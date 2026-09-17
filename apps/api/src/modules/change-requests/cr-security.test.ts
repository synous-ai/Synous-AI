/**
 * Seguridad de Change Requests: aislamiento de tenant (admin y cliente),
 * invisibilidad de `draft` para el cliente, protección contra inyección de
 * campos "core" (precio/plazo/fecha/estado) desde el body del cliente,
 * adjuntos ajenos, y la vista de portal de un admin (`X-Portal-View`).
 *
 * Ver también `cr-flow.test.ts` (flujo feliz, rechazo, cancelación,
 * adjuntos legítimos) y `cr-concurrency.test.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import {
  changeRequest,
  changeRequestAttachment,
  changeRequestItem,
  company,
  contact,
  deal,
  clientAccount,
  clientDealAccess,
  hubUser,
  invoice,
  portal,
} from '../../db/schema'
import { ensurePortalAndUser, ensurePipeline, ensureClientAccount, loginToken, listenForSupertest, type PipelineContext } from '../../test/helpers'
import { FILE_BYTES, uploadServerFile } from '../../test/uploads'

const app = buildApp()

let portalId: string
let adminToken: string
let dealId: string
let pipe: PipelineContext

let otherPortalId: string
let otherAdminToken: string
let otherDealId: string

beforeAll(async () => {
  await listenForSupertest(app)

  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  adminToken = await loginToken(app, ctx.email, ctx.password)
  pipe = await ensurePipeline(portalId)
  const dealRes = await request(app.server)
    .post('/api/deals')
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ name: 'Deal seguridad CR', pipelineId: pipe.pipelineId, stageId: pipe.firstStageId })
  dealId = dealRes.body.data.id as string

  const [op] = await db.insert(portal).values({ name: `Otro Portal CR ${randomUUID()}` }).returning()
  otherPortalId = op!.id
  const otherClerkId = `clerk_test_cr_other_${randomUUID()}`
  await db
    .insert(hubUser)
    .values({ portalId: otherPortalId, email: `cr-other-${randomUUID()}@test.com`, role: 'owner', firstName: 'Otro', clerkUserId: otherClerkId })
  otherAdminToken = `faketoken:${otherClerkId}`

  const otherPipe = await ensurePipeline(otherPortalId)
  const otherDealRes = await request(app.server)
    .post('/api/deals')
    .set({ Authorization: `Bearer ${otherAdminToken}` })
    .send({ name: 'Deal de otro portal', pipelineId: otherPipe.pipelineId, stageId: otherPipe.firstStageId })
  otherDealId = otherDealRes.body.data.id as string
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

const adminAuth = () => ({ Authorization: `Bearer ${adminToken}` })

/** Crea una CR desde el portal y la lleva hasta `sent` (propuesta enviada) para probar acciones del cliente. */
async function createSentCR(clientToken: string, title: string): Promise<string> {
  const create = await request(app.server)
    .post('/api/client/change-requests')
    .set({ Authorization: `Bearer ${clientToken}` })
    .send({ title, description: `${title} — descripción` })
  const crId = create.body.data.id as string
  await request(app.server).post(`/api/change-requests/${crId}/transition`).set(adminAuth()).send({ status: 'under_review' })
  await request(app.server).post(`/api/change-requests/${crId}/proposals`).set(adminAuth()).send({ amount: 200, timelineImpactDays: 2, send: true })
  return crId
}

// ── Draft invisible para el cliente ─────────────────────────────────────────

describe('change-requests — un borrador NO existe para el cliente', () => {
  it('GET detalle de una CR draft desde el portal → 404 (no 403)', async () => {
    const created = await request(app.server)
      .post('/api/change-requests')
      .set(adminAuth())
      .send({ dealId, title: 'CR interna sin enviar', description: 'Todavía no la vio nadie' })
    const crId = created.body.data.id as string
    expect(created.body.data.status).toBe('draft')

    const client = await ensureClientAccount(portalId, dealId)
    const res = await request(app.server).get(`/api/client/change-requests/${crId}`).set({ Authorization: `Bearer ${client.token}` })
    expect(res.status).toBe(404)
  })

  it('el listado del cliente tampoco incluye el borrador', async () => {
    const created = await request(app.server)
      .post('/api/change-requests')
      .set(adminAuth())
      .send({ dealId, title: 'CR interna sin enviar 2', description: 'Otra que no se envió' })
    const crId = created.body.data.id as string

    const client = await ensureClientAccount(portalId, dealId)
    const list = await request(app.server).get('/api/client/change-requests').set({ Authorization: `Bearer ${client.token}` })
    expect(list.status).toBe(200)
    const ids = (list.body.data as Array<{ id: string }>).map((c) => c.id)
    expect(ids).not.toContain(crId)
  })
})

