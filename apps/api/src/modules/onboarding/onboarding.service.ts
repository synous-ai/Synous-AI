import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db, type DB } from '../../db'
import { clientOnboarding, clientAsset, deal, clientAccount, clientDealAccess, contact } from '../../db/schema'
import { Errors } from '../../lib/errors'
import type { Tx } from '../../lib/audit'
import { createNotification, notifyAdmins } from '../notifications/notifications.service'
import { moveDealToProduction } from '../deals/stage.service'
import { sendEmail, clientPortalBaseUrl } from '../../lib/mailer'
import { onboardingCompletedHtml } from './emails/onboarding-completed'
import type { ClientTokenPayload } from '../../middleware/authenticate-client'
import type { SavedFile } from '../files/files.service'
import { ONBOARDING_STATUS, type OnboardingBriefDTO, type OnboardingMaterialCategory, type OnboardingMaterialsDTO } from './onboarding.schema'

/**
 * Onboarding POST-VENTA (post-pago): wizard de 8 pasos que el cliente completa
 * autenticado en el Client Portal. Reemplaza al wizard pre-venta público
 * (ver git history de este archivo / onboarding_submission en db/schema/onboarding.ts,
 * que sigue existiendo solo para datos históricos de leads/propuestas).
 */

type ClientOnboardingRow = typeof clientOnboarding.$inferSelect
type ClientAssetRow = typeof clientAsset.$inferSelect

// ── Categoría de material → tipo de client_asset (check constraint de la tabla) ──
const CATEGORY_TO_ASSET_TYPE: Record<OnboardingMaterialCategory, string> = {
  logoBrand: 'logo',
  programContent: 'documento',
  clientBase: 'documento',
  toolAccess: 'acceso',
}

// ── Helpers internos ─────────────────────────────────────────────────────────

interface ActiveDeal {
  id: string
  portalId: string
}

/**
 * Resuelve el deal activo del cliente autenticado, vía client_deal_access.
 * Si el cliente tiene varios deals (poco común hoy), toma el más reciente no
 * archivado — es el proyecto que está por arrancar.
 */
async function resolveActiveDeal(clientId: string): Promise<ActiveDeal> {
  const [row] = await db
    .select({ id: deal.id, portalId: deal.portalId })
    .from(clientDealAccess)
    .innerJoin(deal, eq(deal.id, clientDealAccess.dealId))
    .where(and(eq(clientDealAccess.clientId, clientId), eq(deal.archived, false)))
    .orderBy(desc(deal.createdAt))
    .limit(1)
  if (!row) throw Errors.notFound('No hay un proyecto activo asociado a esta cuenta')
  return row
}

/**
 * Lazy-get-or-create de la fila de client_onboarding para un deal. Idempotente
 * y a prueba de carreras (dos requests casi simultáneas del mismo cliente):
 * el UNIQUE en deal_id + onConflictDoNothing + relectura evita el 500 por
 * violación de constraint.
 *
 * Acepta `db` o un `tx` en curso (patrón `Tx` de lib/audit.ts) — así
 * `completeOnboarding` puede reusarlo DENTRO de su propia transacción en vez
 * de reimplementar el lazy-create inline.
 */
async function getOrCreateOnboarding(
  dbOrTx: DB | Tx,
  portalId: string,
  dealId: string,
  clientId: string,
): Promise<ClientOnboardingRow> {
  const [existing] = await dbOrTx.select().from(clientOnboarding).where(eq(clientOnboarding.dealId, dealId)).limit(1)
  if (existing) return existing

  const [created] = await dbOrTx
    .insert(clientOnboarding)
    .values({ portalId, dealId, clientId })
    .onConflictDoNothing({ target: clientOnboarding.dealId })
    .returning()
  if (created) return created

  const [row] = await dbOrTx.select().from(clientOnboarding).where(eq(clientOnboarding.dealId, dealId)).limit(1)
  if (!row) throw Errors.internal('No se pudo crear el onboarding')
  return row
}

function assertNotCompleted(row: ClientOnboardingRow): void {
  if (row.status === ONBOARDING_STATUS.COMPLETED) throw Errors.conflict('El onboarding ya está completo')
}

// ── Cliente: estado general (lazy-create) ────────────────────────────────────

export interface OnboardingStateDTO {
  onboarding: ClientOnboardingRow
  assets: ClientAssetRow[]
}

