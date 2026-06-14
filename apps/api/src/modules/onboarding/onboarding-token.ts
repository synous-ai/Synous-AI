import jwt from 'jsonwebtoken'
import { env } from '../../config/env'
import { Errors } from '../../lib/errors'

/**
 * Token de invitación al onboarding.
 *
 * Es el mecanismo que VINCULA una submission del wizard con un lead que YA
 * existe en el CRM. El flujo correcto es: el lead entra por un canal (setter,
 * formulario, IG, recomendación…) → primer contacto → le mandamos un link
 * tokenizado (`/onboarding?t=<token>`) → al completarlo, la submission se
 * asocia a ESE contacto/deal (no crea uno frío por email).
 *
 * Va firmado como JWT con el mismo secreto que el access token, pero con
 * `type: 'onboarding'` para que NO pueda confundirse con un token de sesión.
 */
interface OnboardingTokenPayload {
  contactId: string
  portalId: string
  type: 'onboarding'
}

// Vigencia larga a propósito: se lo enviamos al lead tras el primer contacto y
// puede tardar días en completar el formulario.
const ONBOARDING_TOKEN_TTL = '30d'

/** Firma un token de invitación al onboarding atado a un contacto del CRM. */
export function signOnboardingToken(payload: Omit<OnboardingTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'onboarding' }, env.ACCESS_TOKEN_SECRET, {
    expiresIn: ONBOARDING_TOKEN_TTL,
  } as jwt.SignOptions)
}

/**
 * Verifica un token de onboarding y devuelve a qué contacto/portal apunta.
 * Lanza 401 si está vencido, manipulado o no es del tipo correcto.
 */
export function verifyOnboardingToken(token: string): { contactId: string; portalId: string } {
  try {
    const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET) as unknown as OnboardingTokenPayload
    if (decoded.type !== 'onboarding') throw Errors.unauthorized('Tipo de token inválido')
    return { contactId: decoded.contactId, portalId: decoded.portalId }
  } catch {
    throw Errors.unauthorized('Link de onboarding inválido o expirado')
  }
}
