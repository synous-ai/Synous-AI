/**
 * Autorización de lectura de archivos: POST /api/files/access, la ruta firmada
 * GET /api/files/raw/* y el logo público de marca.
 *
 * Fija tres límites que ya se rompieron alguna vez:
 *  - autenticar no alcanza: el acceso se autoriza por el registro dueño de la key;
 *  - una key "plantada" en un registro de otro portal no hereda acceso;
 *  - la sesión de Clerk ya no viaja en la URL (`?token=`), la URL de lectura
 *    es firmada y vence.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { randomUUID } from 'node:crypto'
import { writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { buildApp } from '../../app'
import { env } from '../../config/env'
import { db, closeDb } from '../../db'
import {
  portal,
  hubUser,
  contact,
  deal,
  clientAccount,
  clientDealAccess,
  document,
  libraryItem,
  expense,
  company,
  fileUpload,
} from '../../db/schema'
import { ensurePortalAndUser, ensurePipeline, ensureHubUser, loginToken, type PipelineContext, listenForSupertest } from '../../test/helpers'
import { FILE_BYTES, clearPendingUploads, removeTestUploads, uploadServerFile } from '../../test/uploads'
import { buildSignedRawUrl } from '../../lib/storage/signed-url'

const app = buildApp({ rateLimit: false })

let portalId: string
let adminToken: string
let adminUserId: string
let teammateToken: string
let viewerToken: string
let collaboratorToken: string
let ventas: PipelineContext

let clientAId: string
let clientAToken: string
let dealAId: string
let dealBId: string

let otherPortalId: string
let otherHubToken: string

let ownDocumentKey: string
let internalDocumentKey: string
let otherClientDocumentKey: string
let docxDocumentKey: string
let libraryItemKey: string
let expenseKey: string
let orphanKey: string
let plantedKey: string
let brandLogoKey: string
const legacyPrivateKey = `legacy-${randomUUID()}-contrato.pdf`

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })
const access = (token: string, storageKey: string) =>
  request(app.server).post('/api/files/access').set(auth(token)).send({ storageKey })
const pathOf = (url: string) => {
  const parsed = new URL(url)
  return `${parsed.pathname}${parsed.search}`
}

async function makeClient(tag: string): Promise<{ clientId: string; dealId: string; token: string }> {
  const unique = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `files-authz-${unique}@test.com`
  const [c] = await db.insert(contact).values({ portalId, firstName: 'Cliente', lastName: tag, email }).returning()
  const [d] = await db
    .insert(deal)
    .values({ portalId, name: `Deal ${unique}`, pipelineId: ventas.pipelineId, stageId: ventas.firstStageId, primaryContactId: c!.id, ownerId: adminUserId })
    .returning()
  const clerkUserId = `clerk_test_files_authz_${unique}`
  const [ca] = await db.insert(clientAccount).values({ portalId, contactId: c!.id, email, clerkUserId, isActive: true }).returning()
  await db.insert(clientDealAccess).values({ clientId: ca!.id, dealId: d!.id })
  return { clientId: ca!.id, dealId: d!.id, token: `faketoken:${clerkUserId}` }
}

async function adminUpload(purpose: string, bytes: Buffer, contentType: string, fileName: string): Promise<string> {
  return (await uploadServerFile(app, adminToken, '/api/uploads', { purpose, fileName, contentType, bytes })).storageKey
}

beforeAll(async () => {
  await listenForSupertest(app)

  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  adminUserId = ctx.userId
  adminToken = await loginToken(app, ctx.email, ctx.password)
  ventas = await ensurePipeline(portalId)
  const teammateEmail = 'files-authz-teammate@test.com'
  const teammateId = await ensureHubUser(portalId, teammateEmail, 'Compañero')
  teammateToken = await loginToken(app, teammateEmail, '')
  await clearPendingUploads([adminUserId, teammateId])
  for (const role of ['viewer', 'collaborator'] as const) {
    const clerkUserId = `clerk_test_files_authz_${role}_${Date.now()}`
    await db.insert(hubUser).values({ portalId, email: `files-authz-${role}-${Date.now()}@test.com`, role, firstName: role, clerkUserId })
    if (role === 'viewer') viewerToken = `faketoken:${clerkUserId}`
    else collaboratorToken = `faketoken:${clerkUserId}`
  }

  const clientA = await makeClient('a')
  clientAId = clientA.clientId
  clientAToken = clientA.token
  dealAId = clientA.dealId
  dealBId = (await makeClient('b')).dealId

  ownDocumentKey = await adminUpload('deal_document', FILE_BYTES.pdf, 'application/pdf', 'propio.pdf')
  internalDocumentKey = await adminUpload('deal_document', FILE_BYTES.pdf, 'application/pdf', 'interno.pdf')
  otherClientDocumentKey = await adminUpload('deal_document', FILE_BYTES.pdf, 'application/pdf', 'ajeno.pdf')
  docxDocumentKey = await adminUpload(
    'deal_document',
    FILE_BYTES.docx,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'minuta.docx',
  )
  libraryItemKey = await adminUpload('library_item', FILE_BYTES.pdf, 'application/pdf', 'sop.pdf')
  expenseKey = await adminUpload('expense_receipt', FILE_BYTES.pdf, 'application/pdf', 'factura.pdf')
  orphanKey = await adminUpload('deal_document', FILE_BYTES.pdf, 'application/pdf', 'huerfano.pdf')
  brandLogoKey = await adminUpload('brand_logo', FILE_BYTES.png, 'image/png', 'logo.png')

  await db.insert(document).values([
    { portalId, dealId: dealAId, name: 'Propio', type: 'other', storageKey: ownDocumentKey, visibleToClient: true, createdBy: adminUserId },
    { portalId, dealId: dealAId, name: 'Interno', type: 'other', storageKey: internalDocumentKey, visibleToClient: false, createdBy: adminUserId },
    { portalId, dealId: dealBId, name: 'De B', type: 'other', storageKey: otherClientDocumentKey, visibleToClient: true, createdBy: adminUserId },
    { portalId, dealId: dealAId, name: 'Minuta', type: 'other', storageKey: docxDocumentKey, visibleToClient: true, createdBy: adminUserId },
    // Legacy: key plana sin ledger, archivo privado de un deal.
    { portalId, dealId: dealAId, name: 'Contrato legacy', type: 'contract', storageKey: legacyPrivateKey, visibleToClient: false, createdBy: adminUserId },
  ])
  await db.insert(libraryItem).values({ portalId, type: 'document', name: 'SOP interno', storageKey: libraryItemKey })
  await db.insert(expense).values({
    portalId,
    description: 'Suscripción de prueba',
    amount: '100.00',
    currency: 'USD',
    amountBase: '100.00',
    category: 'software',
    expenseDate: '2024-01-01',
    storageKey: expenseKey,
  })
  await mkdir(resolve(process.cwd(), 'uploads'), { recursive: true })
  await writeFile(resolve(process.cwd(), 'uploads', legacyPrivateKey), FILE_BYTES.pdf)

  // ── Otro portal: su hub sube un archivo propio ─────────────────────────
  const [op] = await db.insert(portal).values({ name: `Otro Portal Files Authz ${randomUUID()}` }).returning()
  otherPortalId = op!.id
  const otherClerkUserId = `clerk_test_files_authz_other_portal_${Date.now()}`
  await db.insert(hubUser).values({
    portalId: otherPortalId,
    email: `files-authz-other-portal-${Date.now()}@test.com`,
    role: 'owner',
    firstName: 'Otro',
    lastName: 'Portal',
    clerkUserId: otherClerkUserId,
  })
  otherHubToken = `faketoken:${otherClerkUserId}`
  plantedKey = (
    await uploadServerFile(app, otherHubToken, '/api/uploads', {
      purpose: 'deal_document',
      fileName: 'secreto-del-portal-b.pdf',
      contentType: 'application/pdf',
      bytes: FILE_BYTES.pdf,
    })
  ).storageKey
  // Referencia "plantada": un documento del portal A apunta a la key del portal B.
  await db.insert(document).values({ portalId, dealId: dealAId, name: 'Plantado', type: 'other', storageKey: plantedKey, createdBy: adminUserId })
})

afterAll(async () => {
  await removeTestUploads([portalId, otherPortalId], [legacyPrivateKey])
  await app.close()
  await closeDb()
})

describe('POST /api/files/access — autorización por recurso', () => {
  it('1. el cliente obtiene URL para el storageKey de SU documento', async () => {
    const res = await access(clientAToken, ownDocumentKey)
    expect(res.status).toBe(200)
    expect(res.body.data.url).toContain(`/api/files/raw/${ownDocumentKey}?`)
    expect(new Date(res.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('2. documento de OTRO cliente (otro deal) → 403', async () => {
    expect((await access(clientAToken, otherClientDocumentKey)).status).toBe(403)
  })

  it('3. documento con visibleToClient=false → 403 para el cliente, 200 para el hub del portal', async () => {
    expect((await access(clientAToken, internalDocumentKey)).status).toBe(403)
    expect((await access(adminToken, internalDocumentKey)).status).toBe(200)
  })

  it('4a. library_item → 403 para el cliente, 200 para el hub', async () => {
    expect((await access(clientAToken, libraryItemKey)).status).toBe(403)
    expect((await access(adminToken, libraryItemKey)).status).toBe(200)
  })

  it('4b. expense → 403 para el cliente, 200 para el hub', async () => {
    expect((await access(clientAToken, expenseKey)).status).toBe(403)
    expect((await access(adminToken, expenseKey)).status).toBe(200)
  })

  it('4c. comprobante de gasto: solo roles de finanzas — owner y member sí, viewer y collaborator → 403', async () => {
    expect((await access(adminToken, expenseKey)).status).toBe(200)
    expect((await access(teammateToken, expenseKey)).status).toBe(200)
    expect((await access(viewerToken, expenseKey)).status).toBe(403)
    expect((await access(collaboratorToken, expenseKey)).status).toBe(403)
  })

  it('5. key huérfana → solo quien la subió; ni el cliente ni otro miembro del equipo', async () => {
    expect((await access(clientAToken, orphanKey)).status).toBe(403)
    expect((await access(teammateToken, orphanKey)).status).toBe(403)
    expect((await access(adminToken, orphanKey)).status).toBe(200)
  })

  it('6. hub_user de OTRO portal contra un documento ajeno → 403', async () => {
    expect((await access(otherHubToken, ownDocumentKey)).status).toBe(403)
  })

  it('7. referencia plantada: un documento del portal A con una key del portal B no da acceso al portal A', async () => {
    expect((await access(adminToken, plantedKey)).status).toBe(403)
    expect((await access(clientAToken, plantedKey)).status).toBe(403)
  })

  it('8. `?token=` ya no autentica: sin header Authorization → 401', async () => {
    const res = await request(app.server).post(`/api/files/access?token=${encodeURIComponent(clientAToken)}`).send({ storageKey: ownDocumentKey })
    expect(res.status).toBe(401)
  })

  it('9. key con traversal → 403 sin tocar storage', async () => {
    expect((await access(adminToken, '../../../etc/passwd')).status).toBe(403)
  })
})

describe('GET /api/files/raw/* — URL firmada', () => {
  it('firma válida: sirve el PDF inline con nosniff', async () => {
    const { body } = await access(clientAToken, ownDocumentKey)
    const res = await request(app.server).get(pathOf(body.data.url))
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/pdf')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['content-disposition']).toBeUndefined()
  })

  it('tipo no inline (docx): attachment + CSP sandbox', async () => {
    const { body } = await access(adminToken, docxDocumentKey)
    const res = await request(app.server).get(pathOf(body.data.url))
    expect(res.status).toBe(200)
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="[a-f0-9-]+\.docx"$/)
    expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox")
  })

  it('firma alterada → 403', async () => {
    const { body } = await access(adminToken, ownDocumentKey)
    const url = new URL(body.data.url)
    const sig = url.searchParams.get('sig')!
    url.searchParams.set('sig', `${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`)
    expect((await request(app.server).get(`${url.pathname}${url.search}`)).status).toBe(403)
  })

  it('firma de otra key → 403', async () => {
    const { body } = await access(adminToken, ownDocumentKey)
    const url = new URL(body.data.url)
    expect((await request(app.server).get(`/api/files/raw/${internalDocumentKey}${url.search}`)).status).toBe(403)
  })

  it('fuera de modo server (producción sin credenciales, o Blob configurado) → 404: nunca lee disco', async () => {
    const { body } = await access(adminToken, ownDocumentKey)
    const path = pathOf(body.data.url)
    const mutableEnv = env as { NODE_ENV: typeof env.NODE_ENV; BLOB_READ_WRITE_TOKEN?: string }
    const previousNodeEnv = mutableEnv.NODE_ENV
    const previousToken = mutableEnv.BLOB_READ_WRITE_TOKEN
    try {
      mutableEnv.NODE_ENV = 'production'
      expect((await request(app.server).get(path)).status).toBe(404)
      mutableEnv.NODE_ENV = previousNodeEnv
      mutableEnv.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_teststore_notarealsecret'
      expect((await request(app.server).get(path)).status).toBe(404)
    } finally {
      mutableEnv.NODE_ENV = previousNodeEnv
      mutableEnv.BLOB_READ_WRITE_TOKEN = previousToken
    }
  })

  it('URL vencida o sin firma → 403', async () => {
    const expired = buildSignedRawUrl(ownDocumentKey, Date.now() - 1000)
    expect((await request(app.server).get(pathOf(expired))).status).toBe(403)
    expect((await request(app.server).get(`/api/files/raw/${ownDocumentKey}`)).status).toBe(403)
  })
})

describe('GET /api/public/files/brand-logo/* — logo público', () => {
  it('key referenciada como logo de marca → 302 a una URL de corta vida', async () => {
    const patch = await request(app.server)
      .patch(`/api/branding/clients/${clientAId}`)
      .set(auth(adminToken))
      .send({ brandLogoKey })
    expect(patch.status).toBe(200)
    expect(patch.body.data.logoUrl).toContain(`/api/public/files/brand-logo/${brandLogoKey}?v=`)

    const res = await request(app.server).get(pathOf(patch.body.data.logoUrl))
    expect(res.status).toBe(302)
    expect(res.headers['cache-control']).toBe('public, max-age=60')
    expect(res.headers.location).toContain(`/api/files/raw/${brandLogoKey}?`)

    const image = await request(app.server).get(pathOf(res.headers.location!))
    expect(image.status).toBe(200)
    expect(image.headers['content-type']).toContain('image/png')
  })

  it('logo de una empresa ARCHIVADA → 404; la misma empresa activa → 302', async () => {
    const logoKey = await adminUpload('brand_logo', FILE_BYTES.png, 'image/png', 'logo-archivada.png')
    await db.update(fileUpload).set({ status: 'attached', attachedAt: new Date() }).where(eq(fileUpload.storageKey, logoKey))
    const [archived] = await db
      .insert(company)
      .values({ portalId, name: `Archivada ${randomUUID()}`, brandLogoKey: logoKey, archived: true, archivedAt: new Date() })
      .returning()
    expect((await request(app.server).get(`/api/public/files/brand-logo/${logoKey}`)).status).toBe(404)

    await db.update(company).set({ archived: false, archivedAt: null }).where(eq(company.id, archived!.id))
    expect((await request(app.server).get(`/api/public/files/brand-logo/${logoKey}`)).status).toBe(302)
  })

  it('key que no es logo de marca → 404', async () => {
    expect((await request(app.server).get(`/api/public/files/brand-logo/${ownDocumentKey}`)).status).toBe(404)
  })

  it('key legacy de un archivo privado configurada como logo → 404 (no se publica el contrato)', async () => {
    const [account] = await db
      .insert(clientAccount)
      .values({
        portalId,
        contactId: (await db.insert(contact).values({ portalId, firstName: 'Logo', lastName: 'Plantado', email: `logo-${randomUUID()}@test.com` }).returning())[0]!.id,
        email: `logo-plantado-${randomUUID()}@test.com`,
        brandLogoKey: legacyPrivateKey,
      })
      .returning()
    expect(account).toBeDefined()
    expect((await request(app.server).get(`/api/public/files/brand-logo/${legacyPrivateKey}`)).status).toBe(404)
  })
})
