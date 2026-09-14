import type { Readable } from 'node:stream'
import type { fileUpload } from '../../db/schema'
import type { StorageMode } from '../../lib/storage'

/**
 * Quién sube o lee un archivo. Lo arman los routers desde la sesión ya
 * verificada (hub_user o client_account); los services nunca lo derivan del body.
 */
export type StorageActor =
  | { kind: 'hub'; userId: string; portalId: string }
  | { kind: 'client'; clientId: string; portalId: string }

export type FileUploadRow = typeof fileUpload.$inferSelect

export interface UploadIntentDTO {
  uploadId: string
  storageKey: string
  mode: StorageMode
  maxSizeBytes: number
  contentType: string
}

export interface ServerContentResultDTO {
  uploadId: string
  storageKey: string
  sizeBytes: number
}

/** Stream de un archivo multipart ya abierto (subset de @fastify/multipart). */
export interface IncomingFilePart {
  file: Readable & { truncated: boolean }
}
