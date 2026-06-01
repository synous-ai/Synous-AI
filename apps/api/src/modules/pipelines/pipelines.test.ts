import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { buildApp } from '../../app'
import { closeDb } from '../../db'
import { ensurePortalAndUser, loginToken } from '../../test/helpers'

const app = buildApp()
let token: string

beforeAll(async () => {
  await app.ready()
  const ctx = await ensurePortalAndUser()
  token = await loginToken(app, ctx.email, ctx.password)
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

const auth = () => ({ Authorization: `Bearer ${token}` })

// Helper: crea un pipeline nuevo con una etapa inicial y devuelve { pipelineId, stageId }
async function createFreshPipeline(label: string) {
  const res = await request(app.server)
    .post('/api/pipelines')
    .set(auth())
    .send({
      label,
      stages: [{ label: 'Etapa inicial', displayOrder: 0 }],
    })
  expect(res.status).toBe(201)
  const pl = res.body.data
  return {
    pipelineId: pl.id as string,
    stageId: pl.stages[0].id as string,
  }
}

// ── PATCH de etapa — exitCriteria y description ───────────────────────────────

describe('pipelines — PATCH de etapa', () => {
  it('actualiza exitCriteria y se refleja en GET /pipelines', async () => {
    const { pipelineId, stageId } = await createFreshPipeline('Pipeline exitCriteria')

    const patch = await request(app.server)
      .patch(`/api/pipelines/${pipelineId}/stages/${stageId}`)
      .set(auth())
      .send({ exitCriteria: 'Propuesta firmada por el cliente' })
    expect(patch.status).toBe(200)
    expect(patch.body.data.exitCriteria).toBe('Propuesta firmada por el cliente')

    // Verificar persistencia a través del listado
    const listRes = await request(app.server).get('/api/pipelines').set(auth())
    expect(listRes.status).toBe(200)
    const pl = listRes.body.data.find((p: { id: string }) => p.id === pipelineId)
    expect(pl).toBeDefined()
    const stage = pl.stages.find((s: { id: string }) => s.id === stageId)
    expect(stage?.exitCriteria).toBe('Propuesta firmada por el cliente')
  })

  it('actualiza description y se refleja en GET /:id/stages', async () => {
    const { pipelineId, stageId } = await createFreshPipeline('Pipeline description')

    const patch = await request(app.server)
      .patch(`/api/pipelines/${pipelineId}/stages/${stageId}`)
      .set(auth())
      .send({ description: 'El deal aún está en evaluación inicial' })
    expect(patch.status).toBe(200)
    expect(patch.body.data.description).toBe('El deal aún está en evaluación inicial')

    const stagesRes = await request(app.server)
      .get(`/api/pipelines/${pipelineId}/stages`)
      .set(auth())
    expect(stagesRes.status).toBe(200)
    const stage = stagesRes.body.data.find((s: { id: string }) => s.id === stageId)
    expect(stage?.description).toBe('El deal aún está en evaluación inicial')
  })

  it('actualiza label sin afectar otros campos', async () => {
    const { pipelineId, stageId } = await createFreshPipeline('Pipeline label')

    // Primero setear exitCriteria
    await request(app.server)
      .patch(`/api/pipelines/${pipelineId}/stages/${stageId}`)
      .set(auth())
      .send({ exitCriteria: 'Criterio original' })

    // Ahora actualizar solo el label
    const patch = await request(app.server)
      .patch(`/api/pipelines/${pipelineId}/stages/${stageId}`)
      .set(auth())
      .send({ label: 'Etapa renombrada' })
    expect(patch.status).toBe(200)
    expect(patch.body.data.label).toBe('Etapa renombrada')
    // exitCriteria debe mantenerse intacto
    expect(patch.body.data.exitCriteria).toBe('Criterio original')
  })

  it('puede limpiar exitCriteria enviando null', async () => {
    const { pipelineId, stageId } = await createFreshPipeline('Pipeline null exitCriteria')

    await request(app.server)
      .patch(`/api/pipelines/${pipelineId}/stages/${stageId}`)
      .set(auth())
      .send({ exitCriteria: 'Criterio a limpiar' })

    const clear = await request(app.server)
      .patch(`/api/pipelines/${pipelineId}/stages/${stageId}`)
      .set(auth())
      .send({ exitCriteria: null })
    expect(clear.status).toBe(200)
    expect(clear.body.data.exitCriteria).toBeNull()
  })

  it('devuelve 404 si el stageId no existe en ese pipeline', async () => {
    const { pipelineId } = await createFreshPipeline('Pipeline 404 stage')

    const patch = await request(app.server)
      .patch(`/api/pipelines/${pipelineId}/stages/999999`)
      .set(auth())
      .send({ label: 'Ghost stage' })
    expect(patch.status).toBe(404)
  })
})

// ── addStage — persiste todos los campos ──────────────────────────────────────

describe('pipelines — addStage', () => {
  it('addStage persiste label, exitCriteria y description', async () => {
    const { pipelineId } = await createFreshPipeline('Pipeline addStage')

    const addRes = await request(app.server)
      .post(`/api/pipelines/${pipelineId}/stages`)
      .set(auth())
      .send({
        label: 'Nueva etapa',
        exitCriteria: 'Prototipo aprobado',
        description: 'El cliente revisó el prototipo',
      })
    expect(addRes.status).toBe(201)
    expect(addRes.body.data.label).toBe('Nueva etapa')
    expect(addRes.body.data.exitCriteria).toBe('Prototipo aprobado')
    expect(addRes.body.data.description).toBe('El cliente revisó el prototipo')
  })

  it('addStage asigna displayOrder incremental (al final de la lista)', async () => {
    const { pipelineId } = await createFreshPipeline('Pipeline displayOrder')

    // El pipeline ya tiene 1 etapa (displayOrder=0)
    const stage2 = await request(app.server)
      .post(`/api/pipelines/${pipelineId}/stages`)
      .set(auth())
      .send({ label: 'Segunda etapa' })
    expect(stage2.status).toBe(201)
    expect(stage2.body.data.displayOrder).toBe(1)

    const stage3 = await request(app.server)
      .post(`/api/pipelines/${pipelineId}/stages`)
      .set(auth())
      .send({ label: 'Tercera etapa' })
    expect(stage3.status).toBe(201)
    expect(stage3.body.data.displayOrder).toBe(2)
  })

  it('addStage con isWon=true persiste el flag', async () => {
    const { pipelineId } = await createFreshPipeline('Pipeline isWon stage')

    const addRes = await request(app.server)
      .post(`/api/pipelines/${pipelineId}/stages`)
      .set(auth())
      .send({ label: 'Ganado', isWon: true, isClosed: true })
    expect(addRes.status).toBe(201)
    expect(addRes.body.data.isWon).toBe(true)
    expect(addRes.body.data.isClosed).toBe(true)
  })
})

// ── Listado con stages anidados ───────────────────────────────────────────────

describe('pipelines — listPipelines anidado', () => {
  it('GET /pipelines devuelve stages anidados con todos sus campos', async () => {
    const { pipelineId } = await createFreshPipeline('Pipeline lista anidada')

    await request(app.server)
      .post(`/api/pipelines/${pipelineId}/stages`)
      .set(auth())
      .send({ label: 'Segunda', exitCriteria: 'Contrato firmado' })

    const listRes = await request(app.server).get('/api/pipelines').set(auth())
    expect(listRes.status).toBe(200)

    const found = listRes.body.data.find((p: { id: string }) => p.id === pipelineId)
    expect(found).toBeDefined()
    expect(Array.isArray(found.stages)).toBe(true)
    expect(found.stages.length).toBeGreaterThanOrEqual(2)

    // La segunda etapa debe tener exitCriteria
    const withCriteria = found.stages.find(
      (s: { exitCriteria: string | null }) => s.exitCriteria === 'Contrato firmado',
    )
    expect(withCriteria).toBeDefined()
  })
})

// ── Auth requerida ────────────────────────────────────────────────────────────

describe('pipelines — autenticación requerida', () => {
  it('GET /pipelines sin token devuelve 401', async () => {
    const res = await request(app.server).get('/api/pipelines')
    expect(res.status).toBe(401)
  })
})
