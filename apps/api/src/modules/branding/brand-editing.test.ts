/**
 * brand-editing.test.ts
 *
 * "Onboarding → Marca" editable desde el Client Portal (identidad visual,
 * archivos de marca, identidad del brief) y desde el panel admin. Cubre el
 * contrato completo: persistencia, auditoría (`audit_log` + `record_history`),
 * notificación al dueño del deal SOLO para cambios originados por el cliente,
 * y el aislamiento entre clientes/portales de siempre.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { buildApp } from '../../app'
import { env } from '../../config/env'
import { db, closeDb } from '../../db'
import { portal, contact, deal, company, clientAccount, clientDealAccess, auditLog, recordHistory, notification, clientAsset, clientOnboarding } from '../../db/schema'
import {
  ensurePortalAndUser,
  ensurePipeline,
  ensureProductionPipeline,
  ensureHubUser,
  loginToken,
  listenForSupertest,
  type PipelineContext,
} from '../../test/helpers'
import { PORTAL_VIEW_HEADER } from '../../middleware/authenticate-client'
import { FILE_BYTES, clearPendingUploads, removeTestUploads, uploadServerFile } from '../../test/uploads'
import { notifyBrandChange } from './branding.service'

const app = buildApp({ rateLimit: false })

interface TestClient {
  clientId: string
  dealId: string
  contactId: string
  token: string
}

let portalId: string
let ownerId: string
let adminToken: string
let companyId: string
let clientA: TestClient // vinculado a `company` — ejercita la rama company del branding
let clientB: TestClient // mismo portal, sin relación con clientA — aislamiento
let clientC: TestClient // onboarding completado — identidad de marca post-completado
let clientD: TestClient // hasta el brief (paso 6) — limpieza de materials.logoBrand.assetIds al archivar

let otherPortalId: string
let otherCompanyId: string
let otherDealId: string

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })
const brand = (token: string) => request(app.server).get('/api/client/branding').set(auth(token))
const access = (token: string, storageKey: string) => request(app.server).post('/api/files/access').set(auth(token)).send({ storageKey })

async function makeClient(
  targetPortalId: string,
  pipe: PipelineContext,
  tag: string,
  opts: { companyId?: string; ownerId?: string } = {},
): Promise<TestClient> {
  const unique = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `brand-${unique}@test.com`
  const [c] = await db
    .insert(contact)
    .values({ portalId: targetPortalId, firstName: 'Cliente', lastName: tag, email, companyId: opts.companyId ?? null })
    .returning()
  const [d] = await db
    .insert(deal)
    .values({
      portalId: targetPortalId,
      name: `Deal ${unique}`,
      pipelineId: pipe.pipelineId,
      stageId: pipe.firstStageId,
      primaryContactId: c!.id,
      companyId: opts.companyId ?? null,
      ownerId: opts.ownerId ?? null,
    })
    .returning()
  const clerkUserId = `clerk_test_brand_${unique}`
  const [ca] = await db
    .insert(clientAccount)
    .values({ portalId: targetPortalId, contactId: c!.id, email, clerkUserId, isActive: true })
    .returning()
  await db.insert(clientDealAccess).values({ clientId: ca!.id, dealId: d!.id })
  return { clientId: ca!.id, dealId: d!.id, contactId: c!.id, token: `faketoken:${clerkUserId}` }
}

const VALID_BRIEF = {
  businessProgram: 'Mentoría de marca personal',
  activeClients: '40 alumnos activos',
  deliveryChannels: ['whatsapp'],
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

/** Pasos 1-6 (orientación + firma + brief) — lo mínimo para habilitar el paso 7 (materiales). */
async function completeUpToBrief(token: string): Promise<void> {
  for (const step of [1, 2, 3, 4]) {
    expect((await request(app.server).patch('/api/client/onboarding/progress').set(auth(token)).send({ step })).status).toBe(200)
  }
  expect(
    (await request(app.server).post('/api/client/onboarding/signature').set(auth(token)).send({ fullName: 'Cliente de Prueba', accepted: true }))
      .status,
  ).toBe(200)
  const brief = await request(app.server).post('/api/client/onboarding/brief').set(auth(token)).send(VALID_BRIEF)
  expect(brief.status).toBe(200)
}

