import { and, desc, eq } from 'drizzle-orm'
import type { ListQuery } from '../../lib/crm-schemas'
import { cursorWhere, decodeCursor, paginateRows, type Paginated } from '../../lib/pagination'
import { db } from '../../db'
import { proposal, deal, contact, company, onboardingSubmission } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { env } from '../../config/env'
import { slugify as baseSlugify } from '../../lib/slug'
import type { ModelProvider } from '../../lib/ai'
import type { ProposalContent } from './proposals.types'
import {
  generateProposalContent,
  fallbackProposalContent,
  type ProposalGenerationInput,
} from './proposals.ai'
import { buildProposalPdf } from './proposals.pdf'
import { actorName } from '../notifications/notifications.service'
import { notifyAdmins } from '../notifications/notify'
import { claimUpload, isNewStorageKey, prepareUploadClaim, releaseReplacedUpload } from '../uploads/uploads.service'
import { isServablePublicLogo } from '../files/files.authz'
import { createReadUrl, isLegacyStorageKey, type ReadAccessUrl } from '../../lib/storage'

/** Monto legible para el copy de notificaciones. */
function money(total: number, currency: string): string {
  if (!total) return ''
  return `${currency} ${Math.round(total).toLocaleString('es')}`
}

type ProposalRow = typeof proposal.$inferSelect

// ─── Helpers ─────────────────────────────────────────────────────────────────

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined
}

/** URL pública de la propuesta (link para enviarle al cliente). */
function publicUrl(token: string): string {
  const base = env.ADMIN_URL ?? 'http://localhost:3000'
  return `${base}/p/${token}`
}

/** Provider de IA configurado para la instancia (env MODEL_PROVIDER, default gemini). */
function getModelProvider(): ModelProvider {
  return env.MODEL_PROVIDER
}

