/**
 * Formato de respuesta estándar de la API.
 * Éxito: `{ data, meta? }` — Error: `{ error: { code, message, details? } }`.
 */

export interface Meta {
  /** cursor para la siguiente página (paginación basada en cursor, no offset) */
  nextCursor?: string | null
  total?: number
  [key: string]: unknown
}

export function ok<T>(data: T, meta?: Meta): { data: T; meta?: Meta } {
  return meta ? { data, meta } : { data }
}