/** Pasos 1-7 + completar (misma secuencia que client-onboarding-data.test.ts). */
async function completeOnboardingFully(token: string): Promise<void> {
  await completeUpToBrief(token)
  const materials = await request(app.server)
    .post('/api/client/onboarding/materials')
    .set(auth(token))
    .send({
      materials: {
        logoBrand: { done: false },
        programContent: { done: false },
        clientBase: { done: false },
        toolAccess: { done: false },
      },
    })
  expect(materials.status).toBe(200)
  expect((await request(app.server).post('/api/client/onboarding/complete').set(auth(token))).status).toBe(200)
}

beforeAll(async () => {
  await listenForSupertest(app)

  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  ownerId = ctx.userId
  adminToken = await loginToken(app, ctx.email, ctx.password)
  const pipe = await ensurePipeline(portalId)
  // completeOnboardingFully mueve el deal a Producción y notifica a un responsable.
  await ensureProductionPipeline(portalId)
  await ensureHubUser(portalId, env.PRODUCTION_ASSIGNEE_DIAGNOSTICO_EMAIL, 'Lauri')
  await ensureHubUser(portalId, env.PRODUCTION_ASSIGNEE_DEFAULT_EMAIL, 'Jeremias')

  const [co] = await db
    .insert(company)
    .values({ portalId, name: 'Empresa Marca', slug: `marca-${randomUUID().slice(0, 8)}` })
    .returning()
  companyId = co!.id

  clientA = await makeClient(portalId, pipe, 'a', { companyId, ownerId })
  clientB = await makeClient(portalId, pipe, 'b')
  clientC = await makeClient(portalId, pipe, 'c')
  clientD = await makeClient(portalId, pipe, 'd')

  const [op] = await db.insert(portal).values({ name: `Otro Portal Marca ${randomUUID()}` }).returning()
  otherPortalId = op!.id
  const otherPipe = await ensurePipeline(otherPortalId)
  const [otherCo] = await db
    .insert(company)
    .values({ portalId: otherPortalId, name: 'Otra Empresa', slug: `otra-marca-${randomUUID().slice(0, 8)}` })
    .returning()
  otherCompanyId = otherCo!.id
  const otherClient = await makeClient(otherPortalId, otherPipe, 'other-portal', { companyId: otherCompanyId })
  otherDealId = otherClient.dealId

  await completeOnboardingFully(clientC.token)
  // Solo hasta el brief: necesita el paso 7 (materiales) HABILITADO pero SIN
  // completar el onboarding — completarlo bloquearía el draft de materiales.
  await completeUpToBrief(clientD.token)
})

afterAll(async () => {
  await clearPendingUploads([], [clientA.clientId, clientB.clientId, clientC.clientId, clientD.clientId])
  await removeTestUploads([portalId, otherPortalId])
  await app.close()
  await closeDb()
})

