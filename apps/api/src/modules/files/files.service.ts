import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync, createReadStream } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { Readable } from 'node:stream'
import { put, get, del } from '@vercel/blob'

/**
 * Almacenamiento de archivos con dos backends:
 *
 *   1. **Vercel Blob (store PRIVADO)** — el de producción. Se activa solo si hay
 *      credenciales en el entorno. Los blobs privados NO son accesibles por URL
 *      directa: se leen con `get()` desde nuestra propia Function, que es
 *      justamente donde autorizamos al usuario antes de servir los bytes.
 *
 *   2. **Disco local** — fallback para `pnpm dev` sin credenciales de Vercel.
 *      NO sirve en producción: el filesystem de una Function es efímero y no se
 *      comparte entre instancias, así que lo que se sube se pierde. Era el ÚNICO
 *      backend antes de este cambio, y por eso todo archivo subido en producción
 *      (logos, materiales de onboarding, contratos) desaparecía.
 *
 * El `storageKey` es la ruta dentro del store (o el nombre de archivo en disco),
 * y es lo que se guarda en la DB. Nunca guardamos URLs: se resuelven al momento
 * de servir, igual que con `docuseal_submission_id`.
 */

const UPLOADS_DIR = join(process.cwd(), 'uploads')

/**
 * ¿Hay credenciales de Vercel Blob?
 * - `BLOB_READ_WRITE_TOKEN`: token estático, para código fuera de Vercel (dev/CI).
 * - `BLOB_STORE_ID` + `VERCEL_OIDC_TOKEN`: OIDC, lo inyecta Vercel al conectar
 *   el store al proyecto. Tiene precedencia sobre el token estático.
 */
export function isBlobConfigured(): boolean {
  return Boolean(process.env['BLOB_READ_WRITE_TOKEN'] ?? process.env['BLOB_STORE_ID'])
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.webm': 'audio/webm',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
}

function sanitize(name: string): string {
  return basename(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'archivo'
}

function mimeForKey(key: string): string {
  return MIME_BY_EXT[extname(basename(key)).toLowerCase()] ?? 'application/octet-stream'
}

export interface SavedFile {
  storageKey: string
  name: string
  mimeType: string
  sizeBytes: number
  /** Ruta de descarga en NUESTRA API (autenticada) — nunca una URL directa al store. */
  url: string
}

export async function saveUpload(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<SavedFile> {
  const storageKey = `${randomUUID()}-${sanitize(originalName)}`

  if (isBlobConfigured()) {
    // `access: 'private'` exige que el store haya sido creado como privado.
    // El pathname ya es único (uuid), así que no hace falta addRandomSuffix.
    await put(storageKey, buffer, { access: 'private', contentType: mimeType })
  } else {
    await mkdir(UPLOADS_DIR, { recursive: true })
    await writeFile(join(UPLOADS_DIR, storageKey), buffer)
  }

  return {
    storageKey,
    name: originalName,
    mimeType,
    sizeBytes: buffer.length,
    url: `/api/files/${storageKey}`,
  }
}

export interface ResolvedFile {
  stream: Readable
  mime: string
}

/**
 * Devuelve el contenido del archivo listo para streamear, o null si no existe.
 * El llamador YA debe haber autorizado al usuario: esta función no sabe de permisos.
 */
export async function readFile(key: string): Promise<ResolvedFile | null> {
  const safe = basename(key)

  if (isBlobConfigured()) {
    try {
      // `access: 'private'` es obligatorio en el get de un store privado.
      // El resultado es una unión discriminada por statusCode: solo el 200
      // trae stream (el 304 aparece al usar ifNoneMatch, que acá no usamos).
      const result = await get(safe, { access: 'private' })
      if (!result || result.statusCode !== 200) return null
      return {
        stream: Readable.fromWeb(result.stream as Parameters<typeof Readable.fromWeb>[0]),
        mime: result.blob.contentType || mimeForKey(safe),
      }
    } catch {
      // El SDK lanza si el blob no existe.
      return null
    }
  }

  const path = join(UPLOADS_DIR, safe)
  if (!existsSync(path)) return null
  return { stream: createReadStream(path), mime: mimeForKey(safe) }
}

/** Borra un archivo del store. No falla si ya no existe. */
export async function deleteFile(key: string): Promise<void> {
  const safe = basename(key)
  if (!isBlobConfigured()) return
  try {
    await del(safe)
  } catch {
    /* ya no existe */
  }
}
