import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../../config/env'

/**
 * URLs firmadas de `GET /api/files/raw/*` (modo server). La firma ES la
 * credencial: el browser la usa en un <img>/<a> sin headers, así que la sesión
 * de Clerk ya no viaja en la URL (antes `?token=` quedaba en historial y logs).
 *
 * El prefijo `files.raw` separa este uso de los otros HMAC que firman con el
 * mismo ACCESS_TOKEN_SECRET (booking, email tracking): una firma emitida para
 * uno nunca valida en otro.
 */
function sign(key: string, exp: string): string {
  return createHmac('sha256', env.ACCESS_TOKEN_SECRET).update(`files.raw\n${key}\n${exp}`).digest('base64url')
}

export function buildSignedRawUrl(key: string, expiresAtMs: number): string {
  const exp = String(expiresAtMs)
  const params = new URLSearchParams({ exp, sig: sign(key, exp) })
  return `${env.PUBLIC_API_URL}/api/files/raw/${key}?${params.toString()}`
}

export function verifyRawSignature(key: string, exp: unknown, sig: unknown, now = Date.now()): boolean {
  if (typeof exp !== 'string' || typeof sig !== 'string') return false
  if (!/^\d{1,15}$/.test(exp) || Number(exp) <= now) return false
  const expected = Buffer.from(sign(key, exp))
  const received = Buffer.from(sig)
  return expected.length === received.length && timingSafeEqual(expected, received)
}