describe('PATCH /api/client/branding — identidad visual (colores/logo/nombre)', () => {
  it('persiste, audita (audit_log + record_history) y notifica al dueño del deal', async () => {
    const res = await request(app.server).patch('/api/client/branding').set(auth(clientA.token)).send({ brandPrimary: '#123456' })
    expect(res.status).toBe(200)
    expect(res.body.data.brandPrimary).toBe('#123456')

    const got = await brand(clientA.token)
    expect(got.body.data.brandPrimary).toBe('#123456')

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.clientId, clientA.clientId), eq(auditLog.entityType, 'company'), eq(auditLog.entityId, companyId), eq(auditLog.action, 'BRAND_UPDATE')))
    expect(audit).toBeDefined()
    expect(audit!.payload).toMatchObject({
      section: 'marca',
      changes: [{ field: 'brandPrimary', oldValue: null, newValue: '#123456' }],
    })

    const history = await db
      .select()
      .from(recordHistory)
      .where(and(eq(recordHistory.entityType, 'company'), eq(recordHistory.entityId, companyId), eq(recordHistory.fieldName, 'brandPrimary')))
    expect(history.length).toBeGreaterThan(0)
    expect(history[0]!.newValue).toBe('#123456')
    expect(history[0]!.changedBy).toBeNull()

    const notif = await db
      .select()
      .from(notification)
      .where(and(eq(notification.userId, ownerId), eq(notification.type, 'client_brand_updated')))
    expect(notif.length).toBeGreaterThan(0)
    expect(notif[0]!.title).toContain('actualizó su marca')
  })

  it('un PATCH sin cambios reales (mismo valor) no genera auditoría ni notificación nuevas', async () => {
    const before = await Promise.all([
      db.select().from(auditLog).where(and(eq(auditLog.entityType, 'company'), eq(auditLog.entityId, companyId), eq(auditLog.action, 'BRAND_UPDATE'))),
      db.select().from(notification).where(and(eq(notification.userId, ownerId), eq(notification.type, 'client_brand_updated'))),
    ])

    const res = await request(app.server).patch('/api/client/branding').set(auth(clientA.token)).send({ brandPrimary: '#123456' })
    expect(res.status).toBe(200)

    const after = await Promise.all([
      db.select().from(auditLog).where(and(eq(auditLog.entityType, 'company'), eq(auditLog.entityId, companyId), eq(auditLog.action, 'BRAND_UPDATE'))),
      db.select().from(notification).where(and(eq(notification.userId, ownerId), eq(notification.type, 'client_brand_updated'))),
    ])
    expect(after[0].length).toBe(before[0].length)
    expect(after[1].length).toBe(before[1].length)
  })

  it('el logo (brand_logo) se guarda en la identidad y NO aparece en los archivos de marca del onboarding', async () => {
    const { storageKey } = await uploadServerFile(app, clientA.token, '/api/client/uploads', {
      purpose: 'brand_logo',
      fileName: 'logo.png',
      contentType: 'image/png',
      bytes: FILE_BYTES.png,
    })

    const res = await request(app.server).patch('/api/client/branding').set(auth(clientA.token)).send({ brandLogoKey: storageKey })
    expect(res.status).toBe(200)
    expect(res.body.data.brandLogoKey).toBe(storageKey)
    expect(res.body.data.logoUrl).toContain(storageKey)

    const onboarding = await request(app.server).get('/api/client/onboarding').set(auth(clientA.token))
    expect(onboarding.status).toBe(200)
    const assets = onboarding.body.data.assets as Array<{ storageKey: string }>
    expect(assets.some((a) => a.storageKey === storageKey)).toBe(false)
  })
})

