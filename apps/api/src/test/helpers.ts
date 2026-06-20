import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { portal, hubUser, pipeline, pipelineStage } from '../db/schema'

/** Clerk user_id determinístico del hub_user owner de tests. */
export const TEST_CLERK_USER_ID = 'clerk_test_owner'

export interface TestContext {
  portalId: string
  userId: string
  email: string
  password: string
  clerkUserId: string
}

/** Crea (o reutiliza) un portal y un usuario owner para los tests. Idempotente. */
export async function ensurePortalAndUser(): Promise<TestContext> {
  let [p] = await db.select().from(portal).limit(1)
  if (!p) [p] = await db.insert(portal).values({ name: 'Test Portal' }).returning()

  const email = 'owner@test.com'
  // `password` se conserva por compatibilidad de firma; la auth real es Clerk.
  const password = 'password123'
  let [u] = await db.select().from(hubUser).where(eq(hubUser.email, email)).limit(1)
  if (!u) {
    ;[u] = await db
      .insert(hubUser)
      .values({ portalId: p!.id, email, role: 'owner', firstName: 'Owner', clerkUserId: TEST_CLERK_USER_ID })
      .returning()
  } else if (u.clerkUserId !== TEST_CLERK_USER_ID) {
    // Asegura que la fila reutilizada tenga el clerk_user_id que espera el mock.
    ;[u] = await db
      .update(hubUser)
      .set({ clerkUserId: TEST_CLERK_USER_ID })
      .where(eq(hubUser.id, u.id))
      .returning()
  }
  return { portalId: p!.id, userId: u!.id, email, password, clerkUserId: TEST_CLERK_USER_ID }
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

/**
 * Devuelve un token de prueba aceptado por el mock de Clerk (test/setup.ts).
 * Resuelve el clerk_user_id del hub_user por email para no acoplar callers al
 * valor concreto. Mantiene la firma original `(app, email, password)` para no
 * romper los ~10 callers; `password` se ignora (la auth real es Clerk).
 */
export async function loginToken(_app: FastifyInstance, email: string, _password: string): Promise<string> {
  const [u] = await db
    .select({ clerkUserId: hubUser.clerkUserId })
    .from(hubUser)
    .where(eq(hubUser.email, email))
    .limit(1)
  const clerkUserId = u?.clerkUserId ?? TEST_CLERK_USER_ID
  return `faketoken:${clerkUserId}`
}
