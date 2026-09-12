/**
 * Integridad del onboarding post-venta: lo que tiene que seguir siendo cierto
 * aunque el cliente recargue, abandone, vuelva días después, abra dos
 * pestañas, o le pegue a los endpoints a mano salteándose el wizard.
 *
 * Complementa a onboarding.test.ts (que cubre el camino feliz de punta a
 * punta). Acá cada test arma SU PROPIO cliente + deal, así el orden de los
 * tests no importa y ninguno se contamina con el estado de otro.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import { buildApp } from '../../app'
import { env } from '../../config/env'
import { db, closeDb } from '../../db'
import { contact, deal, clientAccount, clientDealAccess, clientOnboarding, clientAsset } from '../../db/schema'
import {
  ensurePortalAndUser,
  ensurePipeline,
  ensureProductionPipeline,
  ensureHubUser,
  type PipelineContext,
} from '../../test/helpers'
import { resumeStep, ONBOARDING_TOTAL_STEPS } from './steps'

const app = buildApp()
let portalId: string
let pipe: PipelineContext

interface TestClient {
  dealId: string
  clientId: string
  token: string
}

/** Cliente + contacto + deal + acceso: un cliente logueado con proyecto activo. */
async function makeClient(tag: string): Promise<TestClient> {
  const unique = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `integrity-${unique}@test.com`
  const [c] = await db.insert(contact).values({ portalId, firstName: 'Integrity', lastName: tag, email }).returning()
  const [d] = await db
    .insert(deal)
    .values({ portalId, name: `Deal ${unique}`, pipelineId: pipe.pipelineId, stageId: pipe.firstStageId, primaryContactId: c!.id })
    .returning()
  const clerkUserId = `clerk_integrity_${unique}`
  const [ca] = await db
    .insert(clientAccount)
    .values({ portalId, contactId: c!.id, email, clerkUserId, isActive: true })
    .returning()
  await db.insert(clientDealAccess).values({ clientId: ca!.id, dealId: d!.id })
  return { dealId: d!.id, clientId: ca!.id, token: `faketoken:${clerkUserId}` }
}

const auth = (t: string) => ({ Authorization: `Bearer ${t}` })

const api = {
  state: (t: string) => request(app.server).get('/api/client/onboarding').set(auth(t)),
  progress: (t: string, step: number) =>
    request(app.server).patch('/api/client/onboarding/progress').set(auth(t)).send({ step }),
  sign: (t: string, fullName = 'Cliente Integridad') =>
    request(app.server).post('/api/client/onboarding/signature').set(auth(t)).send({ fullName, accepted: true }),
  briefDraft: (t: string, partial: Record<string, unknown>) =>
    request(app.server).patch('/api/client/onboarding/brief/draft').set(auth(t)).send(partial),
  brief: (t: string, body: Record<string, unknown>) =>
    request(app.server).post('/api/client/onboarding/brief').set(auth(t)).send(body),
  materialsDraft: (t: string, materials: Record<string, unknown>) =>
    request(app.server).patch('/api/client/onboarding/materials/draft').set(auth(t)).send({ materials }),
  materials: (t: string, materials: Record<string, unknown>) =>
    request(app.server).post('/api/client/onboarding/materials').set(auth(t)).send({ materials }),
  complete: (t: string) => request(app.server).post('/api/client/onboarding/complete').set(auth(t)),
}

const validBrief = {
  businessProgram: 'Programa de mentoría', activeClients: '50 alumnos', deliveryChannels: ['whatsapp'],
  worstChannel: 'WhatsApp', weeklyTimeDrain: 'Consultas repetidas', sixMonthConcern: 'Escalar',
  idealDayToDay: 'Centralizado', desiredStudentFeeling: 'Acompañado', referenceApps: 'Notion',
  teamRoles: 'Yo + 1', brandIdentity: 'Azul y blanco', requiredIntegrations: 'Ninguna',
  existingClientBase: 'Excel', howFoundUs: 'Instagram', decisionTrigger: 'Perder tiempo',
  doubtsBeforeBuying: 'Migrar clientes',
}
const validMaterials = {
  logoBrand: { done: true }, programContent: { done: true },
  clientBase: { done: true }, toolAccess: { done: true },
}

/** Recorre la orientación (1-4) en orden, como hace el wizard real. */
async function completeOrientation(token: string): Promise<void> {
  for (const step of [1, 2, 3, 4]) {
    const res = await api.progress(token, step)
    expect(res.status).toBe(200)
  }
}

