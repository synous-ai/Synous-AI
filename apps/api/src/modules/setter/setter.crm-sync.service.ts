import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db'
import {
  setterLead,
  setterPerson,
  setterTenant,
  contact,
  deal,
  pipeline,
  pipelineStage,
  hubUser,
} from '../../db/schema'
import { recordFieldChanges, writeAudit, type Tx } from '../../lib/audit'
import { changeStage } from '../deals/stage.service'
import { logSetterEvent } from './setter.events.service'

/**
 * Sincroniza un lead del setter con el CRM (automático por etapa):
 *  - crea/linkea un `contact` del CRM (el lead del setter ES un lead del CRM)
 *  - mapea el estado del setter al lifecycle del contact (lead→mql→sql→opportunity)
 *  - al calificar, crea un `deal` linkeado; al BOOKED, lo avanza una etapa
 *
 * El actor de las acciones es el owner del portal (el setter actúa en su nombre).
 * NO fuerza la conversión a cliente: eso queda al flujo normal del CRM (deal won).
 */

const STATUS_TO_LIFECYCLE: Record<string, string> = {
  ENGAGED: 'lead',
  QUALIFYING: 'mql',
  QUALIFIED: 'sql',
  BOOKING: 'opportunity',
  BOOKED: 'opportunity',
  NOT_INTERESTED: 'other',
  OPTED_OUT: 'other',
}

const CREATE_CONTACT_STATUSES = new Set([
  'ENGAGED',
  'QUALIFYING',
  'QUALIFIED',
  'BOOKING',
  'BOOKED',
  'HANDED_OFF',
])
const CREATE_DEAL_STATUSES = new Set(['QUALIFIED', 'BOOKING', 'BOOKED'])

const LIFECYCLE_RANK: Record<string, number> = {
  lead: 1,
  mql: 2,
  sql: 3,
  opportunity: 4,
  customer: 5,
}

/** ¿No deberíamos mover el lifecycle del contact a `next`? (evita retroceder). */
function isDowngrade(current: string, next: string): boolean {
  if (next === 'other') return false // terminal negativo: siempre permitido
  if (current === 'customer') return true // nunca degradar a un cliente
  return (LIFECYCLE_RANK[next] ?? 0) < (LIFECYCLE_RANK[current] ?? 0)
}

async function findOrCreateContact(
  tx: Tx,
  portalId: string,
  person: typeof setterPerson.$inferSelect,
  lifecycle: string,
  actorId: string | null,
): Promise<string> {
  // Dedup por teléfono (el setter no captura email; el CRM no tiene unique de phone).
  if (person.phone) {
    const [existing] = await tx
      .select({ id: contact.id })
      .from(contact)
      .where(
        and(eq(contact.portalId, portalId), eq(contact.phone, person.phone), eq(contact.archived, false)),
      )
      .limit(1)
    if (existing) return existing.id
  }

  const [created] = await tx
    .insert(contact)
    .values({
      portalId,
      ownerId: actorId,
      firstName: person.name,
      phone: person.phone,
      lifecycleStage: lifecycle,
      custom: { source: 'setter', setterPersonId: person.id },
    })
    .returning({ id: contact.id })

  if (actorId) {
    await writeAudit({
      tx,
      portalId,
      userId: actorId,
      entityType: 'contact',
      entityId: created!.id,
      action: 'CREATE',
      payload: { source: 'setter' },
    })
  }
  return created!.id
}

async function createSetterDeal(
  tx: Tx,
  portalId: string,
  contactId: string,
  person: typeof setterPerson.$inferSelect,
  tenantName: string,
  actorId: string | null,
): Promise<string | null> {
  // Explícito por label 'Ventas' primero (mismo criterio que db/seed.ts): con
  // el pipeline "Producción" ya seedeado, ordenar por createdAt asc y tomar
  // el primero deja de ser determinístico — un reorden o un seed parcial
  // podría enrutar leads del setter a Producción/Diagnóstico. Solo cae al más
  // viejo si el portal no tiene un pipeline "Ventas" (legacy/datos de test).
  let [pl] = await tx
    .select({ id: pipeline.id })
    .from(pipeline)
    .where(and(eq(pipeline.portalId, portalId), eq(pipeline.archived, false), eq(pipeline.label, 'Ventas')))
    .limit(1)
  if (!pl) {
    ;[pl] = await tx
      .select({ id: pipeline.id })
      .from(pipeline)
      .where(and(eq(pipeline.portalId, portalId), eq(pipeline.archived, false)))
      .orderBy(asc(pipeline.createdAt))
      .limit(1)
  }
  if (!pl) return null

  const [stage] = await tx
    .select({ id: pipelineStage.id })
    .from(pipelineStage)
    .where(and(eq(pipelineStage.pipelineId, pl.id), eq(pipelineStage.archived, false)))
    .orderBy(asc(pipelineStage.displayOrder))
    .limit(1)
  if (!stage) return null

  const [created] = await tx
    .insert(deal)
    .values({
      portalId,
      ownerId: actorId,
      pipelineId: pl.id,
      stageId: stage.id,
      primaryContactId: contactId,
      name: `${person.name ?? 'Lead'} — ${tenantName}`,
      currency: 'USD',
      custom: { source: 'setter' },
    })
    .returning({ id: deal.id })

  if (actorId) {
    await writeAudit({
      tx,
      portalId,
      userId: actorId,
      entityType: 'deal',
      entityId: created!.id,
      action: 'CREATE',
      payload: { source: 'setter' },
    })
  }
  return created!.id
}

