import { and, desc, eq, lt, or } from 'drizzle-orm'
import type { Column } from 'drizzle-orm'

/**
 * Paginación basada en cursor (no offset) usando (created_at DESC, id DESC).
 * CUID2 no es numérico ni ordenable, por eso el cursor es el par (createdAt, id).
 * Cursor: base64url de "ISO8601|cuid2"
 */

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
 * Builds the WHERE clause for cursor-based pagination on (createdAt DESC, id DESC).
 * Equivalent to: WHERE (created_at, id) < (cursor.createdAt, cursor.id)
 *   = WHERE created_at < cursor.createdAt OR (created_at = cursor.createdAt AND id < cursor.id)
 */
export function cursorWhere(
  createdAtCol: Column,
  idCol: Column,
  cursor: { createdAt: Date; id: string },
) {
  return or(
    lt(createdAtCol, cursor.createdAt),
    and(eq(createdAtCol, cursor.createdAt), lt(idCol, cursor.id)),
  )
}

/**
 * Post-procesa las filas resultado de un `.limit(limit + 1)` para producir
 * el resultado paginado final: corta la fila extra y calcula nextCursor.
 *
 * Uso:
 *   const rows = await db.select().from(table).orderBy(desc(table.createdAt), desc(table.id)).limit(query.limit + 1)
 *   return paginateRows(rows, query.limit)
 */
export function paginateRows<T extends CursorRow>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const last = items.at(-1)
  return { items, nextCursor: hasMore && last ? encodeCursor(last) : null }
}