/** Deja al cliente listo para el paso 8 (orientación + firma + brief + materiales). */
async function advanceToFinalStep(token: string): Promise<void> {
  await completeOrientation(token)
  expect((await api.sign(token)).status).toBe(200)
  expect((await api.brief(token, validBrief)).status).toBe(200)
  expect((await api.materials(token, validMaterials)).status).toBe(200)
}

beforeAll(async () => {
  await app.ready()
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  pipe = await ensurePipeline(portalId)
  await ensureProductionPipeline(portalId)
  await ensureHubUser(portalId, env.PRODUCTION_ASSIGNEE_DIAGNOSTICO_EMAIL, 'Lauri')
  await ensureHubUser(portalId, env.PRODUCTION_ASSIGNEE_DEFAULT_EMAIL, 'Jeremias')
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

// ── Reconstrucción del estado: reload / abandonar y volver / logout-login ────

describe('reconstrucción del progreso desde la DB', () => {
  it('el paso actual se reconstruye con un GET limpio (reload / pestaña nueva / logout-login)', async () => {
    const { token } = await makeClient('resume')
    await api.progress(token, 1)
    await api.progress(token, 2)
    await api.progress(token, 3)

    // Un GET nuevo es exactamente lo que hace el wizard al montar: sin React
    // state, sin localStorage, sin URL params — solo lo que está persistido.
    const reloaded = await api.state(token)
    expect(reloaded.status).toBe(200)
    expect(reloaded.body.data.onboarding.currentStep).toBe(4)
    expect(Object.keys(reloaded.body.data.onboarding.stepsCompleted).sort()).toEqual(['1', '2', '3'])
  })

  it('las respuestas ya enviadas vuelven en el GET (no se pierden al abandonar)', async () => {
    const { token } = await makeClient('answers')
    await completeOrientation(token)
    await api.sign(token, 'Firma Persistida')
    await api.brief(token, validBrief)

    const reloaded = await api.state(token)
    expect(reloaded.body.data.onboarding.signatureName).toBe('Firma Persistida')
    expect(reloaded.body.data.onboarding.briefAnswers.businessProgram).toBe(validBrief.businessProgram)
    expect(reloaded.body.data.onboarding.currentStep).toBe(7)
  })

  it('current_step NUNCA apunta a un paso con prerequisitos incompletos', async () => {
    const { token } = await makeClient('invariant')
    await completeOrientation(token)
    await api.sign(token)

    const { body } = await api.state(token)
    const { currentStep, stepsCompleted } = body.data.onboarding
    expect(currentStep).toBe(resumeStep(stepsCompleted))
    // Todo paso anterior al actual está completo — no hay huecos.
    for (let prev = 1; prev < currentStep; prev++) {
      expect(stepsCompleted[String(prev)]).toBeTruthy()
    }
    expect(currentStep).toBeLessThanOrEqual(ONBOARDING_TOTAL_STEPS)
  })
})

// ── Borrador del brief: lo tipeado no vive solo en memoria ───────────────────

describe('borrador del brief (paso 6)', () => {
  it('guarda respuestas parciales y las devuelve en el GET', async () => {
    const { token } = await makeClient('draft')
    await completeOrientation(token)
    await api.sign(token)

    const res = await api.briefDraft(token, { businessProgram: 'Bloque 1 tipeado', activeClients: '30 alumnos' })
    expect(res.status).toBe(200)

    const reloaded = await api.state(token)
    expect(reloaded.body.data.onboarding.briefDraft.businessProgram).toBe('Bloque 1 tipeado')
    // Un borrador NO marca el paso como completo.
    expect(reloaded.body.data.onboarding.stepsCompleted['6']).toBeUndefined()
    expect(reloaded.body.data.onboarding.currentStep).toBe(6)
  })

  it('una actualización parcial no borra lo guardado antes', async () => {
    const { token } = await makeClient('draft-merge')
    await completeOrientation(token)
    await api.sign(token)

    await api.briefDraft(token, { businessProgram: 'Bloque 1' })
    await api.briefDraft(token, { worstChannel: 'Bloque 2' })

    const { body } = await api.state(token)
    expect(body.data.onboarding.briefDraft).toMatchObject({ businessProgram: 'Bloque 1', worstChannel: 'Bloque 2' })
  })

  it('dos borradores CONCURRENTES no se pisan (sin lost update)', async () => {
    const { token } = await makeClient('draft-race')
    await completeOrientation(token)
    await api.sign(token)

    // El bug original: read-modify-write en JS. Dos requests leían el mismo
    // valor, cada una agregaba SU clave y la última pisaba la otra.
    const results = await Promise.all([
      api.briefDraft(token, { businessProgram: 'A' }),
      api.briefDraft(token, { worstChannel: 'B' }),
      api.briefDraft(token, { teamRoles: 'C' }),
      api.briefDraft(token, { howFoundUs: 'D' }),
    ])
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200])

    const { body } = await api.state(token)
    expect(body.data.onboarding.briefDraft).toMatchObject({
      businessProgram: 'A', worstChannel: 'B', teamRoles: 'C', howFoundUs: 'D',
    })
  })

  it('el submit final limpia el borrador y marca el paso 6', async () => {
    const { token } = await makeClient('draft-clear')
    await completeOrientation(token)
    await api.sign(token)
    await api.briefDraft(token, { businessProgram: 'borrador viejo' })

    expect((await api.brief(token, validBrief)).status).toBe(200)

    const { body } = await api.state(token)
    expect(body.data.onboarding.briefDraft).toBeNull()
    expect(body.data.onboarding.briefAnswers.businessProgram).toBe(validBrief.businessProgram)
    expect(body.data.onboarding.stepsCompleted['6']).toBeTruthy()
  })

  it('rechaza claves desconocidas en el borrador (no se infla la fila con basura)', async () => {
    const { token } = await makeClient('draft-strict')
    await completeOrientation(token)
    await api.sign(token)

    const res = await api.briefDraft(token, { businessProgram: 'ok', hackeado: 'x' })
    expect(res.status).toBe(400)
  })

  it('rechaza un borrador antes de firmar (no se puede adelantar al paso 6)', async () => {
    const { token } = await makeClient('draft-order')
    await completeOrientation(token)

    const res = await api.briefDraft(token, { businessProgram: 'adelantado' })
    expect(res.status).toBe(400)
    expect(res.body.error.details.missing).toContain('firma')
  })
})