export async function getOnboardingState(clientId: string): Promise<OnboardingStateDTO> {
  const activeDeal = await resolveActiveDeal(clientId)
  // Las dos queries son independientes entre sí: assets depende solo de
  // activeDeal.id, no de la fila onboarding — se resuelven en paralelo.
  const [onboarding, assets] = await Promise.all([
    getOrCreateOnboarding(db, activeDeal.portalId, activeDeal.id, clientId),
    db
      .select()
      .from(clientAsset)
      .where(and(eq(clientAsset.dealId, activeDeal.id), isNull(clientAsset.intakeId)))
      .orderBy(desc(clientAsset.uploadedAt)),
  ])
  return { onboarding, assets }
}

// ── Cliente: Parte 1 — orientación (pasos 1-4) ───────────────────────────────

export async function markStepProgress(clientId: string, step: number): Promise<ClientOnboardingRow> {
  const activeDeal = await resolveActiveDeal(clientId)
  const row = await getOrCreateOnboarding(db, activeDeal.portalId, activeDeal.id, clientId)
  assertNotCompleted(row)

  const stepsCompleted = { ...row.stepsCompleted, [String(step)]: new Date().toISOString() }
  const [updated] = await db
    .update(clientOnboarding)
    .set({
      stepsCompleted,
      currentStep: Math.max(row.currentStep, Math.min(step + 1, 8)),
      updatedAt: new Date(),
    })
    .where(eq(clientOnboarding.id, row.id))
    .returning()
  if (!updated) throw Errors.internal('No se pudo actualizar el progreso')
  return updated
}

// ── Cliente: Paso 5 — Firma ───────────────────────────────────────────────────

export async function submitSignature(clientId: string, fullName: string, ip: string): Promise<ClientOnboardingRow> {
  const activeDeal = await resolveActiveDeal(clientId)
  const row = await getOrCreateOnboarding(db, activeDeal.portalId, activeDeal.id, clientId)
  assertNotCompleted(row)
  if (row.signatureAcceptedAt) throw Errors.conflict('El onboarding ya fue firmado')

  const stepsCompleted = { ...row.stepsCompleted, '5': new Date().toISOString() }
  const [updated] = await db
    .update(clientOnboarding)
    .set({
      signatureName: fullName,
      signatureAcceptedAt: new Date(),
      signatureIp: ip,
      stepsCompleted,
      currentStep: Math.max(row.currentStep, 6),
      updatedAt: new Date(),
    })
    .where(eq(clientOnboarding.id, row.id))
    .returning()
  if (!updated) throw Errors.internal('No se pudo guardar la firma')
  return updated
}

// ── Cliente: Paso 6 — Brief (16 preguntas) ────────────────────────────────────

export async function submitBrief(clientId: string, answers: OnboardingBriefDTO): Promise<ClientOnboardingRow> {
  const activeDeal = await resolveActiveDeal(clientId)
  const row = await getOrCreateOnboarding(db, activeDeal.portalId, activeDeal.id, clientId)
  assertNotCompleted(row)

  const stepsCompleted = { ...row.stepsCompleted, '6': new Date().toISOString() }
  const [updated] = await db
    .update(clientOnboarding)
    .set({
      briefAnswers: answers,
      stepsCompleted,
      currentStep: Math.max(row.currentStep, 7),
      updatedAt: new Date(),
    })
    .where(eq(clientOnboarding.id, row.id))
    .returning()
  if (!updated) throw Errors.internal('No se pudo guardar el brief')
  return updated
}

// ── Cliente: Paso 7 — Materiales ──────────────────────────────────────────────

/**
 * Sube un archivo de material (multipart, ya guardado en disco por
 * files.service.saveUpload) y crea el client_asset que lo vincula al deal
 * activo del cliente. El id devuelto es el que el wizard manda en
 * `materials.<categoria>.assetIds` al llamar a submitMaterials.
 */
export async function uploadMaterialAsset(
  clientId: string,
  category: OnboardingMaterialCategory,
  saved: SavedFile,
): Promise<ClientAssetRow> {
  const activeDeal = await resolveActiveDeal(clientId)
  const [row] = await db
    .insert(clientAsset)
    .values({
      portalId: activeDeal.portalId,
      dealId: activeDeal.id,
      clientId,
      intakeId: null,
      fieldName: category,
      name: saved.name,
      type: CATEGORY_TO_ASSET_TYPE[category],
      mimeType: saved.mimeType,
      storageKey: saved.storageKey,
      sizeBytes: saved.sizeBytes,
    })
    .returning()
  if (!row) throw Errors.internal('No se pudo guardar el archivo')
  return row
}

