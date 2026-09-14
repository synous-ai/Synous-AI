/**
 * Lo que el cliente consulta de su onboarding desde el portal (sección
 * "Onboarding"): brief, materiales y archivos — SOLO los suyos.
 *
 * La sección no tiene endpoint propio: lee GET /api/client/onboarding y abre
 * cada archivo con POST /api/files/access. Estos tests fijan el aislamiento de
 * esas dos rutas contra otro cliente del mismo portal y contra otro portal,
 * incluidos los intentos de manipular ids y storage keys desde el request.
 * Hasta acá ningún test cubría `client_asset` en la autorización de archivos.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { randomUUID } from 'node:crypto'
import { buildApp } from '../../app'
import { env } from '../../config/env'
import { db, closeDb } from '../../db'
import { portal, contact, deal, clientAccount, clientDealAccess } from '../../db/schema'
import {
  ensurePortalAndUser,
  ensurePipeline,
  ensureProductionPipeline,
  ensureHubUser,
  loginToken,
  listenForSupertest,
  type PipelineContext,
} from '../../test/helpers'
import { FILE_BYTES, clearPendingUploads, removeTestUploads, uploadServerFile, type UploadRequest } from '../../test/uploads'

const app = buildApp({ rateLimit: false })

interface TestClient {
  clientId: string
  dealId: string
  token: string
}

let portalId: string
let otherPortalId: string
let adminToken: string
let clientA: TestClient
let clientB: TestClient
let otherPortalClient: TestClient

let logoKey: string
let logoAssetId: string
let manualKey: string

const validBrief = {
  businessProgram: 'Mentoría de marca personal',
  activeClients: '40 alumnos activos',
  deliveryChannels: ['whatsapp', 'otro'],
  deliveryChannelsOther: 'Telegram',
  worstChannel: 'WhatsApp se desordena',
  weeklyTimeDrain: 'Responder consultas repetidas',
  sixMonthConcern: 'No poder escalar',
  idealDayToDay: 'Todo en un solo lugar',
  desiredStudentFeeling: 'Acompañados',
  referenceApps: 'Skool',
  teamRoles: 'Yo + 1 asistente',
  brandIdentity: 'Logo definido, azul y blanco',
  requiredIntegrations: 'Stripe',
  existingClientBase: 'Planilla con 40 filas',
  howFoundUs: 'Instagram',
  decisionTrigger: 'Perder tiempo con la operación',
  doubtsBeforeBuying: 'La migración de alumnos',
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })
const getOnboarding = (token: string) => request(app.server).get('/api/client/onboarding').set(auth(token))
const access = (token: string, storageKey: string) =>
  request(app.server).post('/api/files/access').set(auth(token)).send({ storageKey })
const pathOf = (url: string) => {
  const parsed = new URL(url)
  return `${parsed.pathname}${parsed.search}`
}

async function makeClient(targetPortalId: string, pipe: PipelineContext, tag: string): Promise<TestClient> {
  const unique = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `onboarding-data-${unique}@test.com`
  const [c] = await db
    .insert(contact)
    .values({ portalId: targetPortalId, firstName: 'Cliente', lastName: tag, email })
    .returning()
  const [d] = await db
    .insert(deal)
    .values({
      portalId: targetPortalId,
      name: `Deal ${unique}`,
      pipelineId: pipe.pipelineId,
      stageId: pipe.firstStageId,
      primaryContactId: c!.id,
    })
    .returning()
  const clerkUserId = `clerk_test_onboarding_data_${unique}`
  const [ca] = await db
    .insert(clientAccount)
    .values({ portalId: targetPortalId, contactId: c!.id, email, clerkUserId, isActive: true })
    .returning()
  await db.insert(clientDealAccess).values({ clientId: ca!.id, dealId: d!.id })
  return { clientId: ca!.id, dealId: d!.id, token: `faketoken:${clerkUserId}` }
}

/** Pasos 1-6 por la API real: el paso 7 exige los anteriores. */
async function completeUpToBrief(token: string): Promise<void> {
  for (const step of [1, 2, 3, 4]) {
    const res = await request(app.server).patch('/api/client/onboarding/progress').set(auth(token)).send({ step })
    expect(res.status).toBe(200)
  }
  const signature = await request(app.server)
    .post('/api/client/onboarding/signature')
    .set(auth(token))
    .send({ fullName: 'Cliente de Prueba', accepted: true })
  expect(signature.status).toBe(200)
  const brief = await request(app.server).post('/api/client/onboarding/brief').set(auth(token)).send(validBrief)
  expect(brief.status).toBe(200)
}