// ── Borrador de materiales ──────────────────────────────────────────────────

describe('borrador de materiales (paso 7)', () => {
  it('persiste el checklist sin marcar el paso como completo', async () => {
    const { token } = await makeClient('mat-draft')
    await completeOrientation(token)
    await api.sign(token)
    await api.brief(token, validBrief)

    const res = await api.materialsDraft(token, { logoBrand: { done: true, note: 'Ya lo tengo' } })
    expect(res.status).toBe(200)

    const { body } = await api.state(token)
    expect(body.data.onboarding.materials.logoBrand).toMatchObject({ done: true, note: 'Ya lo tengo' })
    expect(body.data.onboarding.stepsCompleted['7']).toBeUndefined()
    expect(body.data.onboarding.currentStep).toBe(7)
  })

  it('dos categorías guardadas CONCURRENTEMENTE sobreviven las dos', async () => {
    const { token } = await makeClient('mat-race')
    await completeOrientation(token)
    await api.sign(token)
    await api.brief(token, validBrief)

    const results = await Promise.all([
      api.materialsDraft(token, { logoBrand: { done: true } }),
      api.materialsDraft(token, { programContent: { done: true } }),
      api.materialsDraft(token, { clientBase: { done: false, note: 'No tengo' } }),
    ])
    expect(results.map((r) => r.status)).toEqual([200, 200, 200])

    const { body } = await api.state(token)
    expect(body.data.onboarding.materials).toMatchObject({
      logoBrand: { done: true }, programContent: { done: true }, clientBase: { done: false, note: 'No tengo' },
    })
  })

  it('no se pueden vincular archivos de OTRO proyecto', async () => {
    const victim = await makeClient('mat-victim')
    const attacker = await makeClient('mat-attacker')
    await completeOrientation(attacker.token)
    await api.sign(attacker.token)
    await api.brief(attacker.token, validBrief)

    const [foreign] = await db
      .insert(clientAsset)
      .values({
        portalId, dealId: victim.dealId, clientId: victim.clientId, fieldName: 'logoBrand',
        name: 'ajeno.png', type: 'logo', storageKey: `test/${Date.now()}-ajeno.png`,
      })
      .returning()

    const res = await api.materialsDraft(attacker.token, { logoBrand: { done: true, assetIds: [foreign!.id] } })
    expect(res.status).toBe(400)
    expect(res.body.error.details.invalid).toContain(foreign!.id)
  })
})

// ── Imposibilidad de saltear pasos por request directo ───────────────────────

