/**
 * document-folders.test.ts — API admin de carpetas (`/api/documents/folders`)
 * y PATCH /api/documents/:id.
 *
 * Cubre la matriz de roles del equipo (crear/renombrar/mover → owner, member,
 * collaborator; archivar → SOLO owner), el guard de tenant sobre deal/carpeta,
 * que el equipo administra CUALQUIER carpeta o documento del deal (incluidos
 * los creados por un cliente desde el Portal), que archivar una carpeta libera
 * sus documentos a la raíz en una sola operación, y que portal-view nunca
 * puede escribir sobre recursos creados por el equipo.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import {
  portal,
  hubUser,
  company,
  contact,
  deal,
  document,
  documentFolder,
  clientAccount,
  clientDealAccess,
  auditLog,
  recordHistory,
} from '../../db/schema'
import { ensurePortalAndUser, ensurePipeline, loginToken, listenForSupertest, type PipelineContext } from '../../test/helpers'
import { PORTAL_VIEW_HEADER } from '../../middleware/authenticate-client'

const app = buildApp({ rateLimit: false })

let portalId: string
let ownerId: string
let ownerToken: string
let memberToken: string
let collaboratorToken: string
let pipe: PipelineContext
let dealId: string
/** Segundo deal del MISMO portal — para el caso "carpeta de otro proyecto propio". */
let secondDealId: string

let otherPortalId: string
let otherDealId: string

let pvSlug: string
let pvClientToken: string
let pvClientId: string

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })
const asPortalViewer = (slug: string) => ({ Authorization: `Bearer ${ownerToken}`, [PORTAL_VIEW_HEADER]: slug })

