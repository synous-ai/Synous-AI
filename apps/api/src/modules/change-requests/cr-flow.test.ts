/**
 * Flujo completo de Change Requests: alta desde el portal, revisión,
 * propuestas versionadas, negociación, decisión del cliente (aprobar /
 * rechazar), cancelación, comentarios/adjuntos y notificaciones.
 *
 * Ver también `cr.test.ts` (numeración, transición básica, ítems — no tocar),
 * `cr-security.test.ts` (aislamiento de tenant, draft, vista de portal) y
 * `cr-concurrency.test.ts` (idempotencia, propuestas concurrentes, races).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { asc, eq } from 'drizzle-orm'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import {
  changeRequest,
  changeRequestComment,
  changeRequestHistory,
  changeRequestProposal,
  notification,
} from '../../db/schema'
import { ensurePortalAndUser, ensurePipeline, ensureClientAccount, loginToken, listenForSupertest } from '../../test/helpers'
import { FILE_BYTES, uploadServerFile } from '../../test/uploads'

const app = buildApp()

let portalId: string
let adminUserId: string
let adminToken: string
let dealId: string

beforeAll(async () => {
  await listenForSupertest(app)
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  adminUserId = ctx.userId
  adminToken = await loginToken(app, ctx.email, ctx.password)
  const pipe = await ensurePipeline(portalId)

  const dealRes = await request(app.server)
    .post('/api/deals')
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ name: 'Deal CR flow', pipelineId: pipe.pipelineId, stageId: pipe.firstStageId })
  dealId = dealRes.body.data.id as string
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

const adminAuth = () => ({ Authorization: `Bearer ${adminToken}` })

async function history(crId: string) {
  return db.select().from(changeRequestHistory).where(eq(changeRequestHistory.changeRequestId, crId)).orderBy(asc(changeRequestHistory.changedAt))
}

// ── Flujo feliz completo ──────────────────────────────────────────────────

describe('change-requests — flujo feliz completo (cliente crea → propuestas → aprobación)', () => {
  let clientId: string
  let clientToken: string
  let crId: string
  let proposalV1Id: string
  let proposalV2Id: string

  beforeAll(async () => {
    const client = await ensureClientAccount(portalId, dealId)
    clientId = client.clientId
    clientToken = client.token
  })

  const clientAuth = () => ({ Authorization: `Bearer ${clientToken}` })

  it('1. el cliente crea la solicitud (submitted)', async () => {
    const res = await request(app.server)
      .post('/api/client/change-requests')
      .set(clientAuth())
      .send({ title: 'Agregar módulo de reportes', description: 'Necesitamos un dashboard nuevo con exportación a Excel.' })
    expect(res.status).toBe(201)
    expect(res.body.data.status).toBe('submitted')
    expect(res.body.data.dealId).toBe(dealId)
    crId = res.body.data.id as string
  })

  it('2. el admin la ve en el listado con status submitted', async () => {
    const res = await request(app.server).get('/api/change-requests').set(adminAuth()).query({ dealId })
    expect(res.status).toBe(200)
    const found = (res.body.data as Array<{ id: string; status: string }>).find((c) => c.id === crId)
    expect(found).toBeTruthy()
    expect(found?.status).toBe('submitted')
  })

  it('3. el admin la pasa a under_review', async () => {
    const res = await request(app.server).post(`/api/change-requests/${crId}/transition`).set(adminAuth()).send({ status: 'under_review' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('under_review')
  })

  it('4. el admin crea y envía la propuesta v1 (la CR queda sent)', async () => {
    const res = await request(app.server)
      .post(`/api/change-requests/${crId}/proposals`)
      .set(adminAuth())
      .send({ amount: 500, currency: 'USD', timelineImpactDays: 5, note: 'Primera propuesta', send: true })
    expect(res.status).toBe(201)
    expect(res.body.data.version).toBe(1)
    expect(res.body.data.status).toBe('sent')
    proposalV1Id = res.body.data.id as string

    const [cr] = await db.select().from(changeRequest).where(eq(changeRequest.id, crId))
    expect(cr?.status).toBe('sent')
    expect(cr?.currentProposalId).toBe(proposalV1Id)
  })

  it('5. el cliente pide un ajuste (queda negotiating) y el comentario queda persistido', async () => {
    const res = await request(app.server)
      .post(`/api/client/change-requests/${crId}/request-adjustment`)
      .set(clientAuth())
      .send({ area: 'price', comment: 'Es más de lo que teníamos presupuestado, ¿se puede bajar?' })
    expect(res.status).toBe(200)

    const [cr] = await db.select().from(changeRequest).where(eq(changeRequest.id, crId))
    expect(cr?.status).toBe('negotiating')

    const comments = await db.select().from(changeRequestComment).where(eq(changeRequestComment.changeRequestId, crId))
    const adjustmentComment = comments.find((c) => c.body.includes('presupuestado'))
    expect(adjustmentComment).toBeTruthy()
    expect(adjustmentComment?.authorClient).toBe(clientId)
  })

  it('6. el admin envía la propuesta v2: v1 queda superseded, la CR vuelve a sent', async () => {
    const res = await request(app.server)
      .post(`/api/change-requests/${crId}/proposals`)
      .set(adminAuth())
      .send({ amount: 400, currency: 'USD', timelineImpactDays: 4, note: 'Ajustada a pedido del cliente', send: true })
    expect(res.status).toBe(201)
    expect(res.body.data.version).toBe(2)
    proposalV2Id = res.body.data.id as string

    const [cr] = await db.select().from(changeRequest).where(eq(changeRequest.id, crId))
    expect(cr?.status).toBe('sent')
    expect(cr?.currentProposalId).toBe(proposalV2Id)

    const [v1] = await db.select().from(changeRequestProposal).where(eq(changeRequestProposal.id, proposalV1Id))
    const [v2] = await db.select().from(changeRequestProposal).where(eq(changeRequestProposal.id, proposalV2Id))
    expect(v1?.status).toBe('superseded')
    expect(v2?.status).toBe('sent')
  })

  it('7. el cliente aprueba: la CR queda approved apuntando a la v2 (no a la v1)', async () => {
    const res = await request(app.server)
      .post(`/api/client/change-requests/${crId}/approve`)
      .set(clientAuth())
      .send({ comment: 'Dale, aprobado así' })
    expect(res.status).toBe(200)

    const detail = await request(app.server).get(`/api/change-requests/${crId}`).set(adminAuth())
    expect(detail.status).toBe(200)
    const cr = detail.body.data.changeRequest
    expect(cr.status).toBe('approved')
    expect(cr.approvedAt).not.toBeNull()
    expect(cr.approvedBy).toBe(clientId)
    expect(cr.approvedProposalId).toBe(proposalV2Id)
    expect(cr.approvedProposalId).not.toBe(proposalV1Id)

    const [v1] = await db.select().from(changeRequestProposal).where(eq(changeRequestProposal.id, proposalV1Id))
    const [v2] = await db.select().from(changeRequestProposal).where(eq(changeRequestProposal.id, proposalV2Id))
    expect(v2?.status).toBe('accepted')
    expect(v2?.decidedByClient).toBe(clientId)
    expect(v1?.status).toBe('superseded')
  })

  it('8. el historial tiene la secuencia esperada de eventos, roles y metadata', async () => {
    const rows = await history(crId)
    const byType = (t: string) => rows.filter((r) => r.eventType === t)

    expect(byType('created')).toHaveLength(1)
    expect(byType('created')[0]?.actorRole).toBe('client')
    expect(byType('submitted')).toHaveLength(1)
    expect(byType('submitted')[0]?.actorRole).toBe('client')
    expect(byType('review_started')).toHaveLength(1)
    expect(byType('review_started')[0]?.actorRole).toBe('admin')
    expect(byType('proposal_sent')).toHaveLength(2)
    expect(byType('proposal_sent').every((e) => e.actorRole === 'admin')).toBe(true)
    expect(byType('adjustment_requested')).toHaveLength(1)
    expect(byType('adjustment_requested')[0]?.actorRole).toBe('client')
    expect(byType('approved')).toHaveLength(1)
    const approvedEvent = byType('approved')[0]!
    expect(approvedEvent.actorRole).toBe('client')

    // metadata de proposal_sent trae versión y monto reales de cada envío
    const [sentV1, sentV2] = byType('proposal_sent')
    expect((sentV1?.metadata as Record<string, unknown>).version).toBe(1)
    expect(Number((sentV1?.metadata as Record<string, unknown>).amount)).toBe(500)
    expect((sentV2?.metadata as Record<string, unknown>).version).toBe(2)
    expect(Number((sentV2?.metadata as Record<string, unknown>).amount)).toBe(400)

    // metadata del approved: snapshot de la propuesta aprobada (la v2)
    const approvedMeta = approvedEvent.metadata as Record<string, unknown>
    expect(approvedMeta.proposalId).toBe(proposalV2Id)
    expect(approvedMeta.version).toBe(2)
    expect(Number(approvedMeta.amount)).toBe(400)
    expect(approvedMeta.timelineImpactDays).toBe(4)
  })

  it('9. los timestamps del historial son crecientes', async () => {
    const rows = await history(crId)
    for (let i = 1; i < rows.length; i++) {
      expect(new Date(rows[i]!.changedAt).getTime()).toBeGreaterThanOrEqual(new Date(rows[i - 1]!.changedAt).getTime())
    }
  })

  it('10. notificaciones: admin avisado al crear, cliente avisado en cada envío, admin avisado al aprobar', async () => {
    // `notifyAdmins` notifica a TODOS los hub_users activos del portal
    // compartido de tests (hay más de uno acumulado entre archivos), así que
    // se busca CON `.some()` la fila del admin dueño de este test, no la
    // primera fila de ese tipo.
    const rows = await db.select().from(notification).where(eq(notification.entityId, crId))
    const submittedToAdmin = rows.filter((n) => n.type === 'cr_submitted')
    expect(submittedToAdmin.some((n) => n.userId === adminUserId)).toBe(true)

    const sentToClientV1 = rows.filter((n) => n.type === 'cr_sent')
    expect(sentToClientV1.some((n) => n.clientId === clientId)).toBe(true)

    const proposalUpdated = rows.filter((n) => n.type === 'cr_proposal_updated')
    expect(proposalUpdated.some((n) => n.clientId === clientId)).toBe(true)

    const adjustmentRequested = rows.filter((n) => n.type === 'cr_adjustment_requested')
    expect(adjustmentRequested.some((n) => n.userId === adminUserId)).toBe(true)

    const approved = rows.filter((n) => n.type === 'cr_approved')
    expect(approved.some((n) => n.userId === adminUserId)).toBe(true)
  })
})

// ── Notificaciones repetibles ────────────────────────────────────────────

describe('change-requests — avisos que se repiten', () => {
  /**
   * REGRESIÓN — el `dedupeKey` era `cr_adjustment_requested:${id}:${cr.status}`
   * y en ese punto `cr.status` es SIEMPRE 'sent' (único origen posible), así que
   * la clave quedaba constante por CR: `onConflictDoNothing` se comía todos los
   * avisos menos el primero y el equipo no se enteraba del segundo pedido.
   */
  it('un SEGUNDO pedido de ajuste sobre la misma CR vuelve a notificar al equipo', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const clientAuth = { Authorization: `Bearer ${client.token}` }

    const create = await request(app.server)
      .post('/api/client/change-requests')
      .set(clientAuth)
      .send({ title: 'CR con dos ajustes', description: 'El cliente pide ajustes dos veces seguidas' })
    const crId = create.body.data.id as string

    const adjustmentsForAdmin = async () =>
      (await db.select().from(notification).where(eq(notification.entityId, crId))).filter(
        (n) => n.type === 'cr_adjustment_requested' && n.userId === adminUserId,
      ).length

    await request(app.server).post(`/api/change-requests/${crId}/proposals`).set(adminAuth()).send({ amount: 900, send: true })
    await request(app.server)
      .post(`/api/client/change-requests/${crId}/request-adjustment`)
      .set(clientAuth)
      .send({ area: 'price', comment: 'Primer pedido: está caro para el presupuesto' })
    expect(await adjustmentsForAdmin()).toBe(1)

    // El equipo reenvía corregida y el cliente vuelve a pedir un ajuste.
    await request(app.server).post(`/api/change-requests/${crId}/proposals`).set(adminAuth()).send({ amount: 800, send: true })
    await request(app.server)
      .post(`/api/client/change-requests/${crId}/request-adjustment`)
      .set(clientAuth)
      .send({ area: 'timeline', comment: 'Segundo pedido: el plazo tampoco nos sirve' })

    // Contador RELATIVO a esta CR: la base de tests arrastra filas de corridas
    // anteriores, así que nunca se asume un total absoluto.
    expect(await adjustmentsForAdmin()).toBe(2)
  })

  /**
   * REGRESIÓN — `cr_submitted` mandaba `dealName: null` fijo, y el template lo
   * usa (`${title} · ${dealName}`): el equipo veía la solicitud sin saber de qué
   * proyecto era.
   */
  it('el aviso de solicitud nueva incluye el nombre del proyecto', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const create = await request(app.server)
      .post('/api/client/change-requests')
      .set({ Authorization: `Bearer ${client.token}` })
      .send({ title: 'CR con nombre de proyecto', description: 'El aviso tiene que decir de qué deal viene' })
    const crId = create.body.data.id as string

    const rows = await db.select().from(notification).where(eq(notification.entityId, crId))
    const submitted = rows.find((n) => n.type === 'cr_submitted' && n.userId === adminUserId)
    expect(submitted).toBeTruthy()
    expect(submitted?.body).toContain('Deal CR flow')
  })
})

