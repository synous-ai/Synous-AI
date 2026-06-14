/**
 * setter.crm-sync.test.ts — Sincronización setter ↔ CRM
 *
 *  - lead QUALIFYING → crea contact (lifecycle mql) y linkea person.crmContactId
 *  - lead QUALIFIED → crea contact (sql) + deal, linkea lead.crmDealId
 *  - dedup: si ya existe un contact con ese teléfono, lo reusa (no duplica)
 *  - opt-out sin contact previo → no crea contact; con contact previo → 'other'
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
import { db, closeDb } from '../../db'
import {
  setterTenant,
  setterPerson,
  setterLead,
  setterConversation,
  contact,
  deal,
} from '../../db/schema'
import { createId } from '../../lib/id'
import { ensurePortalAndUser, ensurePipeline } from '../../test/helpers'
import { syncLeadToCrm } from './setter.crm-sync.service'

let tenantId: string
let portalId: string

beforeAll(async () => {
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  await ensurePipeline(portalId) // el setter crea deals en el primer pipeline/etapa
  const [t] = await db
    .insert(setterTenant)
    .values({
      portalId,
      name: `CRM Sync ${Date.now()}`,
      businessBrief: 'Brief',
      agentName: 'Tom',
      ownerName: 'Owner',
    })
    .returning()
  tenantId = t!.id
})

afterAll(async () => {
  // Limpia los registros del CRM creados por el setter (no cascadean del tenant).
  await db.delete(deal).where(and(eq(deal.portalId, portalId), sql`(${deal.custom}->>'source') = 'setter'`))
  await db
    .delete(contact)
    .where(and(eq(contact.portalId, portalId), sql`(${contact.custom}->>'source') = 'setter'`))
  await db.delete(setterTenant).where(eq(setterTenant.id, tenantId)) // cascade setter_*
  await closeDb()
})

async function setupLead(status: string, phone?: string): Promise<{ leadId: string; personId: string; phone: string }> {
  const ph = phone ?? `+5491${createId().slice(0, 9)}`
  const [person] = await db
    .insert(setterPerson)
    .values({ tenantId, phone: ph, name: 'Lead Sync' })
    .returning()
  await db.insert(setterConversation).values({ tenantId, personId: person!.id })
  const [lead] = await db.insert(setterLead).values({ tenantId, personId: person!.id, status }).returning()
  return { leadId: lead!.id, personId: person!.id, phone: ph }
}

describe('syncLeadToCrm', () => {
  it('QUALIFYING → crea contact (mql) y linkea person.crmContactId', async () => {
    const { leadId, personId } = await setupLead('QUALIFYING')
    await syncLeadToCrm(leadId)

    const [person] = await db.select().from(setterPerson).where(eq(setterPerson.id, personId)).limit(1)
    expect(person!.crmContactId).toBeTruthy()

    const [c] = await db.select().from(contact).where(eq(contact.id, person!.crmContactId!)).limit(1)
    expect(c!.lifecycleStage).toBe('mql')
    expect((c!.custom as Record<string, unknown>)?.['source']).toBe('setter')
  })

  it('QUALIFIED → crea contact (sql) + deal y linkea lead.crmDealId', async () => {
    const { leadId, personId } = await setupLead('QUALIFIED')
    await syncLeadToCrm(leadId)

    const [person] = await db.select().from(setterPerson).where(eq(setterPerson.id, personId)).limit(1)
    const [c] = await db.select().from(contact).where(eq(contact.id, person!.crmContactId!)).limit(1)
    expect(c!.lifecycleStage).toBe('sql')

    const [lead] = await db.select().from(setterLead).where(eq(setterLead.id, leadId)).limit(1)
    expect(lead!.crmDealId).toBeTruthy()

    const [d] = await db.select().from(deal).where(eq(deal.id, lead!.crmDealId!)).limit(1)
    expect(d!.primaryContactId).toBe(person!.crmContactId)
  })

  it('dedup: reusa un contact existente con el mismo teléfono', async () => {
    const phone = `+5491${createId().slice(0, 9)}`
    // Contact preexistente en el CRM con ese teléfono (no del setter).
    const [pre] = await db
      .insert(contact)
      .values({ portalId, phone, firstName: 'Preexistente', lifecycleStage: 'lead', custom: { source: 'setter' } })
      .returning({ id: contact.id })

    const { leadId, personId } = await setupLead('ENGAGED', phone)
    await syncLeadToCrm(leadId)

    const [person] = await db.select().from(setterPerson).where(eq(setterPerson.id, personId)).limit(1)
    expect(person!.crmContactId).toBe(pre!.id) // reusó, no creó otro

    const rows = await db
      .select()
      .from(contact)
      .where(and(eq(contact.portalId, portalId), eq(contact.phone, phone)))
    expect(rows.length).toBe(1)
  })

  it('opt-out sin contact previo → no crea contact', async () => {
    const { leadId, personId } = await setupLead('OPTED_OUT')
    await syncLeadToCrm(leadId)
    const [person] = await db.select().from(setterPerson).where(eq(setterPerson.id, personId)).limit(1)
    expect(person!.crmContactId).toBeNull()
  })

  it('opt-out con contact previo → lifecycle other', async () => {
    const { leadId, personId } = await setupLead('ENGAGED')
    await syncLeadToCrm(leadId) // crea contact (lead)
    await db.update(setterLead).set({ status: 'OPTED_OUT' }).where(eq(setterLead.id, leadId))
    await syncLeadToCrm(leadId) // marca other

    const [person] = await db.select().from(setterPerson).where(eq(setterPerson.id, personId)).limit(1)
    const [c] = await db.select().from(contact).where(eq(contact.id, person!.crmContactId!)).limit(1)
    expect(c!.lifecycleStage).toBe('other')
  })
})
