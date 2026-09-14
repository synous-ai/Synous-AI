import { and, asc, eq, gt, inArray, lt, sql } from 'drizzle-orm'
import { db, type DB } from '../../db'
import {
  fileUpload,
  document,
  changeRequestAttachment,
  clientAsset,
  libraryItem,
  expense,
  company,
  clientAccount,
  proposal,
} from '../../db/schema'
import type { Tx } from '../../lib/audit'
import { AppError, Errors } from '../../lib/errors'
import {
  MAGIC_BYTES_LENGTH,
  PRIVATE_BLOB_HOST_SUFFIX,
  assertUploadAllowed,
  buildStorageKey,
  deleteObjects,
  fileLargerThanDeclaredError,
  fileTypeNotAllowedError,
  getStorageMode,
  hasMagicBytesCheck,
  isStorageKey,
  issueUploadToken,
  matchesMagicBytes,
  parseStorageKey,
  readObjectHead,
  sanitizeDisplayName,
  statObject,
  writeLocalObject,
  type FilePurpose,
  type StorageLogContext,
} from '../../lib/storage'
import type { CreateUploadIntentDTO } from './uploads.schema'
import type {
  FileUploadRow,
  IncomingFilePart,
  ServerContentResultDTO,
  StorageActor,
  UploadIntentDTO,
} from './uploads.types'

type Executor = DB | Tx

const HOUR_MS = 60 * 60 * 1000
const MB = 1024 * 1024

/** Reservas `pending` más viejas que esto las borra la limpieza oportunista. */
const STALE_PENDING_MS = 24 * HOUR_MS
const STALE_CLEANUP_BATCH = 20
/**
 * Una reserva solo se puede reclamar dentro de las primeras 23 h: la hora de
 * margen con la limpieza (24 h) evita que un reclamo y un borrado corran sobre
 * la misma fila.
 */
const CLAIM_WINDOW_MS = 23 * HOUR_MS
/** Ventana para pedir el token de subida después del intent. */
const UPLOAD_TOKEN_WINDOW_MS = HOUR_MS
const UPLOAD_TOKEN_TTL_MS = 15 * 60 * 1000

/** Cuota por uploader (hub_user o client_account) de reservas sin reclamar. */
export const MAX_PENDING_UPLOADS = 20
export const MAX_PENDING_BYTES = 500 * MB

function actorLog(actor: StorageActor): StorageLogContext['actor'] {
  return actor.kind === 'hub' ? { kind: 'hub', id: actor.userId } : { kind: 'client', id: actor.clientId }
}

function uploaderIs(actor: StorageActor) {
  return actor.kind === 'hub'
    ? eq(fileUpload.uploadedByUserId, actor.userId)
    : eq(fileUpload.uploadedByClientId, actor.clientId)
}

function modeMismatch(): AppError {
  return new AppError('UPLOAD_MODE_MISMATCH', 'Esta ruta no corresponde al modo de almacenamiento activo', 409)
}

/**
 * Mismo error para "no existe", "es de otro portal/usuario", "ya se usó" o
 * "nunca se subió": distinguirlos le confirmaría a un atacante que una key
 * ajena existe.
 */
function fileNotUploaded(): AppError {
  return new AppError('FILE_NOT_UPLOADED', 'El archivo no se subió o no está disponible para este registro', 400)
}

function quotaExceeded(message: string): AppError {
  return new AppError('UPLOAD_QUOTA_EXCEEDED', message, 429, {
    maxPendingUploads: MAX_PENDING_UPLOADS,
    maxPendingBytes: MAX_PENDING_BYTES,
  })
}

// ─── 1. Intent ───────────────────────────────────────────────────────────────

/**
 * Reserva una key. Sin cuota, cualquier sesión podía crear reservas sin límite
 * (filas + tokens de subida de hasta 100 MB cada una) y llenar el store sin
 * reclamar nada nunca.
 */