// ── Rechazo ──────────────────────────────────────────────────────────────

describe('change-requests — rechazo', () => {
  it('el cliente rechaza con motivo estructurado: decisionReason/decisionComment, rejectedAt y evento con metadata.reason', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const clientAuth = { Authorization: `Bearer ${client.token}` }

    const create = await request(app.server)
      .post('/api/client/change-requests')
      .set(clientAuth)
      .send({ title: 'CR a rechazar', description: 'Descripción de la CR que se va a rechazar' })
    const crId = create.body.data.id as string

    await request(app.server).post(`/api/change-requests/${crId}/transition`).set(adminAuth()).send({ status: 'under_review' })
    const proposal = await request(app.server)
      .post(`/api/change-requests/${crId}/proposals`)
      .set(adminAuth())
      .send({ amount: 1000, send: true })
    const proposalId = proposal.body.data.id as string

    const reject = await request(app.server)
      .post(`/api/client/change-requests/${crId}/reject`)
      .set(clientAuth)
      .send({ reason: 'cost', comment: 'Sale muy caro para el presupuesto actual' })
    expect(reject.status).toBe(200)

    const [cr] = await db.select().from(changeRequest).where(eq(changeRequest.id, crId))
    expect(cr?.status).toBe('rejected')
    expect(cr?.decisionReason).toBe('cost')
    expect(cr?.decisionComment).toBe('Sale muy caro para el presupuesto actual')
    expect(cr?.rejectedAt).not.toBeNull()

    const [proposalRow] = await db.select().from(changeRequestProposal).where(eq(changeRequestProposal.id, proposalId))
    expect(proposalRow?.status).toBe('rejected')

    const rows = await history(crId)
    const rejectedEvent = rows.find((r) => r.eventType === 'rejected')
    expect(rejectedEvent?.actorRole).toBe('client')
    expect((rejectedEvent?.metadata as Record<string, unknown>).reason).toBe('cost')
  })
})