export interface ProposalDTO {
  id: string
  token: string
  title: string
  status: string
  content: ProposalContent
  model: string | null
  amount: string | null
  currency: string
  dealId: string | null
  contactId: string | null
  publicUrl: string
  acceptedAt: string | null
  sentAt: string | null
  viewedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

function toDTO(row: ProposalRow): ProposalDTO {
  return {
    id: row.id,
    token: row.token,
    title: row.title,
    status: row.status,
    content: row.content,
    model: row.model,
    amount: row.amount,
    currency: row.currency,
    dealId: row.dealId,
    contactId: row.contactId,
    publicUrl: publicUrl(row.token),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    viewedAt: row.viewedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ─── Generación ──────────────────────────────────────────────────────────────

/**
 * Genera una propuesta (status `draft`) para un deal, usando la data del
 * onboarding asociado + el deal/contacto/empresa. Si la IA falla, cae a una
 * propuesta base editable (no rompe el flujo).
 */
export async function generateProposal(
  portalId: string,
  dealId: string,
  actorId: string,
): Promise<ProposalDTO> {
  const [d] = await db
    .select({
      id: deal.id,
      primaryContactId: deal.primaryContactId,
      companyId: deal.companyId,
    })
    .from(deal)
    .where(and(eq(deal.id, dealId), eq(deal.portalId, portalId), eq(deal.archived, false)))
    .limit(1)
  if (!d) throw Errors.notFound('Deal no encontrado')

  // Contacto principal (para el nombre del cliente).
  let contactName = 'Cliente'
  if (d.primaryContactId) {
    const [c] = await db
      .select({ firstName: contact.firstName, lastName: contact.lastName })
      .from(contact)
      .where(eq(contact.id, d.primaryContactId))
      .limit(1)
    if (c) contactName = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || contactName
  }

  // Empresa (opcional).
  let companyName: string | undefined
  if (d.companyId) {
    const [co] = await db.select({ name: company.name }).from(company).where(eq(company.id, d.companyId)).limit(1)
    companyName = co?.name
  }

  // Última submission de onboarding del deal (la materia prima de la propuesta).
  const [sub] = await db
    .select({ id: onboardingSubmission.id, answers: onboardingSubmission.answers })
    .from(onboardingSubmission)
    .where(and(eq(onboardingSubmission.portalId, portalId), eq(onboardingSubmission.dealId, dealId)))
    .orderBy(desc(onboardingSubmission.createdAt))
    .limit(1)
  const a = (sub?.answers ?? {}) as Record<string, unknown>

  const input: ProposalGenerationInput = {
    contactName,
    companyName,
    projectType: str(a.projectType),
    mainGoal: str(a.mainGoal),
    currentSolution: str(a.currentSolution),
    clarity: str(a.clarity),
    budget: str(a.budget),
    startWhen: str(a.startWhen),
    deadline: str(a.deadline),
    currentCrm: str(a.currentCrm),
    toAutomate: str(a.toAutomate),
    priority: str(a.priority),
  }

  // Generación con IA (con fallback si falla o no hay credenciales).
  const provider = getModelProvider()
  let content: ProposalContent
  let model: string
  try {
    content = await generateProposalContent(input, provider)
    model = provider
  } catch (err) {
    // El fallback es correcto, pero tiene que dejar rastro: sin este log una IA
    // caída (key vencida, cuota, JSON inválido) producía semanas de propuestas
    // de plantilla sin que nadie se enterara.
    console.error('[proposals] Falló la generación con IA, se usa la plantilla', {
      dealId,
      provider,
      error: (err as Error)?.message ?? err,
    })
    content = fallbackProposalContent(input)
    model = 'manual'
  }

  const [row] = await db
    .insert(proposal)
    .values({
      portalId,
      dealId,
      contactId: d.primaryContactId ?? null,
      onboardingSubmissionId: sub?.id ?? null,
      title: content.title,
      status: 'draft',
      content,
      model,
      amount: content.pricing.total ? String(content.pricing.total) : null,
      currency: content.pricing.currency || 'USD',
    })
    .returning()
  if (!row) throw Errors.internal('No se pudo crear la propuesta')

  // Aviso a los demás admins: se generó una propuesta.
  const who = await actorName(portalId, actorId)
  const amount = money(content.pricing.total, content.pricing.currency)
  await notifyAdmins(
    portalId,
    'proposal_generated',
    { proposalId: row.id, contactName: content.companyName || content.clientName },
    {
      entity: { type: 'proposal', id: row.id },
      exceptUserId: actorId,
      // El actor y el monto viajan en metadata: el título del catálogo es
      // deliberadamente corto (es lo único que entra en la fila de la campana).
      metadata: { actor: who, amount: amount ?? null },
    },
  )

  return toDTO(row)
}

// ─── Lectura / edición (admin) ───────────────────────────────────────────────

export async function listProposals(portalId: string, query: ListQuery): Promise<Paginated<ProposalDTO>> {
  const cursor = decodeCursor(query.cursor)
  const rows = await db
    .select()
    .from(proposal)
    .where(and(eq(proposal.portalId, portalId), cursor ? cursorWhere(proposal.createdAt, proposal.id, cursor) : undefined))
    .orderBy(desc(proposal.createdAt), desc(proposal.id))
    .limit(query.limit + 1)
  const { items, nextCursor } = paginateRows(rows, query.limit)
  return { items: items.map(toDTO), nextCursor }
}

export async function getProposal(portalId: string, id: string): Promise<ProposalDTO> {
  const [row] = await db
    .select()
    .from(proposal)
    .where(and(eq(proposal.id, id), eq(proposal.portalId, portalId)))
    .limit(1)
  if (!row) throw Errors.notFound('Propuesta no encontrada')
  return toDTO(row)
}

export interface UpdateProposalInput {
  title?: string
  content?: ProposalContent
}

/**
 * Referencia al logo que se persiste. Las ediciones guardan `logoKey`; el
 * `logoUrl` legacy solo sobrevive si ya estaba guardado tal cual. Aceptar una
 * URL nueva dejaría apuntar el logo PÚBLICO de la propuesta a cualquier key,
 * incluida la de un archivo privado.
 */
function withLogoReference(next: ProposalContent, current: ProposalContent): ProposalContent {
  const { logoUrl, ...rest } = next
  if (rest.logoKey) return rest
  return logoUrl && logoUrl === current.logoUrl ? { ...rest, logoUrl } : rest
}

/**
 * Edita una propuesta (título y/o contenido). El admin ajusta lo que la IA
 * generó. Recalcula el monto denormalizado desde el total del contenido.
 */
export async function updateProposal(
  portalId: string,
  userId: string,
  id: string,
  input: UpdateProposalInput,
): Promise<ProposalDTO> {
  if (input.title === undefined && input.content === undefined) return getProposal(portalId, id)

  const newLogoKey = input.content?.logoKey
  const preparedClaim = newLogoKey
    ? await prepareUploadClaim({ storageKey: newLogoKey, portalId, actor: { kind: 'hub', userId, portalId }, purpose: 'proposal_logo' })
    : null

  const { row, previousLogoKey } = await db.transaction(async (tx) => {
    // FOR UPDATE: el logo "anterior" que se libera después del commit tiene que
    // ser el que esta edición reemplazó, no uno que otra edición ya cambió.
    const [current] = await tx
      .select({ content: proposal.content })
      .from(proposal)
      .where(and(eq(proposal.id, id), eq(proposal.portalId, portalId)))
      .limit(1)
      .for('update')
    if (!current) throw Errors.notFound('Propuesta no encontrada')

    const patch: Partial<ProposalRow> = {}
    if (input.title !== undefined) patch.title = input.title
    if (input.content !== undefined) {
      if (isNewStorageKey(input.content.logoKey, current.content.logoKey)) await claimUpload(tx, preparedClaim)
      patch.content = withLogoReference(input.content, current.content)
      patch.amount = input.content.pricing.total ? String(input.content.pricing.total) : null
      patch.currency = input.content.pricing.currency || 'USD'
    }

    const [updated] = await tx
      .update(proposal)
      .set(patch)
      .where(and(eq(proposal.id, id), eq(proposal.portalId, portalId)))
      .returning()
    if (!updated) throw Errors.notFound('Propuesta no encontrada')
    return { row: updated, previousLogoKey: current.content.logoKey }
  })

  if (input.content !== undefined) await releaseReplacedUpload(portalId, previousLogoKey, row.content.logoKey)
  return toDTO(row)
}

/**
 * El admin APRUEBA la propuesta (queda lista para enviar al cliente). Pasa a
 * `accepted`; a partir de acá el link público es visible.
 */
export async function acceptProposal(portalId: string, id: string, actorId: string): Promise<ProposalDTO> {
  const [row] = await db
    .update(proposal)
    .set({ status: 'accepted', acceptedAt: new Date() })
    .where(and(eq(proposal.id, id), eq(proposal.portalId, portalId)))
    .returning()
  if (!row) throw Errors.notFound('Propuesta no encontrada')

  // Aviso a los demás admins: la propuesta quedó aprobada y lista para enviar.
  const who = await actorName(portalId, actorId)
  await notifyAdmins(
    portalId,
    'proposal_accepted',
    { proposalId: row.id, contactName: row.title },
    { entity: { type: 'proposal', id: row.id }, exceptUserId: actorId, metadata: { actor: who } },
  )

  return toDTO(row)
}

/**
 * Marca la propuesta como ENVIADA (sentAt + status `sent`). Se llama cuando el
 * admin copia el link o abre la presentación para mandarla. Idempotente: solo
 * setea sentAt la primera vez.
 */
export async function markProposalSent(portalId: string, id: string): Promise<ProposalDTO> {
  const [row] = await db
    .select()
    .from(proposal)
    .where(and(eq(proposal.id, id), eq(proposal.portalId, portalId)))
    .limit(1)
  if (!row) throw Errors.notFound('Propuesta no encontrada')

  if (!row.sentAt) {
    const [updated] = await db
      .update(proposal)
      .set({ sentAt: new Date(), status: row.status === 'accepted' ? 'sent' : row.status })
      .where(and(eq(proposal.id, id), eq(proposal.portalId, portalId)))
      .returning()
    if (updated) return toDTO(updated)
  }
  return toDTO(row)
}

/**
 * Marca que el cliente llegó al ÚLTIMO paso de la presentación (público, por
 * token). Idempotente y silencioso: no expone borradores ni devuelve datos.
 */
export async function markProposalCompleted(token: string): Promise<void> {
  const [row] = await db
    .select({ id: proposal.id, status: proposal.status, completedAt: proposal.completedAt })
    .from(proposal)
    .where(eq(proposal.token, token))
    .limit(1)
  if (!row || row.status === 'draft') return
  if (!row.completedAt) {
    await db.update(proposal).set({ completedAt: new Date() }).where(eq(proposal.id, row.id))
  }
}

// ─── Vista pública (cliente, por token) ──────────────────────────────────────

export interface PublicProposalDTO {
  title: string
  status: string
  content: ProposalContent
  updatedAt: string
}

/**
 * Devuelve la propuesta por su token público (link `/p/<token>`). No requiere
 * auth: el token ES la credencial. No expone borradores (`draft`): solo cuando
 * el admin la aprobó. Marca la primera visualización del cliente.
 */
export async function getPublicProposal(token: string): Promise<PublicProposalDTO> {
  const [row] = await db.select().from(proposal).where(eq(proposal.token, token)).limit(1)
  // 404 indistinto si no existe o sigue en borrador: no revelamos su existencia.
  if (!row || row.status === 'draft') throw Errors.notFound('Propuesta no encontrada')

  // Marca de visto: registramos la primera apertura del cliente y avisamos a
  // TODOS los admins (es una señal de venta importante).
  if (!row.viewedAt) {
    await db
      .update(proposal)
      .set({ viewedAt: new Date(), status: row.status === 'accepted' || row.status === 'sent' ? 'viewed' : row.status })
      .where(eq(proposal.id, row.id))

    const cliente = row.content.companyName || row.content.clientName
    // Solo la PRIMERA vista (el if de arriba mira viewedAt): la dedupeKey lo
    // refuerza por si dos cargas de la página pública llegan concurrentes.
    await notifyAdmins(row.portalId, 'proposal_viewed', { proposalId: row.id, contactName: cliente }, {
      entity: { type: 'proposal', id: row.id },
      dedupeKey: `proposal_viewed:${row.id}`,
    })
  }

  return {
    title: row.title,
    status: row.status,
    content: row.content,
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Key de un `logoUrl` legacy de la forma `…/api/files/<key>`. */
function legacyLogoKey(logoUrl: string | undefined): string | null {
  const match = /\/api\/files\/([^/?#]+)(?:[?#]|$)/.exec(logoUrl ?? '')
  return match?.[1] && isLegacyStorageKey(match[1]) ? match[1] : null
}

/**
 * URL de lectura de corta vida del logo de la propuesta pública. Mismas reglas
 * de visibilidad que la vista pública (sin borradores), y el logo tiene que ser
 * servible públicamente para el portal dueño de la propuesta.
 */
export async function getPublicProposalLogoUrl(token: string): Promise<ReadAccessUrl> {
  const [row] = await db
    .select({ portalId: proposal.portalId, status: proposal.status, content: proposal.content })
    .from(proposal)
    .where(eq(proposal.token, token))
    .limit(1)
  if (!row || row.status === 'draft') throw Errors.notFound('Logo no encontrado')

  const storageKey = row.content.logoKey ?? legacyLogoKey(row.content.logoUrl)
  if (!storageKey || !(await isServablePublicLogo(storageKey, row.portalId, 'proposal_logo'))) {
    throw Errors.notFound('Logo no encontrado')
  }
  return createReadUrl(storageKey, { op: 'public-proposal-logo', storageKey, portalId: row.portalId })
}

/**
 * Slug de archivo para el PDF descargable: reusa el `slugify` compartido
 * (antes tenía su propia copia, ligeramente distinta — no eliminaba las
 * marcas combinantes de NFD, solo confiaba en el filtro alfanumérico, lo que
 * podía dejar guiones espurios en medio de palabras con tilde, ej. "María" →
 * "mari-a" en vez de "maria") y le agrega el truncado a 60 chars + fallback
 * "propuesta" que son específicos de nombre de archivo, no de slug genérico.
 */
function slugify(s: string): string {
  return baseSlugify(s).slice(0, 60) || 'propuesta'
}

/**
 * Genera el PDF descargable de una propuesta (link `/p/<token>` → botón PDF).
 * Mismas reglas de visibilidad que la vista pública: no expone borradores.
 */
export async function getPublicProposalPdf(token: string): Promise<{ filename: string; buffer: Buffer }> {
  const [row] = await db.select().from(proposal).where(eq(proposal.token, token)).limit(1)
  if (!row || row.status === 'draft') throw Errors.notFound('Propuesta no encontrada')
  const buffer = await buildProposalPdf(row.content)
  return { filename: `${slugify(row.title)}.pdf`, buffer }
}
