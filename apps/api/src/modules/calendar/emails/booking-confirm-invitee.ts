/**
 * booking-confirm-invitee.ts — Template de confirmación de booking para el invitado
 *
 * Muestra la fecha/hora en la TZ del invitado (ya calculada antes de llamar a este template).
 * Incluye los links de cancelación y reprogramación con los tokens firmados.
 */

export interface BookingConfirmInviteeParams {
  guestName: string
  eventName: string
  /** Fecha y hora formateada en la TZ del invitado (ej. '2030-06-17 09:00 America/Bogota') */
  startLocal: string
  durationMin: number
  /** Ubicación / link (puede ser un Meet link, dirección física, etc.) */
  location?: string | null
  cancelUrl: string
  rescheduleUrl: string
}

/**
 * Genera el HTML de confirmación para el invitado.
 * Diseño simple y compatible con la mayoría de clientes de email.
 */
export function bookingConfirmInviteeHtml(p: BookingConfirmInviteeParams): string {
  const locationBlock = p.location
    ? `<p><strong>Ubicación / Link:</strong> <a href="${p.location}">${p.location}</a></p>`
    : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirmación de reunión</title>
</head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #2563eb;">✅ Reunión confirmada</h2>

  <p>Hola ${escHtml(p.guestName)},</p>
  <p>Tu reunión ha sido confirmada. Aquí están los detalles:</p>

  <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
    <tr>
      <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold; width: 40%;">Evento</td>
      <td style="padding: 8px 12px;">${escHtml(p.eventName)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold;">Fecha y hora</td>
      <td style="padding: 8px 12px;">${escHtml(p.startLocal)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold;">Duración</td>
      <td style="padding: 8px 12px;">${p.durationMin} minutos</td>
    </tr>
    ${p.location ? `<tr>
      <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold;">Ubicación / Link</td>
      <td style="padding: 8px 12px;"><a href="${escAttr(p.location)}" style="color: #2563eb;">${escHtml(p.location)}</a></td>
    </tr>` : ''}
  </table>

  <p style="margin-top: 24px;">¿Necesitás cambiar algo?</p>
  <p>
    <a href="${escAttr(p.cancelUrl)}"
       style="display: inline-block; margin-right: 12px; padding: 10px 18px; background: #ef4444; color: #fff; border-radius: 6px; text-decoration: none;">
      Cancelar reunión
    </a>
    <a href="${escAttr(p.rescheduleUrl)}"
       style="display: inline-block; padding: 10px 18px; background: #2563eb; color: #fff; border-radius: 6px; text-decoration: none;">
      Reprogramar
    </a>
  </p>

  <hr style="margin: 32px 0; border: none; border-top: 1px solid #e2e8f0;" />
  <p style="font-size: 12px; color: #64748b;">
    Si no esperabas este email, podés ignorarlo.
    Los links de cancelación y reprogramación son personales — no los compartas.
  </p>
</body>
</html>`
}

/** Escapa caracteres HTML para prevenir XSS en el contenido del template. */
function escHtml(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escapa solo los caracteres necesarios para atributos HTML. */
function escAttr(s: string | null | undefined): string {
  if (!s) return '#'
  return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
