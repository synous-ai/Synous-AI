import { and, eq, ne } from 'drizzle-orm'
import { slugify, SLUG_RESERVED } from '@synous/shared'
import { company } from '../db/schema'
import type { Tx } from './audit'

// `slugify` y `SLUG_RESERVED` viven en `@synous/shared` (no acá) porque
// `apps/admin/middleware.ts` también los necesita en runtime Edge (sin APIs
// de Node) para descartar subdominios de plataforma (app.*, api.*, www.*...)
// antes de tratarlos como tenant. Reexportamos para no romper los imports
// existentes dentro de la API (`from '../../lib/slug'`) — ver el comentario
// en `packages/shared/src/slug.ts` sobre por qué la lista es compartida.
export { slugify, SLUG_RESERVED }

/**
 * true si `slug` ya está en uso por otra empresa — GLOBAL, sin filtrar por
 * portal. Los subdominios (`<slug>.synousai.com`) son globales y
 * `getBrandingBySlug()` resuelve por `company.slug` sin filtrar por portal,
 * así que la unicidad tiene que ser global para que ese lookup sea
 * determinista. `portalId` ya no se usa acá (antes filtraba por portal, lo
 * que permitía colisiones de slug entre portales distintos), pero se
 * mantiene en la firma de `uniqueCompanySlug` para no romper a sus llamadores.
 */
async function slugTaken(tx: Tx, slug: string, excludeCompanyId?: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: company.id })
    .from(company)
    .where(excludeCompanyId ? and(eq(company.slug, slug), ne(company.id, excludeCompanyId)) : eq(company.slug, slug))
    .limit(1)
  return !!row
}

/**
 * Genera un slug único GLOBAL de empresa a partir de su nombre.
 *
 * No se puede confiar solo en el UNIQUE(slug) de la DB: necesitamos probar
 * candidatos hasta encontrar uno libre ANTES del insert/update (y también
 * evitar los reservados, que la constraint de DB no conoce). Si el nombre se
 * queda vacío al slugificar (p.ej. solo símbolos/emoji), usamos "empresa"
 * como base para no insertar un slug vacío.
 *
 * `portalId` se mantiene en la firma por compatibilidad con los llamadores
 * existentes (`createCompany`, `backfill-company-slugs.ts`), pero ya NO se
 * usa para acotar la unicidad — ver comentario de `slugTaken`.
 *
 * `excludeCompanyId` sirve para revalidar el slug de una empresa existente
 * sin chocar contra su propia fila (no se usa hoy porque el slug no se
 * regenera al renombrar, pero lo dejamos listo para ese caso).
 */
export async function uniqueCompanySlug(
  tx: Tx,
  _portalId: string,
  name: string,
  excludeCompanyId?: string,
): Promise<string> {
  const base = slugify(name) || 'empresa'
  const reserved: readonly string[] = SLUG_RESERVED

  let candidate = base
  let suffix = 1
  for (;;) {
    if (!reserved.includes(candidate) && !(await slugTaken(tx, candidate, excludeCompanyId))) {
      return candidate
    }
    suffix += 1
    candidate = `${base}-${suffix}`
  }
}
