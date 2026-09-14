import { rm, rmdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { FastifyInstance } from 'fastify'
import request from 'supertest'
import { and, eq, inArray, or } from 'drizzle-orm'
import { db } from '../db'
import { fileUpload } from '../db/schema'

/** Firmas mínimas válidas para pasar la verificación de magic bytes. */
export const FILE_BYTES = {
  png: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('png-body')]),
  pdf: Buffer.from('%PDF-1.4\n% test document\n'),
  docx: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('docx-body')]),
  mp3: Buffer.from('ID3-audio-bytes'),
}

export interface UploadRequest {
  purpose: string
  fileName: string
  contentType: string
  bytes: Buffer
}

export interface UploadedFile {
  uploadId: string
  storageKey: string
}

/**
 * Sube un archivo por el flujo real en modo server: intent + PUT del contenido.
 * `basePath` es `/api/uploads` (equipo) o `/api/client/uploads` (cliente).
 */
export async function uploadServerFile(
  app: FastifyInstance,
  token: string,
  basePath: '/api/uploads' | '/api/client/uploads',
  file: UploadRequest,
): Promise<UploadedFile> {
  const intent = await request(app.server)
    .post(basePath)
    .set({ Authorization: `Bearer ${token}` })
    .send({ purpose: file.purpose, fileName: file.fileName, contentType: file.contentType, sizeBytes: file.bytes.length })
  if (intent.status !== 201) throw new Error(`intent ${intent.status}: ${JSON.stringify(intent.body)}`)
  const { uploadId, storageKey } = intent.body.data as UploadedFile

  const content = await request(app.server)
    .put(`${basePath}/${uploadId}/content`)
    .set({ Authorization: `Bearer ${token}` })
    .attach('file', file.bytes, { filename: file.fileName, contentType: file.contentType })
  if (content.status !== 200) throw new Error(`content ${content.status}: ${JSON.stringify(content.body)}`)
  return { uploadId, storageKey }
}

/**
 * Borra las reservas PENDIENTES de estos uploaders. La DB de test persiste
 * entre corridas y la cuota por uploader (20 reservas / 500 MB) se agotaría
 * con las que dejaron corridas anteriores del mismo owner de tests.
 */
export async function clearPendingUploads(userIds: string[], clientIds: string[] = []): Promise<void> {
  const uploaders = [
    ...(userIds.length > 0 ? [inArray(fileUpload.uploadedByUserId, userIds)] : []),
    ...(clientIds.length > 0 ? [inArray(fileUpload.uploadedByClientId, clientIds)] : []),
  ]
  if (uploaders.length === 0) return
  await db.delete(fileUpload).where(and(eq(fileUpload.status, 'pending'), or(...uploaders)))
}

/** Borra lo que los tests escribieron en `apps/api/uploads` (por portal o por key legacy). */
export async function removeTestUploads(portalIds: string[], legacyKeys: string[] = []): Promise<void> {
  const root = resolve(process.cwd(), 'uploads')
  await Promise.all([
    ...portalIds.map((id) => rm(resolve(root, 'portals', id), { recursive: true, force: true })),
    ...legacyKeys.map((key) => rm(resolve(root, key), { force: true })),
  ])
  // Solo si quedó vacío: en dev puede haber archivos de otros portales.
  await rmdir(resolve(root, 'portals')).catch(() => undefined)
}
