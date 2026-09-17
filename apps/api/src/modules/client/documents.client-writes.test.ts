/**
 * documents.client-writes.test.ts
 *
 * Escrituras del cliente sobre carpetas y documentos (portal → Documentos):
 * crear/renombrar/archivar carpetas propias, subir/renombrar/mover/archivar
 * documentos propios, y todos los límites de tenant/propiedad de
 * `portal-document-writes` (spec). `document.portal_id` es el tenant de la
 * AGENCIA, no de la empresa cliente: toda escritura exige
 * `dealId ∈ clientDealIds`, así que fuera de esos ids siempre es 404 (nunca
 * 403), sin importar el motivo (deal de otro cliente, de otro portal, o
 * acceso revocado).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import {
  portal,
  contact,
  deal,
  company,
  clientAccount,
  clientDealAccess,
  document,
  documentFolder,
  auditLog,
  recordHistory,
} from '../../db/schema'
import { ensurePortalAndUser, ensurePipeline, loginToken, listenForSupertest, type PipelineContext } from '../../test/helpers'
import { PORTAL_VIEW_HEADER } from '../../middleware/authenticate-client'
import { FILE_BYTES, clearPendingUploads, removeTestUploads, uploadServerFile } from '../../test/uploads'

const app = buildApp({ rateLimit: false })

interface TestClient {
  clientId: string
  dealId: string
  token: string
}

let portalId: string
let ownerId: string
let adminToken: string
let pipe: PipelineContext

let clientA: TestClient // sujeto principal — dealA es solo suyo
let clientB: TestClient // otro cliente del mismo portal, otro deal — aislamiento entre proyectos
let clientD: TestClient // comparte dealShared con clientA — dos cuentas con acceso al MISMO proyecto
let sharedDealId: string
let revokedClient: TestClient // se le revoca el acceso ANTES de que use las rutas

let otherPortalId: string
let otherDealId: string

let pvSlug: string
let pvClientId: string

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })
const asPortalViewer = (slug: string) => ({ Authorization: `Bearer ${adminToken}`, [PORTAL_VIEW_HEADER]: slug })

async function makeClient(targetPortalId: string, pipeline: PipelineContext, tag: string, opts: { companyId?: string } = {}): Promise<TestClient> {
  const unique = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `docwrites-${unique}@test.com`
  const [c] = await db.insert(contact).values({ portalId: targetPortalId, firstName: 'Cli', lastName: tag, email, companyId: opts.companyId ?? null }).returning()
  const [d] = await db
    .insert(deal)
    .values({
      portalId: targetPortalId,
      name: `Deal ${unique}`,
      pipelineId: pipeline.pipelineId,
      stageId: pipeline.firstStageId,
      primaryContactId: c!.id,
      companyId: opts.companyId ?? null,
    })
    .returning()
  const clerkUserId = `clerk_test_docwrites_${unique}`
  const [ca] = await db.insert(clientAccount).values({ portalId: targetPortalId, contactId: c!.id, email, clerkUserId, isActive: true }).returning()
  await db.insert(clientDealAccess).values({ clientId: ca!.id, dealId: d!.id })
  return { clientId: ca!.id, dealId: d!.id, token: `faketoken:${clerkUserId}` }
}

beforeAll(async () => {
  await listenForSupertest(app)

  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  ownerId = ctx.userId
  adminToken = await loginToken(app, ctx.email, ctx.password)
  pipe = await ensurePipeline(portalId)

  clientA = await makeClient(portalId, pipe, 'a')
  clientB = await makeClient(portalId, pipe, 'b')
  clientD = await makeClient(portalId, pipe, 'd')
  sharedDealId = clientA.dealId
  // clientD también tiene acceso al deal de A (dos personas de la misma empresa con login propio).
  await db.insert(clientDealAccess).values({ clientId: clientD.clientId, dealId: sharedDealId })

  revokedClient = await makeClient(portalId, pipe, 'revoked')
  await db.delete(clientDealAccess).where(and(eq(clientDealAccess.clientId, revokedClient.clientId), eq(clientDealAccess.dealId, revokedClient.dealId)))

  const [op] = await db.insert(portal).values({ name: `Otro Portal Docs ${randomUUID()}` }).returning()
  otherPortalId = op!.id
  const otherPipe = await ensurePipeline(otherPortalId)
  const otherClient = await makeClient(otherPortalId, otherPipe, 'other-portal')
  otherDealId = otherClient.dealId

  pvSlug = `pv-docs-${randomUUID().slice(0, 8)}`
  const [pvCompany] = await db.insert(company).values({ portalId, name: 'PV Docs', slug: pvSlug }).returning()
  const pvClient = await makeClient(portalId, pipe, 'pv', { companyId: pvCompany!.id })
  pvClientId = pvClient.clientId
})

afterAll(async () => {
  await clearPendingUploads([], [clientA.clientId, clientB.clientId, clientD.clientId])
  await removeTestUploads([portalId, otherPortalId])
  await app.close()
  await closeDb()
})

describe('POST /api/client/document-folders', () => {
  it('crea una carpeta en un deal propio', async () => {
    const res = await request(app.server).post('/api/client/document-folders').set(auth(clientA.token)).send({ dealId: clientA.dealId, name: 'Contratos A' })
    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({ dealId: clientA.dealId, name: 'Contratos A', documentCount: 0, canManage: true })

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.clientId, clientA.clientId), eq(auditLog.entityType, 'document_folder'), eq(auditLog.entityId, res.body.data.id), eq(auditLog.action, 'CREATE')))
    expect(audit).toBeDefined()
  })

  it('sin dealId → 400 (nunca se puede crear una carpeta en "Generales")', async () => {
    const res = await request(app.server).post('/api/client/document-folders').set(auth(clientA.token)).send({ name: 'Sin proyecto' })
    expect(res.status).toBe(400)
  })

  it('deal de otro cliente del mismo portal → 404', async () => {
    const res = await request(app.server).post('/api/client/document-folders').set(auth(clientA.token)).send({ dealId: clientB.dealId, name: 'Ajena' })
    expect(res.status).toBe(404)
  })

  it('deal_id de otro portal/agencia → 404', async () => {
    const res = await request(app.server).post('/api/client/document-folders').set(auth(clientA.token)).send({ dealId: otherDealId, name: 'Otra agencia' })
    expect(res.status).toBe(404)
  })

  it('cliente con acceso revocado al deal → 404', async () => {
    const res = await request(app.server).post('/api/client/document-folders').set(auth(revokedClient.token)).send({ dealId: revokedClient.dealId, name: 'Revocado' })
    expect(res.status).toBe(404)
  })

  it('nombre duplicado entre carpetas activas del mismo proyecto → 409, y se reutiliza tras archivar', async () => {
    const first = await request(app.server).post('/api/client/document-folders').set(auth(clientA.token)).send({ dealId: clientA.dealId, name: 'Duplicada' })
    expect(first.status).toBe(201)

    const dup = await request(app.server).post('/api/client/document-folders').set(auth(clientA.token)).send({ dealId: clientA.dealId, name: 'Duplicada' })
    expect(dup.status).toBe(409)
    // Case-insensitive: mismo choque con otra capitalización.
    const dupCase = await request(app.server).post('/api/client/document-folders').set(auth(clientA.token)).send({ dealId: clientA.dealId, name: 'DUPLICADA' })
    expect(dupCase.status).toBe(409)

    const archived = await request(app.server).delete(`/api/client/document-folders/${first.body.data.id}`).set(auth(clientA.token))
    expect(archived.status).toBe(200)

    const reused = await request(app.server).post('/api/client/document-folders').set(auth(clientA.token)).send({ dealId: clientA.dealId, name: 'Duplicada' })
    expect(reused.status).toBe(201)
  })

  it('X-Portal-View → 403 (nunca escribe en nombre del cliente)', async () => {
    const res = await request(app.server).post('/api/client/document-folders').set(asPortalViewer(pvSlug)).send({ dealId: sharedDealId, name: 'Vista admin' })
    expect(res.status).toBe(403)
  })
})

describe('PATCH/DELETE /api/client/document-folders/:id', () => {
  let ownFolderId: string
  let teamFolderId: string
  let otherClientFolderId: string

  beforeAll(async () => {
    const created = await request(app.server).post('/api/client/document-folders').set(auth(clientA.token)).send({ dealId: sharedDealId, name: `De A ${randomUUID().slice(0, 6)}` })
    ownFolderId = created.body.data.id

    // Carpeta creada por el equipo (no hay ruta admin todavía en este PR — se
    // fija por DB, simulando el estado que dejará PR1c).
    const [teamFolder] = await db.insert(documentFolder).values({ portalId, dealId: sharedDealId, name: `Del equipo ${randomUUID().slice(0, 6)}`, createdBy: ownerId }).returning()
    teamFolderId = teamFolder!.id

    // Carpeta creada por clientD, que también tiene acceso a sharedDealId.
    const otherCreated = await request(app.server).post('/api/client/document-folders').set(auth(clientD.token)).send({ dealId: sharedDealId, name: `De D ${randomUUID().slice(0, 6)}` })
    otherClientFolderId = otherCreated.body.data.id
  })

  it('renombra y archiva la carpeta propia', async () => {
    const renamed = await request(app.server).patch(`/api/client/document-folders/${ownFolderId}`).set(auth(clientA.token)).send({ name: 'Renombrada por A' })
    expect(renamed.status).toBe(200)
    expect(renamed.body.data.name).toBe('Renombrada por A')

    const history = await db.select().from(recordHistory).where(and(eq(recordHistory.entityType, 'document_folder'), eq(recordHistory.entityId, ownFolderId), eq(recordHistory.fieldName, 'name')))
    expect(history.length).toBeGreaterThan(0)
    expect(history.at(-1)!.newValue).toBe('Renombrada por A')
    expect(history.at(-1)!.changedBy).toBeNull()
    expect(history.at(-1)!.sourceType).toBe('CLIENT_PORTAL')

    const archived = await request(app.server).delete(`/api/client/document-folders/${ownFolderId}`).set(auth(clientA.token))
    expect(archived.status).toBe(200)
  })

  it('no puede renombrar ni archivar una carpeta del equipo → 403', async () => {
    const rename = await request(app.server).patch(`/api/client/document-folders/${teamFolderId}`).set(auth(clientA.token)).send({ name: 'x' })
    expect(rename.status).toBe(403)
    const archive = await request(app.server).delete(`/api/client/document-folders/${teamFolderId}`).set(auth(clientA.token))
    expect(archive.status).toBe(403)
  })

  it('no puede renombrar ni archivar una carpeta creada por OTRA cuenta cliente con acceso al mismo deal → 403', async () => {
    const rename = await request(app.server).patch(`/api/client/document-folders/${otherClientFolderId}`).set(auth(clientA.token)).send({ name: 'x' })
    expect(rename.status).toBe(403)
    const archive = await request(app.server).delete(`/api/client/document-folders/${otherClientFolderId}`).set(auth(clientA.token))
    expect(archive.status).toBe(403)
  })

  it('archivar una carpeta con documentos activos los mueve a la raíz del proyecto (folder_id = null) en una sola operación', async () => {
    const created = await request(app.server).post('/api/client/document-folders').set(auth(clientA.token)).send({ dealId: sharedDealId, name: `Con docs ${randomUUID().slice(0, 6)}` })
    const folderId = created.body.data.id

    const { storageKey } = await uploadServerFile(app, clientA.token, '/api/client/uploads', { purpose: 'deal_document', fileName: 'a.pdf', contentType: 'application/pdf', bytes: FILE_BYTES.pdf })
    const doc = await request(app.server).post('/api/client/documents').set(auth(clientA.token)).send({ dealId: sharedDealId, folderId, name: 'Doc en carpeta', storageKey })
    expect(doc.status).toBe(201)
    const documentId = doc.body.data.id

    const archived = await request(app.server).delete(`/api/client/document-folders/${folderId}`).set(auth(clientA.token))
    expect(archived.status).toBe(200)
    expect(archived.body.data).toEqual({ success: true, movedDocuments: 1 })

    const [row] = await db.select({ folderId: document.folderId, archived: document.archived }).from(document).where(eq(document.id, documentId))
    expect(row!.folderId).toBeNull()
    expect(row!.archived).toBe(false)

    const historyMove = await db.select().from(recordHistory).where(and(eq(recordHistory.entityType, 'document'), eq(recordHistory.entityId, documentId), eq(recordHistory.fieldName, 'folderId')))
    expect(historyMove.length).toBeGreaterThan(0)
    expect(historyMove.at(-1)!.newValue).toBeNull()
  })
})

describe('POST /api/client/documents', () => {
  it('sube un documento a la raíz del proyecto', async () => {
    const { storageKey } = await uploadServerFile(app, clientA.token, '/api/client/uploads', { purpose: 'deal_document', fileName: 'raiz.pdf', contentType: 'application/pdf', bytes: FILE_BYTES.pdf })
    const res = await request(app.server).post('/api/client/documents').set(auth(clientA.token)).send({ dealId: clientA.dealId, name: 'Documento raíz', storageKey })
    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({ dealId: clientA.dealId, folderId: null, name: 'Documento raíz', canManage: true })

    const [audit] = await db.select().from(auditLog).where(and(eq(auditLog.clientId, clientA.clientId), eq(auditLog.entityType, 'document'), eq(auditLog.entityId, res.body.data.id), eq(auditLog.action, 'CREATE')))
    expect(audit).toBeDefined()
  })

  it('sube un documento a una carpeta propia del proyecto', async () => {
    const folder = await request(app.server).post('/api/client/document-folders').set(auth(clientA.token)).send({ dealId: clientA.dealId, name: `Subida a carpeta ${randomUUID().slice(0, 6)}` })
    const { storageKey } = await uploadServerFile(app, clientA.token, '/api/client/uploads', { purpose: 'deal_document', fileName: 'en-carpeta.pdf', contentType: 'application/pdf', bytes: FILE_BYTES.pdf })
    const res = await request(app.server).post('/api/client/documents').set(auth(clientA.token)).send({ dealId: clientA.dealId, folderId: folder.body.data.id, name: 'En carpeta', storageKey })
    expect(res.status).toBe(201)
    expect(res.body.data.folderId).toBe(folder.body.data.id)
  })

  it('sin dealId → 400 ("Generales" no admite subidas propias del cliente)', async () => {
    const { storageKey } = await uploadServerFile(app, clientA.token, '/api/client/uploads', { purpose: 'deal_document', fileName: 'sin-deal.pdf', contentType: 'application/pdf', bytes: FILE_BYTES.pdf })
    const res = await request(app.server).post('/api/client/documents').set(auth(clientA.token)).send({ name: 'Sin proyecto', storageKey })
    expect(res.status).toBe(400)
  })

  it('deal de otro cliente o de otro portal → 404', async () => {
    const { storageKey } = await uploadServerFile(app, clientA.token, '/api/client/uploads', { purpose: 'deal_document', fileName: 'ajeno.pdf', contentType: 'application/pdf', bytes: FILE_BYTES.pdf })
    const resB = await request(app.server).post('/api/client/documents').set(auth(clientA.token)).send({ dealId: clientB.dealId, name: 'Ajeno', storageKey })
    expect(resB.status).toBe(404)
    const resOther = await request(app.server).post('/api/client/documents').set(auth(clientA.token)).send({ dealId: otherDealId, name: 'Otra agencia', storageKey })
    expect(resOther.status).toBe(404)
  })

  it('carpeta de otro deal → 400 (aunque sea un deal propio)', async () => {
    const otherOwnFolder = await request(app.server).post('/api/client/document-folders').set(auth(clientB.token)).send({ dealId: clientB.dealId, name: `De B ${randomUUID().slice(0, 6)}` })
    const { storageKey } = await uploadServerFile(app, clientA.token, '/api/client/uploads', { purpose: 'deal_document', fileName: 'cruzado.pdf', contentType: 'application/pdf', bytes: FILE_BYTES.pdf })
    const res = await request(app.server).post('/api/client/documents').set(auth(clientA.token)).send({ dealId: clientA.dealId, folderId: otherOwnFolder.body.data.id, name: 'Cruzado', storageKey })
    expect(res.status).toBe(400)
  })

  it('storageKey que el caller no reclamó (subida de OTRO cliente) → rechazada, no crea el documento', async () => {
    const { storageKey } = await uploadServerFile(app, clientB.token, '/api/client/uploads', { purpose: 'deal_document', fileName: 'de-b.pdf', contentType: 'application/pdf', bytes: FILE_BYTES.pdf })
    const res = await request(app.server).post('/api/client/documents').set(auth(clientA.token)).send({ dealId: clientA.dealId, name: 'Robado', storageKey })
    expect(res.status).toBe(400)

    const rows = await db.select().from(document).where(eq(document.storageKey, storageKey))
    expect(rows).toHaveLength(0)
  })

  it('cliente con acceso revocado al deal → 404', async () => {
    const { storageKey } = await uploadServerFile(app, revokedClient.token, '/api/client/uploads', { purpose: 'deal_document', fileName: 'revocado.pdf', contentType: 'application/pdf', bytes: FILE_BYTES.pdf })
    const res = await request(app.server).post('/api/client/documents').set(auth(revokedClient.token)).send({ dealId: revokedClient.dealId, name: 'Revocado', storageKey })
    expect(res.status).toBe(404)
  })

  it('X-Portal-View → 403', async () => {
    const { storageKey } = await uploadServerFile(app, clientA.token, '/api/client/uploads', { purpose: 'deal_document', fileName: 'pv.pdf', contentType: 'application/pdf', bytes: FILE_BYTES.pdf })
    const res = await request(app.server).post('/api/client/documents').set(asPortalViewer(pvSlug)).send({ dealId: sharedDealId, name: 'Vista admin', storageKey })
    expect(res.status).toBe(403)
  })
})

describe('PATCH/DELETE /api/client/documents/:id', () => {
  let ownDocumentId: string
  let docusealDocumentId: string
  let teamDocumentId: string
  let otherFolderInSameDeal: string

  beforeAll(async () => {
    const { storageKey } = await uploadServerFile(app, clientA.token, '/api/client/uploads', { purpose: 'deal_document', fileName: 'propio.pdf', contentType: 'application/pdf', bytes: FILE_BYTES.pdf })
    const created = await request(app.server).post('/api/client/documents').set(auth(clientA.token)).send({ dealId: sharedDealId, name: 'Propio de A', storageKey })
    ownDocumentId = created.body.data.id

    const [docusealDoc] = await db
      .insert(document)
      .values({ portalId, dealId: sharedDealId, name: 'Contrato firmado', type: 'contract', source: 'docuseal', docusealSubmissionId: 123456, docusealStatus: 'completed', createdBy: ownerId })
      .returning()
    docusealDocumentId = docusealDoc!.id

    const [teamDoc] = await db.insert(document).values({ portalId, dealId: sharedDealId, name: 'Del equipo', type: 'other', source: 'manual', createdBy: ownerId }).returning()
    teamDocumentId = teamDoc!.id

    const otherFolder = await request(app.server).post('/api/client/document-folders').set(auth(clientA.token)).send({ dealId: sharedDealId, name: `Destino ${randomUUID().slice(0, 6)}` })
    otherFolderInSameDeal = otherFolder.body.data.id
  })

  it('renombra y mueve el documento propio dentro del mismo proyecto', async () => {
    const renamed = await request(app.server).patch(`/api/client/documents/${ownDocumentId}`).set(auth(clientA.token)).send({ name: 'Renombrado' })
    expect(renamed.status).toBe(200)
    expect(renamed.body.data.name).toBe('Renombrado')

    const moved = await request(app.server).patch(`/api/client/documents/${ownDocumentId}`).set(auth(clientA.token)).send({ folderId: otherFolderInSameDeal })
    expect(moved.status).toBe(200)
    expect(moved.body.data.folderId).toBe(otherFolderInSameDeal)

    const history = await db.select().from(recordHistory).where(and(eq(recordHistory.entityType, 'document'), eq(recordHistory.entityId, ownDocumentId), eq(recordHistory.fieldName, 'name')))
    expect(history.length).toBeGreaterThan(0)
  })

  it('mover a una carpeta de OTRO proyecto → 400 (aunque la carpeta exista, es de otro deal)', async () => {
    const otherProjectFolder = await request(app.server).post('/api/client/document-folders').set(auth(clientB.token)).send({ dealId: clientB.dealId, name: `Otro proyecto ${randomUUID().slice(0, 6)}` })
    const res = await request(app.server).patch(`/api/client/documents/${ownDocumentId}`).set(auth(clientA.token)).send({ folderId: otherProjectFolder.body.data.id })
    expect(res.status).toBe(400)
  })

  it('body vacío → 400 (nada para actualizar)', async () => {
    const res = await request(app.server).patch(`/api/client/documents/${ownDocumentId}`).set(auth(clientA.token)).send({})
    expect(res.status).toBe(400)
  })

  it('documento del equipo → 403 al renombrar y al archivar', async () => {
    const rename = await request(app.server).patch(`/api/client/documents/${teamDocumentId}`).set(auth(clientA.token)).send({ name: 'x' })
    expect(rename.status).toBe(403)
    const archive = await request(app.server).delete(`/api/client/documents/${teamDocumentId}`).set(auth(clientA.token))
    expect(archive.status).toBe(403)
  })

  it('documento de DocuSeal → 403 al renombrar y al archivar, sin importar quién lo vea', async () => {
    const rename = await request(app.server).patch(`/api/client/documents/${docusealDocumentId}`).set(auth(clientA.token)).send({ name: 'x' })
    expect(rename.status).toBe(403)
    const archive = await request(app.server).delete(`/api/client/documents/${docusealDocumentId}`).set(auth(clientA.token))
    expect(archive.status).toBe(403)
  })

  it('documento de otro proyecto (otro cliente / otro portal) → 404', async () => {
    const { storageKey } = await uploadServerFile(app, clientB.token, '/api/client/uploads', { purpose: 'deal_document', fileName: 'b.pdf', contentType: 'application/pdf', bytes: FILE_BYTES.pdf })
    const bDoc = await request(app.server).post('/api/client/documents').set(auth(clientB.token)).send({ dealId: clientB.dealId, name: 'De B', storageKey })
    const res = await request(app.server).patch(`/api/client/documents/${bDoc.body.data.id}`).set(auth(clientA.token)).send({ name: 'x' })
    expect(res.status).toBe(404)
  })

  it('cliente con acceso revocado al deal → 404 al intentar renombrar un documento que subió ANTES de la revocación', async () => {
    // El documento se fija directo por DB simulando un upload previo a la
    // revocación: hoy la ruta POST ya rechazaría la subida (dealId fuera de
    // clientDealIds), así que este es el escenario real que puede pasar en
    // producción — el acceso se revoca DESPUÉS de que el cliente ya subió algo.
    const [row] = await db
      .insert(document)
      .values({ portalId, dealId: revokedClient.dealId, name: 'Antes de revocar', type: 'other', source: 'manual', uploadedByClientAccountId: revokedClient.clientId })
      .returning()
    const res = await request(app.server).patch(`/api/client/documents/${row!.id}`).set(auth(revokedClient.token)).send({ name: 'x' })
    expect(res.status).toBe(404)
  })

  it('X-Portal-View → 403', async () => {
    const res = await request(app.server).patch(`/api/client/documents/${ownDocumentId}`).set(asPortalViewer(pvSlug)).send({ name: 'x' })
    expect(res.status).toBe(403)
  })
})

describe('GET /api/client/document-folders', () => {
  it('requiere dealId (400 sin query) y devuelve solo las carpetas activas del deal, con canManage por dueño', async () => {
    const missing = await request(app.server).get('/api/client/document-folders').set(auth(clientA.token))
    expect(missing.status).toBe(400)

    const created = await request(app.server).post('/api/client/document-folders').set(auth(clientA.token)).send({ dealId: clientA.dealId, name: `Listado ${randomUUID().slice(0, 6)}` })
    const list = await request(app.server).get(`/api/client/document-folders?dealId=${clientA.dealId}`).set(auth(clientA.token))
    expect(list.status).toBe(200)
    const found = (list.body.data as Array<{ id: string; canManage: boolean }>).find((f) => f.id === created.body.data.id)
    expect(found?.canManage).toBe(true)

    const asOther = await request(app.server).get(`/api/client/document-folders?dealId=${clientB.dealId}`).set(auth(clientA.token))
    expect(asOther.status).toBe(404)
  })
})
