import {
  BlobNotFoundError,
  BlobRequestAbortedError,
  del,
  get,
  head,
  issueSignedToken,
  presignUrl,
  type IssuedSignedToken,
  type PresignPutUrlOptions,
} from '@vercel/blob'
import { env } from '../../config/env'

/**
 * ÚNICO archivo que llama al SDK de Vercel Blob. El store es PRIVADO: nada se
 * lee por URL directa, todo acceso sale de un token de delegación de corta
 * vida emitido acá.
 */

/**
 * Techo de cada llamada de red al SDK, reintentos incluidos. El SDK reintenta
 * hasta `VERCEL_BLOB_RETRIES` veces (default 10, solo configurable por env, no
 * por llamada) con backoff exponencial: sin este techo, un store degradado
 * colgaba el request —y la Function— por minutos.
 *
 * Se aborta con `abort()` sin motivo (AbortError) porque es el único error que
 * el SDK corta sin reintentar; y además se compite contra el timer, porque el
 * abort no interrumpe una espera de backoff ya en curso.
 */
const BLOB_CALL_TIMEOUT_MS = 10_000

async function withTimeout<T>(call: (abortSignal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new BlobRequestAbortedError())
    }, BLOB_CALL_TIMEOUT_MS)
  })
  try {
    return await Promise.race([call(controller.signal), timeout])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Credenciales explícitas en vez de dejar que el SDK lea process.env por su
 * cuenta: con `BLOB_STORE_ID` se usa OIDC (el SDK toma VERCEL_OIDC_TOKEN);
 * si no, el token estático, que es lo que hoy existe en Production/Preview.
 */
function authOptions(): { storeId: string } | { token: string } | Record<string, never> {
  if (env.BLOB_STORE_ID) return { storeId: env.BLOB_STORE_ID }
  if (env.BLOB_READ_WRITE_TOKEN) return { token: env.BLOB_READ_WRITE_TOKEN }
  return {}
}

export interface BlobObjectInfo {
  size: number
  contentType: string
  url: string
}

export async function headBlob(key: string): Promise<BlobObjectInfo | null> {
  try {
    const info = await withTimeout((abortSignal) => head(key, { ...authOptions(), abortSignal }))
    return { size: info.size, contentType: info.contentType, url: info.url }
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null
    throw err
  }
}

/** Primeros bytes del blob (Range) para verificar la firma del formato sin bajar el archivo entero. */
export async function readBlobHead(key: string, length: number): Promise<Buffer | null> {
  return withTimeout(async (abortSignal) => {
    const result = await get(key, {
      access: 'private',
      useCache: false,
      headers: { Range: `bytes=0-${length - 1}` },
      abortSignal,
      ...authOptions(),
    })
    if (!result || result.statusCode !== 200) return null
    const reader = result.stream.getReader()
    const chunks: Buffer[] = []
    let total = 0
    try {
      while (total < length) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(Buffer.from(value))
        total += value.byteLength
      }
    } finally {
      await reader.cancel().catch(() => undefined)
    }
    return Buffer.concat(chunks).subarray(0, length)
  })
}

export async function deleteBlobs(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  await withTimeout((abortSignal) => del(keys, { ...authOptions(), abortSignal }))
}

export async function presignBlobGet(key: string, validUntil: number): Promise<string> {
  const token = await withTimeout((abortSignal) =>
    issueSignedToken({ ...authOptions(), pathname: key, operations: ['get'], validUntil, abortSignal }),
  )
  const { presignedUrl } = await presignUrl(token, { operation: 'get', pathname: key, access: 'private', validUntil })
  return presignedUrl
}

export type BlobUploadUrlOptions = Omit<PresignPutUrlOptions, 'operation' | 'pathname' | 'onUploadCompleted'>

export interface BlobUploadScope {
  pathname: string
  contentType: string
  maxBytes: number
  validUntil: number
}

/**
 * Token de delegación SOLO `put`, atado a UN pathname, un único Content-Type
 * y el tamaño declarado en el intent. Las mismas restricciones van repetidas en
 * las opciones de la URL: el SDK exige que sean subconjunto de la delegación.
 */
export async function issueBlobUploadToken(
  scope: BlobUploadScope,
): Promise<{ token: IssuedSignedToken; urlOptions: BlobUploadUrlOptions }> {
  const constraints = {
    allowedContentTypes: [scope.contentType],
    maximumSizeInBytes: scope.maxBytes,
    validUntil: scope.validUntil,
  }
  const token = await withTimeout((abortSignal) =>
    issueSignedToken({ ...authOptions(), pathname: scope.pathname, operations: ['put'], ...constraints, abortSignal }),
  )
  return { token, urlOptions: { ...constraints, addRandomSuffix: false, allowOverwrite: false } }
}
