import { env } from '../../config/env'
import { AppError } from '../errors'
import { deleteBlobs, headBlob, issueBlobUploadToken, presignBlobGet, readBlobHead, type BlobUploadScope } from './blob'
import { toStorageAppError, type StorageLogContext } from './errors'
import { deleteLocalObject, readLocalHead, statLocalObject } from './local'
import { buildSignedRawUrl } from './signed-url'

export * from './keys'
export * from './policy'
export * from './magic'
export { toStorageAppError, storageUnavailableError, type StorageLogContext } from './errors'
export { verifyRawSignature } from './signed-url'
export { openLocalObject, writeLocalObject } from './local'

export type StorageMode = 'blob' | 'server'

/** Validez de las URLs de lectura (presignada en blob, firmada en server). */
export const READ_URL_TTL_MS = 5 * 60 * 1000

export function isBlobConfigured(): boolean {
  return Boolean(env.BLOB_STORE_ID || env.BLOB_READ_WRITE_TOKEN)
}

let reportedUnconfigured = false

/**
 * Backend activo. En producción sin credenciales de Blob NO cae a disco: el
 * disco de una Function es efímero, y así fue como se perdieron todos los
 * archivos subidos antes de este cambio. Falla con 503 y lo loguea una vez.
 */
export function getStorageMode(): StorageMode {
  if (isBlobConfigured()) return 'blob'
  if (env.NODE_ENV === 'production') {
    if (!reportedUnconfigured) {
      reportedUnconfigured = true
      console.error('[storage] producción sin BLOB_READ_WRITE_TOKEN ni BLOB_STORE_ID: subidas y descargas deshabilitadas')
    }
    throw new AppError('STORAGE_NOT_CONFIGURED', 'El almacenamiento de archivos no está configurado', 503)
  }
  return 'server'
}

/**
 * Modo activo sin lanzar: null en producción sin credenciales. Para rutas que
 * deben responder 404 (no 503) cuando no pueden servir desde disco.
 */
export function currentStorageMode(): StorageMode | null {
  try {
    return getStorageMode()
  } catch {
    return null
  }
}

/** Host de los blobs de un store PRIVADO; un objeto fuera de él nunca se reclama. */
export const PRIVATE_BLOB_HOST_SUFFIX = '.private.blob.vercel-storage.com'

export interface StoredObjectInfo {
  size: number
  /** null en modo server: el disco no guarda metadata. */
  contentType: string | null
  /** URL del objeto en el store; null en modo server. */
  url: string | null
}

async function run<T>(context: StorageLogContext, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    throw toStorageAppError(err, context)
  }
}

export async function statObject(key: string, context: StorageLogContext): Promise<StoredObjectInfo | null> {
  if (getStorageMode() === 'blob') return run(context, () => headBlob(key))
  const size = await statLocalObject(key)
  return size === null ? null : { size, contentType: null, url: null }
}

export async function readObjectHead(key: string, length: number, context: StorageLogContext): Promise<Buffer | null> {
  if (getStorageMode() === 'blob') return run(context, () => readBlobHead(key, length))
  return readLocalHead(key, length)
}

export async function deleteObjects(keys: string[], context: StorageLogContext): Promise<void> {
  if (keys.length === 0) return
  if (getStorageMode() === 'blob') return run(context, () => deleteBlobs(keys))
  await Promise.all(keys.map((key) => deleteLocalObject(key)))
}

export interface ReadAccessUrl {
  url: string
  expiresAt: string
}

export async function createReadUrl(key: string, context: StorageLogContext, now = Date.now()): Promise<ReadAccessUrl> {
  const expiresAtMs = now + READ_URL_TTL_MS
  const url =
    getStorageMode() === 'blob'
      ? await run(context, () => presignBlobGet(key, expiresAtMs))
      : buildSignedRawUrl(key, expiresAtMs)
  return { url, expiresAt: new Date(expiresAtMs).toISOString() }
}

export async function issueUploadToken(scope: BlobUploadScope, context: StorageLogContext): ReturnType<typeof issueBlobUploadToken> {
  return run(context, () => issueBlobUploadToken(scope))
}