describe('POST/DELETE /api/client/branding/files — archivos de marca', () => {
  let fileAssetId: string
  let fileStorageKey: string

  it('agregar un archivo (onboarding_material) lo hace aparecer en los assets del onboarding con fieldName logoBrand, auditado y notificado', async () => {
    const { storageKey } = await uploadServerFile(app, clientA.token, '/api/client/uploads', {
      purpose: 'onboarding_material',
      fileName: 'brandbook.pdf',
      contentType: 'application/pdf',
      bytes: FILE_BYTES.pdf,
    })
    fileStorageKey = storageKey

    const res = await request(app.server).post('/api/client/branding/files').set(auth(clientA.token)).send({ storageKey })
    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({ dealId: clientA.dealId, clientId: clientA.clientId, fieldName: 'logoBrand', storageKey, archived: false })
    fileAssetId = res.body.data.id

    const onboarding = await request(app.server).get('/api/client/onboarding').set(auth(clientA.token))
    const assets = onboarding.body.data.assets as Array<{ id: string; fieldName: string }>
    expect(assets.some((a) => a.id === fileAssetId && a.fieldName === 'logoBrand')).toBe(true)

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'client_asset'), eq(auditLog.entityId, fileAssetId), eq(auditLog.action, 'BRAND_FILE_ADD')))
    expect(audit).toBeDefined()

    const notif = await db
      .select()
      .from(notification)
      .where(and(eq(notification.userId, ownerId), eq(notification.type, 'client_brand_updated')))
    expect(notif.some((n) => n.body?.includes('Archivos de marca'))).toBe(true)
  })

  it('eliminarlo lo archiva (la fila sigue existiendo), desaparece de los assets, y bloquea el acceso al archivo', async () => {
    const res = await request(app.server).delete(`/api/client/branding/files/${fileAssetId}`).set(auth(clientA.token))
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ success: true })

    const [row] = await db.select().from(clientAsset).where(eq(clientAsset.id, fileAssetId))
    expect(row).toBeDefined()
    expect(row!.archived).toBe(true)
    expect(row!.archivedAt).not.toBeNull()

    const onboarding = await request(app.server).get('/api/client/onboarding').set(auth(clientA.token))
    const assets = onboarding.body.data.assets as Array<{ id: string }>
    expect(assets.some((a) => a.id === fileAssetId)).toBe(false)

    expect((await access(clientA.token, fileStorageKey)).status).toBe(403)
    expect((await access(adminToken, fileStorageKey)).status).toBe(200)
  })

  it('otro cliente del mismo portal no puede borrar (no es su deal → 404) ni ver los archivos de marca de A', async () => {
    const { storageKey } = await uploadServerFile(app, clientA.token, '/api/client/uploads', {
      purpose: 'onboarding_material',
      fileName: 'otro-brandbook.pdf',
      contentType: 'application/pdf',
      bytes: FILE_BYTES.pdf,
    })
    const created = await request(app.server).post('/api/client/branding/files').set(auth(clientA.token)).send({ storageKey })
    expect(created.status).toBe(201)
    const assetId = created.body.data.id as string

    const del = await request(app.server).delete(`/api/client/branding/files/${assetId}`).set(auth(clientB.token))
    expect(del.status).toBe(404)

    const onboardingB = await request(app.server).get('/api/client/onboarding').set(auth(clientB.token))
    expect((onboardingB.body.data.assets as Array<{ id: string }>).some((a) => a.id === assetId)).toBe(false)
    expect((await access(clientB.token, storageKey)).status).toBe(403)

    // sigue vivo (no lo borró B) y B sigue sin poder tocarlo
    const [row] = await db.select({ archived: clientAsset.archived }).from(clientAsset).where(eq(clientAsset.id, assetId))
    expect(row!.archived).toBe(false)
  })

  it('archivar un archivo lo saca de client_onboarding.materials.logoBrand.assetIds si el wizard lo tenía referenciado', async () => {
    const { storageKey } = await uploadServerFile(app, clientD.token, '/api/client/uploads', {
      purpose: 'onboarding_material',
      fileName: 'logo-checklist.png',
      contentType: 'image/png',
      bytes: FILE_BYTES.png,
    })
    // Vinculado por el flujo VIEJO del wizard (paso 7), no por el endpoint nuevo —
    // ambos escriben el mismo client_asset (field_name='logoBrand').
    const attached = await request(app.server)
      .post('/api/client/onboarding/materials/assets')
      .set(auth(clientD.token))
      .send({ category: 'logoBrand', storageKey })
    expect(attached.status).toBe(201)
    const assetId = attached.body.data.id as string

    const draft = await request(app.server)
      .patch('/api/client/onboarding/materials/draft')
      .set(auth(clientD.token))
      .send({ materials: { logoBrand: { done: true, note: 'Ya lo subí', assetIds: [assetId] } } })
    expect(draft.status).toBe(200)
    expect(draft.body.data.materials.logoBrand.assetIds).toEqual([assetId])

    const del = await request(app.server).delete(`/api/client/branding/files/${assetId}`).set(auth(clientD.token))
    expect(del.status).toBe(200)

    const onboarding = await request(app.server).get('/api/client/onboarding').set(auth(clientD.token))
    const logoBrand = onboarding.body.data.onboarding.materials.logoBrand as { done: boolean; note?: string; assetIds?: string[] }
    expect(logoBrand.assetIds ?? []).not.toContain(assetId)
    // Solo el array cambia — done/note de la categoría quedan como estaban.
    expect(logoBrand.done).toBe(true)
    expect(logoBrand.note).toBe('Ya lo subí')
  })
})

