import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { db } from '../../db'
import { onboardingSubmission, portal, contact, company, deal, pipeline, pipelineStage } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { env } from '../../config/env'
import type { OnboardingSubmitDTO } from './onboarding.schema'
import { signOnboardingToken, verifyOnboardingToken } from './onboarding-token'
import { notifyAdmins } from '../notifications/notifications.service'

type SubmissionRow = typeof onboardingSubmission.$inferSelect

// ─── Routing de ventas (la regla del spec) ──────────────────────────────────
// budget > 2000 (buckets 1000-3000 / 3000+)  ||  claridad baja  →  llamada.
function decideRouting(budget: string, clarity: string): 'call' | 'proposal' {
  // Software a medida: presupuesto alto o baja claridad → mejor arrancar con una
  // llamada para acotar bien el alcance antes de proponer.
  const highBudget = budget === '5000-10000' || budget === '10000+'
  const lowClarity = clarity === 'necesito_ayuda'
  return highBudget || lowClarity ? 'call' : 'proposal'
}

// Monto estimado del deal según el bucket de presupuesto (punto medio del rango).
const BUDGET_AMOUNT: Record<string, string> = {
  '<2000': '1500.00',
  '2000-5000': '3500.00',
  '5000-10000': '7500.00',
  '10000+': '12000.00',
}

const PROJECT_TYPE_LABEL: Record<string, string> = {
  webapp: 'Web App',
  crm: 'CRM',
  automatizacion: 'Automatización',
  portal: 'Portal de Clientes',
  otro: 'Proyecto',
}

export interface OnboardingResult {
  decision: 'call' | 'proposal'
  submissionId: string
}

/**
 * Procesa una submission pública del wizard: resuelve el portal, calcula el
 * routing y deja todo asociado en el CRM (company opcional + contact + deal +
 * submission). Todo en una transacción porque toca varias tablas.
 *
 * Vinculación del lead — dos caminos:
 *  1. CON token de invitación (camino principal): el lead YA existe en el CRM.
 *     La submission se asocia a ESE contacto y reusa su deal si ya tiene uno.
 *  2. SIN token (fallback frío): se busca el contacto por email y, si no existe,
 *     se crea. El email es citext UNIQUE (portalId, email): reusarlo evita que
 *     completar el wizard dos veces rompa la transacción con un 500.
 */
