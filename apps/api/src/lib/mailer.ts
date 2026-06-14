/**
 * mailer.ts — Cliente de email centralizado (Resend)
 *
 * Diseño lazy: el cliente Resend se instancia solo si RESEND_API_KEY está presente.
 * Si no está configurada (dev / CI / test) → se loguea y se omite el envío sin lanzar error.
 * Esto garantiza que el flujo de booking NO se rompa por un email fallido.
 *
 * Uso:
 *   import { sendEmail } from '../../lib/mailer'
 *   await sendEmail({ to: 'x@y.com', subject: 'Confirmación', html: '<p>...</p>' })
 *
 * El caller SIEMPRE debe envolver en try/catch y tratar el fallo como best-effort.
 */

import { Resend } from 'resend'
import { env } from '../config/env'

/** Parámetros mínimos para enviar un email. */
export interface SendEmailParams {
  to: string | string[]
  subject: string
  html: string
  /** De: por defecto usa FROM_EMAIL del env o el dominio de Resend para testing. */
  from?: string
}

// Instancia lazy: se crea solo cuando RESEND_API_KEY está disponible.
let resendClient: Resend | null = null

function getResend(): Resend | null {
  if (!env.RESEND_API_KEY) return null
  if (!resendClient) {
    resendClient = new Resend(env.RESEND_API_KEY)
  }
  return resendClient
}

/**
 * Envía un email vía Resend.
 *
 * Si RESEND_API_KEY no está configurada:
 *  - Loguea el intento y devuelve sin error (modo dev/test seguro).
 *
 * Si Resend devuelve un error:
 *  - Loguea el error completo (código + mensaje) sin propagarlo.
 *  - El caller decide si reintentar o ignorar (best-effort).
 */
export async function sendEmail(params: SendEmailParams): Promise<void> {
  const client = getResend()

  if (!client) {
    // En dev / CI sin API key: log informativo, no error
    console.info('[mailer] RESEND_API_KEY no configurada — email omitido', {
      to: params.to,
      subject: params.subject,
    })
    return
  }

  const from = params.from ?? env.FROM_EMAIL ?? 'noreply@onboarding.resend.dev'

  const { error } = await client.emails.send({
    from,
    to: Array.isArray(params.to) ? params.to : [params.to],
    subject: params.subject,
    html: params.html,
  })

  if (error) {
    // Loguear pero NO propagar — el email es best-effort
    console.error('[mailer] Error al enviar email via Resend', {
      to: params.to,
      subject: params.subject,
      error,
    })
  }
}