describe('el backend impide saltear pasos (sin depender del frontend)', () => {
  it('firmar sin haber pasado la orientación → 400', async () => {
    const { token } = await makeClient('skip-sign')
    const res = await api.sign(token)
    expect(res.status).toBe(400)
    expect(res.body.error.details.missing).toEqual([
      'bienvenida', 'cómo funciona', 'fases del proyecto', 'modo de trabajo',
    ])
  })

  it('mandar el brief sin firmar → 400', async () => {
    const { token } = await makeClient('skip-brief')
    await completeOrientation(token)
    const res = await api.brief(token, validBrief)
    expect(res.status).toBe(400)
    expect(res.body.error.details.missing).toEqual(['firma'])
  })

  it('mandar materiales sin el brief → 400', async () => {
    const { token } = await makeClient('skip-mat')
    await completeOrientation(token)
    await api.sign(token)
    const res = await api.materials(token, validMaterials)
    expect(res.status).toBe(400)
    expect(res.body.error.details.missing).toEqual(['brief'])
  })

  it('completar el onboarding sin NINGÚN paso previo → 400 y el deal no se mueve', async () => {
    const { token, dealId } = await makeClient('skip-complete')
    const res = await api.complete(token)
    expect(res.status).toBe(400)

    // El gate corre DENTRO de la transacción, así que su rechazo también
    // revierte el lazy-create de la fila: o no existe, o quedó in_progress.
    // Lo que importa es que nunca quede completada.
    const [row] = await db.select().from(clientOnboarding).where(eq(clientOnboarding.dealId, dealId))
    expect(row?.status ?? 'in_progress').toBe('in_progress')
    expect(row?.completedAt ?? null).toBeNull()

    const [d] = await db.select().from(deal).where(eq(deal.id, dealId))
    expect(d!.pipelineId).toBe(pipe.pipelineId)
  })

  it('un intento rechazado no deja rastro en la DB (no marca el paso ni mueve current_step)', async () => {
    const { token, dealId } = await makeClient('skip-noop')
    await api.progress(token, 1)
    expect((await api.progress(token, 4)).status).toBe(400)

    const [row] = await db.select().from(clientOnboarding).where(eq(clientOnboarding.dealId, dealId))
    expect(row!.stepsCompleted['4']).toBeUndefined()
    expect(row!.currentStep).toBe(2)
  })
})

// ── Concurrencia en los pasos que disparan efectos ──────────────────────────

describe('concurrencia y doble submit', () => {
  it('dos firmas simultáneas: una sola gana y no se pisa la firma registrada', async () => {
    const { token, dealId } = await makeClient('sign-race')
    await completeOrientation(token)

    const [r1, r2] = await Promise.all([api.sign(token, 'Primera Firma'), api.sign(token, 'Segunda Firma')])
    const statuses = [r1.status, r2.status].sort()
    expect(statuses).toEqual([200, 409])

    const [row] = await db.select().from(clientOnboarding).where(eq(clientOnboarding.dealId, dealId))
    expect(['Primera Firma', 'Segunda Firma']).toContain(row!.signatureName)
    expect(row!.signatureAcceptedAt).toBeTruthy()
  })

  it('dos POST /complete simultáneos: se completa UNA sola vez', async () => {
    const { token, dealId } = await makeClient('complete-race')
    await advanceToFinalStep(token)

    const [r1, r2] = await Promise.all([api.complete(token), api.complete(token)])
    expect([r1.status, r2.status].sort()).toEqual([200, 409])

    const rows = await db.select().from(clientOnboarding).where(eq(clientOnboarding.dealId, dealId))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('completed')
  })

  it('GETs simultáneos sobre un cliente sin fila no crean duplicados', async () => {
    const { token, dealId } = await makeClient('lazy-race')
    const results = await Promise.all([api.state(token), api.state(token), api.state(token)])
    expect(results.every((r) => r.status === 200)).toBe(true)

    const rows = await db.select().from(clientOnboarding).where(eq(clientOnboarding.dealId, dealId))
    expect(rows).toHaveLength(1)
  })
})

// ── Onboarding ya completo: estado terminal ─────────────────────────────────