// ── Aislamiento de tenant — cliente ──────────────────────────────────────────

describe('change-requests — un cliente de otro portal/deal no accede a una CR ajena', () => {
  it('GET, approve, reject, request-adjustment, cancel y comment devuelven 404 (nunca 403)', async () => {
    const owner = await ensureClientAccount(portalId, dealId)
    const crId = await createSentCR(owner.token, 'CR de portal A')

    const outsider = await ensureClientAccount(otherPortalId, otherDealId)
    const outsiderAuth = { Authorization: `Bearer ${outsider.token}` }

    const get = await request(app.server).get(`/api/client/change-requests/${crId}`).set(outsiderAuth)
    expect(get.status).toBe(404)

    const approve = await request(app.server).post(`/api/client/change-requests/${crId}/approve`).set(outsiderAuth).send({})
    expect(approve.status).toBe(404)

    const reject = await request(app.server).post(`/api/client/change-requests/${crId}/reject`).set(outsiderAuth).send({})
    expect(reject.status).toBe(404)

    const adjustment = await request(app.server)
      .post(`/api/client/change-requests/${crId}/request-adjustment`)
      .set(outsiderAuth)
      .send({ area: 'price', comment: 'Necesito que bajen el precio por favor' })
    expect(adjustment.status).toBe(404)

    const cancel = await request(app.server).post(`/api/client/change-requests/${crId}/cancel`).set(outsiderAuth).send({})
    expect(cancel.status).toBe(404)

    const comment = await request(app.server).post(`/api/client/change-requests/${crId}/comments`).set(outsiderAuth).send({ body: 'hola' })
    expect(comment.status).toBe(404)

    // La CR real no se movió con ninguno de estos intentos.
    const [cr] = await db.select().from(changeRequest).where(eq(changeRequest.id, crId))
    expect(cr?.status).toBe('sent')
  })
})

// ── Aislamiento de tenant — admin ────────────────────────────────────────────

describe('change-requests — un admin de otro portal no ve ni toca una CR ajena', () => {
  it('GET y POST /transition devuelven 404', async () => {
    const created = await request(app.server)
      .post('/api/change-requests')
      .set(adminAuth())
      .send({ dealId, title: 'CR solo de portal A', description: 'No la debe ver el admin de otro portal' })
    const crId = created.body.data.id as string

    const get = await request(app.server).get(`/api/change-requests/${crId}`).set({ Authorization: `Bearer ${otherAdminToken}` })
    expect(get.status).toBe(404)

    const transition = await request(app.server)
      .post(`/api/change-requests/${crId}/transition`)
      .set({ Authorization: `Bearer ${otherAdminToken}` })
      .send({ status: 'sent' })
    expect(transition.status).toBe(404)

    const [cr] = await db.select().from(changeRequest).where(eq(changeRequest.id, crId))
    expect(cr?.status).toBe('draft')
  })
})

// ── El cliente no puede fijar campos "core" del negocio ─────────────────────

