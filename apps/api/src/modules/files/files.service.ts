import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync, createReadStream } from 'node:fs'
import { join, basename, extname } from 'node:path'

/** Almacenamiento de archivos en disco local (alternativa a R2 para desarrollo). */
const UPLOADS_DIR = join(process.cwd(), 'uploads')

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
}

function sanitize(name: string): string {
  return basename(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'archivo'
}

export interface SavedFile {
  storageKey: string
  name: string
  mimeType: string
  sizeBytes: number
  url: string
}

export async function saveUpload(buffer: Buffer, originalName: string, mimeType: string): Promise<SavedFile> {
  await mkdir(UPLOADS_DIR, { recursive: true })
  const storageKey = `${randomUUID()}-${sanitize(originalName)}`
  await writeFile(join(UPLOADS_DIR, storageKey), buffer)
  return { storageKey, name: originalName, mimeType, sizeBytes: buffer.length, url: `/api/files/${storageKey}` }
}

export function resolveFile(key: string): { path: string; mime: string } | null {
  const safe = basename(key)
  const path = join(UPLOADS_DIR, safe)
  if (!existsSync(path)) return null
  return { path, mime: MIME_BY_EXT[extname(safe).toLowerCase()] ?? 'application/octet-stream' }
}

export function fileStream(path: string) {
  return createReadStream(path)
}