describe('PATCH /api/client/onboarding/brand-identity', () => {
  it('body con otras claves del brief → 400 (schema estricto)', async () => {
    const res = await request(app.server)
      .patch('/api/client/onboarding/brand-identity')
      .set(auth(clientA.token))
      .send({ brandIdentity: 'Azul y blanco', businessProgram: 'no debería aceptar esto' })
    expect(res.status).toBe(400)
  })

  it('con el onboarding ya completado, actualiza SOLO brandIdentity — el resto del brief no cambia — y audita', async () => {
    const before = await request(app.server).get('/api/client/onboarding').set(auth(clientC.token))
    const beforeAnswers = before.body.data.onboarding.briefAnswers as Record<string, unknown>
    expect(before.body.data.onboarding.status).toBe('completed')

    const res = await request(app.server)
      .patch('/api/client/onboarding/brand-identity')
      .set(auth(clientC.token))
      .send({ brandIdentity: 'Nueva identidad: verde y negro' })
    expect(res.status).toBe(200)
    expect(res.body.data.briefAnswers.brandIdentity).toBe('Nueva identidad: verde y negro')

    for (const key of Object.keys(beforeAnswers)) {
      if (key === 'brandIdentity') continue
      expect(res.body.data.briefAnswers[key]).toEqual(beforeAnswers[key])
    }

    const onboardingId = res.body.data.id as string
    const [audit] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'client_onboarding'), eq(auditLog.entityId, onboardingId), eq(auditLog.action, 'BRAND_IDENTITY_UPDATE')))
    expect(audit).toBeDefined()
    expect(audit!.clientId).toBe(clientC.clientId)

    const history = await db
      .select()
      .from(recordHistory)
      .where(and(eq(recordHistory.entityType, 'client_onboarding'), eq(recordHistory.entityId, onboardingId), eq(recordHistory.fieldName, 'brandIdentity')))
    expect(history.length).toBeGreaterThan(0)
    expect(history.at(-1)!.newValue).toBe('Nueva identidad: verde y negro')
  })
})

describe('Admin — PATCH /api/companies/:id/branding', () => {
  it('audita con userId y NO notifica', async () => {
    const before = await db.select().from(notification).where(eq(notification.type, 'client_brand_updated'))

    const res = await request(app.server).patch(`/api/companies/${companyId}/branding`).set(auth(adminToken)).send({ brandName: 'Marca Actualizada' })
    expect(res.status).toBe(200)
    expect(res.body.data.brandName).toBe('Marca Actualizada')
    expect(res.body.data).toHaveProperty('logoUrl')

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'company'), eq(auditLog.entityId, companyId), eq(auditLog.action, 'BRAND_UPDATE'), eq(auditLog.userId, ownerId)))
    expect(audit).toBeDefined()

    const after = await db.select().from(notification).where(eq(notification.type, 'client_brand_updated'))
    expect(after.length).toBe(before.length)
  })

  it('empresa de otro portal → 404', async () => {
    const res = await request(app.server).patch(`/api/companies/${otherCompanyId}/branding`).set(auth(adminToken)).send({ brandName: 'x' })
    expect(res.status).toBe(404)
  })
})