describe('change-requests — el cliente no puede fijar precio/plazo/fecha/estado', () => {
  it('al crear: totalAmount/timelineImpactDays/status/newDeliveryDate del body se ignoran', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const res = await request(app.server)
      .post('/api/client/change-requests')
      .set({ Authorization: `Bearer ${client.token}` })
      .send({
        title: 'Intento de inyección al crear',
        description: 'El cliente manda campos que no le corresponden',
        totalAmount: 999999,
        timelineImpactDays: 999,
        status: 'approved',
        newDeliveryDate: '2099-01-01',
      })
    expect(res.status).toBe(201)
    const crId = res.body.data.id as string

    const [cr] = await db.select().from(changeRequest).where(eq(changeRequest.id, crId))
    expect(cr?.status).toBe('submitted')
    expect(cr?.totalAmount).toBeNull()
    expect(cr?.timelineImpactDays).toBe(0)
    expect(cr?.newDeliveryDate).toBeNull()
  })

  it('al aprobar: los mismos campos en el body no alteran la fila (queda lo que fijó la propuesta)', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const crId = await createSentCR(client.token, 'CR con propuesta de 200')

    const res = await request(app.server)
      .post(`/api/client/change-requests/${crId}/approve`)
      .set({ Authorization: `Bearer ${client.token}` })
      .send({
        comment: 'aprobado',
        totalAmount: 999999,
        timelineImpactDays: 999,
        status: 'rejected',
        newDeliveryDate: '2099-01-01',
      })
    expect(res.status).toBe(200)

    const [cr] = await db.select().from(changeRequest).where(eq(changeRequest.id, crId))
    expect(cr?.status).toBe('approved')
    expect(Number(cr?.totalAmount)).toBe(200)
    expect(cr?.timelineImpactDays).toBe(2)
    expect(cr?.newDeliveryDate).toBeNull()
  })
})

// ── Adjuntos: no se puede reclamar una key ajena ────────────────────────────

describe('change-requests — un cliente no puede reclamar un storageKey subido por otro actor', () => {
  it('la key de otro cliente en /attachments → 400 FILE_NOT_UPLOADED, y no queda adjunto', async () => {
    const owner = await ensureClientAccount(portalId, dealId)
    const stranger = await ensureClientAccount(portalId, dealId)

    const create = await request(app.server)
      .post('/api/client/change-requests')
      .set({ Authorization: `Bearer ${owner.token}` })
      .send({ title: 'CR con intento de adjunto ajeno', description: 'La key la subió otro cliente' })
    const crId = create.body.data.id as string

    const { storageKey } = await uploadServerFile(app, stranger.token, '/api/client/uploads', {
      purpose: 'cr_attachment',
      fileName: 'de-otro-cliente.pdf',
      contentType: 'application/pdf',
      bytes: FILE_BYTES.pdf,
    })

    const res = await request(app.server)
      .post(`/api/client/change-requests/${crId}/attachments`)
      .set({ Authorization: `Bearer ${owner.token}` })
      .send({ uploads: [{ storageKey }] })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('FILE_NOT_UPLOADED')

    const attachments = await db.select().from(changeRequestAttachment).where(eq(changeRequestAttachment.changeRequestId, crId))
    expect(attachments).toHaveLength(0)
  })
})

// ── Vínculos (links) de la CR ───────────────────────────────────────────────

