import {
  BlobAccessError,
  BlobContentTypeNotAllowedError,
  BlobError,
  BlobFileTooLargeError,
  BlobNotFoundError,
  BlobRequestAbortedError,
  BlobServiceNotAvailable,
  BlobServiceRateLimited,
  BlobStoreNotFoundError,
  BlobStoreSuspendedError,
  BlobUnknownError,
} from '@vercel/blob'
import { AppError } from '../errors'

/**
 * Contexto de log de una operación de storage. Nunca incluye tokens, URLs
 * presignadas ni firmas: solo lo necesario para correlacionar el incidente.
 */
export interface StorageLogContext {
  op: string
  storageKey?: string
  portalId?: string
  purpose?: string
  actor?: { kind: 'hub' | 'client'; id: string }
}

export function storageUnavailableError(): AppError {
  return new AppError('STORAGE_UNAVAILABLE', 'El almacenamiento de archivos no está disponible. Probá de nuevo en unos minutos.', 503)
}

const NETWORK_ERROR_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE'])

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return true
  const code = (err as { code?: unknown }).code ?? (err.cause as { code?: unknown } | undefined)?.code
  if (typeof code === 'string' && (NETWORK_ERROR_CODES.has(code) || code.startsWith('UND_ERR'))) return true
  return err instanceof TypeError && /fetch failed/i.test(err.message)
}

/**
 * El SDK tira un BlobError genérico cuando no encuentra credenciales. No es una
 * caída transitoria: reintentar no lo arregla, así que no puede disfrazarse de 503.
 */
const MISSING_CREDENTIALS_MESSAGES = ['No blob credentials found', 'No read-write token found', 'no storeId was found']

function isMissingCredentialsError(err: unknown): boolean {
  return err instanceof BlobError && MISSING_CREDENTIALS_MESSAGES.some((m) => err.message.includes(m))
}

function log(level: 'warn' | 'error', message: string, context: StorageLogContext, err: unknown): void {
  const errorName = err instanceof Error ? err.constructor.name : typeof err
  console[level](`[storage] ${message}`, { ...context, error: errorName })
}

/** Traduce cualquier error del SDK / red al AppError del contrato. Ya lo loguea. */
export function toStorageAppError(err: unknown, context: StorageLogContext): AppError {
  if (err instanceof AppError) return err
  if (err instanceof BlobNotFoundError) return new AppError('FILE_NOT_FOUND', 'Archivo no encontrado', 404)
  if (err instanceof BlobContentTypeNotAllowedError) return new AppError('FILE_TYPE_NOT_ALLOWED', 'Tipo de archivo no permitido', 400)
  if (err instanceof BlobFileTooLargeError) return new AppError('FILE_TOO_LARGE', 'El archivo supera el máximo permitido', 400)
  if (err instanceof BlobAccessError || err instanceof BlobStoreNotFoundError || isMissingCredentialsError(err)) {
    // Credenciales o store mal configurados: no se arregla reintentando.
    log('error', 'store mal configurado o credenciales inválidas', context, err)
    return new AppError('STORAGE_MISCONFIGURED', 'El almacenamiento de archivos está mal configurado', 500)
  }
  if (
    err instanceof BlobServiceNotAvailable ||
    err instanceof BlobServiceRateLimited ||
    err instanceof BlobRequestAbortedError ||
    err instanceof BlobUnknownError ||
    err instanceof BlobStoreSuspendedError ||
    isNetworkError(err)
  ) {
    log('warn', 'servicio de storage no disponible', context, err)
    return storageUnavailableError()
  }
  log('error', 'error inesperado de storage', context, err)
  return storageUnavailableError()
}
