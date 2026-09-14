/**
 * client-invoices.test.ts — Balance multimoneda de GET /api/client/invoices.
 *
 * `invoice.currency` y `payment.currency` son independientes: una factura en
 * ARS puede cobrarse con un pago en USD (o viceversa). `listClientInvoices`
 * calculaba el saldo como `Number(inv.total) - SUM(payment.amount)` —montos
 * CRUDOS, en sus monedas originales— así que una factura de 100.000 ARS
 * saldada con un pago de USD 100 (mismo valor real, monedas distintas)
 * mostraba un saldo absurdo en vez de 0. El fix agrega y balancea todo en
 * `amountBase` (USD, igual que el admin en `finance/invoices.ts`) y solo
 * convierte de vuelta a la moneda de la factura para el campo `balance` que
 * ve el cliente.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import { portal, contact, deal, clientAccount, clientDealAccess, invoice, payment } from '../../db/schema'
import { createId } from '../../lib/id'
import { ensurePipeline, type PipelineContext, listenForSupertest } from '../../test/helpers'

const app = buildApp()

let portalId: string
let ventas: PipelineContext
let dealId: string
let clientToken: string

// Vencida ampliamente en el pasado — no depende de la fecha en que corran los tests.
const PAST_DUE_DATE = '2020-01-01'

beforeAll(async () => {
  await listenForSupertest(app)

  // Portal PROPIO (no el "Test Portal" compartido de `ensurePortalAndUser`):
  // `financeSummary`/`financeSummary`-style aggregates de OTRAS suites (p. ej.
  // `finance.test.ts`) suman TODAS las facturas no-void del portal — insertar
  // acá facturas 'sent' en el portal compartido inflaba esos totales y hacía
  // fallar asserts de otro archivo que no tiene nada que ver con esto. Con un
  // portal nuevo por corrida (mismo patrón que `list-pagination.test.ts`), el
  // número de factura tampoco puede chocar con el UNIQUE (portal_id, number).
  const suffix = createId()
  const [p] = await db.insert(portal).values({ name: `Balance Multimoneda ${suffix}` }).returning()
  portalId = p!.id
  ventas = await ensurePipeline(portalId)

  const uniqueEmail = `invoices-balance-client-${suffix}@test.com`
  const [c] = await db
    .insert(contact)
    .values({ portalId, firstName: 'Balance', lastName: 'Test', email: uniqueEmail })
    .returning()
  // Sin `ownerId`: es nullable (`deal.owner_id` sin `.notNull()`) y este
  // portal no tiene ningún hub_user propio — no hace falta crear uno solo
  // para satisfacer una FK opcional.
  const [d] = await db
    .insert(deal)
    .values({
      portalId,
      name: 'Deal Balance Multimoneda',
      pipelineId: ventas.pipelineId,
      stageId: ventas.firstStageId,
      primaryContactId: c!.id,
    })
    .returning()
  dealId = d!.id

  const clerkUserId = `clerk_test_invoices_balance_${suffix}`
  const [ca] = await db
    .insert(clientAccount)
    .values({ portalId, contactId: c!.id, email: uniqueEmail, clerkUserId, isActive: true })
    .returning()
  await db.insert(clientDealAccess).values({ clientId: ca!.id, dealId })
  clientToken = `faketoken:${clerkUserId}`
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

const clientAuth = () => ({ Authorization: `Bearer ${clientToken}` })

describe('GET /api/client/invoices — balance en amountBase, no en montos crudos', () => {
  it('factura ARS saldada con un pago USD de igual amountBase → balance "0.00", NO vencida', async () => {
    // 100.000 ARS a un TC de 1000 ARS/USD → amountBase = 100 USD.
    const [inv] = await db
      .insert(invoice)
      .values({
        portalId,
        dealId,
        number: 9001,
        status: 'sent',
        currency: 'ARS',
        exchangeRate: '1000',
        total: '100000.00',
        amountBase: '100.00',
        dueDate: PAST_DUE_DATE,
      })
      .returning()

    // Pago en USD (moneda distinta a la factura) por el mismo valor real.
    await db.insert(payment).values({
      portalId,
      invoiceId: inv!.id,
      amount: '100.00',
      currency: 'USD',
      amountBase: '100.00',
    })

    const res = await request(app.server).get('/api/client/invoices').set(clientAuth())
    expect(res.status).toBe(200)

    const found = (res.body.data as Array<{ id: string; balance: string; isOverdue: boolean; currency: string }>).find(
      (i) => i.id === inv!.id,
    )
    expect(found).toBeDefined()
    // Saldada de verdad (100 USD de amountBase - 100 USD pagados = 0), no un
    // resto de mezclar 100000 ARS crudos contra 100 USD crudos.
    expect(found?.balance).toBe('0.00')
    expect(found?.isOverdue).toBe(false)
  })

  it('factura ARS vencida y PARCIALMENTE paga → isOverdue true, balance en la moneda de la factura (ARS)', async () => {
    // 100.000 ARS a TC 1000 → amountBase = 100 USD. Se paga USD 40 (40% del
    // amountBase) → balanceBase = 60 USD → balance mostrado = 60 * 1000 = 60000 ARS.
    const [inv] = await db
      .insert(invoice)
      .values({
        portalId,
        dealId,
        number: 9002,
        status: 'sent',
        currency: 'ARS',
        exchangeRate: '1000',
        total: '100000.00',
        amountBase: '100.00',
        dueDate: PAST_DUE_DATE,
      })
      .returning()

    await db.insert(payment).values({
      portalId,
      invoiceId: inv!.id,
      amount: '40.00',
      currency: 'USD',
      amountBase: '40.00',
    })

    const res = await request(app.server).get('/api/client/invoices').set(clientAuth())
    expect(res.status).toBe(200)

    const found = (res.body.data as Array<{ id: string; balance: string; isOverdue: boolean; currency: string }>).find(
      (i) => i.id === inv!.id,
    )
    expect(found).toBeDefined()
    expect(found?.currency).toBe('ARS')
    expect(found?.balance).toBe('60000.00')
    expect(found?.isOverdue).toBe(true)
  })
})