export async function submitMaterials(
  clientId: string,
  materials: OnboardingMaterialsDTO['materials'],
): Promise<ClientOnboardingRow> {
  const activeDeal = await resolveActiveDeal(clientId)
  const row = await getOrCreateOnboarding(db, activeDeal.portalId, activeDeal.id, clientId)
  assertNotCompleted(row)

  // Los assetIds referenciados deben pertenecer al deal del cliente (no dejar
  // que el cliente vincule client_asset de otro deal por ID adivinado).
  const allAssetIds = Object.values(materials).flatMap((m) => m.assetIds ?? [])
  if (allAssetIds.length > 0) {
    const owned = await db
      .select({ id: clientAsset.id })
      .from(clientAsset)
      .where(and(eq(clientAsset.dealId, activeDeal.id), inArray(clientAsset.id, allAssetIds)))
    const ownedSet = new Set(owned.map((o) => o.id))
    const invalid = allAssetIds.filter((id) => !ownedSet.has(id))
    if (invalid.length > 0) {
      throw Errors.badRequest('Uno o más archivos no pertenecen a este proyecto', { invalid })
    }
  }

  const stepsCompleted = { ...row.stepsCompleted, '7': new Date().toISOString() }
  const [updated] = await db
    .update(clientOnboarding)
    .set({
      materials,
      stepsCompleted,
      currentStep: Math.max(row.currentStep, 8),
      updatedAt: new Date(),
    })
    .where(eq(clientOnboarding.id, row.id))
    .returning()
  if (!updated) throw Errors.internal('No se pudo guardar los materiales')
  return updated
}

// ── Cliente: Paso 8 — Confirmación (gate) ─────────────────────────────────────

export interface CompleteOnboardingResultDTO {
  onboarding: ClientOnboardingRow
  ownerId: string | null
  dealName: string
  stageLabel: string
}

/**
 * GATE del paso 8: exige firma (5) + brief (6) + checklist de materiales (7)
 * ENVIADO — el checklist puede tener ítems en `done: false` (deliberado: el
 * cliente puede no tener, p. ej., manual de marca todavía), lo que exige el
 * gate es que el paso se haya enviado, no que esté "completo".
 * En una transacción: marca el onboarding como completado y mueve el deal al
 * pipeline "Producción" / etapa "Diagnóstico" (moveDealToProduction, NO
 * changeStage — ese valida que el stage pertenezca al pipeline ACTUAL, que acá
 * es justo lo que estamos cambiando). La notificación al responsable asignado
 * va DESPUÉS de la transacción (mismo patrón que changeStage).
 */
export async function completeOnboarding(token: ClientTokenPayload): Promise<CompleteOnboardingResultDTO> {
  const clientId = token.sub
  const activeDeal = await resolveActiveDeal(clientId)

  const result = await db.transaction(async (tx) => {
    const row = await getOrCreateOnboarding(tx, activeDeal.portalId, activeDeal.id, clientId)
    assertNotCompleted(row)

    const missing: string[] = []
    if (!row.stepsCompleted['5']) missing.push('firma')
    if (!row.stepsCompleted['6']) missing.push('brief')
    if (!row.stepsCompleted['7']) missing.push('materiales')
    if (missing.length > 0) {
      throw Errors.badRequest(`Faltan completar pasos previos: ${missing.join(', ')}`, { missing })
    }

    const stepsCompleted = { ...row.stepsCompleted, '8': new Date().toISOString() }
    // UPDATE condicional (WHERE ... status = 'in_progress'): idempotencia
    // ante doble click / retry concurrente. Si dos requests llegan casi
    // simultáneas, ambas pasan `assertNotCompleted` (todavía leen
    // 'in_progress'), pero solo UNA gana este UPDATE — Postgres serializa el
    // lock de fila y la segunda, al aplicarse, ya no matchea el WHERE porque
    // la primera ya la dejó en 'completed'. Sin el WHERE, la segunda
    // pisaría los mismos campos igual y seguiría de largo a
    // moveDealToProduction, duplicando record_history/audit_log/notificación.
    const [updatedOnboarding] = await tx
      .update(clientOnboarding)
      .set({ status: ONBOARDING_STATUS.COMPLETED, completedAt: new Date(), stepsCompleted, currentStep: 8, updatedAt: new Date() })
      .where(and(eq(clientOnboarding.id, row.id), eq(clientOnboarding.status, ONBOARDING_STATUS.IN_PROGRESS)))
      .returning()
    if (!updatedOnboarding) {
      // Otra request ya lo completó entre nuestro SELECT y este UPDATE — no
      // ejecutar moveDealToProduction de nuevo.
      throw Errors.conflict('El onboarding ya está completo')
    }

    const move = await moveDealToProduction(tx, activeDeal.portalId, activeDeal.id, { clientId })

    return { onboarding: updatedOnboarding, ...move }
  })

  const notifyPayload = {
    entityType: 'deal',
    entityId: activeDeal.id,
    type: 'onboarding_completed',
    title: `Onboarding completado: "${result.dealName}" pasó a ${result.stageLabel}`,
  } as const

  // Si no se resolvió un owner final (helper de assignees.ts sin email
  // seedeado Y el deal tampoco tenía owner previo), createNotification con
  // userId=null insertaría una fila que ninguna query de notificaciones
  // matchea (se pierde en silencio) — broadcast a los admins en su lugar.
  if (result.ownerId) {
    await createNotification({ portalId: activeDeal.portalId, userId: result.ownerId, ...notifyPayload })
  } else {
    await notifyAdmins(activeDeal.portalId, notifyPayload)
  }

  // Confirmación al cliente, fuera de la transacción. El email/nombre no vienen
  // en el token (solo sub/portalId/contactId), así que se leen del contacto.
  const [c] = await db
    .select({ email: contact.email, firstName: contact.firstName })
    .from(contact)
    .where(eq(contact.id, token.contactId))
    .limit(1)
  if (c?.email) {
    await sendEmail({
      to: c.email,
      subject: `Arrancamos con ${result.dealName}`,
      html: onboardingCompletedHtml({
        firstName: c.firstName,
        dealName: result.dealName,
        stageLabel: result.stageLabel,
        portalUrl: `${clientPortalBaseUrl()}/portal`,
      }),
    })
  }

  return result
}

