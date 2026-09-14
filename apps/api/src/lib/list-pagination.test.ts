/**
 * list-pagination.test.ts — Listados paginados por cursor y agregados de finanzas.
 *
 * Corre contra un portal NUEVO por corrida, así los conteos y los totales son
 * exactos (la base de test acumula datos de otras suites). Todas las filas de un
 * mismo listado comparten el valor de orden (created_at, paid_at, expense_date…):
 * el empate obliga a que el cursor desempate por id. Sin el desempate, recorrer
 * con páginas de 2 repite o saltea filas y estos tests fallan.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { buildApp } from '../app'
import { db, closeDb } from '../db'
import {
  booking,
  changeRequest,
  clientAccount,
  clientDealAccess,
  clientOnboarding,
  company,
  contact,
  deal,
  deliverable,
  document,
  expense,
  hubUser,
  invoice,
  libraryItem,
  meetingType,
  note,
  payment,
  pipeline,
  pipelineStage,
  portal,
  proposal,
  retainer,
  task,
  workItem,
} from '../db/schema'
import { createId } from './id'
import { listenForSupertest } from '../test/helpers'

const app = buildApp({ rateLimit: false })

/** Valor de orden compartido por todas las filas sembradas. */
const T = new Date('2030-01-01T12:00:00.000Z')
const T_DATE = '2030-01-01'

let adminToken: string
let clientToken: string
let companyA: string
let companyB: string

interface Walk {
  ids: string[]
  pages: number
  firstMeta: Record<string, unknown>
}

/** `key`: campo que identifica cada item (el listado de onboardings expone `dealId`, uno por deal). */
async function walk(path: string, token: string, limit: number, key = 'id'): Promise<Walk> {
  const ids: string[] = []
  let firstMeta: Record<string, unknown> = {}
  let cursor: string | undefined
  let pages = 0
  do {
    const res = await request(app.server)
      .get(path)
      .query({ limit, ...(cursor ? { cursor } : {}) })
      .set({ Authorization: `Bearer ${token}` })
    expect(res.status, `${path} → ${JSON.stringify(res.body)}`).toBe(200)
    expect(res.body.data.length).toBeLessThanOrEqual(limit)
    ids.push(...(res.body.data as Array<Record<string, string>>).map((r) => r[key]!))
    if (pages === 0) firstMeta = res.body.meta
    cursor = res.body.meta.nextCursor ?? undefined
    pages++
    if (pages > 50) throw new Error(`${path}: el cursor no termina nunca`)
  } while (cursor)
  return { ids, pages, firstMeta }
}