describe('onboarding completo (estado terminal)', () => {
  it('rechaza cualquier escritura posterior', async () => {
    const { token } = await makeClient('terminal')
    await advanceToFinalStep(token)
    expect((await api.complete(token)).status).toBe(200)

    expect((await api.progress(token, 1)).status).toBe(409)
    expect((await api.briefDraft(token, { businessProgram: 'tarde' })).status).toBe(409)
    expect((await api.materialsDraft(token, { logoBrand: { done: false } })).status).toBe(409)
    expect((await api.materials(token, validMaterials)).status).toBe(409)
    expect((await api.brief(token, validBrief)).status).toBe(409)
    expect((await api.sign(token)).status).toBe(409)
  })

  it('el GET sigue funcionando y devuelve el estado final intacto', async () => {
    const { token } = await makeClient('terminal-get')
    await advanceToFinalStep(token)
    await api.complete(token)

    const { body } = await api.state(token)
    expect(body.data.onboarding.status).toBe('completed')
    expect(body.data.onboarding.currentStep).toBe(ONBOARDING_TOTAL_STEPS)
    expect(body.data.onboarding.completedAt).toBeTruthy()
    expect(Object.keys(body.data.onboarding.stepsCompleted).sort()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8'])
  })
})

// ── Aislamiento entre clientes ──────────────────────────────────────────────

describe('aislamiento entre clientes', () => {
  it('dos onboardings parciales en paralelo no se mezclan', async () => {
    const a = await makeClient('iso-a')
    const b = await makeClient('iso-b')

    await api.progress(a.token, 1)
    await completeOrientation(b.token)
    await api.sign(b.token, 'Solo B Firmó')

    const stateA = await api.state(a.token)
    const stateB = await api.state(b.token)

    expect(stateA.body.data.onboarding.dealId).toBe(a.dealId)
    expect(stateA.body.data.onboarding.currentStep).toBe(2)
    expect(stateA.body.data.onboarding.signatureName).toBeNull()

    expect(stateB.body.data.onboarding.dealId).toBe(b.dealId)
    expect(stateB.body.data.onboarding.currentStep).toBe(6)
    expect(stateB.body.data.onboarding.signatureName).toBe('Solo B Firmó')
  })

  it('completar el onboarding de un cliente no toca el del otro', async () => {
    const a = await makeClient('iso-complete-a')
    const b = await makeClient('iso-complete-b')
    await advanceToFinalStep(a.token)
    await api.progress(b.token, 1)

    expect((await api.complete(a.token)).status).toBe(200)

    const [rowB] = await db.select().from(clientOnboarding).where(eq(clientOnboarding.dealId, b.dealId))
    expect(rowB!.status).toBe('in_progress')
    expect(rowB!.currentStep).toBe(2)
  })
})

// ── Validación de datos ─────────────────────────────────────────────────────

describe('validación del brief', () => {
  it('el canal "otro" exige decir cuál', async () => {
    const { token } = await makeClient('valid-otro')
    await completeOrientation(token)
    await api.sign(token)

    const sinDetalle = await api.brief(token, { ...validBrief, deliveryChannels: ['otro'] })
    expect(sinDetalle.status).toBe(400)

    const conDetalle = await api.brief(token, {
      ...validBrief, deliveryChannels: ['otro'], deliveryChannelsOther: 'Telegram',
    })
    expect(conDetalle.status).toBe(200)
  })

  it('rechaza campos vacíos, de solo espacios y desmedidamente largos', async () => {
    const { token } = await makeClient('valid-edge')
    await completeOrientation(token)
    await api.sign(token)

    expect((await api.brief(token, { ...validBrief, businessProgram: '' })).status).toBe(400)
    expect((await api.brief(token, { ...validBrief, businessProgram: '      ' })).status).toBe(400)
    expect((await api.brief(token, { ...validBrief, businessProgram: 'x'.repeat(2001) })).status).toBe(400)
    expect((await api.brief(token, { ...validBrief, deliveryChannels: [] })).status).toBe(400)
    expect((await api.brief(token, { ...validBrief, deliveryChannels: ['inventado'] })).status).toBe(400)
  })

  it('no se pueden escribir campos de control desde el payload (mass assignment)', async () => {
    const { token, dealId } = await makeClient('valid-mass')
    await completeOrientation(token)
    await api.sign(token)

    await api.brief(token, { ...validBrief, status: 'completed', currentStep: 99, portalId: 'ajeno', clientId: 'ajeno' })

    const [row] = await db.select().from(clientOnboarding).where(eq(clientOnboarding.dealId, dealId))
    expect(row!.status).toBe('in_progress')
    expect(row!.currentStep).toBe(7)
    expect(row!.portalId).toBe(portalId)
    expect(row!.dealId).toBe(dealId)
  })

  it('acepta caracteres especiales y unicode sin romperse', async () => {
    const { token } = await makeClient('valid-unicode')
    await completeOrientation(token)
    await api.sign(token)

    const raro = 'Programa "Ñandú" <script>alert(1)</script> 日本語 — 100% & más ✨'
    const res = await api.brief(token, { ...validBrief, businessProgram: raro })
    expect(res.status).toBe(200)
    expect(res.body.data.briefAnswers.businessProgram).toBe(raro)
  })
})
