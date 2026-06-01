/**
 * email-tracking.service.ts
 *
 * Registra eventos de apertura y click de emails, y proporciona
 * utilidades para inyectar el pixel de tracking en el HTML del email.
 */

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

// ── validateRedirectUrl ───────────────────────────────────────────────────────

/**
 * Valida que la URL de redirect sea http o https.
 * Si no es válida, devuelve la URL base de la API.
 */
export function validateRedirectUrl(url: string | undefined): string {
  if (!url) return env.PUBLIC_API_URL
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return url
    }
    return env.PUBLIC_API_URL
  } catch {
    return env.PUBLIC_API_URL
  }
}
