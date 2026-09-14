/**
 * Paridad entre lo que el Portal de Cliente LISTA y lo que
 * `POST /api/files/access` autoriza.
 *
 * Motivación: producción vio 403 en `/api/files/access` en dos cargas de
 * página consecutivas de una cuenta cliente genuina, sin ninguna subida ni
 * PATCH de marca en la ventana. La sospecha (ver docs/incidente) es que
 * alguna de las rutas de LISTADO que alimenta `useFileUrl`/`getFileAccessUrl`
 * en el portal (marca, materiales de onboarding, documentos) devuelve una
 * `storageKey` que `assertCanReadFile` (files.authz.ts) después rechaza.
 *
 * Este archivo pide, como cliente real, cada listado que el portal consulta
 * al renderizar, y por cada `storageKey` que devuelve llama a
 * `POST /api/files/access` — TODAS tienen que dar 200. También fija el lado
 * inverso: lo que el cliente NO puede leer tampoco debe aparecer listado
 * (archivado, de un deal ajeno, etc.).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { randomUUID } from 'node:crypto'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import { portal, contact, deal, company, clientAccount, clientDealAccess, document, hubUser } from '../../db/schema'
import { ensurePortalAndUser, ensurePipeline, ensureHubUser, loginToken, listenForSupertest, type PipelineContext } from '../../test/helpers'
import { FILE_BYTES, clearPendingUploads, removeTestUploads, uploadServerFile } from '../../test/uploads'
import { PORTAL_VIEW_HEADER } from '../../middleware/authenticate-client'

const app = buildApp({ rateLimit: false })

interface TestClient {
  clientId: string
  dealId: string
  token: string
}

let portalId: string
let adminUserId: string
let adminToken: string
let ventas: PipelineContext

let clientA: TestClient
let clientB: TestClient

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })
const access = (token: string, storageKey: string) =>
  request(app.server).post('/api/files/access').set(auth(token)).send({ storageKey })

async function makeClient(tag: string, companyId?: string): Promise<TestClient> {
  const unique = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `files-parity-${unique}@test.com`
  const [c] = await db
    .insert(contact)
    .values({ portalId, firstName: 'Cliente', lastName: tag, email, companyId })
    .returning()
  const [d] = await db
    .insert(deal)
    .values({
      portalId,
      name: `Deal ${unique}`,
      pipelineId: ventas.pipelineId,
      stageId: ventas.firstStageId,
      primaryContactId: c!.id,
      ownerId: adminUserId,
      companyId,
    })
    .returning()
  const clerkUserId = `clerk_test_files_parity_${unique}`
  const [ca] = await db
    .insert(clientAccount)
    .values({ portalId, contactId: c!.id, email, clerkUserId, isActive: true })
    .returning()
  await db.insert(clientDealAccess).values({ clientId: ca!.id, dealId: d!.id })
  return { clientId: ca!.id, dealId: d!.id, token: `faketoken:${clerkUserId}` }
}

async function adminUpload(purpose: string, bytes: Buffer, contentType: string, fileName: string): Promise<string> {
  return (await uploadServerFile(app, adminToken, '/api/uploads', { purpose, fileName, contentType, bytes })).storageKey
}

/** Extrae la storageKey de una logoUrl `.../brand-logo/<key>?v=...`. */
function storageKeyFromLogoUrl(logoUrl: string): string {
  const match = /\/brand-logo\/(.+)\?/.exec(logoUrl)
  if (!match) throw new Error(`logoUrl con forma inesperada: ${logoUrl}`)
  return decodeURIComponent(match[1]!)
}

beforeAll(async () => {
  await listenForSupertest(app)
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  adminUserId = ctx.userId
  adminToken = await loginToken(app, ctx.email, ctx.password)
  ventas = await ensurePipeline(portalId)

  clientA = await makeClient('a')
  clientB = await makeClient('b')
})

afterAll(async () => {
  await clearPendingUploads([adminUserId], [clientA.clientId, clientB.clientId])
  await removeTestUploads([portalId])
  await app.close()
  await closeDb()
})