// ── Cancelación ────────────────────────────────────────────────────────────

describe('change-requests — cancelación', () => {
  it('el cliente que creó la CR puede cancelarla', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const clientAuth = { Authorization: `Bearer ${client.token}` }

    const create = await request(app.server)
      .post('/api/client/change-requests')
      .set(clientAuth)
      .send({ title: 'CR a cancelar', description: 'Descripción de la CR que se va a cancelar' })
    const crId = create.body.data.id as string

    const cancel = await request(app.server).post(`/api/client/change-requests/${crId}/cancel`).set(clientAuth).send({ comment: 'Ya no hace falta' })
    expect(cancel.status).toBe(200)

    const [cr] = await db.select().from(changeRequest).where(eq(changeRequest.id, crId))
    expect(cr?.status).toBe('cancelled')
    expect(cr?.cancelledAt).not.toBeNull()
  })

  it('un cliente que NO la creó (pero sí tiene acceso al deal) recibe 403, no 200', async () => {
    const creator = await ensureClientAccount(portalId, dealId)
    const bystander = await ensureClientAccount(portalId, dealId)

    const create = await request(app.server)
      .post('/api/client/change-requests')
      .set({ Authorization: `Bearer ${creator.token}` })
      .send({ title: 'CR de otro cliente', description: 'Esta CR la abrió el creator, no el bystander' })
    const crId = create.body.data.id as string

    const cancel = await request(app.server)
      .post(`/api/client/change-requests/${crId}/cancel`)
      .set({ Authorization: `Bearer ${bystander.token}` })
      .send({})
    expect(cancel.status).toBe(403)

    const [cr] = await db.select().from(changeRequest).where(eq(changeRequest.id, crId))
    expect(cr?.status).toBe('submitted')
  })
})