describe('Admin — archivos y brand-identity de un deal', () => {
  let dealAssetId: string

  it('POST /api/onboarding/deals/:dealId/brand-files audita, no notifica', async () => {
    const before = await db.select().from(notification).where(eq(notification.type, 'client_brand_updated'))

    const { storageKey } = await uploadServerFile(app, adminToken, '/api/uploads', {
      purpose: 'onboarding_material',
      fileName: 'admin-brandbook.pdf',
      contentType: 'application/pdf',
      bytes: FILE_BYTES.pdf,
    })
    const res = await request(app.server).post(`/api/onboarding/deals/${clientA.dealId}/brand-files`).set(auth(adminToken)).send({ storageKey })
    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({ dealId: clientA.dealId, fieldName: 'logoBrand', storageKey })
    dealAssetId = res.body.data.id

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'client_asset'), eq(auditLog.entityId, dealAssetId), eq(auditLog.action, 'BRAND_FILE_ADD'), eq(auditLog.userId, ownerId)))
    expect(audit).toBeDefined()

    const after = await db.select().from(notification).where(eq(notification.type, 'client_brand_updated'))
    expect(after.length).toBe(before.length)
  })

  it('DELETE /api/onboarding/deals/:dealId/brand-files/:assetId archiva', async () => {
    const res = await request(app.server).delete(`/api/onboarding/deals/${clientA.dealId}/brand-files/${dealAssetId}`).set(auth(adminToken))
    expect(res.status).toBe(200)
    const [row] = await db.select({ archived: clientAsset.archived }).from(clientAsset).where(eq(clientAsset.id, dealAssetId))
    expect(row!.archived).toBe(true)
  })

  it('PATCH /api/onboarding/deals/:dealId/brand-identity audita con userId, no notifica', async () => {
    const [onboardingRow] = await db.select().from(clientOnboarding).where(eq(clientOnboarding.dealId, clientC.dealId))
    const before = await db.select().from(notification).where(eq(notification.type, 'client_brand_updated'))

    const res = await request(app.server)
      .patch(`/api/onboarding/deals/${clientC.dealId}/brand-identity`)
      .set(auth(adminToken))
      .send({ brandIdentity: 'Identidad editada por el equipo' })
    expect(res.status).toBe(200)
    expect(res.body.data.briefAnswers.brandIdentity).toBe('Identidad editada por el equipo')

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'client_onboarding'), eq(auditLog.entityId, onboardingRow!.id), eq(auditLog.action, 'BRAND_IDENTITY_UPDATE'), eq(auditLog.userId, ownerId)))
    expect(audit).toBeDefined()

    const after = await db.select().from(notification).where(eq(notification.type, 'client_brand_updated'))
    expect(after.length).toBe(before.length)
  })

  it('deal de otro portal → 404 en los tres endpoints admin', async () => {
    expect((await request(app.server).post(`/api/onboarding/deals/${otherDealId}/brand-files`).set(auth(adminToken)).send({ storageKey: 'x' })).status).toBe(404)
    expect((await request(app.server).delete(`/api/onboarding/deals/${otherDealId}/brand-files/whatever`).set(auth(adminToken))).status).toBe(404)
    expect((await request(app.server).patch(`/api/onboarding/deals/${otherDealId}/brand-identity`).set(auth(adminToken)).send({ brandIdentity: 'x' })).status).toBe(404)
  })
})

describe('Portal-view (admin mirando el portal en solo lectura)', () => {
  it('PATCH /api/client/branding con X-Portal-View → 403', async () => {
    const res = await request(app.server)
      .patch('/api/client/branding')
      .set(auth(adminToken))
      .set(PORTAL_VIEW_HEADER, (await db.select({ slug: company.slug }).from(company).where(eq(company.id, companyId)))[0]!.slug!)
      .send({ brandName: 'No debería poder' })
    expect(res.status).toBe(403)
  })
})

describe('notifyBrandChange — best-effort (nunca puede romper al caller)', () => {
  it('resuelve sin lanzar aunque la resolución del deal/cliente falle (la escritura real ya se hizo)', async () => {
    const spy = vi.spyOn(db, 'select').mockImplementation(() => {
      throw new Error('db no disponible (forzado por el test)')
    })
    try {
      await expect(
        notifyBrandChange({
          portalId,
          dealId: clientA.dealId,
          clientId: clientA.clientId,
          fields: ['Nombre de marca'],
          action: 'update',
        }),
      ).resolves.toBeUndefined()
      // La query rota efectivamente se intentó (no es que el error nunca llegó a pasar por el try/catch).
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }

    // La función sigue siendo utilizable después con el spy restaurado (no quedó en un estado raro).
    await expect(
      notifyBrandChange({ portalId, dealId: clientA.dealId, clientId: clientA.clientId, fields: ['Nombre de marca'], action: 'update' }),
    ).resolves.toBeUndefined()
  })
})