describe('GET /api/client/onboarding — cada storageKey listado abre con 200', () => {
  it('archivo de materiales subido por el propio cliente', async () => {
    const { storageKey } = await uploadServerFile(app, clientA.token, '/api/client/uploads', {
      purpose: 'onboarding_material',
      fileName: 'manual-propio.pdf',
      contentType: 'application/pdf',
      bytes: FILE_BYTES.pdf,
    })
    const link = await request(app.server)
      .post('/api/client/onboarding/materials/assets')
      .set(auth(clientA.token))
      .send({ category: 'programContent', storageKey })
    expect(link.status).toBe(201)

    const state = await request(app.server).get('/api/client/onboarding').set(auth(clientA.token))
    expect(state.status).toBe(200)
    const assets = state.body.data.assets as Array<{ storageKey: string }>
    expect(assets.some((a) => a.storageKey === storageKey)).toBe(true)

    const res = await access(clientA.token, storageKey)
    expect(res.status).toBe(200)
  })

  it('archivo de marca subido por el EQUIPO al deal del cliente (POST /api/onboarding/deals/:dealId/brand-files)', async () => {
    const { storageKey } = await uploadServerFile(app, adminToken, '/api/uploads', {
      purpose: 'onboarding_material',
      fileName: 'brandbook-equipo.pdf',
      contentType: 'application/pdf',
      bytes: FILE_BYTES.pdf,
    })
    const created = await request(app.server)
      .post(`/api/onboarding/deals/${clientA.dealId}/brand-files`)
      .set(auth(adminToken))
      .send({ storageKey })
    expect(created.status).toBe(201)

    const state = await request(app.server).get('/api/client/onboarding').set(auth(clientA.token))
    expect(state.status).toBe(200)
    const assets = state.body.data.assets as Array<{ storageKey: string }>
    expect(assets.some((a) => a.storageKey === storageKey)).toBe(true)

    // Esta es la key que la sección "Marca" pide con useFileUrl al renderizar el thumbnail.
    const res = await access(clientA.token, storageKey)
    expect(res.status).toBe(200)
  })

  it('un archivo ARCHIVADO desaparece del listado y el cliente ya no puede abrirlo', async () => {
    const { storageKey } = await uploadServerFile(app, adminToken, '/api/uploads', {
      purpose: 'onboarding_material',
      fileName: 'brandbook-a-borrar.pdf',
      contentType: 'application/pdf',
      bytes: FILE_BYTES.pdf,
    })
    const created = await request(app.server)
      .post(`/api/onboarding/deals/${clientA.dealId}/brand-files`)
      .set(auth(adminToken))
      .send({ storageKey })
    expect(created.status).toBe(201)
    const assetId = created.body.data.id as string

    expect((await access(clientA.token, storageKey)).status).toBe(200)

    const archived = await request(app.server)
      .delete(`/api/onboarding/deals/${clientA.dealId}/brand-files/${assetId}`)
      .set(auth(adminToken))
    expect(archived.status).toBe(200)

    const state = await request(app.server).get('/api/client/onboarding').set(auth(clientA.token))
    const assets = state.body.data.assets as Array<{ storageKey: string }>
    expect(assets.some((a) => a.storageKey === storageKey)).toBe(false)

    expect((await access(clientA.token, storageKey)).status).toBe(403)
  })

  it('los materiales de OTRO cliente del mismo portal no aparecen ni se pueden abrir', async () => {
    const { storageKey } = await uploadServerFile(app, clientB.token, '/api/client/uploads', {
      purpose: 'onboarding_material',
      fileName: 'manual-de-b.pdf',
      contentType: 'application/pdf',
      bytes: FILE_BYTES.pdf,
    })
    await request(app.server)
      .post('/api/client/onboarding/materials/assets')
      .set(auth(clientB.token))
      .send({ category: 'programContent', storageKey })

    const state = await request(app.server).get('/api/client/onboarding').set(auth(clientA.token))
    const assets = state.body.data.assets as Array<{ storageKey: string }>
    expect(assets.some((a) => a.storageKey === storageKey)).toBe(false)
    expect((await access(clientA.token, storageKey)).status).toBe(403)
  })
})

describe('GET /api/client/documents — cada storageKey listado abre con 200', () => {
  it('documento visible al cliente (visibleToClient=true) abre con 200; uno interno ni se lista', async () => {
    const visibleKey = await adminUpload('deal_document', FILE_BYTES.pdf, 'application/pdf', 'contrato.pdf')
    const internalKey = await adminUpload('deal_document', FILE_BYTES.pdf, 'application/pdf', 'interno.pdf')
    await db.insert(document).values([
      { portalId, dealId: clientA.dealId, name: 'Contrato', type: 'contract', storageKey: visibleKey, visibleToClient: true, createdBy: adminUserId },
      { portalId, dealId: clientA.dealId, name: 'Interno', type: 'other', storageKey: internalKey, visibleToClient: false, createdBy: adminUserId },
    ])

    const list = await request(app.server).get('/api/client/documents').set(auth(clientA.token))
    expect(list.status).toBe(200)
    const keys = (list.body.data as Array<{ storageKey: string | null }>).map((d) => d.storageKey)
    expect(keys).toContain(visibleKey)
    expect(keys).not.toContain(internalKey)

    expect((await access(clientA.token, visibleKey)).status).toBe(200)
    expect((await access(clientA.token, internalKey)).status).toBe(403)
  })

  it('documento SIN storageKey (generado por DocuSeal) se lista con storageKey null, sin romper nada', async () => {
    await db.insert(document).values({
      portalId,
      dealId: clientA.dealId,
      name: 'Firmado en DocuSeal',
      type: 'contract',
      source: 'docuseal',
      docusealStatus: 'completed',
      storageKey: null,
      visibleToClient: true,
      createdBy: adminUserId,
    })
    const list = await request(app.server).get('/api/client/documents').set(auth(clientA.token))
    expect(list.status).toBe(200)
    const found = (list.body.data as Array<{ name: string; storageKey: string | null }>).find((d) => d.name === 'Firmado en DocuSeal')
    expect(found).toBeDefined()
    expect(found!.storageKey).toBeNull()
  })
})