// ── Validación ─────────────────────────────────────────────────────────────

describe('change-requests — validación de formularios', () => {
  it('crear una solicitud sin título → 400', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const res = await request(app.server)
      .post('/api/client/change-requests')
      .set({ Authorization: `Bearer ${client.token}` })
      .send({ description: 'Sin título' })
    expect(res.status).toBe(400)
  })

  it('crear una solicitud sin descripción → 400', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const res = await request(app.server)
      .post('/api/client/change-requests')
      .set({ Authorization: `Bearer ${client.token}` })
      .send({ title: 'Sin descripción' })
    expect(res.status).toBe(400)
  })

  it('pedir un ajuste con comentario de menos de 5 caracteres → 400', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const create = await request(app.server)
      .post('/api/client/change-requests')
      .set({ Authorization: `Bearer ${client.token}` })
      .send({ title: 'CR para ajuste inválido', description: 'Descripción válida' })
    const crId = create.body.data.id as string
    await request(app.server).post(`/api/change-requests/${crId}/transition`).set(adminAuth()).send({ status: 'under_review' })
    await request(app.server).post(`/api/change-requests/${crId}/proposals`).set(adminAuth()).send({ amount: 100, send: true })

    const res = await request(app.server)
      .post(`/api/client/change-requests/${crId}/request-adjustment`)
      .set({ Authorization: `Bearer ${client.token}` })
      .send({ area: 'price', comment: 'no' })
    expect(res.status).toBe(400)
  })
})

