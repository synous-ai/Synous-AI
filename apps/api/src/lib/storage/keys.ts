import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { FILE_PURPOSES, type FilePurpose } from './purposes'
import { extensionForContentType } from './policy'

const PORTAL_SEGMENT = '[A-Za-z0-9_-]{1,64}'
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/** `portals/{portalId}/{purpose}/{yyyy}/{mm}/{uuid}.{ext}` — generada SOLO por el server. */
const STORAGE_KEY_RE = new RegExp(
  `^portals/(${PORTAL_SEGMENT})/(${FILE_PURPOSES.join('|')})/(\\d{4})/(\\d{2})/${UUID}\\.([a-z0-9]{2,5})$`,
)

/**
 * Keys planas de antes del ledger (`<uuid>-<nombre>`). Siguen legibles, pero
 * nunca se pueden reclamar: no tienen dueño registrado. Sin `/` ni `..`, así
 * que no pueden escapar del directorio de uploads en modo server.
 */
const LEGACY_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/

export interface ParsedStorageKey {
  portalId: string
  purpose: FilePurpose
}

export function parseStorageKey(key: string): ParsedStorageKey | null {
  const match = STORAGE_KEY_RE.exec(key)
  if (!match) return null
  return { portalId: match[1]!, purpose: match[2] as FilePurpose }
}

export function isStorageKey(key: string): boolean {
  return STORAGE_KEY_RE.test(key)
}

export function isLegacyStorageKey(key: string): boolean {
  return LEGACY_KEY_RE.test(key) && !key.includes('..')
}

/** Key con forma válida para leer (nueva o legacy). Cualquier otra cosa no toca DB ni storage. */
export function isReadableStorageKey(key: string): boolean {
  return isStorageKey(key) || isLegacyStorageKey(key)
}

export function buildStorageKey(portalId: string, purpose: FilePurpose, contentType: string, now = new Date()): string {
  const ext = extensionForContentType(contentType)
  if (!ext) throw new Error(`Content-Type sin extensión registrada: ${contentType}`)
  if (!new RegExp(`^${PORTAL_SEGMENT}$`).test(portalId)) throw new Error('portalId con formato inesperado')
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `portals/${portalId}/${purpose}/${yyyy}/${mm}/${randomUUID()}.${ext}`
}

/** Nombre para mostrar: sin rutas ni caracteres de control, ≤ 200. */
export function sanitizeDisplayName(name: string): string {
  const cleaned = basename(name.replace(/\\/g, '/'))
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim()
    .slice(0, 200)
  return cleaned || 'archivo'
}
