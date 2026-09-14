/**
 * Modo blob con el SDK de Vercel Blob mockeado (nunca se sale a la red).
 *
 * Verifica lo que en producción no se puede probar a mano sin romper cosas:
 * que el reclamo confía en `head()` y no en lo que declaró el browser, que los
 * errores del SDK llegan con el código del contrato, y que los tokens que se
 * emiten quedan atados a UN pathname, operación y vencimiento.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'

const blobSdk = vi.hoisted(() => ({
  head: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  issueSignedToken: vi.fn(),
  presignUrl: vi.fn(),
}))

vi.mock('@vercel/blob', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vercel/blob')>()),
  ...blobSdk,
}))

import request from 'supertest'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { BlobNotFoundError, BlobServiceNotAvailable } from '@vercel/blob'
import { buildApp } from '../../app'
import { env } from '../../config/env'
import { db, closeDb } from '../../db'
import { fileUpload } from '../../db/schema'
import { ensurePortalAndUser, ensureHubUser, loginToken, listenForSupertest } from '../../test/helpers'
import { FILE_BYTES, clearPendingUploads } from '../../test/uploads'
import { claimUpload, prepareUploadClaim } from './uploads.service'
import type { StorageActor } from './uploads.types'

const app = buildApp({ rateLimit: false })
const BLOB_TOKEN = 'vercel_blob_rw_teststore_notarealsecret'
const MIN = 60 * 1000

const mutableEnv = env as { BLOB_READ_WRITE_TOKEN?: string }
let previousBlobToken: string | undefined

let portalId: string
let adminToken: string
let teammateToken: string
let adminActor: StorageActor

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

async function pendingPdf(token = adminToken): Promise<string> {
  const res = await request(app.server)
    .post('/api/uploads')
    .set(auth(token))
    .send({ purpose: 'deal_document', fileName: 'contrato.pdf', contentType: 'application/pdf', sizeBytes: FILE_BYTES.pdf.length })
  expect(res.status).toBe(201)
  expect(res.body.data.mode).toBe('blob')
  return res.body.data.storageKey as string
}

function blobGetResult(bytes: Buffer) {
  return {
    statusCode: 200,
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(bytes))
        controller.close()
      },
    }),
    headers: new Headers(),
    blob: {},
  }
}

/** Delegación con el mismo formato que la real (payload base64url + firma), para que `presign` del SDK la acepte. */
function fakeSignedToken(scope: Record<string, unknown>) {
  const payload = Buffer.from(JSON.stringify({ storeId: 'store_teststore', ...scope })).toString('base64url')
  return { delegationToken: `${payload}.signature`, clientSigningToken: 'client-signing-key', validUntil: scope['validUntil'] as number }
}

/** Mismo orden que los services: verificación fuera de la transacción, reclamo adentro. */
async function claim(storageKey: string) {
  const prepared = await prepareUploadClaim({ storageKey, portalId, actor: adminActor, purpose: 'deal_document' })
  return db.transaction((tx) => claimUpload(tx, prepared))
}

const PRIVATE_URL = 'https://teststore.private.blob.vercel-storage.com/object'
const headResult = (size: number, contentType: string, url = PRIVATE_URL) => ({ size, contentType, url })

beforeAll(async () => {
  previousBlobToken = mutableEnv.BLOB_READ_WRITE_TOKEN
  mutableEnv.BLOB_READ_WRITE_TOKEN = BLOB_TOKEN
  await listenForSupertest(app)
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  adminToken = await loginToken(app, ctx.email, ctx.password)
  adminActor = { kind: 'hub', userId: ctx.userId, portalId }
  const teammateEmail = 'uploads-blob-teammate@test.com'
  const teammateId = await ensureHubUser(portalId, teammateEmail, 'Compañero')
  teammateToken = await loginToken(app, teammateEmail, '')
  await clearPendingUploads([ctx.userId, teammateId])
})

afterAll(async () => {
  mutableEnv.BLOB_READ_WRITE_TOKEN = previousBlobToken
  await app.close()
  await closeDb()
})

beforeEach(() => {
  for (const fn of Object.values(blobSdk)) fn.mockReset()
})

