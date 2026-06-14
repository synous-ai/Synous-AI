/**
 * booking-cancelled.ts — Template de notificación de cancelación de booking
 *
 * Se envía al invitado cuando cancela (o cuando el host cancela por su cuenta).
 */

export interface BookingCancelledParams {
  guestName: string
  eventName: string
  /** Fecha y hora original en la TZ del invitado */
  startLocal: string
}

/**
 * Genera el HTML de cancelación para el invitado.
 */
export function bookingCancelledHtml(p: BookingCancelledParams): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reunión cancelada</title>
</head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #ef4444;">❌ Reunión cancelada</h2>

  <p>Hola ${escHtml(p.guestName)},</p>
  <p>Tu reunión ha sido cancelada.</p>

  <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
    <tr>
      <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold; width: 40%;">Evento</td>
      <td style="padding: 8px 12px;">${escHtml(p.eventName)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold;">Fecha y hora original</td>
      <td style="padding: 8px 12px;">${escHtml(p.startLocal)}</td>
    </tr>
  </table>

  <p>Si querés agendar otra reunión, podés hacerlo cuando quieras usando el link original.</p>

  <hr style="margin: 32px 0; border: none; border-top: 1px solid #e2e8f0;" />
  <p style="font-size: 12px; color: #64748b;">
    Si no solicitaste esta cancelación, por favor contactanos de inmediato.
  </p>
</body>
</html>`
}

function escHtml(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
