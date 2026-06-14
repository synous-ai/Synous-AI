/**
 * booking-host-notify.ts — Template de notificación al host cuando llega un nuevo booking
 *
 * El host recibe la fecha/hora en SU timezone (no la del invitado).
 */

export interface BookingHostNotifyParams {
  hostEmail: string
  hostName?: string | null
  guestName: string
  guestEmail: string
  eventName: string
  /** Fecha y hora formateada en la TZ del host */
  startLocalHost: string
  durationMin: number
  location?: string | null
  notes?: string | null
}

/**
 * Genera el HTML de notificación para el host.
 */
export function bookingHostNotifyHtml(p: BookingHostNotifyParams): string {
  const greeting = p.hostName ? `Hola ${escHtml(p.hostName)},` : 'Hola,'

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nueva reunión agendada</title>
</head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #2563eb;">📅 Nueva reunión agendada</h2>

  <p>${escHtml(greeting)}</p>
  <p>Tenés una nueva reunión confirmada en tu agenda:</p>

  <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
    <tr>
      <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold; width: 40%;">Evento</td>
      <td style="padding: 8px 12px;">${escHtml(p.eventName)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold;">Invitado</td>
      <td style="padding: 8px 12px;">${escHtml(p.guestName)} &lt;<a href="mailto:${escAttr(p.guestEmail)}" style="color: #2563eb;">${escHtml(p.guestEmail)}</a>&gt;</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold;">Fecha y hora</td>
      <td style="padding: 8px 12px;">${escHtml(p.startLocalHost)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold;">Duración</td>
      <td style="padding: 8px 12px;">${p.durationMin} minutos</td>
    </tr>
    ${p.location ? `<tr>
      <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold;">Ubicación / Link</td>
      <td style="padding: 8px 12px;"><a href="${escAttr(p.location)}" style="color: #2563eb;">${escHtml(p.location)}</a></td>
    </tr>` : ''}
    ${p.notes ? `<tr>
      <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold;">Notas</td>
      <td style="padding: 8px 12px;">${escHtml(p.notes)}</td>
    </tr>` : ''}
  </table>

  <hr style="margin: 32px 0; border: none; border-top: 1px solid #e2e8f0;" />
  <p style="font-size: 12px; color: #64748b;">
    Este email fue enviado automáticamente por tu sistema de agenda.
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

function escAttr(s: string | null | undefined): string {
  if (!s) return '#'
  return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