export async function submitOnboarding(input: OnboardingSubmitDTO): Promise<OnboardingResult> {
  // Resolución del portal y, si vino, del contacto del token de invitación.
  // El token manda sobre el email: si es válido, sabemos exactamente a qué lead
  // pertenece la submission, sin ambigüedad ni posibilidad de spoofing por email.
  let tokenContactId: string | null = null
  let portalId: string
  if (input.token) {
    const resolved = verifyOnboardingToken(input.token)
    tokenContactId = resolved.contactId
    portalId = resolved.portalId
  } else {
    // Single-tenant: hay un solo portal. (Multi-tenant: el slug vendría en la URL.)
    const [p] = await db.select().from(portal).limit(1)
    if (!p) throw Errors.internal('No hay portal configurado')
    portalId = p.id
  }

  const decision = decideRouting(input.budget, input.clarity)
  // Nombre y apellido ya vienen separados y validados desde el wizard.
  const firstName = input.firstName
  const lastName = input.lastName
  const fullName = `${firstName} ${lastName}`.trim()
  // Enriquecimiento que guardamos en contact.custom (merge JSONB solo sobre
  // `custom`, según la regla del CRM). No persistimos el token.
  const enrich = {
    mainGoal: input.mainGoal,
    projectType: input.projectType,
    channelPreference: input.preference,
  }

  const result = await db.transaction(async (tx) => {
    // Empresa (opcional)
    let companyId: string | null = null
    if (input.company?.trim()) {
      const [co] = await tx
        .insert(company)
        .values({
          portalId,
          name: input.company.trim(),
          website: input.website?.trim() || null,
          custom: { source: 'onboarding' },
        })
        .returning({ id: company.id })
      companyId = co?.id ?? null
    }

    // ── Contacto (lead) ──────────────────────────────────────────────────────
    let contactId: string
    if (tokenContactId) {
      // Camino por token: el lead ya existe. Lo enriquecemos con lo recolectado
      // (merge JSONB solo en `custom`) y le vinculamos la empresa si la informó.
      contactId = tokenContactId
      await tx
        .update(contact)
        .set({
          ...(companyId ? { companyId } : {}),
          custom: sql`COALESCE(${contact.custom}, '{}'::jsonb) || ${JSON.stringify(enrich)}::jsonb`,
          updatedAt: new Date(),
        })
        .where(and(eq(contact.id, contactId), eq(contact.portalId, portalId)))
    } else {
      // Fallback frío: buscar por email; reusar si existe, crear si no.
      const [existing] = await tx
        .select({ id: contact.id })
        .from(contact)
        .where(and(eq(contact.portalId, portalId), eq(contact.email, input.email)))
        .limit(1)

      if (existing) {
        contactId = existing.id
        if (companyId) {
          await tx.update(contact).set({ companyId }).where(eq(contact.id, contactId))
        }
      } else {
        const [newContact] = await tx
          .insert(contact)
          .values({
            portalId,
            companyId,
            firstName,
            lastName,
            email: input.email,
            lifecycleStage: 'lead',
            custom: { source: 'onboarding', ...enrich },
          })
          .returning({ id: contact.id })
        if (!newContact) throw Errors.internal('No se pudo crear el contacto')
        contactId = newContact.id
      }
    }

    // ── Deal ─────────────────────────────────────────────────────────────────
    // Si el lead ya tiene un deal activo (lo creó su canal de origen, p.ej. el
    // setter), lo reusamos para no duplicar. Si no, creamos uno en la primera
    // etapa del primer pipeline del portal.
    let dealId: string | null = null
    const [existingDeal] = await tx
      .select({ id: deal.id })
      .from(deal)
      .where(and(eq(deal.primaryContactId, contactId), eq(deal.archived, false)))
      .orderBy(desc(deal.createdAt))
      .limit(1)

    if (existingDeal) {
      dealId = existingDeal.id
    } else {
      const [pl] = await tx
        .select({ id: pipeline.id })
        .from(pipeline)
        .where(eq(pipeline.portalId, portalId))
        .orderBy(asc(pipeline.createdAt))
        .limit(1)

      if (pl) {
        const [stage] = await tx
          .select({ id: pipelineStage.id })
          .from(pipelineStage)
          .where(eq(pipelineStage.pipelineId, pl.id))
          .orderBy(asc(pipelineStage.displayOrder))
          .limit(1)

        if (stage) {
          const dealName = `${input.company?.trim() || fullName} — ${PROJECT_TYPE_LABEL[input.projectType] ?? 'Proyecto'}`
          const [newDeal] = await tx
            .insert(deal)
            .values({
              portalId,
              name: dealName,
              amount: BUDGET_AMOUNT[input.budget] ?? '0.00',
              pipelineId: pl.id,
              stageId: stage.id,
              primaryContactId: contactId,
            })
            .returning({ id: deal.id })
          dealId = newDeal?.id ?? null
        }
      }
    }

    // ── Submission ───────────────────────────────────────────────────────────
    // Guardamos TODAS las respuestas + el routing + los IDs asociados. El token
    // NO se persiste (es un JWT válido; lo sacamos del objeto answers).
    const { token: _token, ...answers } = input
    const [sub] = await tx
      .insert(onboardingSubmission)
      .values({
        portalId,
        fullName,
        email: input.email,
        company: input.company?.trim() || null,
        answers: answers as unknown as Record<string, unknown>,
        decision,
        contactId,
        dealId,
      })
      .returning({ id: onboardingSubmission.id })
    if (!sub) throw Errors.internal('No se pudo guardar la submission')

    return { decision, submissionId: sub.id, contactId }
  })

  // Aviso a TODOS los admins: un lead completó el onboarding (lo hizo el lead,
  // no un admin, así que no se excluye a nadie).
  await notifyAdmins(portalId, {
    entityType: 'contact',
    entityId: result.contactId,
    type: 'onboarding_completed',
    title: `📋 ${fullName} completó el onboarding`,
    body: result.decision === 'call' ? 'Sugerido: agendar una llamada.' : 'Sugerido: enviar una propuesta.',
    actionUrl: `/admin/leads/${result.contactId}`,
  })

  return { decision: result.decision, submissionId: result.submissionId }
}