/** Subida real del cliente (intent + contenido) y vínculo al paso de materiales. */
async function attachMaterial(
  token: string,
  category: string,
  file: Omit<UploadRequest, 'purpose'>,
): Promise<{ id: string; storageKey: string }> {
  const { storageKey } = await uploadServerFile(app, token, '/api/client/uploads', { purpose: 'onboarding_material', ...file })
  const res = await request(app.server)
    .post('/api/client/onboarding/materials/assets')
    .set(auth(token))
    .send({ category, storageKey })
  expect(res.status).toBe(201)
  return { id: res.body.data.id as string, storageKey }
}

beforeAll(async () => {
  await listenForSupertest(app)

  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  adminToken = await loginToken(app, ctx.email, ctx.password)
  const ventas = await ensurePipeline(portalId)
  // completeOnboarding mueve el deal a Producción y notifica a un responsable.
  await ensureProductionPipeline(portalId)
  await ensureHubUser(portalId, env.PRODUCTION_ASSIGNEE_DIAGNOSTICO_EMAIL, 'Lauri')
  await ensureHubUser(portalId, env.PRODUCTION_ASSIGNEE_DEFAULT_EMAIL, 'Jeremias')

  clientA = await makeClient(portalId, ventas, 'a')
  clientB = await makeClient(portalId, ventas, 'b')

  const [op] = await db.insert(portal).values({ name: `Otro Portal Onboarding ${randomUUID()}` }).returning()
  otherPortalId = op!.id
  otherPortalClient = await makeClient(otherPortalId, await ensurePipeline(otherPortalId), 'otro-portal')

  // Cliente A: onboarding completo, con un logo (imagen) y un manual (PDF).
  await completeUpToBrief(clientA.token)
  const logo = await attachMaterial(clientA.token, 'logoBrand', {
    fileName: 'logo.png',
    contentType: 'image/png',
    bytes: FILE_BYTES.png,
  })
  const manual = await attachMaterial(clientA.token, 'programContent', {
    fileName: 'manual.pdf',
    contentType: 'application/pdf',
    bytes: FILE_BYTES.pdf,
  })
  logoKey = logo.storageKey
  logoAssetId = logo.id
  manualKey = manual.storageKey

  const materials = await request(app.server)
    .post('/api/client/onboarding/materials')
    .set(auth(clientA.token))
    .send({
      materials: {
        logoBrand: { done: true, assetIds: [logo.id] },
        programContent: { done: true, assetIds: [manual.id], note: 'Faltan las clases del módulo 3' },
        clientBase: { done: false },
        toolAccess: { done: false },
      },
    })
  expect(materials.status).toBe(200)
  const complete = await request(app.server).post('/api/client/onboarding/complete').set(auth(clientA.token))
  expect(complete.status).toBe(200)
})

afterAll(async () => {
  await clearPendingUploads([], [clientA.clientId, clientB.clientId, otherPortalClient.clientId])
  await removeTestUploads([portalId, otherPortalId])
  await app.close()
  await closeDb()
})

