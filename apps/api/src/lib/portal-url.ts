/**
 * portal-url.ts — Construcción de URLs públicas del Client Portal.
 *
 * IMPORTANTE — de dónde sale la base:
 * El Client Portal NO es una app aparte: lo sirve la misma app Next de `apps/admin`
 * bajo `/portal/*` (ver apps/admin/middleware.ts). Por eso la base es `ADMIN_URL`.
 *
 * `CLIENT_PORTAL_URL` NO se usa acá a propósito: hoy es solamente un origin de
 * CORS en app.ts, y apunta a `apps/client-portal`, que quedó legacy. Usarlo para
 * armar los links del email mandaría a los clientes a una app que no es la que
 * está desplegada.
 *
 * White-label: si el `client_account` tiene `brandSlug`, el portal se sirve en
 * `/c/<slug>/*`, que el middleware reescribe a `/portal/*` seteando la cookie de
 * tenant. Sin slug, se usa `/portal/*` directo.
 */
import { env } from '../config/env'

const DEV_FALLBACK = 'http://localhost:3000'
let warnedMissingBase = false

/**
 * Base sin barra final. Si no hay `ADMIN_URL` cae a localhost, que en dev es lo
 * correcto pero en producción mandaría a los clientes un link muerto.
 *
 * Por eso, si además hay `RESEND_API_KEY` (o sea: los emails SALEN de verdad),
 * se loguea un error una sola vez. Sin este aviso la falla es muda — los emails
 * se mandan igual, con un link a localhost, y nos enteramos por el cliente.
 */
function baseUrl(): string {
  if (!env.ADMIN_URL) {
    if (env.RESEND_API_KEY && !warnedMissingBase) {
      warnedMissingBase = true
      console.error(
        '[portal-url] ADMIN_URL no está configurada pero RESEND_API_KEY sí: ' +
          `los emails al cliente van a salir con links a ${DEV_FALLBACK}, que no es accesible para ellos.`,
      )
    }
    return DEV_FALLBACK
  }
  return env.ADMIN_URL.replace(/\/+$/, '')
}

/** Prefijo del portal según sea white-label (`/c/<slug>`) o genérico (`/portal`). */
function portalPrefix(brandSlug?: string | null): string {
  return brandSlug ? `/c/${encodeURIComponent(brandSlug)}` : '/portal'
}

/** URL del login del portal — destino de los emails hacia el cliente. */
export function portalLoginUrl(brandSlug?: string | null): string {
  return `${baseUrl()}${portalPrefix(brandSlug)}/login`
}

/** URL del home del portal (requiere sesión; el middleware redirige al login si no hay). */
export function portalHomeUrl(brandSlug?: string | null): string {
  return `${baseUrl()}${portalPrefix(brandSlug)}`
}
