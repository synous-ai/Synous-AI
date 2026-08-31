import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { and, desc, eq } from 'drizzle-orm'
import { buildApp } from '../../app'
import { env } from '../../config/env'
import { db, closeDb } from '../../db'
import { contact, deal, clientAccount, clientDealAccess, auditLog, recordHistory, notification } from '../../db/schema'
import {
  ensurePortalAndUser,
  ensurePipeline,
  ensureProductionPipeline,
  ensureHubUser,
  loginToken,
  type PipelineContext,
  type ProductionPipelineContext,
} from '../../test/helpers'

const app = buildApp()

let portalId: string
let adminToken: string
let pipe: PipelineContext
let production: ProductionPipelineContext
let laurUserId: string
let jeremiasUserId: string

let dealId: string
let clientToken: string

beforeAll(async () => {
  await app.ready()

  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  adminToken = await loginToken(app, ctx.email, ctx.password)
  pipe = await ensurePipeline(portalId)
  production = await ensureProductionPipeline(portalId)

  // Responsables de Producción con los emails configurados en env
  // (PRODUCTION_ASSIGNEE_DIAGNOSTICO_EMAIL / PRODUCTION_ASSIGNEE_DEFAULT_EMAIL),
  // para que el test no se desincronice de los defaults.
  laurUserId = await ensureHubUser(portalId, env.PRODUCTION_ASSIGNEE_DIAGNOSTICO_EMAIL, 'Lauri')
  jeremiasUserId = await ensureHubUser(portalId, env.PRODUCTION_ASSIGNEE_DEFAULT_EMAIL, 'Jeremias')

  // Deal + contacto + cuenta cliente + acceso, para simular un cliente logueado
  // en el Client Portal con un proyecto activo.
  const uniqueEmail = `onboarding-client-${Date.now()}@test.com`
  const [c] = await db
    .insert(contact)
    .values({ portalId, firstName: 'Test', lastName: 'Client', email: uniqueEmail })
    .returning()
  const [d] = await db
    .insert(deal)
    .values({ portalId, name: 'Deal Onboarding Test', pipelineId: pipe.pipelineId, stageId: pipe.firstStageId, primaryContactId: c!.id })
    .returning()
  dealId = d!.id

  const clerkUserId = `clerk_test_onboarding_client_${Date.now()}`
  const [ca] = await db
    .insert(clientAccount)
    .values({ portalId, contactId: c!.id, email: uniqueEmail, clerkUserId, isActive: true })
    .returning()
  await db.insert(clientDealAccess).values({ clientId: ca!.id, dealId: d!.id })
  clientToken = `faketoken:${clerkUserId}`
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

const clientAuth = () => ({ Authorization: `Bearer ${clientToken}` })
const adminAuth = () => ({ Authorization: `Bearer ${adminToken}` })

const validBrief = {
  businessProgram: 'Programa de mentoría fitness',
  activeClients: '50 alumnos activos',
  deliveryChannels: ['whatsapp', 'notion'],
  worstChannel: 'WhatsApp se desordena',
  weeklyTimeDrain: 'Responder consultas repetidas',
  sixMonthConcern: 'No poder escalar sin más horas',
  idealDayToDay: 'Todo centralizado en un panel',
  desiredStudentFeeling: 'Acompañado y claro',
  referenceApps: 'Notion, Skool',
  teamRoles: 'Yo + 1 asistente',
  brandIdentity: 'Colores azul y blanco, logo ya definido',
  requiredIntegrations: 'Ninguna por ahora',
  existingClientBase: 'Planilla de Excel con 50 filas',
  howFoundUs: 'Instagram',
  decisionTrigger: 'Necesitaba dejar de perder tiempo',
  doubtsBeforeBuying: 'Si iba a poder migrar mis clientes actuales',
}

const validMaterials = {
  logoBrand: { done: true },
  programContent: { done: true },
  clientBase: { done: true },
  toolAccess: { done: true },
}

describe('client onboarding — GET / (lazy-create)', () => {
  it('crea la fila si no existe y devuelve status in_progress + assets vacío', async () => {
    const res = await request(app.server).get('/api/client/onboarding').set(clientAuth())
    expect(res.status).toBe(200)
    expect(res.body.data.onboarding.dealId).toBe(dealId)
    expect(res.body.data.onboarding.status).toBe('in_progress')
    expect(res.body.data.onboarding.currentStep).toBe(1)
    expect(res.body.data.assets).toEqual([])
  })

  it('GET repetido no duplica la fila (misma id)', async () => {
    const first = await request(app.server).get('/api/client/onboarding').set(clientAuth())
    const second = await request(app.server).get('/api/client/onboarding').set(clientAuth())
    expect(first.body.data.onboarding.id).toBe(second.body.data.onboarding.id)
  })

  it('sin token de cliente devuelve 401', async () => {
    const res = await request(app.server).get('/api/client/onboarding')
    expect(res.status).toBe(401)
  })
})

describe('client onboarding — progreso (pasos 1-4)', () => {
  it('PATCH /progress marca el paso y sube current_step', async () => {
    const res = await request(app.server).patch('/api/client/onboarding/progress').set(clientAuth()).send({ step: 1 })
    expect(res.status).toBe(200)
    expect(res.body.data.stepsCompleted['1']).toBeTruthy()
    expect(res.body.data.currentStep).toBeGreaterThanOrEqual(2)
  })

  it('step fuera de rango (5) es rechazado por Zod (400)', async () => {
    const res = await request(app.server).patch('/api/client/onboarding/progress').set(clientAuth()).send({ step: 5 })
    expect(res.status).toBe(400)
  })
})

describe('client onboarding — firma (paso 5) idempotente', () => {
  it('firmar guarda nombre + timestamp + IP y marca el paso 5', async () => {
    const res = await request(app.server)
      .post('/api/client/onboarding/signature')
      .set(clientAuth())
      .send({ fullName: 'Cliente de Prueba', accepted: true })
    expect(res.status).toBe(200)
    expect(res.body.data.signatureName).toBe('Cliente de Prueba')
    expect(res.body.data.signatureAcceptedAt).toBeTruthy()
    expect(res.body.data.signatureIp).toBeTruthy()
    expect(res.body.data.stepsCompleted['5']).toBeTruthy()
  })

  it('re-firmar devuelve 409', async () => {
    const res = await request(app.server)
      .post('/api/client/onboarding/signature')
      .set(clientAuth())
      .send({ fullName: 'Cliente de Prueba', accepted: true })
    expect(res.status).toBe(409)
  })

  it('accepted !== true es rechazado por Zod (400)', async () => {
    const res = await request(app.server)
      .post('/api/client/onboarding/signature')
      .set(clientAuth())
      .send({ fullName: 'Otro Nombre', accepted: false })
    expect(res.status).toBe(400)
  })
})

describe('client onboarding — gate del paso 8 (complete)', () => {
  it('POST /complete falla con 400 y detalla qué falta (brief + materiales, la firma ya está)', async () => {
    const res = await request(app.server).post('/api/client/onboarding/complete').set(clientAuth())
    expect(res.status).toBe(400)
    expect(res.body.error.details.missing).toEqual(expect.arrayContaining(['brief', 'materiales']))
    expect(res.body.error.details.missing).not.toContain('firma')
  })

  it('POST /brief marca el paso 6', async () => {
    const res = await request(app.server).post('/api/client/onboarding/brief').set(clientAuth()).send(validBrief)
    expect(res.status).toBe(200)
    expect(res.body.data.stepsCompleted['6']).toBeTruthy()
    expect(res.body.data.briefAnswers.businessProgram).toBe(validBrief.businessProgram)
  })

  it('POST /materials marca el paso 7', async () => {
    const res = await request(app.server)
      .post('/api/client/onboarding/materials')
      .set(clientAuth())
      .send({ materials: validMaterials })
    expect(res.status).toBe(200)
    expect(res.body.data.stepsCompleted['7']).toBeTruthy()
  })

  it('POST /complete ahora sí completa el onboarding y mueve el deal a Producción / Diagnóstico con owner = Lauri', async () => {
    const res = await request(app.server).post('/api/client/onboarding/complete').set(clientAuth())
    expect(res.status).toBe(200)
    expect(res.body.data.stageLabel).toBe('Diagnóstico')
    expect(res.body.data.ownerId).toBe(laurUserId)
    expect(res.body.data.onboarding.status).toBe('completed')
    expect(res.body.data.onboarding.completedAt).toBeTruthy()

    const [updatedDeal] = await db.select().from(deal).where(eq(deal.id, dealId))
    expect(updatedDeal!.pipelineId).toBe(production.pipelineId)
    expect(updatedDeal!.stageId).toBe(production.diagnosticoStageId)
    expect(updatedDeal!.ownerId).toBe(laurUserId)
  })

  it('registra STAGE_CHANGE + ONBOARDING_COMPLETED en audit_log (atribuido al cliente, no a un hub_user)', async () => {
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, dealId))
    const actions = audits.map((a) => a.action)
    expect(actions).toContain('STAGE_CHANGE')
    expect(actions).toContain('ONBOARDING_COMPLETED')
    const onboardingCompleted = audits.find((a) => a.action === 'ONBOARDING_COMPLETED')
    expect(onboardingCompleted?.userId).toBeNull()
    expect(onboardingCompleted?.clientId).toBeTruthy()
  })

  it('registra el cambio de pipelineId/stageId/ownerId en record_history', async () => {
    const history = await db.select().from(recordHistory).where(eq(recordHistory.entityId, dealId))
    const fields = history.map((h) => h.fieldName)
    expect(fields).toContain('stageId')
    expect(fields).toContain('pipelineId')
    expect(fields).toContain('ownerId')
  })

  it('re-completar un onboarding ya completo devuelve 409', async () => {
    const res = await request(app.server).post('/api/client/onboarding/complete').set(clientAuth())
    expect(res.status).toBe(409)
  })
})

