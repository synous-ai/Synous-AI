import { changeRequestAttachment } from '../../db/schema'
import type { Tx } from '../../lib/audit'
import { claimUpload, prepareUploadClaim, type PreparedClaim } from '../uploads/uploads.service'
import type { StorageActor } from '../uploads/uploads.types'
import type { UploadRefDTO } from './cr.schema'

/** Propósito con el que se reservan los adjuntos de una CR (ver lib/storage/policy.ts). */
const CR_ATTACHMENT_PURPOSE = 'cr_attachment' as const

/**
 * Paso 1 (FUERA de la transacción): verifica cada key contra el store.
 *
 * Son llamadas de red — hacerlas con la transacción abierta retiene una
 * conexión del pool y el lock de la fila de la CR durante segundos. Mismo
 * patrón que `documents.service.ts`: `prepareUploadClaim` afuera,
 * `claimUpload` adentro.
 */
export async function prepareCRUploads(
  actor: StorageActor,
  uploads: readonly UploadRefDTO[] | undefined,
): Promise<PreparedClaim[]> {
  if (!uploads?.length) return []
  return Promise.all(
    uploads.map((u) =>
      prepareUploadClaim({ storageKey: u.storageKey, portalId: actor.portalId, actor, purpose: CR_ATTACHMENT_PURPOSE }),
    ),
  )
}

/**
 * Paso 2 (DENTRO de la transacción): reclama las keys y crea las filas de
 * adjunto. `commentId` cuelga el adjunto de un comentario; sin él queda a nivel
 * CR.
 *
 * Nombre, MIME y tamaño salen del ledger (`claimUpload` devuelve la fila de
 * `file_upload`), nunca del body: lo que el cliente declaró ya se validó contra
 * el objeto real al reservarlo.
 */
export async function attachCRUploads(
  tx: Tx,
  input: {
    changeRequestId: string
    commentId?: string | null
    prepared: readonly PreparedClaim[]
    actor: StorageActor
  },
): Promise<string[]> {
  if (input.prepared.length === 0) return []
  const names: string[] = []
  for (const prepared of input.prepared) {
    const upload = await claimUpload(tx, prepared)
    await tx.insert(changeRequestAttachment).values({
      changeRequestId: input.changeRequestId,
      commentId: input.commentId ?? null,
      name: upload.originalName,
      storageKey: upload.storageKey,
      mimeType: upload.contentType,
      sizeBytes: upload.sizeBytes,
      uploadedBy: input.actor.kind === 'hub' ? input.actor.userId : null,
      uploadedByClient: input.actor.kind === 'client' ? input.actor.clientId : null,
    })
    names.push(upload.originalName)
  }
  return names
}
