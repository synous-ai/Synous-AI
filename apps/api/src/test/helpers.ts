import request from 'supertest'
import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { portal, hubUser, pipeline, pipelineStage } from '../db/schema'
import { hashPassword } from '../lib/password'

export interface TestContext {
  portalId: string
  userId: string
  email: string
  password: string
}

/** Crea (o reutiliza) un portal y un usuario owner para los tests. Idempotente. */
export async function ensurePortalAndUser(): Promise<TestContext> {
  let [p] = await db.select().from(portal).limit(1)
  if (!p) [p] = await db.insert(portal).values({ name: 'Test Portal' }).returning()

  const email = 'owner@test.com'
  const password = 'password123'
  let [u] = await db.select().from(hubUser).where(eq(hubUser.email, email)).limit(1)
  if (!u) {
    ;[u] = await db
      .insert(hubUser)
      .values({ portalId: p!.id, email, passwordHash: await hashPassword(password), role: 'owner', firstName: 'Owner' })
      .returning()
  }
  return { portalId: p!.id, userId: u!.id, email, password }
}

export interface PipelineContext {
  pipelineId: string
  firstStageId: string
  wonStageId: string
}

/** Crea (o reutiliza) un pipeline con dos etapas (inicial y ganada). */
export async function ensurePipeline(portalId: string): Promise<PipelineContext> {
  let [pl] = await db.select().from(pipeline).where(eq(pipeline.portalId, portalId)).limit(1)
  if (!pl) [pl] = await db.insert(pipeline).values({ portalId, label: 'Ventas' }).returning()

  let stages = await db.select().from(pipelineStage).where(eq(pipelineStage.pipelineId, pl!.id))
  if (stages.length === 0) {
    stages = await db
      .insert(pipelineStage)
      .values([
        { pipelineId: pl!.id, label: 'Nuevo', displayOrder: 0 },
        { pipelineId: pl!.id, label: 'Ganado', displayOrder: 1, isWon: true, isClosed: true },
      ])
      .returning()
  }
  return { pipelineId: pl!.id, firstStageId: stages[0]!.id, wonStageId: stages.at(-1)!.id }
}

/** Hace login y devuelve un access token. */
export async function loginToken(app: FastifyInstance, email: string, password: string): Promise<string> {
  const res = await request(app.server).post('/api/auth/login').send({ email, password })
  return res.body.data.accessToken as string
}
