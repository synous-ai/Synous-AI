/**
 * Slugs y su lista de reservados — usados tanto en el ADMIN (middleware, Edge
 * runtime, sin APIs de Node) como en la API (generación de slugs de empresa
 * contra la DB). Por eso este módulo es TypeScript puro: solo string/regex,
 * nada de `Buffer`, `crypto`, etc.
 *
 * IMPORTANTE: `SLUG_RESERVED` es la MISMA lista que usa `getSubdomain()` en
 * `apps/admin/middleware.ts` para descartar subdominios de plataforma
 * (app.*, api.*, www.*...) y la que usa `uniqueCompanySlug()` en
 * `apps/api/src/lib/slug.ts` para no asignarle esos slugs a una empresa. Si
 * divergieran, una empresa podría terminar con un slug que el middleware
 * interpreta como ruta de plataforma (o al revés) — bug real que motivó este
 * archivo (ver comentario en `getSubdomain()`).
 */
export const SLUG_RESERVED = [
  'app',
  'api',
  'www',
  'admin',
  'portal',
  'login',
  'book',
  'p',
  'c',
  'assets',
  'static',
  'mail',
  'dashboard',
] as const

/**
 * Normaliza un string a slug: minúsculas, sin acentos, solo [a-z0-9-].
 * El rango `[̀-ͯ]` son las marcas combinantes que deja NFD al descomponer
 * acentos (p.ej. "á" → "a" + U+0301); se eliminan explícitamente en vez de
 * depender solo del filtro alfanumérico siguiente.
 */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