describe('claimUpload — modo blob', () => {
  it('head OK + firma PDF → attached con el tamaño real, con timeout en cada llamada al SDK', async () => {
    const key = await pendingPdf()
    blobSdk.head.mockResolvedValue(headResult(FILE_BYTES.pdf.length - 2, 'application/pdf'))
    blobSdk.get.mockResolvedValue(blobGetResult(FILE_BYTES.pdf))

    const row = await claim(key)
    expect(row.status).toBe('attached')
    expect(row.sizeBytes).toBe(FILE_BYTES.pdf.length - 2)
    expect(blobSdk.head).toHaveBeenCalledWith(key, { token: BLOB_TOKEN, abortSignal: expect.any(AbortSignal) })
    expect(blobSdk.get).toHaveBeenCalledWith(
      key,
      expect.objectContaining({ access: 'private', headers: { Range: 'bytes=0-15' }, abortSignal: expect.any(AbortSignal) }),
    )
  })

  it('objeto en el store más grande que el tamaño DECLARADO (aunque bajo el máximo) → 400 FILE_TOO_LARGE y sigue pending', async () => {
    const key = await pendingPdf()
    blobSdk.head.mockResolvedValue(headResult(FILE_BYTES.pdf.length + 1, 'application/pdf'))
    await expect(claim(key)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE', statusCode: 400 })
    const [row] = await db.select().from(fileUpload).where(eq(fileUpload.storageKey, key))
    expect(row?.status).toBe('pending')
  })

  it('Content-Type en el store distinto al declarado → 400 FILE_TYPE_NOT_ALLOWED', async () => {
    const key = await pendingPdf()
    blobSdk.head.mockResolvedValue(headResult(10, 'text/html'))
    await expect(claim(key)).rejects.toMatchObject({ code: 'FILE_TYPE_NOT_ALLOWED', statusCode: 400 })
  })

  it('bytes que no son PDF aunque head diga application/pdf → 400 FILE_TYPE_NOT_ALLOWED', async () => {
    const key = await pendingPdf()
    blobSdk.head.mockResolvedValue(headResult(10, 'application/pdf'))
    blobSdk.get.mockResolvedValue(blobGetResult(Buffer.from('<html></html>')))
    await expect(claim(key)).rejects.toMatchObject({ code: 'FILE_TYPE_NOT_ALLOWED', statusCode: 400 })
  })

  it('objeto fuera del host privado del store → 400 FILE_NOT_UPLOADED y se borra', async () => {
    const key = await pendingPdf()
    blobSdk.head.mockResolvedValue(headResult(10, 'application/pdf', 'https://teststore.public.blob.vercel-storage.com/object'))
    blobSdk.get.mockResolvedValue(blobGetResult(FILE_BYTES.pdf))
    await expect(claim(key)).rejects.toMatchObject({ code: 'FILE_NOT_UPLOADED', statusCode: 400 })
    expect(blobSdk.del).toHaveBeenCalledWith([key], expect.objectContaining({ token: BLOB_TOKEN }))
    expect(blobSdk.get).not.toHaveBeenCalled()
  })

  it('BlobNotFoundError (nunca se subió) → 400 FILE_NOT_UPLOADED', async () => {
    const key = await pendingPdf()
    blobSdk.head.mockRejectedValue(new BlobNotFoundError())
    await expect(claim(key)).rejects.toMatchObject({ code: 'FILE_NOT_UPLOADED', statusCode: 400 })
  })

  it('BlobServiceNotAvailable → 503 STORAGE_UNAVAILABLE', async () => {
    const key = await pendingPdf()
    blobSdk.head.mockRejectedValue(new BlobServiceNotAvailable())
    await expect(claim(key)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE', statusCode: 503 })
  })
})

describe('POST /api/files/access — modo blob', () => {
  it('devuelve una URL presignada GET atada al pathname y válida ~5 minutos', async () => {
    const key = await pendingPdf()
    blobSdk.issueSignedToken.mockImplementation(async ({ token: _token, ...scope }: Record<string, unknown>) => fakeSignedToken(scope))
    blobSdk.presignUrl.mockResolvedValue({ presignedUrl: 'https://teststore.private.blob.vercel-storage.com/presigned' })

    const before = Date.now()
    const res = await request(app.server).post('/api/files/access').set(auth(adminToken)).send({ storageKey: key })
    const after = Date.now()

    expect(res.status).toBe(200)
    expect(res.body.data.url).toBe('https://teststore.private.blob.vercel-storage.com/presigned')

    const [tokenOptions] = blobSdk.issueSignedToken.mock.calls[0]!
    expect(tokenOptions).toMatchObject({ token: BLOB_TOKEN, pathname: key, operations: ['get'] })
    expect(tokenOptions.validUntil).toBeGreaterThanOrEqual(before + 5 * MIN)
    expect(tokenOptions.validUntil).toBeLessThanOrEqual(after + 5 * MIN)

    const [, presignOptions] = blobSdk.presignUrl.mock.calls[0]!
    expect(presignOptions).toEqual({ operation: 'get', pathname: key, access: 'private', validUntil: tokenOptions.validUntil })
    expect(res.body.data.expiresAt).toBe(new Date(tokenOptions.validUntil).toISOString())
  })
})

describe('POST /api/uploads/blob-token — getSignedToken', () => {
  const tokenRequest = (token: string, pathname: string, base = '/api/uploads') =>
    request(app.server)
      .post(`${base}/blob-token`)
      .set(auth(token))
      .send({ type: 'blob.generate-presigned-url', payload: { pathname, clientPayload: null, multipart: false } })

  beforeEach(() => {
    blobSdk.issueSignedToken.mockImplementation(async ({ token: _token, ...scope }: Record<string, unknown>) => fakeSignedToken(scope))
  })

  it('pathname sin reserva pendiente del MISMO actor → 403 y no se emite token', async () => {
    const key = await pendingPdf()

    const teammate = await tokenRequest(teammateToken, key)
    expect(teammate.status).toBe(403)
    expect(teammate.body.error.code).toBe('UPLOAD_TOKEN_FORBIDDEN')

    const unknown = await tokenRequest(adminToken, `portals/${portalId}/deal_document/2026/09/${randomUUID()}.pdf`)
    expect(unknown.status).toBe(403)

    const outsideStore = await tokenRequest(adminToken, '../otro-store/archivo.pdf')
    expect(outsideStore.status).toBe(403)

    expect(blobSdk.issueSignedToken).not.toHaveBeenCalled()
  })

  it('reserva propia → token put-only, un Content-Type, tamaño DECLARADO como máximo y ≤ 15 min', async () => {
    const key = await pendingPdf()
    const before = Date.now()
    const res = await tokenRequest(adminToken, key)
    const after = Date.now()

    expect(res.status).toBe(200)
    expect(res.body.type).toBe('blob.generate-presigned-url')
    expect(res.body.presignedUrlPayload.delegationToken).toEqual(expect.any(String))
    expect(res.body.presignedUrlPayload.signature).toEqual(expect.any(String))

    const [tokenOptions] = blobSdk.issueSignedToken.mock.calls[0]!
    expect(tokenOptions).toMatchObject({
      token: BLOB_TOKEN,
      pathname: key,
      operations: ['put'],
      allowedContentTypes: ['application/pdf'],
      maximumSizeInBytes: FILE_BYTES.pdf.length,
    })
    expect(tokenOptions.validUntil).toBeGreaterThan(before)
    expect(tokenOptions.validUntil).toBeLessThanOrEqual(after + 15 * MIN)
  })

  it('PUT de contenido en modo blob → 409 UPLOAD_MODE_MISMATCH', async () => {
    const res = await request(app.server)
      .post('/api/uploads')
      .set(auth(adminToken))
      .send({ purpose: 'deal_document', fileName: 'x.pdf', contentType: 'application/pdf', sizeBytes: 10 })
    const put = await request(app.server)
      .put(`/api/uploads/${res.body.data.uploadId}/content`)
      .set(auth(adminToken))
      .attach('file', FILE_BYTES.pdf, 'x.pdf')
    expect(put.status).toBe(409)
    expect(put.body.error.code).toBe('UPLOAD_MODE_MISMATCH')
  })
})