// ── Aprobación desde el lado del equipo ────────────────────────────────────

describe('change-requests — el equipo marca aprobada una CR (acuerdo fuera del portal)', () => {
  /**
   * REGRESIÓN — `POST /transition {status:'approved'}` escribía solo
   * `status`/`approvedAt`: la CR quedaba aprobada SIN saber sobre qué números,
   * con `approvedProposalId` en null y la propuesta vigente colgada en `sent`
   * para siempre. Se perdía exactamente el dato que justifica la tabla
   * `change_request_proposal`.
   */
  it('fija approvedProposalId, marca la propuesta accepted y deja el snapshot en el evento', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const create = await request(app.server)
      .post('/api/client/change-requests')
      .set({ Authorization: `Bearer ${client.token}` })
      .send({ title: 'CR aprobada por teléfono', description: 'El cliente dijo que sí en una llamada' })
    const crId = create.body.data.id as string

    await request(app.server).post(`/api/change-requests/${crId}/transition`).set(adminAuth()).send({ status: 'under_review' })
    const v1 = await request(app.server).post(`/api/change-requests/${crId}/proposals`).set(adminAuth()).send({ amount: 700, timelineImpactDays: 3, send: true })
    const v2 = await request(app.server).post(`/api/change-requests/${crId}/proposals`).set(adminAuth()).send({ amount: 650, timelineImpactDays: 2, send: true })
    const v1Id = v1.body.data.id as string
    const v2Id = v2.body.data.id as string

    const res = await request(app.server).post(`/api/change-requests/${crId}/transition`).set(adminAuth()).send({ status: 'approved' })
    expect(res.status).toBe(200)

    const [cr] = await db.select().from(changeRequest).where(eq(changeRequest.id, crId))
    expect(cr?.status).toBe('approved')
    expect(cr?.approvedAt).not.toBeNull()
    expect(cr?.approvedProposalId).toBe(v2Id)
    // `approvedBy` sigue en null: es FK a client_account y acá decidió el equipo.
    expect(cr?.approvedBy).toBeNull()

    const [p1] = await db.select().from(changeRequestProposal).where(eq(changeRequestProposal.id, v1Id))
    const [p2] = await db.select().from(changeRequestProposal).where(eq(changeRequestProposal.id, v2Id))
    expect(p2?.status).toBe('accepted')
    expect(p2?.decidedAt).not.toBeNull()
    expect(p2?.decidedByClient).toBeNull()
    expect(p1?.status).toBe('superseded')

    const approvedEvent = (await history(crId)).find((r) => r.toStatus === 'approved')
    const meta = approvedEvent?.metadata as Record<string, unknown>
    expect(approvedEvent?.actorRole).toBe('admin')
    expect(meta.proposalId).toBe(v2Id)
    expect(meta.version).toBe(2)
    expect(Number(meta.amount)).toBe(650)
  })

  it('aprobar una CR que nunca tuvo propuesta es legal, pero el evento deja constancia (noProposal)', async () => {
    const created = await request(app.server)
      .post('/api/change-requests')
      .set(adminAuth())
      .send({ dealId, title: 'CR aprobada sin propuesta', description: 'Nunca se formalizó en el portal' })
    const crId = created.body.data.id as string

    // Única puerta a `sent`: enviar una propuesta. Para llegar a `approved` sin
    // propuesta vigente hay que desvincularla, que es el caso de datos viejos.
    await request(app.server).post(`/api/change-requests/${crId}/proposals`).set(adminAuth()).send({ amount: 100, send: true })
    await db.update(changeRequest).set({ currentProposalId: null }).where(eq(changeRequest.id, crId))

    const res = await request(app.server).post(`/api/change-requests/${crId}/transition`).set(adminAuth()).send({ status: 'approved' })
    expect(res.status).toBe(200)

    const [cr] = await db.select().from(changeRequest).where(eq(changeRequest.id, crId))
    expect(cr?.status).toBe('approved')
    expect(cr?.approvedProposalId).toBeNull()

    const approvedEvent = (await history(crId)).find((r) => r.toStatus === 'approved')
    expect((approvedEvent?.metadata as Record<string, unknown>).noProposal).toBe(true)
  })
})