async function makeHubUser(targetPortalId: string, role: string, tag: string): Promise<string> {
  const clerkUserId = `clerk_docfolders_${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  await db.insert(hubUser).values({ portalId: targetPortalId, email: `${clerkUserId}@test.com`, role, firstName: tag, clerkUserId })
  return `faketoken:${clerkUserId}`
}

beforeAll(async () => {
  await listenForSupertest(app)

  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  ownerId = ctx.userId
  ownerToken = await loginToken(app, ctx.email, ctx.password)
  memberToken = await makeHubUser(portalId, 'member', 'member')
  collaboratorToken = await makeHubUser(portalId, 'collaborator', 'collab')

  pipe = await ensurePipeline(portalId)
  const [c] = await db.insert(contact).values({ portalId, firstName: 'Cli', lastName: 'Folders', email: `docfolders-${randomUUID()}@test.com` }).returning()
  const [d] = await db
    .insert(deal)
    .values({ portalId, name: `Deal Document Folders ${randomUUID()}`, pipelineId: pipe.pipelineId, stageId: pipe.firstStageId, primaryContactId: c!.id, ownerId })
    .returning()
  dealId = d!.id

  const [c2] = await db.insert(contact).values({ portalId, firstName: 'Cli2', lastName: 'Folders', email: `docfolders2-${randomUUID()}@test.com` }).returning()
  const [d2] = await db
    .insert(deal)
    .values({ portalId, name: `Segundo Deal Document Folders ${randomUUID()}`, pipelineId: pipe.pipelineId, stageId: pipe.firstStageId, primaryContactId: c2!.id, ownerId })
    .returning()
  secondDealId = d2!.id

  const [op] = await db.insert(portal).values({ name: `Otro Portal Document Folders ${randomUUID()}` }).returning()
  otherPortalId = op!.id
  const otherPipe = await ensurePipeline(otherPortalId)
  const [oc] = await db.insert(contact).values({ portalId: otherPortalId, firstName: 'Otro', lastName: 'Cli', email: `docfolders-other-${randomUUID()}@test.com` }).returning()
  const [od] = await db
    .insert(deal)
    .values({ portalId: otherPortalId, name: `Otro Deal ${randomUUID()}`, pipelineId: otherPipe.pipelineId, stageId: otherPipe.firstStageId, primaryContactId: oc!.id })
    .returning()
  otherDealId = od!.id

  // Cliente con acceso a `dealId`, con su empresa, para el escenario de portal-view.
  pvSlug = `pv-docfolders-${randomUUID().slice(0, 8)}`
  const [pvCompany] = await db.insert(company).values({ portalId, name: 'PV Document Folders', slug: pvSlug }).returning()
  await db.update(deal).set({ companyId: pvCompany!.id }).where(eq(deal.id, dealId))
  const pvClerkUserId = `clerk_docfolders_pv_${randomUUID()}`
  const [pvContact] = await db.insert(contact).values({ portalId, firstName: 'PV', lastName: 'Client', email: `docfolders-pv-${randomUUID()}@test.com`, companyId: pvCompany!.id }).returning()
  const [pvClient] = await db.insert(clientAccount).values({ portalId, contactId: pvContact!.id, email: `docfolders-pv-acc-${randomUUID()}@test.com`, clerkUserId: pvClerkUserId, isActive: true }).returning()
  await db.insert(clientDealAccess).values({ clientId: pvClient!.id, dealId })
  pvClientToken = `faketoken:${pvClerkUserId}`
  pvClientId = pvClient!.id
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

describe('POST /api/documents/folders — matriz de roles', () => {
  it('owner, member y collaborator pueden crear carpetas', async () => {
    const owner = await request(app.server).post('/api/documents/folders').set(auth(ownerToken)).send({ dealId, name: `Owner ${randomUUID().slice(0, 6)}` })
    expect(owner.status).toBe(201)
    expect(owner.body.data).toMatchObject({ dealId, documentCount: 0, createdByClientAccountId: null })
    expect(owner.body.data.createdBy).toBe(ownerId)

    const member = await request(app.server).post('/api/documents/folders').set(auth(memberToken)).send({ dealId, name: `Member ${randomUUID().slice(0, 6)}` })
    expect(member.status).toBe(201)

    const collab = await request(app.server).post('/api/documents/folders').set(auth(collaboratorToken)).send({ dealId, name: `Collab ${randomUUID().slice(0, 6)}` })
    expect(collab.status).toBe(201)

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'document_folder'), eq(auditLog.entityId, owner.body.data.id), eq(auditLog.action, 'CREATE')))
    expect(audit).toBeDefined()
    expect(audit!.userId).toBe(ownerId)
  })

  it('deal_id de otro portal/agencia → 400 (no expone si el recurso existe)', async () => {
    const res = await request(app.server).post('/api/documents/folders').set(auth(ownerToken)).send({ dealId: otherDealId, name: 'Cruzada' })
    expect(res.status).toBe(400)
  })

  it('nombre duplicado entre carpetas activas del mismo proyecto → 409, y se reutiliza tras archivar', async () => {
    const name = `Duplicada Admin ${randomUUID().slice(0, 6)}`
    const first = await request(app.server).post('/api/documents/folders').set(auth(ownerToken)).send({ dealId, name })
    expect(first.status).toBe(201)

    const dup = await request(app.server).post('/api/documents/folders').set(auth(memberToken)).send({ dealId, name })
    expect(dup.status).toBe(409)
    const dupCase = await request(app.server).post('/api/documents/folders').set(auth(ownerToken)).send({ dealId, name: name.toUpperCase() })
    expect(dupCase.status).toBe(409)

    const archived = await request(app.server).delete(`/api/documents/folders/${first.body.data.id}`).set(auth(ownerToken))
    expect(archived.status).toBe(200)

    const reused = await request(app.server).post('/api/documents/folders').set(auth(ownerToken)).send({ dealId, name })
    expect(reused.status).toBe(201)
  })
})

describe('PATCH /api/documents/folders/:id — renombrar (owner, member, collaborator)', () => {
  let folderId: string

  beforeAll(async () => {
    const created = await request(app.server).post('/api/documents/folders').set(auth(ownerToken)).send({ dealId, name: `Para renombrar ${randomUUID().slice(0, 6)}` })
    folderId = created.body.data.id
  })

  it('member puede renombrar', async () => {
    const res = await request(app.server).patch(`/api/documents/folders/${folderId}`).set(auth(memberToken)).send({ name: 'Renombrada por member' })
    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('Renombrada por member')

    const history = await db.select().from(recordHistory).where(and(eq(recordHistory.entityType, 'document_folder'), eq(recordHistory.entityId, folderId), eq(recordHistory.fieldName, 'name')))
    expect(history.length).toBeGreaterThan(0)
    expect(history.at(-1)!.newValue).toBe('Renombrada por member')
  })

  it('collaborator puede renombrar', async () => {
    const res = await request(app.server).patch(`/api/documents/folders/${folderId}`).set(auth(collaboratorToken)).send({ name: 'Renombrada por collaborator' })
    expect(res.status).toBe(200)
  })

  it('carpeta inexistente o de otro portal → 404', async () => {
    const res = await request(app.server).patch(`/api/documents/folders/${randomUUID()}`).set(auth(ownerToken)).send({ name: 'x' })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/documents/folders/:id — archivar (SOLO owner)', () => {
  it('member NO puede archivar', async () => {
    const created = await request(app.server).post('/api/documents/folders').set(auth(ownerToken)).send({ dealId, name: `No archivable por member ${randomUUID().slice(0, 6)}` })
    const res = await request(app.server).delete(`/api/documents/folders/${created.body.data.id}`).set(auth(memberToken))
    expect(res.status).toBe(403)
  })

  it('collaborator NO puede archivar', async () => {
    const created = await request(app.server).post('/api/documents/folders').set(auth(ownerToken)).send({ dealId, name: `No archivable por collab ${randomUUID().slice(0, 6)}` })
    const res = await request(app.server).delete(`/api/documents/folders/${created.body.data.id}`).set(auth(collaboratorToken))
    expect(res.status).toBe(403)
  })

  it('owner archiva y libera los documentos activos a la raíz del proyecto en una sola operación', async () => {
    const created = await request(app.server).post('/api/documents/folders').set(auth(ownerToken)).send({ dealId, name: `Con docs ${randomUUID().slice(0, 6)}` })
    const folderId = created.body.data.id

    const doc = await request(app.server).post('/api/documents').set(auth(ownerToken)).send({ dealId, folderId, name: 'Doc en carpeta', type: 'other' })
    expect(doc.status).toBe(201)
    expect(doc.body.data.folderId).toBe(folderId)
    const documentId = doc.body.data.id

    const archived = await request(app.server).delete(`/api/documents/folders/${folderId}`).set(auth(ownerToken))
    expect(archived.status).toBe(200)
    expect(archived.body.data).toEqual({ success: true, movedDocuments: 1 })

    const [row] = await db.select({ folderId: document.folderId, archived: document.archived }).from(document).where(eq(document.id, documentId))
    expect(row!.folderId).toBeNull()
    expect(row!.archived).toBe(false)

    const historyMove = await db.select().from(recordHistory).where(and(eq(recordHistory.entityType, 'document'), eq(recordHistory.entityId, documentId), eq(recordHistory.fieldName, 'folderId')))
    expect(historyMove.length).toBeGreaterThan(0)
    expect(historyMove.at(-1)!.newValue).toBeNull()
    expect(historyMove.at(-1)!.oldValue).toBe(folderId)

    const [audit] = await db.select().from(auditLog).where(and(eq(auditLog.entityType, 'document_folder'), eq(auditLog.entityId, folderId), eq(auditLog.action, 'ARCHIVE')))
    expect(audit).toBeDefined()
  })

  it('carpeta ya archivada → 404 al reintentar', async () => {
    const created = await request(app.server).post('/api/documents/folders').set(auth(ownerToken)).send({ dealId, name: `Doble archivado ${randomUUID().slice(0, 6)}` })
    const first = await request(app.server).delete(`/api/documents/folders/${created.body.data.id}`).set(auth(ownerToken))
    expect(first.status).toBe(200)
    const second = await request(app.server).delete(`/api/documents/folders/${created.body.data.id}`).set(auth(ownerToken))
    expect(second.status).toBe(404)
  })
})

describe('el equipo administra carpetas y documentos creados por el cliente', () => {
  it('renombra y archiva una carpeta creada por un client_account', async () => {
    const clientFolder = await request(app.server).post('/api/client/document-folders').set(auth(pvClientToken)).send({ dealId, name: `Carpeta del cliente ${randomUUID().slice(0, 6)}` })
    expect(clientFolder.status).toBe(201)
    const folderId = clientFolder.body.data.id

    const renamed = await request(app.server).patch(`/api/documents/folders/${folderId}`).set(auth(memberToken)).send({ name: 'Renombrada por el equipo' })
    expect(renamed.status).toBe(200)
    expect(renamed.body.data.name).toBe('Renombrada por el equipo')

    const archived = await request(app.server).delete(`/api/documents/folders/${folderId}`).set(auth(ownerToken))
    expect(archived.status).toBe(200)
  })

  it('mueve un documento subido por un client_account a otra carpeta del mismo deal', async () => {
    const [clientDoc] = await db
      .insert(document)
      .values({ portalId, dealId, name: 'Subido por el cliente', type: 'other', source: 'manual', uploadedByClientAccountId: pvClientId })
      .returning()

    const targetFolder = await request(app.server).post('/api/documents/folders').set(auth(ownerToken)).send({ dealId, name: `Destino equipo ${randomUUID().slice(0, 6)}` })

    const moved = await request(app.server).patch(`/api/documents/${clientDoc!.id}`).set(auth(memberToken)).send({ folderId: targetFolder.body.data.id })
    expect(moved.status).toBe(200)
    expect(moved.body.data.folderId).toBe(targetFolder.body.data.id)
    expect(moved.body.data.uploadedByClientAccountId).not.toBeNull()

    const history = await db.select().from(recordHistory).where(and(eq(recordHistory.entityType, 'document'), eq(recordHistory.entityId, clientDoc!.id), eq(recordHistory.fieldName, 'folderId')))
    expect(history.length).toBeGreaterThan(0)
  })
})

describe('PATCH /api/documents/:id — mover solo dentro del mismo proyecto', () => {
  it('mover a carpeta de otro proyecto propio → 400 (aunque el deal sea del mismo portal)', async () => {
    const ownDoc = await request(app.server).post('/api/documents').set(auth(ownerToken)).send({ dealId, name: 'Doc propio', type: 'other' })
    expect(ownDoc.status).toBe(201)
    const otherFolder = await request(app.server).post('/api/documents/folders').set(auth(ownerToken)).send({ dealId: secondDealId, name: `Otro proyecto ${randomUUID().slice(0, 6)}` })
    expect(otherFolder.status).toBe(201)
    const res = await request(app.server).patch(`/api/documents/${ownDoc.body.data.id}`).set(auth(ownerToken)).send({ folderId: otherFolder.body.data.id })
    expect(res.status).toBe(400)
  })

  it('body vacío → 400', async () => {
    const ownDoc = await request(app.server).post('/api/documents').set(auth(ownerToken)).send({ dealId, name: 'Doc vacío', type: 'other' })
    const res = await request(app.server).patch(`/api/documents/${ownDoc.body.data.id}`).set(auth(ownerToken)).send({})
    expect(res.status).toBe(400)
  })
})

describe('GET /api/documents/folders — excluye archivados', () => {
  it('carpeta archivada no aparece en el listado', async () => {
    const created = await request(app.server).post('/api/documents/folders').set(auth(ownerToken)).send({ dealId, name: `Para listar ${randomUUID().slice(0, 6)}` })
    const folderId = created.body.data.id

    const before = await request(app.server).get(`/api/documents/folders?dealId=${dealId}`).set(auth(ownerToken))
    expect(before.status).toBe(200)
    expect((before.body.data as Array<{ id: string }>).some((f) => f.id === folderId)).toBe(true)

    await request(app.server).delete(`/api/documents/folders/${folderId}`).set(auth(ownerToken))

    const after = await request(app.server).get(`/api/documents/folders?dealId=${dealId}`).set(auth(ownerToken))
    expect((after.body.data as Array<{ id: string }>).some((f) => f.id === folderId)).toBe(false)
  })

  it('requiere dealId', async () => {
    const res = await request(app.server).get('/api/documents/folders').set(auth(ownerToken))
    expect(res.status).toBe(400)
  })

  it('deal de otro portal → 400', async () => {
    const res = await request(app.server).get(`/api/documents/folders?dealId=${otherDealId}`).set(auth(ownerToken))
    expect(res.status).toBe(400)
  })
})

describe('portal-view nunca escribe sobre carpetas ni documentos creados por el equipo', () => {
  let teamFolderId: string
  let teamDocumentId: string

  beforeAll(async () => {
    const folder = await request(app.server).post('/api/documents/folders').set(auth(ownerToken)).send({ dealId, name: `Del equipo PV ${randomUUID().slice(0, 6)}` })
    teamFolderId = folder.body.data.id
    const doc = await request(app.server).post('/api/documents').set(auth(ownerToken)).send({ dealId, name: 'Documento del equipo PV', type: 'other' })
    teamDocumentId = doc.body.data.id
  })

  it('no puede crear, renombrar ni archivar una carpeta del equipo', async () => {
    const create = await request(app.server).post('/api/client/document-folders').set(asPortalViewer(pvSlug)).send({ dealId, name: 'Vista admin' })
    expect(create.status).toBe(403)
    const rename = await request(app.server).patch(`/api/client/document-folders/${teamFolderId}`).set(asPortalViewer(pvSlug)).send({ name: 'x' })
    expect(rename.status).toBe(403)
    const archive = await request(app.server).delete(`/api/client/document-folders/${teamFolderId}`).set(asPortalViewer(pvSlug))
    expect(archive.status).toBe(403)
  })

  it('no puede renombrar ni archivar un documento del equipo', async () => {
    const rename = await request(app.server).patch(`/api/client/documents/${teamDocumentId}`).set(asPortalViewer(pvSlug)).send({ name: 'x' })
    expect(rename.status).toBe(403)
    const archive = await request(app.server).delete(`/api/client/documents/${teamDocumentId}`).set(asPortalViewer(pvSlug))
    expect(archive.status).toBe(403)
  })
})