export async function createUploadIntent(actor: StorageActor, input: CreateUploadIntentDTO): Promise<UploadIntentDTO> {
  const mode = getStorageMode()
  const policy = assertUploadAllowed(actor.kind, input.purpose, input.contentType, input.sizeBytes)

  await cleanupStalePendingUploads(actor.portalId)

  const storageKey = buildStorageKey(actor.portalId, input.purpose, input.contentType)
  const row = await db.transaction(async (tx) => {
    // Serializa los intents del mismo uploader: sin el lock, N requests en
    // paralelo leían la misma cuota libre y la superaban juntos.
    const uploaderLockKey = actor.kind === 'hub' ? `file_upload:hub:${actor.userId}` : `file_upload:client:${actor.clientId}`
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${uploaderLockKey}))`)

    const [usage] = await tx
      .select({
        count: sql<number>`count(*)::int`,
        bytes: sql<string>`coalesce(sum(${fileUpload.sizeBytes}), 0)`,
      })
      .from(fileUpload)
      .where(
        and(uploaderIs(actor), eq(fileUpload.status, 'pending'), gt(fileUpload.createdAt, new Date(Date.now() - STALE_PENDING_MS))),
      )
    if ((usage?.count ?? 0) >= MAX_PENDING_UPLOADS) {
      throw quotaExceeded(
        `Tenés ${MAX_PENDING_UPLOADS} subidas sin terminar. Terminá o descartá las que están en curso y probá de nuevo más tarde.`,
      )
    }
    if (Number(usage?.bytes ?? 0) + input.sizeBytes > MAX_PENDING_BYTES) {
      throw quotaExceeded('Las subidas en curso superan los 500 MB. Terminá las que están pendientes y probá de nuevo más tarde.')
    }

    const [inserted] = await tx
      .insert(fileUpload)
      .values({
        portalId: actor.portalId,
        storageKey,
        purpose: input.purpose,
        originalName: sanitizeDisplayName(input.fileName),
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        uploadedByUserId: actor.kind === 'hub' ? actor.userId : null,
        uploadedByClientId: actor.kind === 'client' ? actor.clientId : null,
      })
      .returning()
    return inserted
  })
  if (!row) throw Errors.internal('No se pudo registrar la subida')

  return { uploadId: row.id, storageKey, mode, maxSizeBytes: policy.maxBytes, contentType: row.contentType }
}

/**
 * Borra reservas `pending` de más de 24 h del portal (lote acotado). Oportunista:
 * corre en cada intent y nunca hace fallar la subida nueva.
 *
 * Primero las FILAS, con `FOR UPDATE SKIP LOCKED`, y después solo los objetos de
 * las filas que efectivamente borró. Al revés (leer, borrar objetos, borrar
 * filas) un reclamo concurrente podía marcar la fila `attached` en el medio y
 * quedarse con un registro apuntando a un objeto ya eliminado.
 */
async function cleanupStalePendingUploads(portalId: string): Promise<void> {
  try {
    const stale = db
      .select({ id: fileUpload.id })
      .from(fileUpload)
      .where(
        and(
          eq(fileUpload.portalId, portalId),
          eq(fileUpload.status, 'pending'),
          lt(fileUpload.createdAt, new Date(Date.now() - STALE_PENDING_MS)),
        ),
      )
      .orderBy(asc(fileUpload.createdAt))
      .limit(STALE_CLEANUP_BATCH)
      .for('update', { skipLocked: true })

    const deleted = await db
      .delete(fileUpload)
      .where(and(inArray(fileUpload.id, stale), eq(fileUpload.status, 'pending')))
      .returning({ storageKey: fileUpload.storageKey })
    if (deleted.length === 0) return

    await deleteObjects(deleted.map((d) => d.storageKey), { op: 'cleanup-stale', portalId })
  } catch {
    // deleteObjects ya logueó el motivo; el objeto queda huérfano pero sin fila que lo reclame.
  }
}

// ─── 2. Token de subida directa (modo blob) ─────────────────────────────────

/**
 * Implementación de `getSignedToken` para `handleUploadPresigned`. El pathname
 * lo manda el browser: solo se firma si coincide con una reserva `pending` del
 * MISMO actor, en su portal y reciente. Sin esto, cualquier sesión podía pedir
 * un token para escribir sobre la key de otro usuario.
 */
export async function getSignedUploadToken(actor: StorageActor, pathname: string): ReturnType<typeof issueUploadToken> {
  if (getStorageMode() !== 'blob') throw modeMismatch()
  const forbidden = new AppError('UPLOAD_TOKEN_FORBIDDEN', 'No hay una subida pendiente para ese archivo', 403)
  if (!isStorageKey(pathname)) throw forbidden

  const [row] = await db
    .select()
    .from(fileUpload)
    .where(
      and(
        eq(fileUpload.storageKey, pathname),
        eq(fileUpload.portalId, actor.portalId),
        eq(fileUpload.status, 'pending'),
        uploaderIs(actor),
        gt(fileUpload.createdAt, new Date(Date.now() - UPLOAD_TOKEN_WINDOW_MS)),
      ),
    )
    .limit(1)
  if (!row) throw forbidden

  return issueUploadToken(
    {
      pathname,
      contentType: row.contentType,
      // El tamaño declarado (ya ≤ máximo del propósito), no el máximo: la cuota
      // se calculó con él.
      maxBytes: row.sizeBytes,
      validUntil: Date.now() + UPLOAD_TOKEN_TTL_MS,
    },
    { op: 'issue-upload-token', storageKey: pathname, portalId: actor.portalId, purpose: row.purpose, actor: actorLog(actor) },
  )
}

// ─── 3. Contenido en modo server (solo dev local) ───────────────────────────

export async function findPendingUploadForActor(
  actor: StorageActor,
  uploadId: string,
): Promise<{ row: FileUploadRow; maxBytes: number }> {
  if (getStorageMode() !== 'server') throw modeMismatch()
  const [row] = await db
    .select()
    .from(fileUpload)
    .where(
      and(eq(fileUpload.id, uploadId), eq(fileUpload.portalId, actor.portalId), eq(fileUpload.status, 'pending'), uploaderIs(actor)),
    )
    .limit(1)
  if (!row) throw Errors.notFound('Subida no encontrada')
  return { row, maxBytes: row.sizeBytes }
}

export async function receiveServerContent(
  actor: StorageActor,
  row: FileUploadRow,
  part: IncomingFilePart | undefined,
): Promise<ServerContentResultDTO> {
  if (!part) throw Errors.badRequest('No se envió ningún archivo')
  const context: StorageLogContext = { op: 'server-content', storageKey: row.storageKey, portalId: row.portalId, purpose: row.purpose, actor: actorLog(actor) }

  let sizeBytes: number
  try {
    sizeBytes = await writeLocalObject(row.storageKey, part.file)
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'FST_REQ_FILE_TOO_LARGE') throw fileLargerThanDeclaredError(row.sizeBytes)
    if (code === 'EEXIST') throw new AppError('UPLOAD_ALREADY_SENT', 'Este archivo ya se subió', 409)
    throw err
  }

  const reject = async (error: AppError): Promise<never> => {
    await deleteObjects([row.storageKey], context)
    throw error
  }
  if (part.file.truncated || sizeBytes > row.sizeBytes) return reject(fileLargerThanDeclaredError(row.sizeBytes))
  if (hasMagicBytesCheck(row.contentType)) {
    const head = await readObjectHead(row.storageKey, MAGIC_BYTES_LENGTH, context)
    if (!head || !matchesMagicBytes(row.contentType, head)) return reject(fileTypeNotAllowedError())
  }

  return { uploadId: row.id, storageKey: row.storageKey, sizeBytes }
}

// ─── 4. Reclamo desde un registro de dominio ────────────────────────────────

export interface ClaimUploadInput {
  storageKey: string
  portalId: string
  actor: StorageActor
  purpose: FilePurpose
}

/** Resultado de verificar el objeto ANTES de abrir la transacción del registro. */
export interface PreparedClaim extends ClaimUploadInput {
  /** null: no hay una reserva pendiente de este actor para la key (el reclamo va a fallar). */
  uploadId: string | null
  /** Tamaño real del objeto en el store. */
  sizeBytes: number
}

function claimablePendingRow(input: ClaimUploadInput) {
  return and(
    eq(fileUpload.storageKey, input.storageKey),
    eq(fileUpload.portalId, input.portalId),
    eq(fileUpload.purpose, input.purpose),
    eq(fileUpload.status, 'pending'),
    uploaderIs(input.actor),
    gt(fileUpload.createdAt, new Date(Date.now() - CLAIM_WINDOW_MS)),
  )
}

/**
 * Paso 1 del reclamo, FUERA de la transacción: verifica que el objeto exista,
 * esté en el host privado, no supere el tamaño declarado, tenga el tipo
 * declarado y la firma del formato. Son llamadas de red (head + Range GET, con
 * reintentos del SDK): hacerlas con la transacción abierta retenía una conexión
 * del pool y el lock de la fila durante segundos. Es seguro verificar antes
 * porque los objetos son inmutables (`allowOverwrite: false`).
 *
 * Si no hay reserva pendiente del actor NO lanza: puede ser una key que el
 * registro ya tiene guardada (update sin cambios). La decisión de reclamar se
 * toma dentro de la transacción, con la fila del registro bloqueada.
 */
export async function prepareUploadClaim(input: ClaimUploadInput): Promise<PreparedClaim> {
  const unverified: PreparedClaim = { ...input, uploadId: null, sizeBytes: 0 }
  const parsed = parseStorageKey(input.storageKey)
  if (!parsed || parsed.portalId !== input.portalId || parsed.purpose !== input.purpose) return unverified
  if (input.actor.portalId !== input.portalId) return unverified

  const [row] = await db.select().from(fileUpload).where(claimablePendingRow(input)).limit(1)
  if (!row) return unverified

  const context: StorageLogContext = {
    op: 'claim',
    storageKey: input.storageKey,
    portalId: input.portalId,
    purpose: input.purpose,
    actor: actorLog(input.actor),
  }
  const info = await statObject(input.storageKey, context)
  if (!info) throw fileNotUploaded()

  if (info.url !== null && !new URL(info.url).hostname.endsWith(PRIVATE_BLOB_HOST_SUFFIX)) {
    // Un objeto público sería legible por cualquiera con la URL: nunca se vincula.
    await deleteObjects([input.storageKey], context).catch(() => undefined)
    throw fileNotUploaded()
  }
  if (info.size > row.sizeBytes) throw fileLargerThanDeclaredError(row.sizeBytes)
  if (info.contentType !== null && info.contentType !== row.contentType) throw fileTypeNotAllowedError()
  if (hasMagicBytesCheck(row.contentType)) {
    const head = await readObjectHead(input.storageKey, MAGIC_BYTES_LENGTH, context)
    if (!head || !matchesMagicBytes(row.contentType, head)) throw fileTypeNotAllowedError()
  }

  return { ...input, uploadId: row.id, sizeBytes: info.size }
}

/**
 * Paso 2 del reclamo, DENTRO de la transacción del registro y solo cuando la
 * key es nueva o cambió: vincula la reserva verificada a UN registro.
 *
 * Sin este paso, los endpoints de dominio aceptaban cualquier string como
 * storageKey: un usuario podía apuntar su registro a la key de otro portal y
 * heredar el acceso de lectura vía files.authz.
 *
 * El `FOR UPDATE` + el `WHERE status = 'pending'` del update impiden que dos
 * registros reclamen la misma key en paralelo.
 */
export async function claimUpload(executor: Executor, prepared: PreparedClaim | null): Promise<FileUploadRow> {
  if (!prepared?.uploadId) throw fileNotUploaded()

  const [row] = await executor
    .select({ id: fileUpload.id })
    .from(fileUpload)
    .where(and(eq(fileUpload.id, prepared.uploadId), claimablePendingRow(prepared)))
    .limit(1)
    .for('update')
  if (!row) throw fileNotUploaded()

  const [attached] = await executor
    .update(fileUpload)
    .set({ status: 'attached', attachedAt: new Date(), sizeBytes: prepared.sizeBytes })
    .where(and(eq(fileUpload.id, row.id), eq(fileUpload.status, 'pending')))
    .returning()
  if (!attached) throw fileNotUploaded()
  return attached
}

/** ¿Hay que reclamar? Solo si la key es nueva o cambió respecto de la guardada. */
export function isNewStorageKey(next: string | null | undefined, previous: string | null | undefined): next is string {
  return Boolean(next) && next !== previous
}

// ─── 7. Limpieza del archivo reemplazado ─────────────────────────────────────

/** ¿La key sigue referenciada por algún registro, de cualquier portal? */
async function isStorageKeyReferenced(key: string): Promise<boolean> {
  const checks = await Promise.all([
    db.select({ id: document.id }).from(document).where(eq(document.storageKey, key)).limit(1),
    db.select({ id: changeRequestAttachment.id }).from(changeRequestAttachment).where(eq(changeRequestAttachment.storageKey, key)).limit(1),
    db.select({ id: clientAsset.id }).from(clientAsset).where(eq(clientAsset.storageKey, key)).limit(1),
    db.select({ id: libraryItem.id }).from(libraryItem).where(eq(libraryItem.storageKey, key)).limit(1),
    db.select({ id: expense.id }).from(expense).where(eq(expense.storageKey, key)).limit(1),
    db.select({ id: company.id }).from(company).where(eq(company.brandLogoKey, key)).limit(1),
    db.select({ id: clientAccount.id }).from(clientAccount).where(eq(clientAccount.brandLogoKey, key)).limit(1),
    db.select({ id: proposal.id }).from(proposal).where(sql`${proposal.content}->>'logoKey' = ${key}`).limit(1),
  ])
  return checks.some((rows) => rows.length > 0)
}

/**
 * Después del COMMIT de un registro que cambió de archivo: borra el objeto
 * viejo y su fila del ledger. Best-effort — un fallo no revierte el cambio ya
 * confirmado, solo deja un huérfano logueado.
 *
 * Solo toca keys con fila en el ledger del MISMO portal: las legacy nunca se
 * borran (no hay dueño registrado), y una key todavía referenciada en otro
 * lado tampoco. Archivar un registro NO pasa por acá, y los comprobantes de
 * gastos tampoco: record_history conserva la key vieja y es parte del rastro
 * contable.
 */
export async function releaseReplacedUpload(portalId: string, previousKey: string | null | undefined, nextKey: string | null | undefined): Promise<void> {
  if (!previousKey || previousKey === nextKey || !isStorageKey(previousKey)) return
  try {
    const [row] = await db
      .select({ id: fileUpload.id })
      .from(fileUpload)
      .where(and(eq(fileUpload.storageKey, previousKey), eq(fileUpload.portalId, portalId)))
      .limit(1)
    if (!row || (await isStorageKeyReferenced(previousKey))) return

    await deleteObjects([previousKey], { op: 'release-replaced', storageKey: previousKey, portalId })
    await db.delete(fileUpload).where(eq(fileUpload.id, row.id))
  } catch {
    console.warn('[storage] no se pudo limpiar el archivo reemplazado', { storageKey: previousKey, portalId })
  }
}
