import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { and, eq } from 'drizzle-orm'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import { recordHistory, auditLog } from '../../db/schema'
import { ensurePortalAndUser, ensurePipeline, loginToken, type PipelineContext } from '../../test/helpers'

const app = buildApp()
let token: string
let pipe: PipelineContext

beforeAll(async () => {
  await app.ready()
  const ctx = await ensurePortalAndUser()
  pipe = await ensurePipeline(ctx.portalId)
  token = await loginToken(app, ctx.email, ctx.password)
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

const auth = () => ({ Authorization: `Bearer ${token}` })

describe('deals + stage change', () => {
  let dealId: string

  it('crea un deal en la etapa inicial (201)', async () => {
    const res = await request(app.server)
      .post('/api/deals')
      .set(auth())
      .send({ name: 'Sitio web ACME', amount: 5000, pipelineId: pipe.pipelineId, stageId: pipe.firstStageId })
    expect(res.status).toBe(201)
    expect(res.body.data.id).toBeTruthy()
    expect(res.body.data.stageId).toBe(pipe.firstStageId)
    dealId = res.body.data.id
  })

  it('rechaza crear deal con stage de otro pipeline (400)', async () => {
    const res = await request(app.server)
      .post('/api/deals')
      .set(auth())
      .send({ name: 'X', pipelineId: pipe.pipelineId, stageId: 'nonexistent-stage-id-xyz' })
    expect(res.status).toBe(400)
  })

  it('cambia de etapa y registra STAGE_CHANGE en record_history + audit_log', async () => {
    const res = await request(app.server)
      .patch(`/api/deals/${dealId}/stage`)
      .set(auth())
      .send({ stageId: pipe.wonStageId })
    expect(res.status).toBe(200)
    expect(res.body.data.stageId).toBe(pipe.wonStageId)

    const history = await db
      .select()
      .from(recordHistory)
      .where(and(eq(recordHistory.entityType, 'deal'), eq(recordHistory.entityId, dealId), eq(recordHistory.fieldName, 'stageId')))
    expect(history.length).toBeGreaterThanOrEqual(1)
    expect(history.at(-1)!.newValue).toBe(String(pipe.wonStageId))

    const audit = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'deal'), eq(auditLog.entityId, dealId), eq(auditLog.action, 'STAGE_CHANGE')))
    expect(audit.length).toBeGreaterThanOrEqual(1)
  })

  it('rechaza cambiar a un stage inexistente (400)', async () => {
    const res = await request(app.server).patch(`/api/deals/${dealId}/stage`).set(auth()).send({ stageId: 'nonexistent-stage-id-xyz' })
    expect(res.status).toBe(400)
  })
})