describe('GET /api/client/onboarding — datos de la sección Onboarding', () => {
  it('el cliente ve sus respuestas, su firma y el estado de sus materiales', async () => {
    const res = await getOnboarding(clientA.token)
    expect(res.status).toBe(200)

    const { onboarding } = res.body.data
    expect(onboarding.dealId).toBe(clientA.dealId)
    expect(onboarding.status).toBe('completed')
    expect(onboarding.completedAt).toEqual(expect.any(String))
    expect(onboarding.signatureName).toBe('Cliente de Prueba')
    expect(onboarding.signatureAcceptedAt).toEqual(expect.any(String))
    expect(onboarding.briefAnswers).toMatchObject(validBrief)
    expect(onboarding.materials.logoBrand).toMatchObject({ done: true, assetIds: [logoAssetId] })
    expect(onboarding.materials.programContent).toMatchObject({ done: true, note: 'Faltan las clases del módulo 3' })
  })

  it('devuelve cada archivo con lo que muestra la vista: nombre, tipo, tamaño, fecha y categoría', async () => {
    const res = await getOnboarding(clientA.token)
    const assets = res.body.data.assets as Array<Record<string, unknown>>

    expect(assets).toHaveLength(2)
    expect(assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: logoAssetId,
          name: 'logo.png',
          mimeType: 'image/png',
          sizeBytes: FILE_BYTES.png.length,
          fieldName: 'logoBrand',
          storageKey: logoKey,
          uploadedAt: expect.any(String),
        }),
        expect.objectContaining({
          name: 'manual.pdf',
          mimeType: 'application/pdf',
          sizeBytes: FILE_BYTES.pdf.length,
          fieldName: 'programContent',
          storageKey: manualKey,
        }),
      ]),
    )
  })

  it('otro cliente del mismo portal recibe SU onboarding, sin nada del cliente A', async () => {
    const res = await getOnboarding(clientB.token)
    expect(res.status).toBe(200)
    expect(res.body.data.onboarding.dealId).toBe(clientB.dealId)
    expect(res.body.data.onboarding.briefAnswers).toBeNull()
    expect(res.body.data.assets).toEqual([])
  })

  it('mandar ids ajenos en la URL no cambia de quién son los datos: el deal sale del token', async () => {
    const res = await request(app.server)
      .get('/api/client/onboarding')
      .query({ dealId: clientA.dealId, clientId: clientA.clientId })
      .set(auth(clientB.token))
    expect(res.status).toBe(200)
    expect(res.body.data.onboarding.dealId).toBe(clientB.dealId)
    expect(res.body.data.assets).toEqual([])
    expect(JSON.stringify(res.body)).not.toContain(logoKey)
  })

  it('sin sesión de cliente → 401', async () => {
    const res = await request(app.server).get('/api/client/onboarding')
    expect(res.status).toBe(401)
  })
})

describe('POST /api/files/access — archivos del onboarding', () => {
  it('el cliente abre sus propios archivos (imagen y PDF)', async () => {
    for (const key of [logoKey, manualKey]) {
      const res = await access(clientA.token, key)
      expect(res.status).toBe(200)
      expect(res.body.data.url).toEqual(expect.any(String))
      expect(res.body.data.expiresAt).toEqual(expect.any(String))
    }
  })

  it('la URL de acceso sirve el contenido real del archivo', async () => {
    const res = await access(clientA.token, logoKey)
    const file = await request(app.server).get(pathOf(res.body.data.url))
    expect(file.status).toBe(200)
    expect(file.headers['content-type']).toContain('image/png')
  })

  it('otro cliente del mismo portal no puede abrirlos aunque conozca la key → 403', async () => {
    expect((await access(clientB.token, logoKey)).status).toBe(403)
    expect((await access(clientB.token, manualKey)).status).toBe(403)
  })

  it('un cliente de otro portal tampoco → 403', async () => {
    expect((await access(otherPortalClient.token, logoKey)).status).toBe(403)
    expect((await access(otherPortalClient.token, manualKey)).status).toBe(403)
  })

  it('el equipo del mismo portal sí puede abrirlos (detalle de onboarding del admin)', async () => {
    expect((await access(adminToken, manualKey)).status).toBe(200)
  })
})

describe('manipulación de keys e ids desde el wizard', () => {
  it('otro cliente no puede adueñarse del archivo de A reclamando su storageKey', async () => {
    const res = await request(app.server)
      .post('/api/client/onboarding/materials/assets')
      .set(auth(clientB.token))
      .send({ category: 'logoBrand', storageKey: logoKey })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)

    expect((await getOnboarding(clientB.token)).body.data.assets).toEqual([])
    expect((await access(clientB.token, logoKey)).status).toBe(403)
  })

  it('otro cliente no puede colgar de sus materiales el asset de A por id → 400', async () => {
    await completeUpToBrief(clientB.token)
    const res = await request(app.server)
      .patch('/api/client/onboarding/materials/draft')
      .set(auth(clientB.token))
      .send({ materials: { logoBrand: { done: true, assetIds: [logoAssetId] } } })
    expect(res.status).toBe(400)
    expect(JSON.stringify(res.body)).toContain(logoAssetId)

    const state = await getOnboarding(clientB.token)
    expect(state.body.data.onboarding.materials.logoBrand).toBeUndefined()
    expect(state.body.data.assets).toEqual([])
  })
})