// ── Admin: progreso de onboardings del portal ────────────────────────────────

export interface AdminOnboardingListItemDTO {
  dealId: string
  dealName: string
  clientEmail: string
  status: string
  currentStep: number
  stepsCompleted: Record<string, string>
  completedAt: string | null
  updatedAt: string
}

function toAdminListItem(onboarding: ClientOnboardingRow, dealName: string, clientEmail: string): AdminOnboardingListItemDTO {
  return {
    dealId: onboarding.dealId,
    dealName,
    clientEmail,
    status: onboarding.status,
    currentStep: onboarding.currentStep,
    stepsCompleted: onboarding.stepsCompleted,
    completedAt: onboarding.completedAt?.toISOString() ?? null,
    updatedAt: onboarding.updatedAt.toISOString(),
  }
}

/** Listado para la vista admin de progreso: in_progress primero, luego por updatedAt desc. */
export async function listOnboardings(portalId: string): Promise<AdminOnboardingListItemDTO[]> {
  const rows = await db
    .select({ onboarding: clientOnboarding, dealName: deal.name, clientEmail: clientAccount.email })
    .from(clientOnboarding)
    .innerJoin(deal, and(eq(deal.id, clientOnboarding.dealId), eq(deal.archived, false)))
    .innerJoin(clientAccount, eq(clientAccount.id, clientOnboarding.clientId))
    .where(eq(clientOnboarding.portalId, portalId))
    .orderBy(sql`CASE WHEN ${clientOnboarding.status} = ${ONBOARDING_STATUS.IN_PROGRESS} THEN 0 ELSE 1 END`, desc(clientOnboarding.updatedAt))

  return rows.map(({ onboarding, dealName, clientEmail }) => toAdminListItem(onboarding, dealName, clientEmail))
}

export interface AdminOnboardingDetailDTO {
  onboarding: ClientOnboardingRow
  assets: ClientAssetRow[]
  dealName: string
  clientEmail: string
}

export async function getOnboardingByDeal(portalId: string, dealId: string): Promise<AdminOnboardingDetailDTO> {
  // Las dos queries son independientes (la de assets solo depende del dealId
  // recibido, no de la fila onboarding) — se resuelven en paralelo.
  const [[row], assets] = await Promise.all([
    db
      .select({ onboarding: clientOnboarding, dealName: deal.name, clientEmail: clientAccount.email })
      .from(clientOnboarding)
      .innerJoin(deal, eq(deal.id, clientOnboarding.dealId))
      .innerJoin(clientAccount, eq(clientAccount.id, clientOnboarding.clientId))
      .where(and(eq(clientOnboarding.portalId, portalId), eq(clientOnboarding.dealId, dealId)))
      .limit(1),
    db
      .select()
      .from(clientAsset)
      .where(and(eq(clientAsset.dealId, dealId), isNull(clientAsset.intakeId)))
      .orderBy(desc(clientAsset.uploadedAt)),
  ])
  if (!row) throw Errors.notFound('Onboarding no encontrado para este deal')

  return { onboarding: row.onboarding, assets, dealName: row.dealName, clientEmail: row.clientEmail }
}
