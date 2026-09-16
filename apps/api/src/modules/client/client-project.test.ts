import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import { contact, deal, clientAccount, clientDealAccess, pipelineStage, recordHistory } from '../../db/schema'
import {
  ensurePortalAndUser,
  ensurePipeline,
  ensureFullProductionPipeline,
  loginToken,
  type PipelineContext,
  type FullProductionPipelineContext,
  listenForSupertest,
} from '../../test/helpers'

const app = buildApp()

let portalId: string
let adminToken: string
let adminUserId: string
let ventas: PipelineContext
let production: FullProductionPipelineContext

let dealId: string
let clientToken: string

beforeAll(async () => {
  await listenForSupertest(app)

  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  adminUserId = ctx.userId
  adminToken = await loginToken(app, ctx.email, ctx.password)
  ventas = await ensurePipeline(portalId)
  production = await ensureFullProductionPipeline(portalId)

  const uniqueEmail = `project-status-client-${Date.now()}@test.com`
  const [c] = await db
    .insert(contact)
    .values({ portalId, firstName: 'Test', lastName: 'ProjectStatus', email: uniqueEmail })
    .returning()
  const [d] = await db
    .insert(deal)
    .values({
      portalId,
      name: 'Deal Estado de Proyecto',
      pipelineId: ventas.pipelineId,
      stageId: ventas.firstStageId,
      primaryContactId: c!.id,
      ownerId: adminUserId,
      custom: { foo: 'bar' },
    })
    .returning()
  dealId = d!.id

  const clerkUserId = `clerk_test_project_status_client_${Date.now()}`
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

function stageByLabel(label: string) {
  const found = production.stages.find((stage) => stage.label === label)
  if (!found) throw new Error(`stage no seedeado en el test: ${label}`)
  return found
}

describe('GET /api/client/project — deal todavía en Ventas', () => {
  it('inProduction es false y no expone fase ni roadmap', async () => {
    const res = await request(app.server).get('/api/client/project').set(clientAuth())
    expect(res.status).toBe(200)
    expect(res.body.data.deal.id).toBe(dealId)
    expect(res.body.data.inProduction).toBe(false)
    expect(res.body.data.currentPhase).toBeNull()
    expect(res.body.data.phases).toBeNull()
    expect(res.body.data.updates).toEqual([])
  })

  it('el estado derivado es "preparation" y no expone ninguna fecha de proyecto', async () => {
    const res = await request(app.server).get('/api/client/project').set(clientAuth())
    expect(res.body.data.status).toBe('preparation')
    // El próximo paso es la primera fase REAL del pipeline de Producción del
    // portal, no un texto fijo: si el pipeline cambia de primera fase, cambia.
    expect(res.body.data.nextPhase.label).toBe('Diagnóstico')
    expect(res.body.data.nextPhase.description).toBe(stageByLabel('Diagnóstico').description)
    expect(res.body.data.startedAt).toBeNull()
    expect(res.body.data.currentPhaseSince).toBeNull()
    expect(res.body.data.completedAt).toBeNull()
  })

  it('NO expone la entrega estimada fuera de Producción: todavía no hay proyecto que entregar', async () => {
    await db.update(deal).set({ deliveryDate: '2026-11-30' }).where(eq(deal.id, dealId))
    const res = await request(app.server).get('/api/client/project').set(clientAuth())
    expect(res.body.data.estimatedDelivery).toBeNull()
  })

  it('sin token de cliente devuelve 401', async () => {
    const res = await request(app.server).get('/api/client/project')
    expect(res.status).toBe(401)
  })
})

describe('GET /api/client/project — deal movido a Producción / Diagnóstico', () => {
  beforeAll(async () => {
    const diagnostico = stageByLabel('Diagnóstico')
    await db.update(deal).set({ pipelineId: production.pipelineId, stageId: diagnostico.id }).where(eq(deal.id, dealId))
  })

  it('currentPhase es Diagnóstico con su descripción cliente-facing y el roadmap trae las 9 fases', async () => {
    const res = await request(app.server).get('/api/client/project').set(clientAuth())
    expect(res.status).toBe(200)
    expect(res.body.data.inProduction).toBe(true)
    expect(res.body.data.currentPhase.label).toBe('Diagnóstico')
    expect(res.body.data.currentPhase.description).toBe(stageByLabel('Diagnóstico').description)
    expect(res.body.data.phases).toHaveLength(9)

    const phases = res.body.data.phases as Array<{ label: string; isCurrent: boolean; isDone: boolean; displayOrder: number }>
    const diag = phases.find((p) => p.label === 'Diagnóstico')!
    expect(diag.isCurrent).toBe(true)
    expect(diag.isDone).toBe(false)
    // Diagnóstico es la primera fase: ninguna otra puede estar "hecha" todavía.
    expect(phases.every((p) => p.isDone === false)).toBe(true)
    expect(phases.filter((p) => p.isCurrent).length).toBe(1)
  })

  it('al avanzar a una fase intermedia (Construcción), las fases previas quedan isDone=true', async () => {
    const construccion = stageByLabel('Construcción')
    await db.update(deal).set({ stageId: construccion.id }).where(eq(deal.id, dealId))

    const res = await request(app.server).get('/api/client/project').set(clientAuth())
    expect(res.status).toBe(200)
    const phases = res.body.data.phases as Array<{ label: string; isCurrent: boolean; isDone: boolean; displayOrder: number }>

    expect(res.body.data.currentPhase.label).toBe('Construcción')
    for (const p of phases) {
      if (p.displayOrder < construccion.displayOrder) expect(p.isDone).toBe(true)
      else expect(p.isDone).toBe(false)
    }
    expect(phases.find((p) => p.label === 'Construcción')!.isCurrent).toBe(true)
  })

  it('status es "in_progress" y nextPhase es la fase siguiente por displayOrder', async () => {
    const res = await request(app.server).get('/api/client/project').set(clientAuth())
    expect(res.body.data.status).toBe('in_progress')
    // El deal quedó en Construcción por el test anterior; la que sigue es Verificación.
    expect(res.body.data.currentPhase.label).toBe('Construcción')
    expect(res.body.data.nextPhase.label).toBe('Verificación')
    expect(res.body.data.nextPhase.description).toBe(stageByLabel('Verificación').description)
  })

  it('ya en Producción SÍ expone delivery_date como entrega estimada', async () => {
    const res = await request(app.server).get('/api/client/project').set(clientAuth())
    expect(res.body.data.estimatedDelivery).toBe('2026-11-30')
  })

  it('close_date NUNCA se filtra como entrega: son dos fechas distintas', async () => {
    // Cierre de la VENTA cargado, entrega del PROYECTO vacía: el portal no
    // debe mostrar ninguna estimación. Es la regresión que justifica que
    // `delivery_date` exista como columna propia.
    await db.update(deal).set({ closeDate: '2026-02-01', deliveryDate: null }).where(eq(deal.id, dealId))
    const res = await request(app.server).get('/api/client/project').set(clientAuth())
    expect(res.body.data.estimatedDelivery).toBeNull()

    await db.update(deal).set({ deliveryDate: '2026-11-30' }).where(eq(deal.id, dealId))
  })

  it('sin filas en record_history las fechas viajan null en vez de inventar deal.createdAt', async () => {
    // Los tests de arriba mueven el deal con UPDATE directo, sin pasar por
    // changeStage: no hay historial, y ese es justamente el caso a cubrir.
    const res = await request(app.server).get('/api/client/project').set(clientAuth())
    expect(res.body.data.startedAt).toBeNull()
    expect(res.body.data.currentPhaseSince).toBeNull()
  })

  it('startedAt sale de la PRIMERA entrada al pipeline y currentPhaseSince de la ÚLTIMA entrada a la fase actual', async () => {
    const construccion = stageByLabel('Construcción')
    const first = new Date('2026-01-10T10:00:00Z')
    const reentry = new Date('2026-03-01T10:00:00Z')
    const stageEntry = new Date('2026-05-20T15:30:00Z')
    const staleStageEntry = new Date('2026-04-01T09:00:00Z')

    await db.insert(recordHistory).values([
      // Entrada al pipeline de Producción (la que define el arranque)…
      { portalId, entityType: 'deal', entityId: dealId, fieldName: 'pipelineId', oldValue: ventas.pipelineId, newValue: production.pipelineId, changedAt: first },
      // …y una re-entrada posterior, que NO debe pisar el arranque real.
      { portalId, entityType: 'deal', entityId: dealId, fieldName: 'pipelineId', oldValue: ventas.pipelineId, newValue: production.pipelineId, changedAt: reentry },
      // Dos entradas a la MISMA fase: vale la más reciente.
      { portalId, entityType: 'deal', entityId: dealId, fieldName: 'stageId', oldValue: null, newValue: construccion.id, changedAt: staleStageEntry },
      { portalId, entityType: 'deal', entityId: dealId, fieldName: 'stageId', oldValue: null, newValue: construccion.id, changedAt: stageEntry },
      // Ruido que no debe confundir: entrada a OTRA fase, posterior a todo.
      { portalId, entityType: 'deal', entityId: dealId, fieldName: 'stageId', oldValue: null, newValue: stageByLabel('Ajustes').id, changedAt: new Date('2026-06-01T00:00:00Z') },
    ])

    const res = await request(app.server).get('/api/client/project').set(clientAuth())
    expect(new Date(res.body.data.startedAt).toISOString()).toBe(first.toISOString())
    expect(new Date(res.body.data.currentPhaseSince).toISOString()).toBe(stageEntry.toISOString())
  })

  it('una fase con is_closed marca el proyecto como completado, sin próximo hito', async () => {
    const evolucion = stageByLabel('Evolución')
    await db.update(deal).set({ stageId: evolucion.id }).where(eq(deal.id, dealId))
    const closedAt = new Date('2026-07-15T12:00:00Z')
    await db.insert(recordHistory).values({
      portalId, entityType: 'deal', entityId: dealId, fieldName: 'stageId', oldValue: null, newValue: evolucion.id, changedAt: closedAt,
    })
    // El pipeline de test se comparte entre archivos: se marca y se revierte
    // dentro del mismo test para no filtrar el flag a otras suites.
    await db.update(pipelineStage).set({ isClosed: true }).where(eq(pipelineStage.id, evolucion.id))
    try {
      const res = await request(app.server).get('/api/client/project').set(clientAuth())
      expect(res.body.data.status).toBe('completed')
      expect(res.body.data.nextPhase).toBeNull()
      expect(new Date(res.body.data.completedAt).toISOString()).toBe(closedAt.toISOString())
    } finally {
      await db.update(pipelineStage).set({ isClosed: false }).where(eq(pipelineStage.id, evolucion.id))
      await db.update(deal).set({ stageId: stageByLabel('Construcción').id }).where(eq(deal.id, dealId))
    }
  })
})

describe('Novedades del proyecto (project_update) — admin CRUD + visibilidad del cliente', () => {
  let updateWithDefaultStageId: string
  let updateWithExplicitStageId: string

  it('POST /api/deals/:id/updates sin stageId usa la fase actual del deal (Producción)', async () => {
    const res = await request(app.server)
      .post(`/api/deals/${dealId}/updates`)
      .set(adminAuth())
      .send({ body: 'Arrancamos con la construcción del backend.' })
    expect(res.status).toBe(201)
    expect(res.body.data.body).toBe('Arrancamos con la construcción del backend.')
    expect(res.body.data.stageId).toBe(stageByLabel('Construcción').id)
    expect(res.body.data.createdBy).toBe(adminUserId)
    expect(res.body.data.archived).toBe(false)
    updateWithDefaultStageId = res.body.data.id
  })

  it('POST /api/deals/:id/updates con stageId explícito lo respeta', async () => {
    const res = await request(app.server)
      .post(`/api/deals/${dealId}/updates`)
      .set(adminAuth())
      .send({ body: 'Repasando lo que salió del diagnóstico inicial.', stageId: stageByLabel('Diagnóstico').id })
    expect(res.status).toBe(201)
    expect(res.body.data.stageId).toBe(stageByLabel('Diagnóstico').id)
    updateWithExplicitStageId = res.body.data.id
  })

  it('body vacío es rechazado por Zod (400)', async () => {
    const res = await request(app.server).post(`/api/deals/${dealId}/updates`).set(adminAuth()).send({ body: '' })
    expect(res.status).toBe(400)
  })

  it('GET /api/deals/:id/updates (admin) lista ambas con createdBy y phaseLabel', async () => {
    const res = await request(app.server).get(`/api/deals/${dealId}/updates`).set(adminAuth())
    expect(res.status).toBe(200)
    const ids = (res.body.data as Array<{ id: string }>).map((u) => u.id)
    expect(ids).toEqual(expect.arrayContaining([updateWithDefaultStageId, updateWithExplicitStageId]))
    const withDefault = res.body.data.find((u: { id: string }) => u.id === updateWithDefaultStageId)
    expect(withDefault.phaseLabel).toBe('Construcción')
    expect(withDefault.createdBy.id).toBe(adminUserId)
    expect(withDefault.createdBy.email).toBeTruthy()
  })

  it('GET /api/client/project incluye ambas novedades (no archivadas), con phaseLabel', async () => {
    const res = await request(app.server).get('/api/client/project').set(clientAuth())
    expect(res.status).toBe(200)
    const updates = res.body.data.updates as Array<{ id: string; phaseLabel: string | null }>
    const ids = updates.map((u) => u.id)
    expect(ids).toEqual(expect.arrayContaining([updateWithDefaultStageId, updateWithExplicitStageId]))
    expect(updates.find((u) => u.id === updateWithDefaultStageId)!.phaseLabel).toBe('Construcción')
    expect(updates.find((u) => u.id === updateWithExplicitStageId)!.phaseLabel).toBe('Diagnóstico')
  })

  it('PATCH /api/deals/updates/:id/archive archiva una novedad (nunca DELETE)', async () => {
    const res = await request(app.server).patch(`/api/deals/updates/${updateWithExplicitStageId}/archive`).set(adminAuth())
    expect(res.status).toBe(200)
    expect(res.body.data.success).toBe(true)
  })

  it('la novedad archivada desaparece del cliente pero sigue visible (con flag) para el admin', async () => {
    const clientRes = await request(app.server).get('/api/client/project').set(clientAuth())
    const clientIds = (clientRes.body.data.updates as Array<{ id: string }>).map((u) => u.id)
    expect(clientIds).not.toContain(updateWithExplicitStageId)
    expect(clientIds).toContain(updateWithDefaultStageId)

    const adminRes = await request(app.server).get(`/api/deals/${dealId}/updates`).set(adminAuth())
    const archivedRow = adminRes.body.data.find((u: { id: string }) => u.id === updateWithExplicitStageId)
    expect(archivedRow.archived).toBe(true)
    expect(archivedRow.archivedAt).toBeTruthy()
  })

  it('archivar de nuevo la misma novedad devuelve 404', async () => {
    const res = await request(app.server).patch(`/api/deals/updates/${updateWithExplicitStageId}/archive`).set(adminAuth())
    expect(res.status).toBe(404)
  })

  it('sin token de admin, crear/listar/archivar devuelve 401', async () => {
    const create = await request(app.server).post(`/api/deals/${dealId}/updates`).send({ body: 'x' })
    const list = await request(app.server).get(`/api/deals/${dealId}/updates`)
    const archive = await request(app.server).patch(`/api/deals/updates/${updateWithDefaultStageId}/archive`)
    expect(create.status).toBe(401)
    expect(list.status).toBe(401)
    expect(archive.status).toBe(401)
  })
})

describe('GET /api/client/deals — DTO curado, sin ownerId ni custom', () => {
  it('proyecta solo id/name/amount/currency/stageId/createdAt', async () => {
    const res = await request(app.server).get('/api/client/deals').set(clientAuth())
    expect(res.status).toBe(200)
    const item = (res.body.data as Array<Record<string, unknown>>).find((d) => d.id === dealId)
    expect(item).toBeTruthy()
    expect(item).not.toHaveProperty('ownerId')
    expect(item).not.toHaveProperty('custom')
    expect(item).not.toHaveProperty('pipelineId')
    expect(Object.keys(item!).sort()).toEqual(['amount', 'createdAt', 'currency', 'id', 'name', 'stageId'].sort())
  })
})

describe('GET /api/client/project — cliente sin deal activo', () => {
  it('devuelve 404 con mensaje claro', async () => {
    const uniqueEmail = `no-deal-client-${Date.now()}@test.com`
    const [c] = await db.insert(contact).values({ portalId, firstName: 'Sin', lastName: 'Deal', email: uniqueEmail }).returning()
    const clerkUserId = `clerk_test_no_deal_client_${Date.now()}`
    await db.insert(clientAccount).values({ portalId, contactId: c!.id, email: uniqueEmail, clerkUserId, isActive: true })

    const res = await request(app.server).get('/api/client/project').set({ Authorization: `Bearer faketoken:${clerkUserId}` })
    expect(res.status).toBe(404)
    expect(res.body.error.message).toBeTruthy()
  })
})
