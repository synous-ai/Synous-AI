import { CHANGE_REQUEST_STATUSES, type ChangeRequestBucket, type ChangeRequestStatus } from '@synous/shared'

/**
 * Traducción bucket → estados, derivada del catálogo compartido.
 *
 * Se calcula UNA vez al cargar el módulo para que los contadores se resuelvan
 * en SQL (un `count(*) FILTER`) y no trayendo filas a memoria: el bucket
 * depende SOLO del estado, así que el índice es estático.
 *
 * Vive acá y no duplicado en `cr.service.ts` y `client-cr.service.ts`: las dos
 * copias eran idénticas salvo por el salteo de `draft`, y esa diferencia es
 * justamente lo que expresa `excludeDraft` — para el cliente un borrador del
 * equipo no existe, ni siquiera como número en un contador.
 */
export function bucketIndex(
  bucketOf: (status: ChangeRequestStatus) => ChangeRequestBucket,
  opts: { excludeDraft?: boolean } = {},
): Record<ChangeRequestBucket, ChangeRequestStatus[]> {
  const index: Record<ChangeRequestBucket, ChangeRequestStatus[]> = { needs_action: [], in_review: [], resolved: [] }
  for (const status of CHANGE_REQUEST_STATUSES) {
    if (opts.excludeDraft && status === 'draft') continue
    index[bucketOf(status)].push(status)
  }
  return index
}