describe('GET /api/client/branding — el logoUrl siempre abre con 200', () => {
  it('logo de marca de la EMPRESA asociada al contacto del cliente', async () => {
    const logoKey = await adminUpload('brand_logo', FILE_BYTES.png, 'image/png', 'logo-empresa.png')
    const [co] = await db
      .insert(company)
      .values({ portalId, name: `Empresa con logo ${randomUUID()}`, brandLogoKey: logoKey })
      .returning()
    const client = await makeClient('con-empresa', co!.id)

    const branding = await request(app.server).get('/api/client/branding').set(auth(client.token))
    expect(branding.status).toBe(200)
    expect(branding.body.data.logoUrl).toContain(`/brand-logo/${logoKey}`)

    const res = await access(client.token, storageKeyFromLogoUrl(branding.body.data.logoUrl))
    expect(res.status).toBe(200)
  })

  it('logo de marca propio del client_account (sin empresa asociada)', async () => {
    const { storageKey } = await uploadServerFile(app, clientA.token, '/api/client/uploads', {
      purpose: 'brand_logo',
      fileName: 'logo-propio.png',
      contentType: 'image/png',
      bytes: FILE_BYTES.png,
    })
    const patch = await request(app.server).patch('/api/client/branding').set(auth(clientA.token)).send({ brandLogoKey: storageKey })
    expect(patch.status).toBe(200)

    const branding = await request(app.server).get('/api/client/branding').set(auth(clientA.token))
    expect(branding.body.data.logoUrl).toContain(`/brand-logo/${storageKey}`)
    expect((await access(clientA.token, storageKeyFromLogoUrl(branding.body.data.logoUrl))).status).toBe(200)
  })
})

describe('Task 4 — vista de solo lectura del equipo (mismo portal)', () => {
  it('un hub_user del mismo portal puede abrir con /api/files/access los mismos archivos que el portal de cliente renderiza', async () => {
    const { storageKey: ownMaterial } = await uploadServerFile(app, clientA.token, '/api/client/uploads', {
      purpose: 'onboarding_material',
      fileName: 'material-para-hub.pdf',
      contentType: 'application/pdf',
      bytes: FILE_BYTES.pdf,
    })
    await request(app.server)
      .post('/api/client/onboarding/materials/assets')
      .set(auth(clientA.token))
      .send({ category: 'programContent', storageKey: ownMaterial })

    const { storageKey: brandFile } = await uploadServerFile(app, adminToken, '/api/uploads', {
      purpose: 'onboarding_material',
      fileName: 'brandbook-para-hub.pdf',
      contentType: 'application/pdf',
      bytes: FILE_BYTES.pdf,
    })
    await request(app.server).post(`/api/onboarding/deals/${clientA.dealId}/brand-files`).set(auth(adminToken)).send({ storageKey: brandFile })

    const visibleDoc = await adminUpload('deal_document', FILE_BYTES.pdf, 'application/pdf', 'doc-para-hub.pdf')
    await db.insert(document).values({ portalId, dealId: clientA.dealId, name: 'Doc para hub', type: 'other', storageKey: visibleDoc, visibleToClient: true, createdBy: adminUserId })

    // El equipo (hub_user real, mismo portal) — SIN X-Portal-View, tal como manda hoy apps/admin/lib/file-transfer.ts.
    for (const key of [ownMaterial, brandFile, visibleDoc]) {
      const res = await access(adminToken, key)
      expect(res.status).toBe(200)
    }
  })

  it('con X-Portal-View (simulando el admin mirando el portal del cliente) también abre — el header no cambia nada porque el actor sigue siendo el hub', async () => {
    const [companyRow] = await db
      .insert(company)
      .values({ portalId, name: `Empresa portal-view ${randomUUID()}`, slug: `pv-${randomUUID()}` })
      .returning()
    const client = await makeClient('portal-view', companyRow!.id)

    const { storageKey } = await uploadServerFile(app, adminToken, '/api/uploads', {
      purpose: 'onboarding_material',
      fileName: 'brandbook-portal-view.pdf',
      contentType: 'application/pdf',
      bytes: FILE_BYTES.pdf,
    })
    await request(app.server).post(`/api/onboarding/deals/${client.dealId}/brand-files`).set(auth(adminToken)).send({ storageKey })

    const res = await request(app.server)
      .post('/api/files/access')
      .set(auth(adminToken))
      .set(PORTAL_VIEW_HEADER, companyRow!.slug!)
      .send({ storageKey })
    expect(res.status).toBe(200)
  })
})