describe('change-requests — los vínculos de una CR son SOLO de su propio deal', () => {
  /**
   * REGRESIÓN — `links.invoices` se devolvía sin filtrar por `forClient` ni por
   * deal: solo `invoice.change_request_id = id`. Una factura de OTRA empresa
   * mal vinculada a mano aparecía en el detalle que lee el portal, y las
   * facturas en borrador se le mostraban al cliente antes de emitirse.
   */
  it('una factura de otro deal vinculada a mano NO aparece, ni para el admin ni para el cliente', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const crId = await createSentCR(client.token, 'CR con factura ajena')

    // Deal de OTRA empresa, dentro del mismo portal.
    const otherDeal = await request(app.server)
      .post('/api/deals')
      .set(adminAuth())
      .send({ name: 'Deal de otra empresa', pipelineId: pipe.pipelineId, stageId: pipe.firstStageId })
    const foreignDealId = otherDeal.body.data.id as string

    const foreignInvoice = await request(app.server)
      .post('/api/finance/invoices')
      .set(adminAuth())
      .send({ dealId: foreignDealId, items: [{ description: 'Trabajo de otro cliente', unitPrice: 4500 }] })
    expect(foreignInvoice.status).toBe(201)
    const foreignInvoiceId = foreignInvoice.body.data.id as string

    // Vínculo cruzado forzado en la DB: simula el error de carga que el guard
    // de la API ahora rechaza, para probar que la LECTURA tampoco lo expone.
    await db.update(invoice).set({ changeRequestId: crId }).where(eq(invoice.id, foreignInvoiceId))

    const adminDetail = await request(app.server).get(`/api/change-requests/${crId}`).set(adminAuth())
    expect(adminDetail.status).toBe(200)
    expect((adminDetail.body.data.links.invoices as Array<{ id: string }>).map((i) => i.id)).not.toContain(foreignInvoiceId)

    const clientDetail = await request(app.server).get(`/api/client/change-requests/${crId}`).set({ Authorization: `Bearer ${client.token}` })
    expect(clientDetail.status).toBe(200)
    expect((clientDetail.body.data.links.invoices as Array<{ id: string }>).map((i) => i.id)).not.toContain(foreignInvoiceId)
  })

  it('una factura del MISMO deal en borrador se le oculta al cliente y se le muestra al admin', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const crId = await createSentCR(client.token, 'CR con factura en borrador')

    const draftInvoice = await request(app.server)
      .post('/api/finance/invoices')
      .set(adminAuth())
      .send({ dealId, changeRequestId: crId, items: [{ description: 'Trabajo de esta CR', unitPrice: 800 }] })
    expect(draftInvoice.status).toBe(201)
    expect(draftInvoice.body.data.status).toBe('draft')
    const draftInvoiceId = draftInvoice.body.data.id as string

    const adminDetail = await request(app.server).get(`/api/change-requests/${crId}`).set(adminAuth())
    expect((adminDetail.body.data.links.invoices as Array<{ id: string }>).map((i) => i.id)).toContain(draftInvoiceId)

    const clientDetail = await request(app.server).get(`/api/client/change-requests/${crId}`).set({ Authorization: `Bearer ${client.token}` })
    expect((clientDetail.body.data.links.invoices as Array<{ id: string }>).map((i) => i.id)).not.toContain(draftInvoiceId)

    // Emitida, sí la ve: es plata que se le está cobrando por este cambio.
    await request(app.server).post(`/api/finance/invoices/${draftInvoiceId}/transition`).set(adminAuth()).send({ status: 'sent' })
    const afterSend = await request(app.server).get(`/api/client/change-requests/${crId}`).set({ Authorization: `Bearer ${client.token}` })
    expect((afterSend.body.data.links.invoices as Array<{ id: string }>).map((i) => i.id)).toContain(draftInvoiceId)
  })

  it('vincular una factura a una CR de OTRO deal se rechaza con 400', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const crId = await createSentCR(client.token, 'CR objetivo del vínculo cruzado')

    const otherDeal = await request(app.server)
      .post('/api/deals')
      .set(adminAuth())
      .send({ name: 'Deal ajeno para el guard', pipelineId: pipe.pipelineId, stageId: pipe.firstStageId })

    const res = await request(app.server)
      .post('/api/finance/invoices')
      .set(adminAuth())
      .send({ dealId: otherDeal.body.data.id, changeRequestId: crId, items: [{ description: 'No debería entrar', unitPrice: 100 }] })
    expect(res.status).toBe(400)
  })
})

// ── Inmutabilidad del snapshot que aprobó el cliente ────────────────────────

describe('change-requests — un ítem de una propuesta enviada no se puede borrar', () => {
  /**
   * REGRESIÓN — `deleteItem` no chequeaba ni el estado de la CR ni
   * `proposalId IS NULL`. Los ítems de una propuesta llevan también
   * `changeRequestId`, así que caían dentro del WHERE: se podía borrar un ítem
   * de la propuesta que el cliente YA había aceptado y el snapshot cambiaba
   * retroactivamente, sin rastro en el historial.
   */
  it('DELETE del ítem de una propuesta aceptada falla y el ítem sigue ahí', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const create = await request(app.server)
      .post('/api/client/change-requests')
      .set({ Authorization: `Bearer ${client.token}` })
      .send({ title: 'CR con propuesta aceptada', description: 'Los ítems de la propuesta son inmutables' })
    const crId = create.body.data.id as string

    const proposal = await request(app.server)
      .post(`/api/change-requests/${crId}/proposals`)
      .set(adminAuth())
      .send({
        amount: 4500,
        send: true,
        items: [
          { description: 'Diseño', unitPrice: 1500 },
          { description: 'Desarrollo', unitPrice: 2000 },
          { description: 'QA', unitPrice: 1000 },
        ],
      })
    expect(proposal.status).toBe(201)
    const itemId = (proposal.body.data.items as Array<{ id: string }>)[0]!.id

    await request(app.server).post(`/api/client/change-requests/${crId}/approve`).set({ Authorization: `Bearer ${client.token}` }).send({})

    const res = await request(app.server).delete(`/api/change-requests/${crId}/items/${itemId}`).set(adminAuth())
    expect(res.status).toBeGreaterThanOrEqual(400)

    const items = await db.select().from(changeRequestItem).where(eq(changeRequestItem.changeRequestId, crId))
    expect(items.map((i) => i.id)).toContain(itemId)
    expect(items).toHaveLength(3)
  })

  it('un ítem a nivel CR sí se borra mientras la CR está en borrador', async () => {
    const created = await request(app.server)
      .post('/api/change-requests')
      .set(adminAuth())
      .send({ dealId, title: 'CR borrador con ítems', description: 'Acá el presupuesto todavía se edita' })
    const crId = created.body.data.id as string

    const item = await request(app.server)
      .post(`/api/change-requests/${crId}/items`)
      .set(adminAuth())
      .send({ description: 'Ítem editable', unitPrice: 100 })
    const itemId = item.body.data.id as string

    const res = await request(app.server).delete(`/api/change-requests/${crId}/items/${itemId}`).set(adminAuth())
    expect(res.status).toBe(200)

    const items = await db.select().from(changeRequestItem).where(eq(changeRequestItem.id, itemId))
    expect(items).toHaveLength(0)
  })
})