// ── Propuestas guardadas como borrador ─────────────────────────────────────

describe('change-requests — una propuesta guardada como borrador se puede recuperar y enviar', () => {
  /**
   * REGRESIÓN — con `send: false` la propuesta quedaba en `draft`, la CR nunca
   * la apuntaba y NO había endpoint para enviarla: el detalle no la devolvía,
   * el formulario aparecía vacío al día siguiente y el envío creaba otra
   * versión, dejando la anterior huérfana para siempre.
   */
  it('el detalle la expone en draftProposal (separada de currentProposal) y el cliente no la ve', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const create = await request(app.server)
      .post('/api/client/change-requests')
      .set({ Authorization: `Bearer ${client.token}` })
      .send({ title: 'CR con borrador de propuesta', description: 'El equipo la deja a medio armar' })
    const crId = create.body.data.id as string

    const draft = await request(app.server)
      .post(`/api/change-requests/${crId}/proposals`)
      .set(adminAuth())
      .send({ amount: 320, note: 'Falta confirmar horas', send: false })
    expect(draft.status).toBe(201)
    expect(draft.body.data.status).toBe('draft')
    const draftId = draft.body.data.id as string

    const detail = await request(app.server).get(`/api/change-requests/${crId}`).set(adminAuth())
    expect(detail.body.data.draftProposal?.id).toBe(draftId)
    expect(detail.body.data.currentProposal).toBeNull()

    // La CR NO se movió: un borrador interno no le pide nada al cliente.
    const [cr] = await db.select().from(changeRequest).where(eq(changeRequest.id, crId))
    expect(cr?.status).toBe('submitted')
    expect(cr?.currentProposalId).toBeNull()

    const clientDetail = await request(app.server).get(`/api/client/change-requests/${crId}`).set({ Authorization: `Bearer ${client.token}` })
    expect(clientDetail.status).toBe(200)
    expect(clientDetail.body.data.draftProposal).toBeNull()
    expect((clientDetail.body.data.proposals as Array<{ id: string }>).map((p) => p.id)).not.toContain(draftId)
  })

  it('POST /proposals/:proposalId/send lo envía: misma versión, CR en sent y evento proposal_sent', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const create = await request(app.server)
      .post('/api/client/change-requests')
      .set({ Authorization: `Bearer ${client.token}` })
      .send({ title: 'CR con borrador a enviar', description: 'Se guarda hoy y se manda mañana' })
    const crId = create.body.data.id as string

    const draft = await request(app.server)
      .post(`/api/change-requests/${crId}/proposals`)
      .set(adminAuth())
      .send({ amount: 320, timelineImpactDays: 4, send: false })
    const draftId = draft.body.data.id as string

    const sent = await request(app.server).post(`/api/change-requests/${crId}/proposals/${draftId}/send`).set(adminAuth())
    expect(sent.status).toBe(200)
    expect(sent.body.data.id).toBe(draftId)
    expect(sent.body.data.status).toBe('sent')
    // NO se creó una versión nueva: se envió la que ya estaba.
    expect(sent.body.data.version).toBe(1)

    const [cr] = await db.select().from(changeRequest).where(eq(changeRequest.id, crId))
    expect(cr?.status).toBe('sent')
    expect(cr?.currentProposalId).toBe(draftId)
    expect(Number(cr?.totalAmount)).toBe(320)
    expect(cr?.timelineImpactDays).toBe(4)

    const proposals = await db.select().from(changeRequestProposal).where(eq(changeRequestProposal.changeRequestId, crId))
    expect(proposals).toHaveLength(1)

    const sentEvent = (await history(crId)).find((r) => r.eventType === 'proposal_sent')
    expect((sentEvent?.metadata as Record<string, unknown>).proposalId).toBe(draftId)

    // Y el cliente ya puede decidir sobre ella.
    const clientDetail = await request(app.server).get(`/api/client/change-requests/${crId}`).set({ Authorization: `Bearer ${client.token}` })
    expect(clientDetail.body.data.currentProposal?.id).toBe(draftId)
  })

  it('reenviar una propuesta ya enviada → 409', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const create = await request(app.server)
      .post('/api/client/change-requests')
      .set({ Authorization: `Bearer ${client.token}` })
      .send({ title: 'CR con doble envío', description: 'Una propuesta enviada es inmutable' })
    const crId = create.body.data.id as string

    const proposal = await request(app.server).post(`/api/change-requests/${crId}/proposals`).set(adminAuth()).send({ amount: 90, send: true })
    const proposalId = proposal.body.data.id as string

    const res = await request(app.server).post(`/api/change-requests/${crId}/proposals/${proposalId}/send`).set(adminAuth())
    expect(res.status).toBe(409)
  })
})

