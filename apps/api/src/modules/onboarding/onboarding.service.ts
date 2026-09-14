import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { ListQuery } from '../../lib/crm-schemas'
import { type Paginated } from '../../lib/pagination'
import { z } from 'zod'
import { db, type DB } from '../../db'
import { clientOnboarding, clientAsset, deal, clientAccount, clientDealAccess, contact, company } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { recordFieldChanges, writeAudit, type Tx } from '../../lib/audit'
import { clientDealIds, resolveActiveClientDeal } from '../../lib/portal-access'
import { notifyUser, notifyAdmins } from '../notifications/notify'
import { moveDealToProduction } from '../deals/stage.service'
import { sendEmail, clientPortalBaseUrl } from '../../lib/mailer'
import { tenantPortalUrl } from '../../lib/portal-url'
import { onboardingCompletedHtml } from './emails/onboarding-completed'
import type { ClientTokenPayload } from '../../middleware/authenticate-client'
import { claimUpload, prepareUploadClaim } from '../uploads/uploads.service'
import { notifyBrandChange, resolveBrandLogoKey, removeBrandAssetFromMaterials } from '../branding/branding.service'
import {
  ONBOARDING_STATUS,
  type OnboardingBriefDTO,
  type OnboardingBriefDraftDTO,
  type OnboardingMaterialCategory,
  type OnboardingMaterialsDTO,
  type OnboardingMaterialsDraftDTO,
} from './onboarding.schema'
import {
  ONBOARDING_TOTAL_STEPS,
  assertStepPrerequisites,
  stepsCompletedMerge,
  derivedCurrentStep,
} from './steps'

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
 *
 * Delegado a `resolveActiveClientDeal` (lib/portal-access.ts) — la consulta
 * en sí vive ahí, compartida con branding.service.ts. Acá solo se agrega el
 * `throw` de negocio: en el wizard de onboarding, no tener deal activo SÍ es
 * un error (a diferencia de un caller que solo necesita "no hay a quién
 * notificar").
 */
async function resolveActiveDeal(clientId: string): Promise<ActiveDeal> {
  const row = await resolveActiveClientDeal(clientId)
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

/**
 * Lectura sin efectos para la vista de admin: si el cliente todavía no abrió el
 * onboarding, devuelve el estado inicial SIN crear la fila. Si la creara, mirar
 * el portal lo daría por empezado en el panel.
 */
async function findOnboardingOrInitial(activeDeal: ActiveDeal, clientId: string): Promise<ClientOnboardingRow> {
  const [existing] = await db.select().from(clientOnboarding).where(eq(clientOnboarding.dealId, activeDeal.id)).limit(1)
  if (existing) return existing
  const now = new Date()
  return {
    id: '',
    portalId: activeDeal.portalId,
    dealId: activeDeal.id,
    clientId,
    status: ONBOARDING_STATUS.IN_PROGRESS,
    currentStep: 1,
    stepsCompleted: {},
    signatureName: null,
    signatureAcceptedAt: null,
    signatureIp: null,
    briefAnswers: null,
    briefDraft: null,
    materials: {},
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

export async function getOnboardingState(clientId: string, opts: { readOnly?: boolean } = {}): Promise<OnboardingStateDTO> {
  const activeDeal = await resolveActiveDeal(clientId)
  // Las tres queries son independientes entre sí — se resuelven en paralelo.
  const [onboarding, rawAssets, brandLogoKey] = await Promise.all([
    opts.readOnly
      ? findOnboardingOrInitial(activeDeal, clientId)
      : getOrCreateOnboarding(db, activeDeal.portalId, activeDeal.id, clientId),
    db
      .select()
      .from(clientAsset)
      .where(and(eq(clientAsset.dealId, activeDeal.id), isNull(clientAsset.intakeId), eq(clientAsset.archived, false)))
      .orderBy(desc(clientAsset.uploadedAt)),
    resolveBrandLogoKey(clientId),
  ])
  // Defensa en profundidad: el logo NUNCA aparece en "archivos de marca" (es
  // el campo de identidad, `brand_logo_key`), aunque comparta `field_name:
  // 'logoBrand'` con el checklist de materiales por historia del wizard.
  const assets = brandLogoKey ? rawAssets.filter((a) => a.storageKey !== brandLogoKey) : rawAssets
  return { onboarding, assets }
}

// ── Cliente: Parte 1 — orientación (pasos 1-4) ───────────────────────────────

export async function markStepProgress(clientId: string, step: number): Promise<ClientOnboardingRow> {
  const activeDeal = await resolveActiveDeal(clientId)
  const row = await getOrCreateOnboarding(db, activeDeal.portalId, activeDeal.id, clientId)
  assertNotCompleted(row)
  assertStepPrerequisites(row.stepsCompleted, step)

  const merged = stepsCompletedMerge(step)
  const [updated] = await db
    .update(clientOnboarding)
    .set({
      stepsCompleted: merged,
      currentStep: derivedCurrentStep(merged),
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
  assertStepPrerequisites(row.stepsCompleted, 5)
  if (row.signatureAcceptedAt) throw Errors.conflict('El onboarding ya fue firmado')

  const merged = stepsCompletedMerge(5)
  // WHERE ... signature_accepted_at IS NULL: el chequeo de arriba corre sobre
  // una lectura previa, así que dos firmas concurrentes lo pasarían las dos.
  // La condición en el UPDATE hace que solo una gane (Postgres serializa el
  // lock de fila) — la otra no matchea y devuelve 409, en vez de pisar el
  // nombre/timestamp/IP de la firma que ya quedó registrada.
  const [updated] = await db
    .update(clientOnboarding)
    .set({
      signatureName: fullName,
      signatureAcceptedAt: new Date(),
      signatureIp: ip,
      stepsCompleted: merged,
      currentStep: derivedCurrentStep(merged),
      updatedAt: new Date(),
    })
    .where(and(eq(clientOnboarding.id, row.id), isNull(clientOnboarding.signatureAcceptedAt)))
    .returning()
  if (!updated) throw Errors.conflict('El onboarding ya fue firmado')
  return updated
}

// ── Cliente: Paso 6 — Brief (16 preguntas) ────────────────────────────────────

/**
 * Guarda un BORRADOR parcial del brief (se llama al avanzar cada uno de los 5
 * bloques del paso 6). No valida las 16 respuestas ni marca el paso: solo
 * persiste lo que el cliente ya tipeó para que un reload / cerrar la pestaña
 * no se lleve puesto lo escrito hasta ahí.
 *
 * Merge en SQL (`||`) y no reemplazo: una actualización parcial NUNCA borra
 * claves guardadas antes, y dos bloques enviados casi a la vez no se pisan.
 */
export async function saveBriefDraft(clientId: string, partial: OnboardingBriefDraftDTO): Promise<ClientOnboardingRow> {
  const activeDeal = await resolveActiveDeal(clientId)
  const row = await getOrCreateOnboarding(db, activeDeal.portalId, activeDeal.id, clientId)
  assertNotCompleted(row)
  assertStepPrerequisites(row.stepsCompleted, 6)

  const [updated] = await db
    .update(clientOnboarding)
    .set({
      // COALESCE: `brief_draft` arranca en NULL y `NULL || '{...}'` es NULL.
      briefDraft: sql`COALESCE(${clientOnboarding.briefDraft}, '{}'::jsonb) || ${JSON.stringify(partial)}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(clientOnboarding.id, row.id))
    .returning()
  if (!updated) throw Errors.internal('No se pudo guardar el borrador del brief')
  return updated
}

export async function submitBrief(clientId: string, answers: OnboardingBriefDTO): Promise<ClientOnboardingRow> {
  const activeDeal = await resolveActiveDeal(clientId)
  const row = await getOrCreateOnboarding(db, activeDeal.portalId, activeDeal.id, clientId)
  assertNotCompleted(row)
  assertStepPrerequisites(row.stepsCompleted, 6)

  const merged = stepsCompletedMerge(6)
  const [updated] = await db
    .update(clientOnboarding)
    .set({
      briefAnswers: answers,
      // El borrador ya cumplió su función: las 16 respuestas validadas viven
      // en briefAnswers. Dejarlo sería un segundo estado del mismo dato que
      // se puede desincronizar.
      briefDraft: null,
      stepsCompleted: merged,
      currentStep: derivedCurrentStep(merged),
      updatedAt: new Date(),
    })
    .where(eq(clientOnboarding.id, row.id))
    .returning()
  if (!updated) throw Errors.internal('No se pudo guardar el brief')
  return updated
}

// ── Cliente: Paso 7 — Materiales ──────────────────────────────────────────────

/**
 * Crea el client_asset de un archivo de materiales ya subido y lo vincula al
 * deal activo del cliente. El id devuelto es el que el wizard manda en
 * `materials.<categoria>.assetIds` al llamar a submitMaterials.
 *
 * `claimUpload` exige que la key la haya subido ESTE cliente para este portal:
 * sin eso, un cliente podía registrar como material propio el archivo de otro.
 */
export async function attachMaterialAsset(
  clientId: string,
  category: OnboardingMaterialCategory,
  storageKey: string,
): Promise<ClientAssetRow> {
  const activeDeal = await resolveActiveDeal(clientId)
  const preparedClaim = await prepareUploadClaim({
    storageKey,
    portalId: activeDeal.portalId,
    actor: { kind: 'client', clientId, portalId: activeDeal.portalId },
    purpose: 'onboarding_material',
  })
  return db.transaction(async (tx) => {
    const upload = await claimUpload(tx, preparedClaim)
    const [row] = await tx
      .insert(clientAsset)
      .values({
        portalId: activeDeal.portalId,
        dealId: activeDeal.id,
        clientId,
        intakeId: null,
        fieldName: category,
        name: upload.originalName,
        type: CATEGORY_TO_ASSET_TYPE[category],
        mimeType: upload.contentType,
        storageKey: upload.storageKey,
        sizeBytes: upload.sizeBytes,
      })
      .returning()
    if (!row) throw Errors.internal('No se pudo guardar el archivo')
    return row
  })
}

/**
 * Los assetIds referenciados deben pertenecer al deal del cliente — si no, un
 * cliente podría vincular client_asset de OTRO proyecto adivinando IDs.
 */
async function assertOwnedAssets(dealId: string, materials: Record<string, { assetIds?: string[] }>): Promise<void> {
  const allAssetIds = Object.values(materials).flatMap((m) => m.assetIds ?? [])
  if (allAssetIds.length === 0) return

  const owned = await db
    .select({ id: clientAsset.id })
    .from(clientAsset)
    .where(and(eq(clientAsset.dealId, dealId), inArray(clientAsset.id, allAssetIds), eq(clientAsset.archived, false)))
  const ownedSet = new Set(owned.map((o) => o.id))
  const invalid = allAssetIds.filter((id) => !ownedSet.has(id))
  if (invalid.length > 0) {
    throw Errors.badRequest('Uno o más archivos no pertenecen a este proyecto', { invalid })
  }
}

/**
 * Guarda el estado PARCIAL del checklist de materiales (se llama al tildar una
 * categoría, al escribir una nota o al terminar una subida). No marca el paso
 * 7: solo evita que el `done`/`note`/`assetIds` vivan únicamente en memoria
 * hasta que el cliente apriete "Continuar".
 *
 * Escribe sobre la MISMA columna `materials` mergeando por categoría: lo que
 * define si el paso 7 está hecho es `steps_completed['7']`, no el contenido de
 * esta columna, así que no hace falta un segundo estado paralelo.
 */
export async function saveMaterialsDraft(
  clientId: string,
  materials: OnboardingMaterialsDraftDTO['materials'],
): Promise<ClientOnboardingRow> {
  const activeDeal = await resolveActiveDeal(clientId)
  const row = await getOrCreateOnboarding(db, activeDeal.portalId, activeDeal.id, clientId)
  assertNotCompleted(row)
  assertStepPrerequisites(row.stepsCompleted, 7)
  await assertOwnedAssets(activeDeal.id, materials)

  const [updated] = await db
    .update(clientOnboarding)
    .set({
      materials: sql`${clientOnboarding.materials} || ${JSON.stringify(materials)}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(clientOnboarding.id, row.id))
    .returning()
  if (!updated) throw Errors.internal('No se pudo guardar el borrador de materiales')
  return updated
}

export async function submitMaterials(
  clientId: string,
  materials: OnboardingMaterialsDTO['materials'],
): Promise<ClientOnboardingRow> {
  const activeDeal = await resolveActiveDeal(clientId)
  const row = await getOrCreateOnboarding(db, activeDeal.portalId, activeDeal.id, clientId)
  assertNotCompleted(row)
  assertStepPrerequisites(row.stepsCompleted, 7)
  await assertOwnedAssets(activeDeal.id, materials)

  const merged = stepsCompletedMerge(7)
  const [updated] = await db
    .update(clientOnboarding)
    .set({
      materials,
      stepsCompleted: merged,
      currentStep: derivedCurrentStep(merged),
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

    // Exige los pasos 1-7, no solo los que guardan datos (5/6/7). Un cliente
    // que le pega a los endpoints a mano podía firmar, mandar brief y
    // materiales, y completar el onboarding sin haber pasado NUNCA por la
    // orientación — verificado contra la API real antes de este cambio.
    assertStepPrerequisites(row.stepsCompleted, 8)

    const merged = stepsCompletedMerge(8)
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
      .set({
        status: ONBOARDING_STATUS.COMPLETED,
        completedAt: new Date(),
        stepsCompleted: merged,
        currentStep: ONBOARDING_TOTAL_STEPS,
        updatedAt: new Date(),
      })
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

  const payload = { dealId: activeDeal.id, dealName: result.dealName, stageLabel: result.stageLabel }
  const opts = {
    entity: { type: 'deal', id: activeDeal.id },
    dedupeKey: `onboarding_completed:${activeDeal.id}`,
  }

  // Si no se resolvió un owner final (helper de assignees.ts sin email
  // seedeado Y el deal tampoco tenía owner previo), se avisa a todos los
  // admins. Hoy una notificación sin destinatario ni siquiera se puede
  // insertar (check de la migración 0037), pero el fallback sigue siendo lo
  // correcto: alguien del equipo tiene que enterarse.
  if (result.ownerId) {
    await notifyUser(activeDeal.portalId, result.ownerId, 'onboarding_completed', payload, opts)
  } else {
    await notifyAdmins(activeDeal.portalId, 'onboarding_completed', payload, opts)
  }

  // Confirmación al cliente, fuera de la transacción. El email/nombre no vienen
  // en el token (solo sub/portalId/contactId), así que se leen del contacto.
  const [c] = await db
    .select({ email: contact.email, firstName: contact.firstName })
    .from(contact)
    .where(eq(contact.id, token.contactId))
    .limit(1)
  if (c?.email) {
    // Best-effort: el onboarding ya quedó completado; un fallo del email no
    // puede devolverle un error al cliente sobre algo que sí se guardó.
    try {
      const [dealCompany] = await db
        .select({ slug: company.slug })
        .from(deal)
        .innerJoin(company, eq(company.id, deal.companyId))
        .where(eq(deal.id, activeDeal.id))
        .limit(1)
      await sendEmail({
        to: c.email,
        subject: `Arrancamos con ${result.dealName}`,
        html: onboardingCompletedHtml({
          firstName: c.firstName,
          dealName: result.dealName,
          stageLabel: result.stageLabel,
          portalUrl: tenantPortalUrl(dealCompany?.slug) ?? `${clientPortalBaseUrl()}/portal`,
        }),
      })
    } catch (err) {
      console.error('[onboarding.service] No se pudo enviar la confirmación de onboarding', {
        dealId: activeDeal.id,
        error: (err as Error)?.message ?? err,
      })
    }
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

/**
 * Cursor del listado admin. El orden no es (createdAt, id) sino (in_progress
 * primero, updatedAt desc, id desc), así que el cursor lleva los tres valores
 * de la última fila. `updatedAt` viaja con microsegundos (texto de Postgres, no
 * un `Date` de JS): truncado a milisegundos, las filas del mismo milisegundo
 * que la última se saltearían entre páginas.
 */
const OnboardingCursorSchema = z.object({
  bucket: z.number().int().min(0).max(1),
  updatedAt: z.string().datetime(),
  id: z.string().min(1),
})
type OnboardingCursor = z.infer<typeof OnboardingCursorSchema>

function encodeOnboardingCursor(cursor: OnboardingCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

function decodeOnboardingCursor(cursor?: string): OnboardingCursor | undefined {
  if (!cursor) return undefined
  try {
    const parsed = OnboardingCursorSchema.safeParse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

/** Listado para la vista admin de progreso: in_progress primero, luego por updatedAt desc. */
export async function listOnboardings(portalId: string, query: ListQuery): Promise<Paginated<AdminOnboardingListItemDTO>> {
  const bucket = sql<number>`CASE WHEN ${clientOnboarding.status} = ${ONBOARDING_STATUS.IN_PROGRESS} THEN 0 ELSE 1 END`
  const updatedAtKey = sql<string>`to_char(${clientOnboarding.updatedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
  const cursor = decodeOnboardingCursor(query.cursor)
  const rows = await db
    .select({ onboarding: clientOnboarding, dealName: deal.name, clientEmail: clientAccount.email, bucket, updatedAtKey })
    .from(clientOnboarding)
    .innerJoin(deal, and(eq(deal.id, clientOnboarding.dealId), eq(deal.archived, false)))
    .innerJoin(clientAccount, eq(clientAccount.id, clientOnboarding.clientId))
    .where(
      and(
        eq(clientOnboarding.portalId, portalId),
        cursor
          ? sql`(${bucket} > ${cursor.bucket} OR (${bucket} = ${cursor.bucket} AND (${clientOnboarding.updatedAt}, ${clientOnboarding.id}) < (${cursor.updatedAt}::timestamptz, ${cursor.id})))`
          : undefined,
      ),
    )
    .orderBy(bucket, desc(clientOnboarding.updatedAt), desc(clientOnboarding.id))
    .limit(query.limit + 1)

  const hasMore = rows.length > query.limit
  const page = hasMore ? rows.slice(0, query.limit) : rows
  const last = page.at(-1)
  return {
    items: page.map(({ onboarding, dealName, clientEmail }) => toAdminListItem(onboarding, dealName, clientEmail)),
    nextCursor:
      hasMore && last
        ? encodeOnboardingCursor({ bucket: Number(last.bucket), updatedAt: last.updatedAtKey, id: last.onboarding.id })
        : null,
  }
}

export interface AdminOnboardingDetailDTO {
  onboarding: ClientOnboardingRow
  assets: ClientAssetRow[]
  dealName: string
  clientEmail: string
}

export async function getOnboardingByDeal(portalId: string, dealId: string): Promise<AdminOnboardingDetailDTO> {
  const [row] = await db
    .select({ onboarding: clientOnboarding, dealName: deal.name, clientEmail: clientAccount.email })
    .from(clientOnboarding)
    .innerJoin(deal, eq(deal.id, clientOnboarding.dealId))
    .innerJoin(clientAccount, eq(clientAccount.id, clientOnboarding.clientId))
    .where(and(eq(clientOnboarding.portalId, portalId), eq(clientOnboarding.dealId, dealId)))
    .limit(1)
  if (!row) throw Errors.notFound('Onboarding no encontrado para este deal')

  const [rawAssets, brandLogoKey] = await Promise.all([
    db
      .select()
      .from(clientAsset)
      .where(and(eq(clientAsset.dealId, dealId), isNull(clientAsset.intakeId), eq(clientAsset.archived, false)))
      .orderBy(desc(clientAsset.uploadedAt)),
    resolveBrandLogoKey(row.onboarding.clientId),
  ])
  // Misma defensa en profundidad que getOnboardingState: el logo nunca es un "archivo de marca" suelto.
  const assets = brandLogoKey ? rawAssets.filter((a) => a.storageKey !== brandLogoKey) : rawAssets

  return { onboarding: row.onboarding, assets, dealName: row.dealName, clientEmail: row.clientEmail }
}

// ── Cliente: identidad de marca (brief.brandIdentity, editable post-completado) ──

/**
 * Único campo del brief (q11) editable DESPUÉS de completado el onboarding —
 * las otras 15 respuestas quedan congeladas (a propósito, NO se llama a
 * `assertNotCompleted` acá). 409 si el brief nunca se envió (`briefAnswers`
 * null): todavía no hay nada que editar, primero tiene que pasar por
 * `POST /brief`.
 */
export async function updateBrandIdentity(clientId: string, brandIdentity: string): Promise<ClientOnboardingRow> {
  const activeDeal = await resolveActiveDeal(clientId)
  // get-or-create fuera de la tx (ya es idempotente/a prueba de carreras por su
  // cuenta — onConflictDoNothing + relectura). Solo hace falta el id de la fila.
  const initial = await getOrCreateOnboarding(db, activeDeal.portalId, activeDeal.id, clientId)

  const result = await db.transaction(async (tx) => {
    // Lock + decisión de no-op DENTRO de la misma tx: leer antes (sin lock) y
    // decidir "sin cambios" con esa lectura es TOCTOU — un PATCH concurrente
    // podía pisar el valor entre el SELECT y el UPDATE, y esta request
    // devolvía 200 con datos ya desactualizados sin haber escrito nada.
    const [locked] = await tx
      .select()
      .from(clientOnboarding)
      .where(eq(clientOnboarding.id, initial.id))
      .limit(1)
      .for('update')
    if (!locked) throw Errors.internal('No se pudo leer el onboarding')
    if (locked.briefAnswers === null) throw Errors.conflict('Todavía no enviaste el brief del proyecto')

    const briefAnswers = locked.briefAnswers as Record<string, unknown>
    const previousValue = typeof briefAnswers.brandIdentity === 'string' ? briefAnswers.brandIdentity : null
    if (previousValue === brandIdentity) return { row: locked, changed: false as const }

    const [updatedRow] = await tx
      .update(clientOnboarding)
      .set({
        // jsonb_set sobre UNA sola clave: el resto de las 15 respuestas del
        // brief no se toca. `to_jsonb(...::text)` escapa el valor como
        // parámetro bindeado — no interpolación de string.
        briefAnswers: sql`jsonb_set(${clientOnboarding.briefAnswers}, '{brandIdentity}', to_jsonb(${brandIdentity}::text))`,
        updatedAt: new Date(),
      })
      .where(eq(clientOnboarding.id, locked.id))
      .returning()
    if (!updatedRow) throw Errors.internal('No se pudo guardar la identidad de marca')

    await recordFieldChanges({
      tx,
      portalId: activeDeal.portalId,
      entityType: 'client_onboarding',
      entityId: locked.id,
      before: { brandIdentity: previousValue },
      after: { brandIdentity },
      changedBy: null,
    })
    await writeAudit({
      tx,
      portalId: activeDeal.portalId,
      clientId,
      entityType: 'client_onboarding',
      entityId: locked.id,
      action: 'BRAND_IDENTITY_UPDATE',
      payload: { section: 'marca', changes: [{ field: 'brandIdentity', oldValue: previousValue, newValue: brandIdentity }] },
    })
    return { row: updatedRow, changed: true as const }
  })

  // notifyBrandChange usa `db` (no `tx`) — llamarlo DESPUÉS del commit, nunca
  // dentro de la transacción (segunda conexión al pool mientras esta retiene
  // la suya). Solo si hubo un cambio real.
  if (result.changed) {
    await notifyBrandChange({ portalId: activeDeal.portalId, dealId: activeDeal.id, clientId, fields: ['Identidad de marca'], action: 'update' })
  }
  return result.row
}

// ── Admin: archivos y identidad de marca del deal (detalle de onboarding) ───

/**
 * A diferencia de `assertDealInPortal` (lib/portal-access.ts) — pensada para
 * validar un FK que llega en el BODY y devuelve 400 "Deal inexistente" — acá
 * `dealId` es el RECURSO de la URL (`/api/onboarding/deals/:dealId/...`):
 * mismo criterio 404 que el resto del namespace (`getOnboardingByDeal`), no
 * 400. Un deal de otro portal, archivado, o inexistente son indistinguibles
 * desde afuera — todos 404.
 */
async function assertOnboardingDeal(portalId: string, dealId: string): Promise<void> {
  const [row] = await db
    .select({ id: deal.id })
    .from(deal)
    .where(and(eq(deal.id, dealId), eq(deal.portalId, portalId), eq(deal.archived, false)))
    .limit(1)
  if (!row) throw Errors.notFound('Deal no encontrado')
}

/**
 * Cliente "dueño" del deal para colgarle un client_asset: preferimos el
 * `client_id` de `client_onboarding` (el que efectivamente hizo el wizard) y,
 * si el deal todavía no tiene fila de onboarding, el primero con acceso vía
 * `client_deal_access`. 409 si ninguno de los dos resuelve — no hay a quién
 * asociarle el archivo.
 */
async function resolveDealOwnerClientId(dealId: string): Promise<string> {
  const [onboardingRow] = await db
    .select({ clientId: clientOnboarding.clientId })
    .from(clientOnboarding)
    .where(eq(clientOnboarding.dealId, dealId))
    .limit(1)
  if (onboardingRow) return onboardingRow.clientId

  const [accessRow] = await db.select({ clientId: clientDealAccess.clientId }).from(clientDealAccess).where(eq(clientDealAccess.dealId, dealId)).limit(1)
  if (accessRow) return accessRow.clientId

  throw Errors.conflict('Este deal todavía no tiene una cuenta de cliente asociada')
}

/**
 * Admin: agrega un archivo de marca al deal, desde el detalle de onboarding.
 * Mismo propósito de subida (`onboarding_material`) que el flujo del
 * cliente — `policy.ts` habilita el actor `hub` para ese propósito
 * específicamente por este endpoint. NO notifica (regla de negocio: los
 * cambios que origina el propio equipo no generan la campanita de "el
 * cliente cambió su marca").
 */
export async function addDealBrandFile(portalId: string, userId: string, dealId: string, storageKey: string): Promise<ClientAssetRow> {
  await assertOnboardingDeal(portalId, dealId)
  const clientId = await resolveDealOwnerClientId(dealId)

  const preparedClaim = await prepareUploadClaim({
    storageKey,
    portalId,
    actor: { kind: 'hub', userId, portalId },
    purpose: 'onboarding_material',
  })

  return db.transaction(async (tx) => {
    const upload = await claimUpload(tx, preparedClaim)
    const [inserted] = await tx
      .insert(clientAsset)
      .values({
        portalId,
        dealId,
        clientId,
        intakeId: null,
        fieldName: 'logoBrand',
        name: upload.originalName,
        type: upload.contentType.startsWith('image/') ? 'foto' : 'documento',
        mimeType: upload.contentType,
        storageKey: upload.storageKey,
        sizeBytes: upload.sizeBytes,
      })
      .returning()
    if (!inserted) throw Errors.internal('No se pudo guardar el archivo')
    await writeAudit({
      tx,
      portalId,
      userId,
      entityType: 'client_asset',
      entityId: inserted.id,
      action: 'BRAND_FILE_ADD',
      payload: { section: 'marca', changes: [{ field: 'brandFiles', oldValue: null, newValue: inserted.name }] },
    })
    return inserted
  })
}

/** Admin: soft delete de un archivo de marca del deal. 404 si no matchea deal/portal/campo/estado. */
export async function archiveDealBrandFile(portalId: string, userId: string, dealId: string, assetId: string): Promise<void> {
  await assertOnboardingDeal(portalId, dealId)

  await db.transaction(async (tx) => {
    const [asset] = await tx
      .select({ id: clientAsset.id, name: clientAsset.name })
      .from(clientAsset)
      .where(
        and(
          eq(clientAsset.id, assetId),
          eq(clientAsset.dealId, dealId),
          eq(clientAsset.portalId, portalId),
          eq(clientAsset.fieldName, 'logoBrand'),
          eq(clientAsset.archived, false),
        ),
      )
      .limit(1)
      .for('update')
    if (!asset) throw Errors.notFound('Archivo no encontrado')

    await tx.update(clientAsset).set({ archived: true, archivedAt: new Date() }).where(eq(clientAsset.id, assetId))
    await removeBrandAssetFromMaterials(tx, dealId, assetId)
    await writeAudit({
      tx,
      portalId,
      userId,
      entityType: 'client_asset',
      entityId: assetId,
      action: 'BRAND_FILE_ARCHIVE',
      payload: { section: 'marca', changes: [{ field: 'brandFiles', oldValue: asset.name, newValue: null }] },
    })
  })
}

/** Admin: misma edición que `updateBrandIdentity`, pero auditada con el hub_user que la hizo. NO notifica. */
export async function updateDealBrandIdentity(portalId: string, userId: string, dealId: string, brandIdentity: string): Promise<ClientOnboardingRow> {
  await assertOnboardingDeal(portalId, dealId)

  return db.transaction(async (tx) => {
    // Mismo criterio que updateBrandIdentity: lock + decisión de no-op dentro
    // de la tx, no sobre una lectura previa sin lock (TOCTOU).
    const [locked] = await tx
      .select()
      .from(clientOnboarding)
      .where(and(eq(clientOnboarding.dealId, dealId), eq(clientOnboarding.portalId, portalId)))
      .limit(1)
      .for('update')
    if (!locked) throw Errors.notFound('Onboarding no encontrado para este deal')
    if (locked.briefAnswers === null) throw Errors.conflict('Todavía no se envió el brief del proyecto')

    const briefAnswers = locked.briefAnswers as Record<string, unknown>
    const previousValue = typeof briefAnswers.brandIdentity === 'string' ? briefAnswers.brandIdentity : null
    if (previousValue === brandIdentity) return locked

    const [updated] = await tx
      .update(clientOnboarding)
      .set({
        briefAnswers: sql`jsonb_set(${clientOnboarding.briefAnswers}, '{brandIdentity}', to_jsonb(${brandIdentity}::text))`,
        updatedAt: new Date(),
      })
      .where(eq(clientOnboarding.id, locked.id))
      .returning()
    if (!updated) throw Errors.internal('No se pudo guardar la identidad de marca')

    await recordFieldChanges({
      tx,
      portalId,
      entityType: 'client_onboarding',
      entityId: locked.id,
      before: { brandIdentity: previousValue },
      after: { brandIdentity },
      changedBy: userId,
    })
    await writeAudit({
      tx,
      portalId,
      userId,
      entityType: 'client_onboarding',
      entityId: locked.id,
      action: 'BRAND_IDENTITY_UPDATE',
      payload: { section: 'marca', changes: [{ field: 'brandIdentity', oldValue: previousValue, newValue: brandIdentity }] },
    })
    return updated
  })
}