// ── Vista de portal del admin (X-Portal-View) ───────────────────────────────

describe('change-requests — vista de portal de un admin (X-Portal-View)', () => {
  let slug: string
  let crId: string

  beforeAll(async () => {
    const stamp = Date.now()
    slug = `vista-cr-${stamp}`
    const [co] = await db.insert(company).values({ portalId, name: 'Vista CR', slug }).returning()
    const email = `vista-cr-${stamp}@test.com`
    const [c] = await db.insert(contact).values({ portalId, firstName: 'Vista', lastName: 'CR', email, companyId: co!.id }).returning()
    const [d] = await db
      .insert(deal)
      .values({ portalId, name: 'Deal vista CR', pipelineId: pipe.pipelineId, stageId: pipe.firstStageId, primaryContactId: c!.id, companyId: co!.id })
      .returning()
    const clerkUserId = `clerk_test_vista_cr_${stamp}`
    const [ca] = await db.insert(clientAccount).values({ portalId, contactId: c!.id, email, clerkUserId, isActive: true }).returning()
    await db.insert(clientDealAccess).values({ clientId: ca!.id, dealId: d!.id })

    const create = await request(app.server)
      .post('/api/client/change-requests')
      .set({ Authorization: `Bearer faketoken:${clerkUserId}` })
      .send({ title: 'CR vista de portal', description: 'Para probar X-Portal-View' })
    crId = create.body.data.id as string
  })

  const asAdminViewing = () => ({ Authorization: `Bearer ${adminToken}`, 'X-Portal-View': slug })

  it('el listado y el detalle funcionan (solo lectura)', async () => {
    const list = await request(app.server).get('/api/client/change-requests').set(asAdminViewing())
    expect(list.status).toBe(200)
    expect((list.body.data as Array<{ id: string }>).some((c) => c.id === crId)).toBe(true)

    const detail = await request(app.server).get(`/api/client/change-requests/${crId}`).set(asAdminViewing())
    expect(detail.status).toBe(200)
  })

  it('cualquier escritura devuelve 403 PORTAL_VIEW_READ_ONLY', async () => {
    const comment = await request(app.server).post(`/api/client/change-requests/${crId}/comments`).set(asAdminViewing()).send({ body: 'no debería poder' })
    expect(comment.status).toBe(403)
    expect(comment.body.error.code).toBe('PORTAL_VIEW_READ_ONLY')

    const cancel = await request(app.server).post(`/api/client/change-requests/${crId}/cancel`).set(asAdminViewing()).send({})
    expect(cancel.status).toBe(403)
    expect(cancel.body.error.code).toBe('PORTAL_VIEW_READ_ONLY')

    const approve = await request(app.server).post(`/api/client/change-requests/${crId}/approve`).set(asAdminViewing()).send({})
    expect(approve.status).toBe(403)
    expect(approve.body.error.code).toBe('PORTAL_VIEW_READ_ONLY')
  })
})