// ── Listado del cliente ────────────────────────────────────────────────────

describe('change-requests — el listado del portal trae dealName, requestedByName y canCancel', () => {
  /**
   * REGRESIÓN — el listado del cliente era un `select()` pelado: el portal
   * declaraba esos campos, renderizaba "Solicitado por" vacío en TODAS las
   * cards y ofrecía "Cancelar" en CRs abiertas por el equipo (403 al clickear).
   * Además mandaba la fila completa, con `portalId`, `createdBy`, `approvedBy`
   * y `clientRequestId`.
   */
  it('la CR que abrió el cliente trae su nombre y canCancel true', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const create = await request(app.server)
      .post('/api/client/change-requests')
      .set({ Authorization: `Bearer ${client.token}` })
      .send({ title: 'CR propia del cliente', description: 'La abrió él, la puede cancelar' })
    const crId = create.body.data.id as string

    const list = await request(app.server).get('/api/client/change-requests').set({ Authorization: `Bearer ${client.token}` })
    expect(list.status).toBe(200)
    const found = (list.body.data as Array<Record<string, unknown>>).find((c) => c.id === crId)
    expect(found).toBeTruthy()
    expect(found?.dealName).toBe('Deal CR flow')
    expect(found?.requestedByName).toBe('Cliente Test')
    expect(found?.canCancel).toBe(true)

    // Ids internos que el portal no tiene por qué recibir.
    for (const field of ['portalId', 'createdBy', 'createdByClient', 'approvedBy', 'clientRequestId']) {
      expect(found).not.toHaveProperty(field)
    }
  })

  it('una CR abierta por el EQUIPO llega con canCancel false (el portal ya no ofrece el botón)', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const created = await request(app.server)
      .post('/api/change-requests')
      .set(adminAuth())
      .send({ dealId, title: 'CR del equipo', description: 'El cliente no la puede cancelar' })
    const crId = created.body.data.id as string
    // Hay que sacarla de draft para que el cliente la vea.
    await request(app.server).post(`/api/change-requests/${crId}/proposals`).set(adminAuth()).send({ amount: 50, send: true })

    const list = await request(app.server).get('/api/client/change-requests').set({ Authorization: `Bearer ${client.token}` })
    const found = (list.body.data as Array<Record<string, unknown>>).find((c) => c.id === crId)
    expect(found).toBeTruthy()
    expect(found?.canCancel).toBe(false)
    expect(found?.requestedByName).toBe('Owner')

    const detail = await request(app.server).get(`/api/client/change-requests/${crId}`).set({ Authorization: `Bearer ${client.token}` })
    expect(detail.body.data.changeRequest.canCancel).toBe(false)

    // Y el backend lo respalda: no es solo cosmética de la UI.
    const cancel = await request(app.server).post(`/api/client/change-requests/${crId}/cancel`).set({ Authorization: `Bearer ${client.token}` }).send({})
    expect(cancel.status).toBe(403)
  })
})

// ── Adjuntos y comentarios ──────────────────────────────────────────────────

