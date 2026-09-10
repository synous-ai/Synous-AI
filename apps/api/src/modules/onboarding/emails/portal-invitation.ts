/**
 * portal-invitation.ts — Email de invitación al Client Portal.
 *
 * Se envía al ganar el deal (activateClientPortal). El `portalUrl` que recibe
 * es el link de invitación que genera Clerk (con su `__clerk_ticket`), no una
 * URL armada a mano: es el único link que la página /portal/accept-invitation
 * sabe consumir para que el cliente fije su contraseña.
 */

export interface PortalInvitationParams {
  /** Nombre del contacto; si viene vacío el saludo se degrada a genérico. */
  firstName?: string | null
  dealName: string
  /** Link de invitación generado por Clerk (incluye el ticket). */
  portalUrl: string
}

export function portalInvitationHtml(p: PortalInvitationParams): string {
  const greeting = p.firstName ? `Hola ${escHtml(p.firstName)},` : 'Hola,'

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tu portal de Synous AI</title>
</head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2>Tu portal ya está listo</h2>

  <p>${greeting}</p>
  <p>
    Arrancamos con <strong>${escHtml(p.dealName)}</strong>. Desde tu portal vas a poder
    seguir el avance del proyecto, revisar entregables y encontrar todo en un solo lugar.
  </p>
  <p>Para empezar, activá tu cuenta y completá el onboarding — son unos minutos.</p>

  <p style="margin: 28px 0;">
    <a href="${escAttr(p.portalUrl)}"
       style="display: inline-block; padding: 12px 22px; background: #111; color: #fff; border-radius: 6px; text-decoration: none;">
      Activar mi cuenta
    </a>
  </p>

  <hr style="margin: 32px 0; border: none; border-top: 1px solid #e2e8f0;" />
  <p style="font-size: 12px; color: #64748b;">
    Este link es personal — no lo compartas. Si no esperabas este email, podés ignorarlo.
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