beforeAll(async () => {
  await listenForSupertest(app)
  const suffix = createId()

  const [p] = await db.insert(portal).values({ name: `Paginación ${suffix}` }).returning()
  const portalId = p!.id
  const adminClerkId = `clerk_test_pagination_${suffix}`
  const [owner] = await db
    .insert(hubUser)
    .values({ portalId, email: `pagination-${suffix}@test.com`, role: 'owner', firstName: 'Pag', clerkUserId: adminClerkId })
    .returning()
  adminToken = `faketoken:${adminClerkId}`

  const [pl] = await db.insert(pipeline).values({ portalId, label: 'Ventas' }).returning()
  const [stage] = await db.insert(pipelineStage).values({ pipelineId: pl!.id, label: 'Nuevo', displayOrder: 0 }).returning()

  const [cA] = await db.insert(company).values({ portalId, name: `Empresa A ${suffix}` }).returning()
  const [cB] = await db.insert(company).values({ portalId, name: `Empresa B ${suffix}` }).returning()
  companyA = cA!.id
  companyB = cB!.id

  const contacts = await db
    .insert(contact)
    .values([0, 1, 2].map((i) => ({ portalId, firstName: 'Cli', lastName: `${i}`, email: `pag-contact-${i}-${suffix}@test.com` })))
    .returning()
  const deals = await db
    .insert(deal)
    .values(
      [0, 1, 2].map((i) => ({
        portalId,
        name: `Deal paginación ${i}`,
        pipelineId: pl!.id,
        stageId: stage!.id,
        primaryContactId: contacts[i]!.id,
        ownerId: owner!.id,
      })),
    )
    .returning()
  const dealId = deals[0]!.id

  const clientClerkId = `clerk_test_pagination_client_${suffix}`
  const accounts = await db
    .insert(clientAccount)
    .values(
      [0, 1, 2].map((i) => ({
        portalId,
        contactId: contacts[i]!.id,
        email: contacts[i]!.email!,
        clerkUserId: i === 0 ? clientClerkId : `${clientClerkId}_${i}`,
        isActive: true,
        createdAt: T,
      })),
    )
    .returning()
  clientToken = `faketoken:${clientClerkId}`
  await db.insert(clientDealAccess).values(deals.map((d) => ({ clientId: accounts[0]!.id, dealId: d.id })))

  // Facturas: 1-3 de A (100, cobros de 10), 4 de B (100, cobro de 5), 5 anulada
  // (no suma), 6 de B vencida y sobrepagada (su saldo es 0, nunca negativo).
  const invoices = await db
    .insert(invoice)
    .values([
      ...[1, 2, 3].map((n) => ({ number: n, companyId: companyA, status: 'sent', amountBase: '100.00' })),
      { number: 4, companyId: companyB, status: 'sent', amountBase: '100.00' },
      { number: 5, companyId: companyB, status: 'void', amountBase: '999.00' },
      { number: 6, companyId: companyB, status: 'overdue', amountBase: '50.00' },
    ].map((inv) => ({ ...inv, portalId, dealId, currency: 'USD', total: inv.amountBase, createdAt: T })))
    .returning()
  await db.insert(payment).values([
    ...invoices.slice(0, 3).map((inv) => ({ invoiceId: inv.id, amount: '10.00', amountBase: '10.00' })),
    { invoiceId: invoices[3]!.id, amount: '5.00', amountBase: '5.00' },
    { invoiceId: invoices[5]!.id, amount: '80.00', amountBase: '80.00' },
  ].map((pay) => ({ ...pay, portalId, currency: 'USD', paidAt: T })))

  await db.insert(expense).values([
    ...[0, 1, 2].map((i) => ({ description: `Gasto ${i}`, amount: '20.00', currency: 'USD', amountBase: '20.00', category: 'software' })),
    { description: 'Gasto en pesos', amount: '1000.00', currency: 'ARS', amountBase: '1.00', category: 'otros' },
  ].map((e) => ({ ...e, portalId, expenseDate: T_DATE })))

  await db.insert(retainer).values(
    [0, 1, 2].map(() => ({ portalId, companyId: companyA, amount: '50.00', currency: 'USD', amountBase: '50.00', billingDay: 1, startDate: T_DATE, status: 'active' })),
  )

  const three = [0, 1, 2]
  await db.insert(note).values(three.map((i) => ({ portalId, body: `Nota ${i}`, createdAt: T })))
  await db.insert(task).values(three.map((i) => ({ portalId, title: `Tarea ${i}`, createdAt: T })))
  await db.insert(proposal).values(
    three.map((i) => ({ portalId, title: `Propuesta ${i}`, content: {} as typeof proposal.$inferInsert.content, createdAt: T })),
  )
  await db.insert(document).values(three.map((i) => ({ portalId, dealId, name: `Documento ${i}`, type: 'contract', createdAt: T })))
  await db.insert(libraryItem).values(three.map((i) => ({ portalId, type: 'document', name: `Ítem ${i}`, createdAt: T })))
  await db.insert(workItem).values(three.map((i) => ({ portalId, type: 'bug', title: `Work item ${i}`, createdAt: T })))
  await db.insert(deliverable).values(three.map((i) => ({ dealId, title: `Entregable ${i}`, type: 'design', createdAt: T })))
  await db.insert(changeRequest).values(
    three.map((i) => ({ portalId, dealId, number: i + 1, title: `CR ${i}`, description: 'Cambio', status: 'sent', createdAt: T })),
  )
  // Dos en curso y uno completo, todos con el mismo updatedAt: ejercita el cursor de tres valores.
  await db.insert(clientOnboarding).values(
    deals.map((d, i) => ({ portalId, dealId: d.id, clientId: accounts[0]!.id, status: i < 2 ? 'in_progress' : 'completed', updatedAt: T })),
  )

  const [mt] = await db
    .insert(meetingType)
    .values({ portalId, ownerId: owner!.id, slug: `pag-${suffix}`, name: 'Paginación', durationMin: 30 })
    .returning()
  // Canceladas: el EXCLUDE solo mira confirmadas, así pueden compartir horario.
  await db.insert(booking).values(
    three.map((i) => ({
      meetingTypeId: mt!.id,
      ownerId: owner!.id,
      guestName: `Invitado ${i}`,
      guestEmail: `pag-guest-${i}-${suffix}@test.com`,
      startsAt: T,
      endsAt: new Date(T.getTime() + 30 * 60 * 1000),
      status: 'cancelled',
    })),
  )
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

describe('listados paginados por cursor', () => {
  const adminCases: Array<[path: string, total: number, key?: string]> = [
    ['/api/finance/invoices', 6],
    ['/api/finance/payments', 5],
    ['/api/finance/expenses', 4],
    ['/api/finance/retainers', 3],
    ['/api/change-requests', 3],
    ['/api/documents', 3],
    ['/api/library', 3],
    ['/api/work-items', 3],
    ['/api/deliverables', 3],
    ['/api/notes', 3],
    ['/api/tasks', 3],
    ['/api/proposals', 3],
    ['/api/onboarding', 3, 'dealId'],
    ['/api/branding/clients', 3],
    ['/api/clients/accounts', 3],
    ['/api/calendar/bookings', 3],
  ]
  const clientCases: Array<[path: string, total: number]> = [
    ['/api/client/change-requests', 3],
    ['/api/client/deliverables', 3],
    ['/api/client/documents', 3],
    ['/api/client/invoices', 6],
  ]

  const cases = [
    ...adminCases.map(([path, total, key]) => ({ path, total, key: key ?? 'id', token: () => adminToken })),
    ...clientCases.map(([path, total]) => ({ path, total, key: 'id', token: () => clientToken })),
  ]

  it.each(cases)('$path: páginas de 2 recorren todo sin repetir ni saltear, en el mismo orden que una sola página', async ({ path, total, key, token }) => {
    const small = await walk(path, token(), 2, key)
    const big = await walk(path, token(), 100, key)

    expect(big.pages).toBe(1)
    expect(new Set(big.ids).size).toBe(total)
    expect(new Set(small.ids).size).toBe(total)
    expect(small.ids).toEqual(big.ids)
    expect(small.pages).toBe(Math.ceil(total / 2))
  })

  it('un cursor manipulado en un listado ordenado por fecha se ignora (200, no 500)', async () => {
    const bogus = Buffer.from('no-es-fecha|abc').toString('base64url')
    const res = await request(app.server)
      .get('/api/finance/expenses')
      .query({ limit: 2, cursor: bogus })
      .set({ Authorization: `Bearer ${adminToken}` })
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
  })
})

describe('agregados de finanzas en SQL', () => {
  it('cobros: totalPeriod es la suma del filtro completo, no de la página, y el filtro por empresa corre en SQL', async () => {
    const all = await walk('/api/finance/payments', adminToken, 2)
    expect(Number(all.firstMeta.totalPeriod)).toBe(115)

    const ofA = await walk(`/api/finance/payments?companyId=${companyA}`, adminToken, 2)
    expect(ofA.ids).toHaveLength(3)
    expect(ofA.pages).toBe(2)
    expect(Number(ofA.firstMeta.totalPeriod)).toBe(30)
  })

  it('expenseSummary: total USD, total ARS con el monto original y desglose por categoría', async () => {
    const res = await request(app.server).get('/api/finance/expenses/summary').set({ Authorization: `Bearer ${adminToken}` })
    expect(res.status).toBe(200)
    expect(Number(res.body.data.totalExpenses)).toBe(61)
    expect(Number(res.body.data.totalExpensesArs)).toBe(1000)
    expect(Object.fromEntries(Object.entries(res.body.data.byCategory).map(([k, v]) => [k, Number(v)]))).toEqual({ software: 60, otros: 1 })
  })

  it('financeSummary: facturado sin anuladas, conteo por estado, CxC con saldos nunca negativos y MRR', async () => {
    const res = await request(app.server).get('/api/finance/summary').set({ Authorization: `Bearer ${adminToken}` })
    expect(res.status).toBe(200)
    const data = res.body.data
    expect(Number(data.totalInvoiced)).toBe(450)
    expect(data.invoicesByStatus).toEqual({ sent: 4, void: 1, overdue: 1 })
    // (100−10)×3 + (100−5) + max(0, 50−80) = 365
    expect(Number(data.outstanding)).toBe(365)
    expect(Number(data.totalPaid)).toBe(115)
    expect(Number(data.totalExpenses)).toBe(61)
    expect(Number(data.mrr)).toBe(150)
  })

  it('topDebtors: saldo agrupado por empresa, de mayor a menor', async () => {
    const res = await request(app.server).get('/api/finance/summary/debtors').set({ Authorization: `Bearer ${adminToken}` })
    expect(res.status).toBe(200)
    const rows = res.body.data as Array<{ companyId: string; outstanding: string }>
    expect(rows.map((r) => r.companyId)).toEqual([companyA, companyB])
    expect(rows.map((r) => Number(r.outstanding))).toEqual([270, 95])
  })
})