describe('change-requests — adjuntos y comentarios', () => {
  it('el admin comenta con un adjunto: el adjunto queda asociado al comentario y aparece en el detalle', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const create = await request(app.server)
      .post('/api/client/change-requests')
      .set({ Authorization: `Bearer ${client.token}` })
      .send({ title: 'CR con adjuntos', description: 'Para probar comentarios con adjuntos' })
    const crId = create.body.data.id as string

    const { storageKey } = await uploadServerFile(app, adminToken, '/api/uploads', {
      purpose: 'cr_attachment',
      fileName: 'referencia.pdf',
      contentType: 'application/pdf',
      bytes: FILE_BYTES.pdf,
    })

    const comment = await request(app.server)
      .post(`/api/change-requests/${crId}/comments`)
      .set(adminAuth())
      .send({ body: 'Te dejo una referencia', uploads: [{ storageKey }] })
    expect(comment.status).toBe(201)
    const commentId = comment.body.data.id as string

    const detail = await request(app.server).get(`/api/change-requests/${crId}`).set(adminAuth())
    const commentDTO = (detail.body.data.comments as Array<{ id: string; attachments: Array<{ storageKey: string; commentId: string | null }> }>).find(
      (c) => c.id === commentId,
    )
    expect(commentDTO).toBeTruthy()
    expect(commentDTO?.attachments).toHaveLength(1)
    expect(commentDTO?.attachments[0]?.storageKey).toBe(storageKey)
    expect(commentDTO?.attachments[0]?.commentId).toBe(commentId)
  })

  /**
   * REGRESIÓN — `addAttachments`/`clientAddAttachments` registraban el evento
   * pero no notificaban a nadie, mientras que comentar sí: el cliente subía un
   * plano y el equipo se enteraba solo si entraba a mirar.
   */
  it('adjuntar archivos notifica en las dos direcciones', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const create = await request(app.server)
      .post('/api/client/change-requests')
      .set({ Authorization: `Bearer ${client.token}` })
      .send({ title: 'CR con avisos de adjunto', description: 'Adjuntar tiene que avisar igual que comentar' })
    const crId = create.body.data.id as string

    const fromClient = await uploadServerFile(app, client.token, '/api/client/uploads', {
      purpose: 'cr_attachment',
      fileName: 'plano.pdf',
      contentType: 'application/pdf',
      bytes: FILE_BYTES.pdf,
    })
    const attachAsClient = await request(app.server)
      .post(`/api/client/change-requests/${crId}/attachments`)
      .set({ Authorization: `Bearer ${client.token}` })
      .send({ uploads: [{ storageKey: fromClient.storageKey }] })
    expect(attachAsClient.status).toBe(201)

    const fromAdmin = await uploadServerFile(app, adminToken, '/api/uploads', {
      purpose: 'cr_attachment',
      fileName: 'respuesta.pdf',
      contentType: 'application/pdf',
      bytes: FILE_BYTES.pdf,
    })
    const attachAsAdmin = await request(app.server)
      .post(`/api/change-requests/${crId}/attachments`)
      .set(adminAuth())
      .send({ uploads: [{ storageKey: fromAdmin.storageKey }] })
    expect(attachAsAdmin.status).toBe(201)

    const rows = await db.select().from(notification).where(eq(notification.entityId, crId))
    expect(rows.filter((n) => n.type === 'cr_client_attached').some((n) => n.userId === adminUserId)).toBe(true)
    expect(rows.filter((n) => n.type === 'cr_attachment_added').some((n) => n.clientId === client.clientId)).toBe(true)
  })

  it('el cliente adjunta un archivo a nivel CR (sin comentario) y el detalle lo muestra con uploadedRole client', async () => {
    const client = await ensureClientAccount(portalId, dealId)
    const create = await request(app.server)
      .post('/api/client/change-requests')
      .set({ Authorization: `Bearer ${client.token}` })
      .send({ title: 'CR con adjunto de cliente', description: 'Para probar adjuntos del cliente' })
    const crId = create.body.data.id as string

    const { storageKey } = await uploadServerFile(app, client.token, '/api/client/uploads', {
      purpose: 'cr_attachment',
      fileName: 'captura.pdf',
      contentType: 'application/pdf',
      bytes: FILE_BYTES.pdf,
    })

    const attach = await request(app.server)
      .post(`/api/client/change-requests/${crId}/attachments`)
      .set({ Authorization: `Bearer ${client.token}` })
      .send({ uploads: [{ storageKey }] })
    expect(attach.status).toBe(201)
    expect(attach.body.data.attached).toBe(1)

    const detail = await request(app.server).get(`/api/change-requests/${crId}`).set(adminAuth())
    const att = (detail.body.data.attachments as Array<{ storageKey: string; uploadedRole: string; commentId: string | null }>).find(
      (a) => a.storageKey === storageKey,
    )
    expect(att).toBeTruthy()
    expect(att?.uploadedRole).toBe('client')
    expect(att?.commentId).toBeNull()
  })
})