describe('changeStage — reasignación automática por fase en Producción', () => {
  it('mover el deal a otra fase de Producción (Blueprint) reasigna el owner al responsable default (Jeremías)', async () => {
    const res = await request(app.server)
      .patch(`/api/deals/${dealId}/stage`)
      .set(adminAuth())
      .send({ stageId: production.blueprintStageId })
    expect(res.status).toBe(200)
    expect(res.body.data.ownerId).toBe(jeremiasUserId)

    const [updatedDeal] = await db.select().from(deal).where(eq(deal.id, dealId))
    expect(updatedDeal!.ownerId).toBe(jeremiasUserId)
  })

  it('la notificación de STAGE_CHANGE va al owner NUEVO (Jeremías), no al viejo pre-reasignación (Lauri)', async () => {
    const [latest] = await db
      .select()
      .from(notification)
      .where(and(eq(notification.entityId, dealId), eq(notification.type, 'deal_stage_changed')))
      .orderBy(desc(notification.createdAt))
      .limit(1)
    expect(latest?.userId).toBe(jeremiasUserId)
    expect(latest?.userId).not.toBe(laurUserId)
  })
})

describe('admin onboarding — listado y detalle', () => {
  it('GET /api/onboarding lista el onboarding del deal como completed', async () => {
    const res = await request(app.server).get('/api/onboarding').set(adminAuth())
    expect(res.status).toBe(200)
    const item = res.body.data.find((o: { dealId: string }) => o.dealId === dealId)
    expect(item).toBeTruthy()
    expect(item.status).toBe('completed')
  })

  it('GET /api/onboarding/deals/:dealId devuelve el detalle', async () => {
    const res = await request(app.server).get(`/api/onboarding/deals/${dealId}`).set(adminAuth())
    expect(res.status).toBe(200)
    expect(res.body.data.onboarding.dealId).toBe(dealId)
  })

  it('GET /api/onboarding/deals/:dealId con un dealId sin onboarding devuelve 404', async () => {
    const res = await request(app.server).get('/api/onboarding/deals/nonexistent-deal-id-xyz').set(adminAuth())
    expect(res.status).toBe(404)
  })

  it('sin token de admin devuelve 401', async () => {
    const res = await request(app.server).get('/api/onboarding')
    expect(res.status).toBe(401)
  })
})