// ─── Invitación al onboarding (token) ────────────────────────────────────────

export interface OnboardingResolvedContact {
  firstName: string
  lastName: string
  email: string
  company: string | null
}

/**
 * Resuelve un token de invitación y devuelve los datos del lead para PRE-CARGAR
 * el wizard (nombre/email/empresa). Endpoint público: solo expone lo justo para
 * autocompletar el formulario, nada sensible.
 */
export async function resolveOnboardingInvite(token: string): Promise<OnboardingResolvedContact> {
  const { contactId, portalId } = verifyOnboardingToken(token)
  const [c] = await db
    .select({
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      companyId: contact.companyId,
    })
    .from(contact)
    .where(and(eq(contact.id, contactId), eq(contact.portalId, portalId)))
    .limit(1)
  if (!c) throw Errors.notFound('Contacto no encontrado')

  let companyName: string | null = null
  if (c.companyId) {
    const [co] = await db
      .select({ name: company.name })
      .from(company)
      .where(eq(company.id, c.companyId))
      .limit(1)
    companyName = co?.name ?? null
  }

  return {
    firstName: c.firstName ?? '',
    lastName: c.lastName ?? '',
    email: c.email ?? '',
    company: companyName,
  }
}

export interface OnboardingInviteResult {
  token: string
  url: string
}

/**
 * Genera el link tokenizado de onboarding para mandarle a un lead. Lo usa el
 * admin (y, a futuro, el setter como next-step tras calificar). Valida que el
 * contacto pertenezca al portal antes de firmar.
 */
export async function createOnboardingInvite(
  portalId: string,
  contactId: string,
): Promise<OnboardingInviteResult> {
  const [c] = await db
    .select({ id: contact.id })
    .from(contact)
    .where(and(eq(contact.id, contactId), eq(contact.portalId, portalId)))
    .limit(1)
  if (!c) throw Errors.notFound('Contacto no encontrado')

  const token = signOnboardingToken({ contactId, portalId })
  // El onboarding vive en el apex del admin (ADMIN_URL). En dev, localhost:3000.
  const base = env.ADMIN_URL ?? 'http://localhost:3000'
  const url = `${base}/onboarding?t=${encodeURIComponent(token)}`
  return { token, url }
}

// ─── Admin: listado para review ─────────────────────────────────────────────

export interface SubmissionListItem {
  id: string
  fullName: string
  email: string
  company: string | null
  decision: string
  answers: Record<string, unknown>
  contactId: string | null
  dealId: string | null
  dealName: string | null
  createdAt: string
}

function toListItem(row: SubmissionRow, dealName: string | null): SubmissionListItem {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    company: row.company,
    decision: row.decision,
    answers: row.answers ?? {},
    contactId: row.contactId,
    dealId: row.dealId,
    dealName,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listSubmissions(portalId: string): Promise<SubmissionListItem[]> {
  const rows = await db
    .select({ sub: onboardingSubmission, dealName: deal.name })
    .from(onboardingSubmission)
    .leftJoin(deal, eq(deal.id, onboardingSubmission.dealId))
    .where(eq(onboardingSubmission.portalId, portalId))
    .orderBy(desc(onboardingSubmission.createdAt))
    .limit(500)

  return rows.map(({ sub, dealName }) => toListItem(sub, dealName))
}

export async function getSubmission(portalId: string, id: string): Promise<SubmissionListItem> {
  const [row] = await db
    .select({ sub: onboardingSubmission, dealName: deal.name })
    .from(onboardingSubmission)
    .leftJoin(deal, eq(deal.id, onboardingSubmission.dealId))
    .where(and(eq(onboardingSubmission.id, id), eq(onboardingSubmission.portalId, portalId)))
    .limit(1)

  if (!row) throw Errors.notFound('Submission no encontrada')
  return toListItem(row.sub, row.dealName)
}
