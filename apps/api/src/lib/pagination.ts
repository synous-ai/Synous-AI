import { and, desc, eq, gt, lt, or } from 'drizzle-orm'
import type { Column } from 'drizzle-orm'

/**
 * Paginación basada en cursor (no offset) usando (created_at DESC, id DESC).
 * CUID2 no es numérico ni ordenable, por eso el cursor es el par (createdAt, id).
 * Cursor: base64url de "ISO8601|cuid2"
 */

/** Forma de una columna `date` ('YYYY-MM-DD') para `decodeTextCursor`. */
export const ISO_DATE_CURSOR = /^\d{4}-\d{2}-\d{2}$/

export interface CursorRow {
  createdAt: Date | string
  id: string
}

export function encodeCursor(row: CursorRow): string {
  const iso = row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt
  return Buffer.from(`${iso}|${row.id}`).toString('base64url')
}

export function decodeCursor(cursor?: string): { createdAt: Date; id: string } | undefined {
  if (!cursor) return undefined
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8')
    const sep = raw.lastIndexOf('|')
    if (sep === -1) return undefined
    const isoStr = raw.slice(0, sep)
    const id = raw.slice(sep + 1)
    const createdAt = new Date(isoStr)
    if (!id || isNaN(createdAt.getTime())) return undefined
    return { createdAt, id }
  } catch {
    return undefined
  }
}

/**
 * Variante de `decodeCursor` para listados ordenados por una columna `date` o de
 * texto (fecha de gasto, email). El valor vuelve tal cual, SIN pasar por `Date`:
 * un `Date` de 'YYYY-MM-DD' serializado por el driver lleva la zona horaria del
 * proceso y Postgres lo castea a otro día. `pattern` descarta un cursor cuyo valor
 * no tiene la forma de la columna: manipulado, llegaría a Postgres como una fecha
 * inválida y el listado respondería 500 en vez de ignorarlo.
 */
export function decodeTextCursor(cursor?: string, pattern?: RegExp): { createdAt: string; id: string } | undefined {
  if (!cursor) return undefined
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8')
    const sep = raw.lastIndexOf('|')
    if (sep <= 0) return undefined
    const value = raw.slice(0, sep)
    const id = raw.slice(sep + 1)
    if (!id || (pattern && !pattern.test(value))) return undefined
    return { createdAt: value, id }
  } catch {
    return undefined
  }
}

/**
 * Builds the WHERE clause for cursor-based pagination on (sortCol, id) in the given direction.
 * DESC (default): WHERE (sort, id) < (cursor.value, cursor.id)
 *   = WHERE sort < cursor.value OR (sort = cursor.value AND id < cursor.id)
 * ASC: la misma condición con `>`.
 */
export function cursorWhere(
  sortCol: Column,
  idCol: Column,
  cursor: { createdAt: Date | string; id: string },
  direction: 'asc' | 'desc' = 'desc',
) {
  const past = direction === 'desc' ? lt : gt
  return or(past(sortCol, cursor.createdAt), and(eq(sortCol, cursor.createdAt), past(idCol, cursor.id)))
}

/**
 * Post-procesa las filas resultado de un `.limit(limit + 1)` para producir
 * el resultado paginado final: corta la fila extra y calcula nextCursor.
 *
 * Uso:
 *   const rows = await db.select().from(table).orderBy(desc(table.createdAt), desc(table.id)).limit(query.limit + 1)
 *   return paginateRows(rows, query.limit)
 */
export function paginateRows<T extends CursorRow>(rows: T[], limit: number): Paginated<T>
/** `keyOf` extrae el par (orden, id) cuando el listado no ordena por `createdAt` de la fila. */
export function paginateRows<T>(rows: T[], limit: number, keyOf: (row: T) => CursorRow): Paginated<T>
export function paginateRows<T>(rows: T[], limit: number, keyOf?: (row: T) => CursorRow): Paginated<T> {
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const last = items.at(-1)
  const key = last === undefined ? undefined : keyOf ? keyOf(last) : (last as unknown as CursorRow)
  return { items, nextCursor: hasMore && key ? encodeCursor(key) : null }
}

export interface Paginated<T> {
  items: T[]
  nextCursor: string | null
}