/** Avanza el deal a la siguiente etapa NO ganada/cerrada (vía changeStage). */
async function advanceDealOnBooked(portalId: string, actorId: string, dealId: string): Promise<void> {
  const [d] = await db
    .select({ pipelineId: deal.pipelineId, stageId: deal.stageId })
    .from(deal)
    .where(eq(deal.id, dealId))
    .limit(1)
  if (!d) return

  const stages = await db
    .select({ id: pipelineStage.id, isWon: pipelineStage.isWon, isClosed: pipelineStage.isClosed })
    .from(pipelineStage)
    .where(eq(pipelineStage.pipelineId, d.pipelineId))
    .orderBy(asc(pipelineStage.displayOrder))

  const idx = stages.findIndex((s) => s.id === d.stageId)
  const next = idx >= 0 ? stages[idx + 1] : undefined
  // Solo avanzar a una etapa segura (nunca auto-ganar: eso es decisión humana).
  if (next && !next.isWon && !next.isClosed) {
    await changeStage(portalId, actorId, dealId, next.id)
  }
}

export async function syncLeadToCrm(leadId: string): Promise<void> {
  const [lead] = await db.select().from(setterLead).where(eq(setterLead.id, leadId)).limit(1)
  if (!lead) return
  const [person] = await db
    .select()
    .from(setterPerson)
    .where(eq(setterPerson.id, lead.personId))
    .limit(1)
  if (!person) return
  const [tenant] = await db
    .select({ portalId: setterTenant.portalId, name: setterTenant.name })
    .from(setterTenant)
    .where(eq(setterTenant.id, lead.tenantId))
    .limit(1)
  if (!tenant) return

  const portalId = tenant.portalId
  const status = lead.status
  const lifecycle = STATUS_TO_LIFECYCLE[status]

  // Actor: el owner del portal (el setter actúa en su nombre).
  const [owner] =
    (await db
      .select({ id: hubUser.id })
      .from(hubUser)
      .where(and(eq(hubUser.portalId, portalId), eq(hubUser.role, 'owner')))
      .limit(1)) ?? []
  const [anyUser] = owner
    ? [owner]
    : await db.select({ id: hubUser.id }).from(hubUser).where(eq(hubUser.portalId, portalId)).limit(1)
  const actorId = anyUser?.id ?? null

  let advanceDealId: string | null = null
  let linkedContactId: string | null = null
  let newDealId: string | null = null

  await db.transaction(async (tx) => {
    // 1. Contact (crear/linkear)
    let contactId = person.crmContactId
    if (!contactId) {
      if (!CREATE_CONTACT_STATUSES.has(status)) return // no crear contact para negativos sin contact previo
      contactId = await findOrCreateContact(tx, portalId, person, lifecycle ?? 'lead', actorId)
      await tx.update(setterPerson).set({ crmContactId: contactId }).where(eq(setterPerson.id, person.id))
      linkedContactId = contactId
    }

    // 2. Lifecycle (mapear estado del setter, sin retroceder)
    if (lifecycle) {
      const [c] = await tx
        .select({ lifecycleStage: contact.lifecycleStage })
        .from(contact)
        .where(eq(contact.id, contactId))
        .limit(1)
      if (c && c.lifecycleStage !== lifecycle && !isDowngrade(c.lifecycleStage, lifecycle)) {
        await tx
          .update(contact)
          .set({ lifecycleStage: lifecycle, updatedAt: new Date() })
          .where(eq(contact.id, contactId))
        if (actorId) {
          await recordFieldChanges({
            tx,
            portalId,
            entityType: 'contact',
            entityId: contactId,
            before: { lifecycleStage: c.lifecycleStage },
            after: { lifecycleStage: lifecycle },
            changedBy: actorId,
            sourceType: 'setter',
          })
        }
      }
    }

    // 3. Deal (crear al calificar; linkear)
    if (CREATE_DEAL_STATUSES.has(status) && !lead.crmDealId) {
      const dealId = await createSetterDeal(tx, portalId, contactId, person, tenant.name, actorId)
      if (dealId) {
        await tx.update(setterLead).set({ crmDealId: dealId }).where(eq(setterLead.id, lead.id))
        newDealId = dealId
        if (status === 'BOOKED') advanceDealId = dealId
      }
    } else if (status === 'BOOKED' && lead.crmDealId) {
      advanceDealId = lead.crmDealId
    }
  })

  // 4. Avanzar el deal una etapa en BOOKED (changeStage corre su propia tx).
  if (advanceDealId && actorId) {
    await advanceDealOnBooked(portalId, actorId, advanceDealId)
  }

  // Consola.
  if (linkedContactId) {
    void logSetterEvent({
      tenantId: lead.tenantId,
      level: 'success',
      type: 'sync',
      message: `Lead sincronizado al CRM como contacto (${lifecycle ?? 'lead'})`,
      leadId,
    })
  }
  if (newDealId) {
    void logSetterEvent({
      tenantId: lead.tenantId,
      level: 'success',
      type: 'sync',
      message: 'Deal creado en el CRM',
      leadId,
    })
  }
}
