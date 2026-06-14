import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { proposal, deal, contact, company, onboardingSubmission, setterTenant } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { env } from '../../config/env'
import type { ModelProvider } from '../setter/agent/providers'
import type { ProposalContent } from './proposals.types'
import {
  generateProposalContent,
  fallbackProposalContent,
  type ProposalGenerationInput,
} from './proposals.ai'
import { buildProposalPdf } from './proposals.pdf'
import { notifyAdmins, actorName } from '../notifications/notifications.service'

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

/** Provider de IA configurado para el portal (Model Switcher del setter). */
async function getModelProvider(portalId: string): Promise<ModelProvider> {
  const [t] = await db
    .select({ p: setterTenant.modelProvider })
    .from(setterTenant)
    .where(eq(setterTenant.portalId, portalId))
    .limit(1)
  return t?.p === 'claude' ? 'claude' : 'gemini'
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
 * onboarding asociado + el deal/contacto/empresa. Reusa el Model Switcher del
 * setter. Si la IA falla, cae a una propuesta base editable (no rompe el flujo).
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
  const provider = await getModelProvider(portalId)
  let content: ProposalContent
  let model: string
  try {
    content = await generateProposalContent(input, provider)
    model = provider
  } catch {
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
    {
      entityType: 'proposal',
      entityId: row.id,
      type: 'proposal_generated',
      title: `${who} generó una propuesta para «${content.companyName || content.clientName}»`,
      body: amount ? `Valor estimado: ${amount}` : null,
      actionUrl: `/admin/proposals/${row.id}`,
    },
    { exceptUserId: actorId },
  )

  return toDTO(row)
}

// ─── Lectura / edición (admin) ───────────────────────────────────────────────

export async function listProposals(portalId: string): Promise<ProposalDTO[]> {
  const rows = await db
    .select()
    .from(proposal)
    .where(eq(proposal.portalId, portalId))
    .orderBy(desc(proposal.createdAt))
    .limit(500)
  return rows.map(toDTO)
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
 * Edita una propuesta (título y/o contenido). El admin ajusta lo que la IA
 * generó. Recalcula el monto denormalizado desde el total del contenido.
 */
export async function updateProposal(
  portalId: string,
  id: string,
  input: UpdateProposalInput,
): Promise<ProposalDTO> {
  const patch: Partial<ProposalRow> = {}
  if (input.title !== undefined) patch.title = input.title
  if (input.content !== undefined) {
    patch.content = input.content
    patch.amount = input.content.pricing.total ? String(input.content.pricing.total) : null
    patch.currency = input.content.pricing.currency || 'USD'
  }
  if (Object.keys(patch).length === 0) return getProposal(portalId, id)

  const [row] = await db
    .update(proposal)
    .set(patch)
    .where(and(eq(proposal.id, id), eq(proposal.portalId, portalId)))
    .returning()
  if (!row) throw Errors.notFound('Propuesta no encontrada')
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
    {
      entityType: 'proposal',
      entityId: row.id,
      type: 'proposal_accepted',
      title: `${who} aprobó la propuesta «${row.title}»`,
      body: 'Lista para enviar al cliente.',
      actionUrl: `/admin/proposals/${row.id}`,
    },
    { exceptUserId: actorId },
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
    await notifyAdmins(row.portalId, {
      entityType: 'proposal',
      entityId: row.id,
      type: 'proposal_viewed',
      title: `🎉 «${cliente}» abrió tu propuesta`,
      body: 'Buen momento para hacer seguimiento.',
      actionUrl: `/admin/proposals/${row.id}`,
    })
  }

  return {
    title: row.title,
    status: row.status,
    content: row.content,
    updatedAt: row.updatedAt.toISOString(),
  }
}

function slugify(s: string): string {
  // NFD descompone los acentos; el filtro alfanumérico de abajo descarta las
  // marcas combinantes resultantes (no hace falta un regex de diacríticos).
  return (
    s
      .normalize('NFD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'propuesta'
  )
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
