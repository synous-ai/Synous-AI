import type { FastifyInstance } from 'fastify'
import { and, eq } from 'drizzle-orm'
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

export interface ProductionPipelineContext {
  pipelineId: string
  diagnosticoStageId: string
  blueprintStageId: string
}

/**
 * Crea (o reutiliza) el pipeline "Producción" con las etapas "Diagnóstico" y
 * "Blueprint" — lo mínimo necesario para los tests del onboarding post-venta
 * (completeOnboarding mueve a Diagnóstico; el reassignment de changeStage se
 * prueba moviendo a Blueprint).
 */
export async function ensureProductionPipeline(portalId: string): Promise<ProductionPipelineContext> {
  let [pl] = await db
    .select()
    .from(pipeline)
    .where(and(eq(pipeline.portalId, portalId), eq(pipeline.label, 'Producción')))
    .limit(1)
  if (!pl) [pl] = await db.insert(pipeline).values({ portalId, label: 'Producción' }).returning()

  let [diag] = await db
    .select()
    .from(pipelineStage)
    .where(and(eq(pipelineStage.pipelineId, pl!.id), eq(pipelineStage.label, 'Diagnóstico')))
    .limit(1)
  if (!diag) [diag] = await db.insert(pipelineStage).values({ pipelineId: pl!.id, label: 'Diagnóstico', displayOrder: 0 }).returning()

  let [blueprint] = await db
    .select()
    .from(pipelineStage)
    .where(and(eq(pipelineStage.pipelineId, pl!.id), eq(pipelineStage.label, 'Blueprint')))
    .limit(1)
  if (!blueprint) [blueprint] = await db.insert(pipelineStage).values({ pipelineId: pl!.id, label: 'Blueprint', displayOrder: 1 }).returning()

  return { pipelineId: pl!.id, diagnosticoStageId: diag!.id, blueprintStageId: blueprint!.id }
}

export interface FullProductionStage {
  id: string
  label: string
  description: string | null
  displayOrder: number
}

export interface FullProductionPipelineContext {
  pipelineId: string
  stages: FullProductionStage[]
}

/** Mismas 9 fases y descripciones que `db/seed.ts` — reutilizadas acá para que los tests no se desincronicen del seed real. */
const FULL_PRODUCTION_STAGES = [
  { label: 'Diagnóstico', description: 'Estamos estudiando a fondo tu negocio: tu brief, tus materiales y tu operación. De acá sale el mapa de lo que vamos a construir.' },
  { label: 'Blueprint', description: 'Diseñamos la arquitectura de tu plataforma: pantallas, flujos y estructura. Es el plano antes de construir.' },
  { label: 'Primera Versión (MVP)', description: 'Estamos construyendo la primera versión navegable de tu plataforma. Pronto la vas a ver y tocar en una llamada en vivo.' },
  { label: 'Ajustes', description: 'Estamos afinando la plataforma con tu feedback de la primera versión.' },
  { label: 'Construcción', description: 'Construimos todo lo que va por detrás: funcionalidades completas, integraciones y contenido.' },
  { label: 'Verificación', description: 'Estamos probando todo a fondo para que el lanzamiento salga sin sorpresas.' },
  { label: 'Lanzamiento', description: 'Tu plataforma está saliendo en vivo. Lo mostramos juntos en una llamada.' },
  { label: 'Estabilización', description: 'Tu plataforma ya está en vivo. Te acompañamos de cerca estas primeras semanas.' },
  { label: 'Evolución', description: 'Seguimos mejorando tu plataforma con nuevas iteraciones.' },
] as const

/**
 * Crea (o reutiliza) el pipeline "Producción" con las 9 fases completas + sus
 * descripciones cliente-facing — para probar el endpoint de estado de
 * proyecto (roadmap completo, no solo Diagnóstico/Blueprint como
 * `ensureProductionPipeline`). Idempotente por label; si una fase ya existe
 * sin `description` (p.ej. creada por `ensureProductionPipeline` en otro
 * test), se la completa.
 */
export async function ensureFullProductionPipeline(portalId: string): Promise<FullProductionPipelineContext> {
  let [pl] = await db
    .select()
    .from(pipeline)
    .where(and(eq(pipeline.portalId, portalId), eq(pipeline.label, 'Producción')))
    .limit(1)
  if (!pl) [pl] = await db.insert(pipeline).values({ portalId, label: 'Producción' }).returning()

  const stages: FullProductionStage[] = []
  for (let i = 0; i < FULL_PRODUCTION_STAGES.length; i++) {
    const { label, description } = FULL_PRODUCTION_STAGES[i]!
    let [s] = await db
      .select()
      .from(pipelineStage)
      .where(and(eq(pipelineStage.pipelineId, pl!.id), eq(pipelineStage.label, label)))
      .limit(1)
    if (!s) {
      ;[s] = await db.insert(pipelineStage).values({ pipelineId: pl!.id, label, displayOrder: i, description }).returning()
    } else if (!s.description) {
      ;[s] = await db.update(pipelineStage).set({ description }).where(eq(pipelineStage.id, s.id)).returning()
    }
    stages.push({ id: s!.id, label: s!.label, description: s!.description, displayOrder: s!.displayOrder })
  }
  return { pipelineId: pl!.id, stages }
}

/** Crea (o reutiliza) un hub_user responsable de una fase de Producción, por email. Idempotente. */
export async function ensureHubUser(portalId: string, email: string, firstName: string): Promise<string> {
  let [u] = await db.select().from(hubUser).where(eq(hubUser.email, email)).limit(1)
  if (!u) {
    ;[u] = await db
      .insert(hubUser)
      .values({ portalId, email, firstName, role: 'member', clerkUserId: `clerk_test_${email.toLowerCase().replace(/[^a-z0-9]/g, '_')}` })
      .returning()
  }
  return u!.id
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
