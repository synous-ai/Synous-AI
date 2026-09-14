import type { ApiEnvelope } from '@synous/api-client'

/**
 * Tope de páginas ante un backend que por algún bug nunca deje de devolver
 * `nextCursor` — evita un loop infinito en el cliente.
 */
const MAX_PAGES = 50

/**
 * El `apiList` de un api-client: `@/lib/api` en el admin, `@portal/lib/api` en
 * el portal de cliente. El helper recibe la función en vez de importar un
 * cliente para que los dos contextos, cada uno con su token, compartan esta
 * única implementación.
 */
export type ListFetcher = <T>(path: string) => Promise<ApiEnvelope<T>>

export interface AllPages<T> {
  items: T[]
  /** `meta` de la primera página: agregados del filtro completo (ej. `totalPeriod`), no del corte. */
  meta: Record<string, unknown> | undefined
}

/**
 * Sigue el cursor de un endpoint paginado (`{ data, meta: { nextCursor } }`)
 * hasta agotarlo, y devuelve todos los items concatenados junto al `meta`.
 *
 * Los hooks de listado pedían una sola página y nunca seguían el cursor: a
 * partir del registro #101 la lista se veía "completa" pero faltaban filas, sin
 * ningún indicio para el usuario. `usePagination` solo pagina en memoria sobre
 * lo que ya llegó — no alcanza al backend por más páginas.
 *
 * @param list      `apiList` del cliente del contexto (admin o portal).
 * @param basePath  Path del endpoint, con o sin querystring propia (ej: '/api/deals').
 * @param limit     Tamaño de página a pedir en cada request (default 100, el máximo del backend).
 */
export async function fetchAllPagesWithMeta<T>(list: ListFetcher, basePath: string, limit = 100): Promise<AllPages<T>> {
  const items: T[] = []
  let meta: Record<string, unknown> | undefined
  let cursor: string | undefined
  const sep = basePath.includes('?') ? '&' : '?'

  for (let page = 0; page < MAX_PAGES; page++) {
    const path = `${basePath}${sep}limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    const res = await list<T[]>(path)
    items.push(...res.data)
    if (page === 0) meta = res.meta
    const nextCursor = res.meta?.nextCursor
    if (typeof nextCursor !== 'string' || !nextCursor) break
    cursor = nextCursor
  }

  return { items, meta }
}

/** `fetchAllPagesWithMeta` para los listados que no usan `meta`. */
export async function fetchAllPages<T>(list: ListFetcher, basePath: string, limit = 100): Promise<T[]> {
  return (await fetchAllPagesWithMeta<T>(list, basePath, limit)).items
}
