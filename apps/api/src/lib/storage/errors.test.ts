/**
 * Mapeo de errores del SDK de Vercel Blob a los códigos del contrato. Un error
 * de configuración no puede llegar como 503: el front lo trata como caída
 * transitoria y el usuario reintenta algo que nunca va a funcionar.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BlobAccessError, BlobError, BlobNotFoundError, BlobServiceNotAvailable, BlobStoreNotFoundError } from '@vercel/blob'
import { toStorageAppError } from './errors'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('toStorageAppError', () => {
  it('BlobError genérico por credenciales faltantes → 500 STORAGE_MISCONFIGURED', () => {
    const missing = new BlobError(
      'No blob credentials found. Pass a `token` option, set `BLOB_READ_WRITE_TOKEN`, or use `oidcToken` (or `VERCEL_OIDC_TOKEN`) with `storeId` or `BLOB_STORE_ID`.',
    )
    expect(toStorageAppError(missing, { op: 'test' })).toMatchObject({ code: 'STORAGE_MISCONFIGURED', statusCode: 500 })
    expect(toStorageAppError(new BlobError('No read-write token found.'), { op: 'test' })).toMatchObject({ code: 'STORAGE_MISCONFIGURED' })
  })

  it('acceso denegado o store inexistente → 500 STORAGE_MISCONFIGURED', () => {
    expect(toStorageAppError(new BlobAccessError(), { op: 'test' })).toMatchObject({ code: 'STORAGE_MISCONFIGURED', statusCode: 500 })
    expect(toStorageAppError(new BlobStoreNotFoundError(), { op: 'test' })).toMatchObject({ code: 'STORAGE_MISCONFIGURED' })
  })

  it('servicio no disponible → 503 STORAGE_UNAVAILABLE; not found → 404 FILE_NOT_FOUND', () => {
    expect(toStorageAppError(new BlobServiceNotAvailable(), { op: 'test' })).toMatchObject({ code: 'STORAGE_UNAVAILABLE', statusCode: 503 })
    expect(toStorageAppError(new BlobNotFoundError(), { op: 'test' })).toMatchObject({ code: 'FILE_NOT_FOUND', statusCode: 404 })
  })
})
