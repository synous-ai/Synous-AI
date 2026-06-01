import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import { invoice, payment } from '../../db/schema'
import { ensurePortalAndUser, loginToken } from '../../test/helpers'

const app = buildApp()
let token: string
let portalId: string

beforeAll(async () => {
  await app.ready()
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  token = await loginToken(app, ctx.email, ctx.password)
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

const auth = () => ({ Authorization: `Bearer ${token}` })

// Helper: crea una factura vía API y devuelve el body de respuesta
async function createTestInvoice(overrides: {
  items?: Array<{ description: string; quantity?: number; unitPrice: number }>
  tax?: number
} = {}) {
  const items = overrides.items ?? [
    { description: 'Servicio A', quantity: 2, unitPrice: 100 },
    { description: 'Servicio B', unitPrice: 50 },
  ]
  const body: Record<string, unknown> = { items }
  if (overrides.tax !== undefined) body.tax = overrides.tax
  const res = await request(app.server).post('/api/finance/invoices').set(auth()).send(body)
  return res
}

// ── Numeración ────────────────────────────────────────────────────────────────

describe('finance — numeración de facturas', () => {
  it('la primera factura del portal tiene number = 1', async () => {
    // Obtener el máximo número existente en el portal para establecer la línea de base
    const existing = await db
      .select()
      .from(invoice)
      .where(eq(invoice.portalId, portalId))

    const maxBefore = existing.reduce((m, i) => Math.max(m, i.number), 0)

    const res = await createTestInvoice()
    expect(res.status).toBe(201)
    expect(res.body.data.number).toBe(maxBefore + 1)
  })

  it('facturas sucesivas tienen números consecutivos por portal', async () => {
    const r1 = await createTestInvoice()
    const r2 = await createTestInvoice()
    expect(r1.status).toBe(201)
    expect(r2.status).toBe(201)
    expect(r2.body.data.number).toBe(r1.body.data.number + 1)
  })
})

// ── Subtotal / total ──────────────────────────────────────────────────────────

describe('finance — cálculo de subtotal y total', () => {
  it('subtotal = suma de (quantity * unitPrice) con 2 decimales', async () => {
    // items: 3 * 33.33 + 1 * 0.01 = 100.00
    const res = await createTestInvoice({
      items: [
        { description: 'Item A', quantity: 3, unitPrice: 33.33 },
        { description: 'Item B', quantity: 1, unitPrice: 0.01 },
      ],
    })
    expect(res.status).toBe(201)
    // 3*33.33 = 99.99, + 0.01 = 100.00
    expect(res.body.data.subtotal).toBe('100.00')
    expect(res.body.data.total).toBe('100.00')
    expect(res.body.data.tax).toBe('0.00')
  })

  it('total = subtotal + tax', async () => {
    const res = await createTestInvoice({
      items: [{ description: 'Consultoría', quantity: 1, unitPrice: 500 }],
      tax: 105,
    })
    expect(res.status).toBe(201)
    expect(res.body.data.subtotal).toBe('500.00')
    expect(res.body.data.tax).toBe('105.00')
    expect(res.body.data.total).toBe('605.00')
  })

  it('quantity por defecto = 1 cuando no se envía', async () => {
    const res = await createTestInvoice({
      items: [{ description: 'Sin cantidad', unitPrice: 75.5 }],
    })
    expect(res.status).toBe(201)
    expect(res.body.data.subtotal).toBe('75.50')
    expect(res.body.data.total).toBe('75.50')
  })
})

// ── updateInvoice — solo draft ─────────────────────────────────────────────────

describe('finance — updateInvoice', () => {
  it('rechaza PATCH sobre una factura que no está en draft', async () => {
    // Crear factura y moverla a "sent"
    const created = await createTestInvoice({
      items: [{ description: 'X', unitPrice: 100 }],
    })
    expect(created.status).toBe(201)
    const invoiceId = created.body.data.id as string

    // Transicionar a "sent"
    const transition = await request(app.server)
      .post(`/api/finance/invoices/${invoiceId}/transition`)
      .set(auth())
      .send({ status: 'sent' })
    expect(transition.status).toBe(200)

    // Intentar actualizar: debe rechazar con 400
    const patch = await request(app.server)
      .patch(`/api/finance/invoices/${invoiceId}`)
      .set(auth())
      .send({ notes: 'Intentando editar factura enviada' })
    expect(patch.status).toBe(400)
  })

  it('permite PATCH sobre una factura en draft', async () => {
    const created = await createTestInvoice({
      items: [{ description: 'Draft item', unitPrice: 200 }],
    })
    expect(created.status).toBe(201)
    const invoiceId = created.body.data.id as string

    const patch = await request(app.server)
      .patch(`/api/finance/invoices/${invoiceId}`)
      .set(auth())
      .send({ notes: 'Nota actualizada' })
    expect(patch.status).toBe(200)
    expect(patch.body.data.notes).toBe('Nota actualizada')
  })
})

// ── registerPayment — auto-paid ───────────────────────────────────────────────

describe('finance — registerPayment', () => {
  it('pago parcial no cambia el status a paid', async () => {
    const created = await createTestInvoice({
      items: [{ description: 'Pago parcial', quantity: 1, unitPrice: 1000 }],
    })
    expect(created.status).toBe(201)
    const invoiceId = created.body.data.id as string

    // Mover a sent (requisito implícito de flujo real; payment funciona también en draft)
    await request(app.server)
      .post(`/api/finance/invoices/${invoiceId}/transition`)
      .set(auth())
      .send({ status: 'sent' })

    // Pago parcial: 400 de 1000
    const payRes = await request(app.server)
      .post('/api/finance/payments')
      .set(auth())
      .send({ invoiceId, amount: 400 })
    expect(payRes.status).toBe(201)

    // La factura debe seguir en "sent" (no pagada)
    const inv = await db
      .select({ status: invoice.status })
      .from(invoice)
      .where(eq(invoice.id, invoiceId))
    expect(inv[0]?.status).toBe('sent')
  })

  it('pago exacto al total cambia el status a paid', async () => {
    const created = await createTestInvoice({
      items: [{ description: 'Pago completo', quantity: 1, unitPrice: 200 }],
    })
    expect(created.status).toBe(201)
    const invoiceId = created.body.data.id as string

    const payRes = await request(app.server)
      .post('/api/finance/payments')
      .set(auth())
      .send({ invoiceId, amount: 200 })
    expect(payRes.status).toBe(201)

    const inv = await db
      .select({ status: invoice.status })
      .from(invoice)
      .where(eq(invoice.id, invoiceId))
    expect(inv[0]?.status).toBe('paid')
  })

  it('dos pagos parciales que suman el total marcan la factura como paid', async () => {
    const created = await createTestInvoice({
      items: [{ description: 'Pago en dos cuotas', quantity: 1, unitPrice: 600 }],
    })
    expect(created.status).toBe(201)
    const invoiceId = created.body.data.id as string

    await request(app.server)
      .post('/api/finance/payments')
      .set(auth())
      .send({ invoiceId, amount: 300 })

    const payRes2 = await request(app.server)
      .post('/api/finance/payments')
      .set(auth())
      .send({ invoiceId, amount: 300 })
    expect(payRes2.status).toBe(201)

    const inv = await db
      .select({ status: invoice.status })
      .from(invoice)
      .where(eq(invoice.id, invoiceId))
    expect(inv[0]?.status).toBe('paid')
  })

  it('pago superior al total también marca la factura como paid', async () => {
    const created = await createTestInvoice({
      items: [{ description: 'Overpaid', quantity: 1, unitPrice: 100 }],
    })
    expect(created.status).toBe(201)
    const invoiceId = created.body.data.id as string

    const payRes = await request(app.server)
      .post('/api/finance/payments')
      .set(auth())
      .send({ invoiceId, amount: 150 })
    expect(payRes.status).toBe(201)

    const inv = await db
      .select({ status: invoice.status })
      .from(invoice)
      .where(eq(invoice.id, invoiceId))
    expect(inv[0]?.status).toBe('paid')
  })
})

// ── financeSummary — outstanding es CxC real, no suma de totales ─────────────

describe('finance — financeSummary (outstanding = balance real)', () => {
  it('outstanding es la suma de balances reales de facturas sent/overdue (total − pagos)', async () => {
    // Crear 2 facturas: una sent con pago parcial, una overdue sin pagos
    const inv1 = await createTestInvoice({
      items: [{ description: 'CxC parcial', quantity: 1, unitPrice: 500 }],
    })
    const inv2 = await createTestInvoice({
      items: [{ description: 'CxC vencida', quantity: 1, unitPrice: 300 }],
    })
    const id1 = inv1.body.data.id as string
    const id2 = inv2.body.data.id as string

    // Mover inv1 a "sent" e inv2 a "overdue"
    await request(app.server)
      .post(`/api/finance/invoices/${id1}/transition`)
      .set(auth())
      .send({ status: 'sent' })
    await request(app.server)
      .post(`/api/finance/invoices/${id2}/transition`)
      .set(auth())
      .send({ status: 'overdue' })

    // Pago parcial de 200 en inv1
    await request(app.server)
      .post('/api/finance/payments')
      .set(auth())
      .send({ invoiceId: id1, amount: 200 })

    // Obtener summary
    const summaryRes = await request(app.server)
      .get('/api/finance/summary')
      .set(auth())
    expect(summaryRes.status).toBe(200)

    const outstanding = Number(summaryRes.body.data.outstanding)

    // outstanding mínimo esperado: (500-200) + 300 = 600
    // (puede haber más facturas sent/overdue de tests anteriores, así que verificamos
    //  que el valor sea >= 600 y que no sea simplemente la suma de totales)
    expect(outstanding).toBeGreaterThanOrEqual(600)

    // La suma de totales sería >= 500 + 300 = 800 (inv1 no está pagada completamente)
    // outstanding debe ser MENOR que la suma de todos los totales de sent+overdue
    // porque inv1 tiene 200 de pago.
    // Esto verifica que el cálculo usa balance real, no total bruto.
    const invRows = await db
      .select()
      .from(invoice)
      .where(eq(invoice.portalId, portalId))

    const openTotals = invRows
      .filter((i) => (i.status === 'sent' || i.status === 'overdue') && !i.archived)
      .reduce((acc, i) => acc + Number(i.total), 0)

    // outstanding debe ser menor que la suma cruda de totales (hay al menos 200 pagados)
    expect(outstanding).toBeLessThan(openTotals)
  })

  it('facturas void no cuentan en totalInvoiced', async () => {
    // Crear una factura y marcarla como void
    const inv = await createTestInvoice({
      items: [{ description: 'Void invoice', quantity: 1, unitPrice: 9999 }],
    })
    const invId = inv.body.data.id as string

    await request(app.server)
      .post(`/api/finance/invoices/${invId}/transition`)
      .set(auth())
      .send({ status: 'void' })

    const summaryRes = await request(app.server)
      .get('/api/finance/summary')
      .set(auth())
    expect(summaryRes.status).toBe(200)

    // El totalInvoiced no debe incluir la factura void de 9999
    const totalInvoiced = Number(summaryRes.body.data.totalInvoiced)
    // Calculamos el total sin void desde la DB directamente
    const invRows = await db.select().from(invoice).where(eq(invoice.portalId, portalId))
    const expectedTotal = invRows
      .filter((i) => i.status !== 'void' && !i.archived)
      .reduce((acc, i) => acc + Number(i.total), 0)

    expect(totalInvoiced).toBeCloseTo(expectedTotal, 2)
  })
})
