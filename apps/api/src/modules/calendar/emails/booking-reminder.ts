/**
 * booking-reminder.ts — Recordatorio de reunión próxima.
 *
 * Se manda dos veces: 24 horas antes y 1 hora antes. Es la pieza que faltaba
 * del calendario — sin recordatorio, el invitado reserva y se olvida, que es la
 * causa número uno de no-show.
 *
 * La hora ya viene formateada en la zona horaria del destinatario: este template
 * NO hace conversiones (el booking guarda `invitee_time_zone` y el host tiene la
 * TZ de su schedule; cada llamada resuelve la suya antes de llegar acá).
 */
import { escAttr, escHtml } from '../../../lib/emails/esc'

export type ReminderKind = '24h' | '1h'

export interface BookingReminderParams {
  /** A quién saludamos: invitado o host. */
  recipientName?: string | null
  eventName: string
  /** Fecha y hora ya formateada, con la TZ incluida. */
  startLocal: string
  durationMin: number
  /** Con quién es la reunión (el host para el invitado, el invitado para el host). */
  withWhom?: string | null
  location?: string | null
  /** Link para cancelar (solo se ofrece en el de 24h; a 1h ya no tiene sentido). */
  cancelUrl?: string | null
  rescheduleUrl?: string | null
  kind: ReminderKind
}

export function bookingReminderSubject(kind: ReminderKind, eventName: string): string {
  return kind === '24h'
    ? `Mañana: ${eventName}`
    : `En 1 hora: ${eventName}`
}

export function bookingReminderHtml(p: BookingReminderParams): string {
  const saludo = p.recipientName ? `Hola ${escHtml(p.recipientName)},` : 'Hola,'
  const cuando = p.kind === '24h' ? 'es mañana' : 'empieza en una hora'

  // A 1 hora del inicio, ofrecer "reprogramar" es ruido: lo único útil es entrar.
  const acciones =
    p.kind === '24h' && (p.cancelUrl || p.rescheduleUrl)
      ? `<p style="margin: 24px 0 0; font-size: 13px; color: #57534e;">
           ¿No podés? ${
             p.rescheduleUrl
               ? `<a href="${escAttr(p.rescheduleUrl)}" style="color: #1c1917;">Reprogramar</a>`
               : ''
           }${p.rescheduleUrl && p.cancelUrl ? ' · ' : ''}${
             p.cancelUrl ? `<a href="${escAttr(p.cancelUrl)}" style="color: #1c1917;">Cancelar</a>` : ''
           }
         </p>`
      : ''

  const linkBoton = p.location?.startsWith('http')
    ? `<p style="margin: 24px 0;">
         <a href="${escAttr(p.location)}"
            style="display: inline-block; padding: 12px 24px; background: #0c0a09; color: #fafaf9; border-radius: 999px; text-decoration: none; font-size: 14px; font-weight: 600;">
           Entrar a la reunión
         </a>
       </p>`
    : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Recordatorio de reunión</title>
</head>
<body style="margin: 0; padding: 0; background: #f5f5f4;">
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #1c1917; max-width: 560px; margin: 0 auto; padding: 32px 24px;">

    <p style="margin: 0 0 4px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #78716c;">Recordatorio</p>
    <h1 style="margin: 0 0 20px; font-size: 22px; line-height: 1.3; font-weight: 600;">${escHtml(p.eventName)}</h1>

    <p style="font-size: 15px; line-height: 1.6;">${saludo}</p>
    <p style="font-size: 15px; line-height: 1.6;">Te recordamos que tu reunión ${cuando}.</p>

    <table style="border-collapse: collapse; width: 100%; margin: 20px 0; background: #ffffff; border: 1px solid #e7e5e4; border-radius: 12px;">
      <tr>
        <td style="padding: 12px 16px; font-size: 13px; color: #57534e; width: 38%;">Cuándo</td>
        <td style="padding: 12px 16px; font-size: 14px; font-weight: 600;">${escHtml(p.startLocal)}</td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; font-size: 13px; color: #57534e; border-top: 1px solid #f5f5f4;">Duración</td>
        <td style="padding: 12px 16px; font-size: 14px; border-top: 1px solid #f5f5f4;">${p.durationMin} minutos</td>
      </tr>
      ${
        p.withWhom
          ? `<tr>
               <td style="padding: 12px 16px; font-size: 13px; color: #57534e; border-top: 1px solid #f5f5f4;">Con</td>
               <td style="padding: 12px 16px; font-size: 14px; border-top: 1px solid #f5f5f4;">${escHtml(p.withWhom)}</td>
             </tr>`
          : ''
      }
      ${
        p.location
          ? `<tr>
               <td style="padding: 12px 16px; font-size: 13px; color: #57534e; border-top: 1px solid #f5f5f4;">Dónde</td>
               <td style="padding: 12px 16px; font-size: 14px; border-top: 1px solid #f5f5f4;">${escHtml(p.location)}</td>
             </tr>`
          : ''
      }
    </table>

    ${linkBoton}
    ${acciones}
  </div>
</body>
</html>`
}
