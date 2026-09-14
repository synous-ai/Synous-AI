/**
 * Subidas en modo server (disco) contra la DB de test: intents, contenido y el
 * reclamo (`claimUpload`) desde los endpoints de dominio.
 *
 * Lo que protege: que un storageKey deje de ser "cualquier string". Antes, los
 * endpoints de documentos/biblioteca/gastos/branding aceptaban una key ajena y
 * el registro heredaba el acceso de lectura a ese archivo.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { eq, inArray } from 'drizzle-orm'
import { buildApp } from '../../app'
import { env } from '../../config/env'
import { db, closeDb } from '../../db'
import { portal, hubUser, contact, deal, clientAccount, clientDealAccess, fileUpload, libraryItem } from '../../db/schema'
import { ensurePortalAndUser, ensurePipeline, ensureHubUser, loginToken, type PipelineContext, listenForSupertest } from '../../test/helpers'
import { FILE_BYTES, clearPendingUploads, removeTestUploads, uploadServerFile } from '../../test/uploads'
import { MAX_PENDING_BYTES, MAX_PENDING_UPLOADS } from './uploads.service'

const app = buildApp({ rateLimit: false })

let portalId: string
let adminToken: string
let teammateToken: string
let viewerToken: string
let pipe: PipelineContext
let otherPortalId: string
let otherHubToken: string
const legacyKeys: string[] = []

interface TestClient {
  clientId: string
  dealId: string
  token: string
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })
const intent = (token: string, body: Record<string, unknown>, base = '/api/uploads') =>
  request(app.server).post(base).set(auth(token)).send(body)
const onDisk = (key: string) => existsSync(resolve(process.cwd(), 'uploads', key))
const ledgerRow = async (key: string) => (await db.select().from(fileUpload).where(eq(fileUpload.storageKey, key)).limit(1))[0]
const createDocument = (token: string, storageKey: string) =>
  request(app.server).post('/api/documents').set(auth(token)).send({ dealId: clientA.dealId, name: 'Contrato', type: 'contract', storageKey })
const expenseBody = { description: 'Hosting', amount: 10, currency: 'USD', category: 'software', expenseDate: '2026-09-01' }

async function freshHubToken(tag: string): Promise<string> {
  const clerkUserId = `clerk_uploads_${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  await db.insert(hubUser).values({ portalId, email: `${clerkUserId}@test.com`, role: 'member', firstName: tag, clerkUserId })
  return `faketoken:${clerkUserId}`
}

async function makeClient(tag: string): Promise<TestClient> {
  const unique = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `uploads-${unique}@test.com`
  const [c] = await db.insert(contact).values({ portalId, firstName: 'Uploads', lastName: tag, email }).returning()
  const [d] = await db
    .insert(deal)
    .values({ portalId, name: `Deal ${unique}`, pipelineId: pipe.pipelineId, stageId: pipe.firstStageId, primaryContactId: c!.id })
    .returning()
  const clerkUserId = `clerk_uploads_${unique}`
  const [ca] = await db.insert(clientAccount).values({ portalId, contactId: c!.id, email, clerkUserId, isActive: true }).returning()
  await db.insert(clientDealAccess).values({ clientId: ca!.id, dealId: d!.id })
  return { clientId: ca!.id, dealId: d!.id, token: `faketoken:${clerkUserId}` }
}

function adminPdf(purpose = 'deal_document', fileName = 'contrato.pdf') {
  return uploadServerFile(app, adminToken, '/api/uploads', { purpose, fileName, contentType: 'application/pdf', bytes: FILE_BYTES.pdf })
}

let clientA: TestClient
let clientB: TestClient

beforeAll(async () => {
  await listenForSupertest(app)
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  adminToken = await loginToken(app, ctx.email, ctx.password)
  pipe = await ensurePipeline(portalId)

  const teammateEmail = 'uploads-teammate@test.com'
  const teammateId = await ensureHubUser(portalId, teammateEmail, 'Compañero')
  teammateToken = await loginToken(app, teammateEmail, '')
  await clearPendingUploads([ctx.userId, teammateId])

  const viewerClerkId = `clerk_uploads_viewer_${Date.now()}`
  await db.insert(hubUser).values({ portalId, email: `uploads-viewer-${Date.now()}@test.com`, role: 'viewer', firstName: 'Viewer', clerkUserId: viewerClerkId })
  viewerToken = `faketoken:${viewerClerkId}`

  clientA = await makeClient('a')
  clientB = await makeClient('b')

  const [op] = await db.insert(portal).values({ name: `Otro Portal Uploads ${randomUUID()}` }).returning()
  otherPortalId = op!.id
  const otherClerkId = `clerk_uploads_other_portal_${Date.now()}`
  await db.insert(hubUser).values({ portalId: otherPortalId, email: `uploads-other-${Date.now()}@test.com`, role: 'owner', firstName: 'Otro', clerkUserId: otherClerkId })
  otherHubToken = `faketoken:${otherClerkId}`
})

afterAll(async () => {
  await removeTestUploads([portalId, otherPortalId], legacyKeys)
  await app.close()
  await closeDb()
})

describe('POST /api/uploads — intent', () => {
  it('el equipo reserva cada propósito propio: key del server, modo server y máximo del propósito', async () => {
    const cases = [
      { purpose: 'deal_document', contentType: 'application/pdf', max: 50 },
      { purpose: 'library_item', contentType: 'application/zip', max: 50 },
      { purpose: 'expense_receipt', contentType: 'image/jpeg', max: 10 },
      { purpose: 'proposal_logo', contentType: 'image/gif', max: 2 },
      { purpose: 'brand_logo', contentType: 'image/webp', max: 2 },
    ]
    for (const c of cases) {
      const res = await intent(adminToken, { purpose: c.purpose, fileName: '../../etc/passwd.html', contentType: c.contentType, sizeBytes: 1000 })
      expect(res.status).toBe(201)
      expect(res.body.data.mode).toBe('server')
      expect(res.body.data.maxSizeBytes).toBe(c.max * 1024 * 1024)
      expect(res.body.data.storageKey).toMatch(new RegExp(`^portals/${portalId}/${c.purpose}/\\d{4}/\\d{2}/[0-9a-f-]{36}\\.[a-z]+$`))
      expect((await ledgerRow(res.body.data.storageKey))?.originalName).toBe('passwd.html')
    }
  })

  it('el cliente pidiendo un propósito del equipo → 403 FILE_PURPOSE_FORBIDDEN', async () => {
    const asClient = await intent(clientA.token, { purpose: 'deal_document', fileName: 'x.pdf', contentType: 'application/pdf', sizeBytes: 10 }, '/api/client/uploads')
    expect(asClient.status).toBe(403)
    expect(asClient.body.error.code).toBe('FILE_PURPOSE_FORBIDDEN')
  })

  it('el equipo también puede reservar onboarding_material (agrega archivos de marca al deal desde el detalle de onboarding)', async () => {
    const asHub = await intent(adminToken, { purpose: 'onboarding_material', fileName: 'x.pdf', contentType: 'application/pdf', sizeBytes: 10 })
    expect(asHub.status).toBe(201)
  })

  it('tipo no permitido (SVG como logo) → 400 FILE_TYPE_NOT_ALLOWED', async () => {
    const res = await intent(adminToken, { purpose: 'brand_logo', fileName: 'logo.svg', contentType: 'image/svg+xml', sizeBytes: 10 })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED')
  })

  it('tamaño mayor al máximo → 400 FILE_TOO_LARGE con el máximo en el mensaje', async () => {
    const res = await intent(adminToken, { purpose: 'brand_logo', fileName: 'logo.png', contentType: 'image/png', sizeBytes: 2 * 1024 * 1024 + 1 })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('FILE_TOO_LARGE')
    expect(res.body.error.message).toContain('2 MB')
  })

  it('propósito desconocido → 400', async () => {
    const res = await intent(adminToken, { purpose: 'avatar', fileName: 'x.png', contentType: 'image/png', sizeBytes: 10 })
    expect(res.status).toBe(400)
  })

  it('rol viewer → 403', async () => {
    const res = await intent(viewerToken, { purpose: 'deal_document', fileName: 'x.pdf', contentType: 'application/pdf', sizeBytes: 10 })
    expect(res.status).toBe(403)
  })

  it('producción sin credenciales de Blob → 503 STORAGE_NOT_CONFIGURED (nunca disco efímero)', async () => {
    const mutableEnv = env as { NODE_ENV: typeof env.NODE_ENV }
    const previous = mutableEnv.NODE_ENV
    mutableEnv.NODE_ENV = 'production'
    try {
      const res = await intent(adminToken, { purpose: 'deal_document', fileName: 'x.pdf', contentType: 'application/pdf', sizeBytes: 10 })
      expect(res.status).toBe(503)
      expect(res.body.error.code).toBe('STORAGE_NOT_CONFIGURED')
    } finally {
      mutableEnv.NODE_ENV = previous
    }
  })

  it('blob-token en modo server → 409 UPLOAD_MODE_MISMATCH', async () => {
    const { body } = await intent(adminToken, { purpose: 'deal_document', fileName: 'x.pdf', contentType: 'application/pdf', sizeBytes: 10 })
    const res = await request(app.server)
      .post('/api/uploads/blob-token')
      .set(auth(adminToken))
      .send({ type: 'blob.generate-presigned-url', payload: { pathname: body.data.storageKey, clientPayload: null, multipart: false } })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('UPLOAD_MODE_MISMATCH')
  })
})

describe('PUT /api/uploads/:uploadId/content — modo server', () => {
  it('el dueño sube el contenido', async () => {
    const { storageKey } = await adminPdf()
    expect(onDisk(storageKey)).toBe(true)
  })

  it('otro miembro del equipo o un cliente sobre la subida ajena → 404', async () => {
    const { body } = await intent(adminToken, { purpose: 'deal_document', fileName: 'x.pdf', contentType: 'application/pdf', sizeBytes: FILE_BYTES.pdf.length })
    const uploadId = body.data.uploadId as string

    const teammate = await request(app.server).put(`/api/uploads/${uploadId}/content`).set(auth(teammateToken)).attach('file', FILE_BYTES.pdf, 'x.pdf')
    expect(teammate.status).toBe(404)
    const client = await request(app.server).put(`/api/client/uploads/${uploadId}/content`).set(auth(clientA.token)).attach('file', FILE_BYTES.pdf, 'x.pdf')
    expect(client.status).toBe(404)
    expect(onDisk(body.data.storageKey)).toBe(false)
  })

  it('bytes reales por encima del máximo del propósito → 400 y no queda archivo', async () => {
    const { body } = await intent(adminToken, { purpose: 'brand_logo', fileName: 'logo.png', contentType: 'image/png', sizeBytes: 1000 })
    const oversized = Buffer.concat([FILE_BYTES.png, Buffer.alloc(2 * 1024 * 1024)])
    const res = await request(app.server).put(`/api/uploads/${body.data.uploadId}/content`).set(auth(adminToken)).attach('file', oversized, 'logo.png')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('FILE_TOO_LARGE')
    expect(onDisk(body.data.storageKey)).toBe(false)
  })

  it('propósito PNG con bytes que no son PNG → 400 FILE_TYPE_NOT_ALLOWED y no queda archivo', async () => {
    const { body } = await intent(adminToken, { purpose: 'brand_logo', fileName: 'logo.png', contentType: 'image/png', sizeBytes: 100 })
    const html = Buffer.from('<html><script>alert(1)</script></html>')
    const res = await request(app.server).put(`/api/uploads/${body.data.uploadId}/content`).set(auth(adminToken)).attach('file', html, 'logo.png')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED')
    expect(onDisk(body.data.storageKey)).toBe(false)
  })
})

describe('claimUpload desde los endpoints de dominio', () => {
  it('documento con key propia pendiente → 201 y el ledger queda attached', async () => {
    const { storageKey } = await adminPdf()
    const res = await createDocument(adminToken, storageKey)
    expect(res.status).toBe(201)
    const row = await ledgerRow(storageKey)
    expect(row?.status).toBe('attached')
    expect(row?.attachedAt).not.toBeNull()
    expect(row?.sizeBytes).toBe(FILE_BYTES.pdf.length)
  })

  it('key subida por un usuario de OTRO portal → 400 FILE_NOT_UPLOADED', async () => {
    const { storageKey } = await uploadServerFile(app, otherHubToken, '/api/uploads', {
      purpose: 'deal_document',
      fileName: 'ajeno.pdf',
      contentType: 'application/pdf',
      bytes: FILE_BYTES.pdf,
    })
    const res = await createDocument(adminToken, storageKey)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('FILE_NOT_UPLOADED')
    expect((await ledgerRow(storageKey))?.status).toBe('pending')
  })

  it('key de otro miembro del mismo portal → 400', async () => {
    const { storageKey } = await uploadServerFile(app, teammateToken, '/api/uploads', {
      purpose: 'deal_document',
      fileName: 'del-companero.pdf',
      contentType: 'application/pdf',
      bytes: FILE_BYTES.pdf,
    })
    expect((await createDocument(adminToken, storageKey)).status).toBe(400)
  })

  it('key ya reclamada reutilizada en otro registro → 400', async () => {
    const { storageKey } = await adminPdf()
    expect((await createDocument(adminToken, storageKey)).status).toBe(201)
    const again = await createDocument(adminToken, storageKey)
    expect(again.status).toBe(400)
    expect(again.body.error.code).toBe('FILE_NOT_UPLOADED')
  })

  it('key desconocida o legacy al crear → 400', async () => {
    expect((await createDocument(adminToken, `${randomUUID()}-contrato.pdf`)).status).toBe(400)
    expect((await createDocument(adminToken, `portals/${portalId}/deal_document/2026/01/${randomUUID()}.pdf`)).status).toBe(400)
  })

  it('reserva que nunca recibió contenido → 400 FILE_NOT_UPLOADED', async () => {
    const { body } = await intent(adminToken, { purpose: 'deal_document', fileName: 'x.pdf', contentType: 'application/pdf', sizeBytes: 10 })
    const res = await createDocument(adminToken, body.data.storageKey)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('FILE_NOT_UPLOADED')
  })

  it('key con propósito distinto al del registro → 400', async () => {
    const { storageKey } = await adminPdf('library_item')
    expect((await createDocument(adminToken, storageKey)).status).toBe(400)
  })
})

describe('reemplazo de archivo en un registro', () => {
  it('key sin cambios en un update → OK; key nueva → borra el ledger y el archivo anteriores', async () => {
    const first = await adminPdf('library_item', 'manual-v1.pdf')
    const created = await request(app.server).post('/api/library').set(auth(adminToken)).send({ type: 'document', name: 'Manual', storageKey: first.storageKey })
    expect(created.status).toBe(201)
    const itemId = created.body.data.id as string

    const unchanged = await request(app.server).patch(`/api/library/${itemId}`).set(auth(adminToken)).send({ name: 'Manual (rev)', storageKey: first.storageKey })
    expect(unchanged.status).toBe(200)
    expect(onDisk(first.storageKey)).toBe(true)

    const second = await adminPdf('library_item', 'manual-v2.pdf')
    const replaced = await request(app.server).patch(`/api/library/${itemId}`).set(auth(adminToken)).send({ storageKey: second.storageKey })
    expect(replaced.status).toBe(200)
    expect(replaced.body.data.storageKey).toBe(second.storageKey)

    expect(await ledgerRow(first.storageKey)).toBeUndefined()
    expect(onDisk(first.storageKey)).toBe(false)
    expect((await ledgerRow(second.storageKey))?.status).toBe('attached')
    expect(onDisk(second.storageKey)).toBe(true)
  })

  it('la key legacy anterior NO se borra al reemplazarla', async () => {
    const legacyKey = `${randomUUID()}-manual-legacy.pdf`
    legacyKeys.push(legacyKey)
    await mkdir(resolve(process.cwd(), 'uploads'), { recursive: true })
    await writeFile(resolve(process.cwd(), 'uploads', legacyKey), FILE_BYTES.pdf)
    const [item] = await db.insert(libraryItem).values({ portalId, type: 'document', name: 'Legacy', storageKey: legacyKey }).returning()

    const next = await adminPdf('library_item', 'manual-nuevo.pdf')
    const res = await request(app.server).patch(`/api/library/${item!.id}`).set(auth(adminToken)).send({ storageKey: next.storageKey })
    expect(res.status).toBe(200)
    expect(onDisk(legacyKey)).toBe(true)
  })
})

describe('POST /api/client/onboarding/materials/assets', () => {
  it('{ category, storageKey } crea el client_asset con nombre, tipo y tamaño del ledger', async () => {
    const { storageKey } = await uploadServerFile(app, clientA.token, '/api/client/uploads', {
      purpose: 'onboarding_material',
      fileName: 'clase 1.mp3',
      contentType: 'audio/mpeg',
      bytes: FILE_BYTES.mp3,
    })
    const res = await request(app.server)
      .post('/api/client/onboarding/materials/assets')
      .set(auth(clientA.token))
      .send({ category: 'programContent', storageKey })
    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({
      dealId: clientA.dealId,
      clientId: clientA.clientId,
      fieldName: 'programContent',
      type: 'documento',
      name: 'clase 1.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: FILE_BYTES.mp3.length,
      storageKey,
    })
    expect((await ledgerRow(storageKey))?.status).toBe('attached')
  })

  it('key subida por OTRO cliente → 400 FILE_NOT_UPLOADED', async () => {
    const { storageKey } = await uploadServerFile(app, clientB.token, '/api/client/uploads', {
      purpose: 'onboarding_material',
      fileName: 'de-b.pdf',
      contentType: 'application/pdf',
      bytes: FILE_BYTES.pdf,
    })
    const res = await request(app.server)
      .post('/api/client/onboarding/materials/assets')
      .set(auth(clientA.token))
      .send({ category: 'logoBrand', storageKey })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('FILE_NOT_UPLOADED')
  })
})

describe('limpieza de reservas vencidas vs reclamo', () => {
  it('una reserva pendiente de más de 24 h se borra (fila y archivo); una reclamada igual de vieja NO', async () => {
    const stale = await adminPdf()
    const claimed = await adminPdf()
    expect((await createDocument(adminToken, claimed.storageKey)).status).toBe(201)
    // La más vieja del portal: la limpieza procesa en orden de antigüedad.
    await db
      .update(fileUpload)
      .set({ createdAt: new Date('2000-01-01T00:00:00Z') })
      .where(inArray(fileUpload.storageKey, [stale.storageKey, claimed.storageKey]))

    expect((await intent(adminToken, { purpose: 'deal_document', fileName: 'x.pdf', contentType: 'application/pdf', sizeBytes: 10 })).status).toBe(201)

    expect(await ledgerRow(stale.storageKey)).toBeUndefined()
    expect(onDisk(stale.storageKey)).toBe(false)
    expect((await ledgerRow(claimed.storageKey))?.status).toBe('attached')
    expect(onDisk(claimed.storageKey)).toBe(true)
  })

  it('reclamar una reserva de más de 23 h → 400 FILE_NOT_UPLOADED (no se superpone con la limpieza)', async () => {
    const { storageKey } = await adminPdf()
    await db
      .update(fileUpload)
      .set({ createdAt: new Date(Date.now() - 23.5 * 60 * 60 * 1000) })
      .where(eq(fileUpload.storageKey, storageKey))
    const res = await createDocument(adminToken, storageKey)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('FILE_NOT_UPLOADED')
  })
})

describe('cuota de reservas pendientes por uploader', () => {
  it(`más de ${MAX_PENDING_UPLOADS} reservas pendientes → 429 UPLOAD_QUOTA_EXCEEDED`, async () => {
    const token = await freshHubToken('quota-count')
    const small = { purpose: 'deal_document', fileName: 'x.pdf', contentType: 'application/pdf', sizeBytes: 10 }
    for (let i = 0; i < MAX_PENDING_UPLOADS; i++) expect((await intent(token, small)).status).toBe(201)
    const res = await intent(token, small)
    expect(res.status).toBe(429)
    expect(res.body.error.code).toBe('UPLOAD_QUOTA_EXCEEDED')
    expect(res.body.error.details).toEqual({ maxPendingUploads: 20, maxPendingBytes: 500 * 1024 * 1024 })
  })

  it('más de 500 MB declarados pendientes → 429 UPLOAD_QUOTA_EXCEEDED', async () => {
    const token = await freshHubToken('quota-bytes')
    const big = { purpose: 'deal_document', fileName: 'x.zip', contentType: 'application/zip', sizeBytes: 50 * 1024 * 1024 }
    for (let i = 0; i < MAX_PENDING_BYTES / big.sizeBytes; i++) expect((await intent(token, big)).status).toBe(201)
    const res = await intent(token, { ...big, sizeBytes: 1 })
    expect(res.status).toBe(429)
    expect(res.body.error.code).toBe('UPLOAD_QUOTA_EXCEEDED')
    expect(res.body.error.message).toContain('500 MB')
  })

  it('la cuota es por uploader: otro usuario del mismo portal no se ve afectado', async () => {
    const res = await intent(teammateToken, { purpose: 'deal_document', fileName: 'x.pdf', contentType: 'application/pdf', sizeBytes: 10 })
    expect(res.status).toBe(201)
  })
})

describe("storageKey '' (vacío)", () => {
  it('se rechaza con 400 en biblioteca, gastos y branding en vez de saltear el reclamo', async () => {
    const item = await request(app.server).post('/api/library').set(auth(adminToken)).send({ type: 'document', name: 'Sin archivo' })
    expect(item.status).toBe(201)
    expect((await request(app.server).patch(`/api/library/${item.body.data.id}`).set(auth(adminToken)).send({ storageKey: '' })).status).toBe(400)
    expect((await request(app.server).post('/api/library').set(auth(adminToken)).send({ type: 'document', name: 'Vacío', storageKey: '' })).status).toBe(400)
    expect((await request(app.server).post('/api/finance/expenses').set(auth(adminToken)).send({ ...expenseBody, storageKey: '' })).status).toBe(400)
    expect((await request(app.server).patch(`/api/branding/clients/${clientA.clientId}`).set(auth(adminToken)).send({ brandLogoKey: '' })).status).toBe(400)
    expect((await request(app.server).patch('/api/client/branding').set(auth(clientA.token)).send({ brandLogoKey: '' })).status).toBe(400)
  })
})

describe('comprobantes de gastos', () => {
  it('reemplazar el comprobante NO borra el archivo anterior ni su fila del ledger (rastro contable)', async () => {
    const first = await adminPdf('expense_receipt', 'factura-1.pdf')
    const created = await request(app.server).post('/api/finance/expenses').set(auth(adminToken)).send({ ...expenseBody, storageKey: first.storageKey })
    expect(created.status).toBe(201)

    const second = await adminPdf('expense_receipt', 'factura-2.pdf')
    const updated = await request(app.server)
      .patch(`/api/finance/expenses/${created.body.data.id}`)
      .set(auth(adminToken))
      .send({ storageKey: second.storageKey })
    expect(updated.status).toBe(200)
    expect(updated.body.data.storageKey).toBe(second.storageKey)

    expect(onDisk(first.storageKey)).toBe(true)
    expect((await ledgerRow(first.storageKey))?.status).toBe('attached')
  })
})
