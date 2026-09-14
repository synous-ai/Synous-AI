/**
 * email-tracking.service.ts
 *
 * Registra eventos de apertura y click de emails, y proporciona
 * utilidades para inyectar el pixel de tracking en el HTML del email.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { emailSend, emailEvent } from '../../db/schema'
import { env } from '../../config/env'

// ── Pixel GIF 1×1 transparente ───────────────────────────────────────────────

/**
 * GIF transparente 1×1 px (43 bytes).
 * Se sirve directamente en el endpoint GET /track/open/:trackingId.
 */
export const TRACKING_PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
)

// ── recordOpen ────────────────────────────────────────────────────────────────

/**
 * Registra un evento 'opened' para el email identificado por trackingId.
 *
 * Si el trackingId no existe, la función termina silenciosamente
 * (el endpoint de pixel nunca debe fallar con error visible).
 *
 * Política de deduplicación: se registran TODOS los opens
 * (útil para ver frecuencia de apertura). Para filtrar opens únicos,
 * consultar el primer event 'opened' por emailId.
 */
export async function recordOpen(
  trackingId: string,
  userAgent?: string,
  ip?: string,
): Promise<void> {
  const [send] = await db
    .select({ id: emailSend.id })
    .from(emailSend)
    .where(eq(emailSend.trackingId, trackingId))
    .limit(1)

  if (!send) return

  await db.insert(emailEvent).values({
    emailId: send.id,
    type: 'opened',
    userAgent: userAgent ?? null,
    ipAddress: ip ?? null,
  })
}

// ── recordClick ───────────────────────────────────────────────────────────────

/**
 * Registra un evento 'clicked' con la URL de destino.
 *
 * Si el trackingId no existe, termina silenciosamente
 * (el redirect igual ocurre al destino o a la base).
 */
export async function recordClick(
  trackingId: string,
  url: string,
  userAgent?: string,
  ip?: string,
): Promise<void> {
  const [send] = await db
    .select({ id: emailSend.id })
    .from(emailSend)
    .where(eq(emailSend.trackingId, trackingId))
    .limit(1)

  if (!send) return

  await db.insert(emailEvent).values({
    emailId: send.id,
    type: 'clicked',
    linkUrl: url,
    userAgent: userAgent ?? null,
    ipAddress: ip ?? null,
  })
}

// ── buildPixelTag ─────────────────────────────────────────────────────────────

/**
 * Construye el tag <img> del pixel de tracking para incrustar al final del bodyHtml.
 */
export function buildPixelTag(trackingId: string): string {
  const base = env.PUBLIC_API_URL.replace(/\/$/, '')
  return `<img src="${base}/track/open/${trackingId}" width="1" height="1" style="display:none" alt="" />`
}

// ── injectTrackingPixel ───────────────────────────────────────────────────────

/**
 * Inyecta el pixel antes del </body> o, si no hay tag, al final del HTML.
 */
export function injectTrackingPixel(html: string, trackingId: string): string {
  const pixel = buildPixelTag(trackingId)
  if (html.includes('</body>')) {
    return html.replace('</body>', `${pixel}</body>`)
  }
  return html + pixel
}

// ── Links de click firmados ───────────────────────────────────────────────────

/**
 * Firma HMAC del par (trackingId, url) que acompaña a cada link trackeado.
 *
 * El endpoint de click es público y redirige a lo que diga la query: sin firma,
 * cualquiera armaba `/track/click/<uuid>?url=https://phishing.example` y usaba
 * nuestro dominio para lavar links maliciosos (open redirect). Con la firma
 * solo se redirige a destinos que nosotros mismos pusimos en un email.
 */
export function signClickTarget(trackingId: string, url: string): string {
  return createHmac('sha256', env.ACCESS_TOKEN_SECRET).update(`${trackingId}\n${url}`).digest('base64url')
}

/** Devuelve el destino si es http(s) y la firma coincide; si no, `null`. */
export function verifyClickTarget(
  trackingId: string,
  url: string | undefined,
  sig: string | undefined,
): string | null {
  if (!url || !sig) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

  const expected = Buffer.from(signClickTarget(trackingId, url))
  const received = Buffer.from(sig)
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null
  return url
}
