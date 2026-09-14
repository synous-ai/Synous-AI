import jwt from 'jsonwebtoken'
import { Errors, AppError } from '../../lib/errors'
import { env } from '../../config/env'

/**
 * Genera un JWT firmado para cancelar o reprogramar un booking.
 *
 * Diseño de seguridad:
 *  - El campo `type` discrimina el uso: un token de reschedule NO sirve para cancelar.
 *  - TTL = tiempo hasta el inicio de la reunión (el token expira cuando la reunión comienza).
 *  - Se usa ACCESS_TOKEN_SECRET para no requerir un secreto adicional en dev/staging.
 *  - El token se almacena en la DB (cancelToken / rescheduleToken) para permitir revocación.
 *
 * @param bookingId ID del booking
 * @param type      Discriminador de uso
 * @param startsAt  Inicio de la reunión (determina el TTL del token)
 */
export function signBookingToken(
  bookingId: string,
  type: 'booking-cancel' | 'booking-reschedule',
  startsAt: Date,
): string {
  const nowSec = Math.floor(Date.now() / 1000)
  const expSec = Math.floor(startsAt.getTime() / 1000)
  // El token no puede expirar "en el pasado" al generarse; garantizar mínimo 60 s de vida.
  const exp = Math.max(expSec, nowSec + 60)

  return jwt.sign(
    { sub: bookingId, type },
    env.ACCESS_TOKEN_SECRET,
    { expiresIn: exp - nowSec } as jwt.SignOptions,
  )
}

/**
 * Verifica y decodifica un token de booking (cancel o reschedule).
 * Lanza UNAUTHORIZED si el token es inválido, expirado o del tipo incorrecto.
 *
 * @param token Token JWT
 * @param expectedType Tipo esperado para evitar reutilización cruzada
 */
export function verifyBookingToken(
  token: string,
  expectedType: 'booking-cancel' | 'booking-reschedule',
): { sub: string; type: string } {
  try {
    const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET) as { sub: string; type: string }
    if (decoded.type !== expectedType) {
      throw Errors.unauthorized('Tipo de token inválido para esta operación')
    }
    return decoded
  } catch (err) {
    if (err instanceof AppError) throw err
    throw Errors.unauthorized('Token inválido o expirado')
  }
}
