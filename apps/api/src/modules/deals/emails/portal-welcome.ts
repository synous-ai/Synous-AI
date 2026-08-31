/**
 * portal-welcome.ts — Email de bienvenida / invitación al Client Portal.
 *
 * Se manda UNA sola vez, cuando `activateClientPortal` crea la cuenta del
 * cliente al ganar el deal. Es la primera comunicación post-venta: hasta este
 * email el cliente no tiene forma de enterarse de que su panel existe.
 *
 * Sobre el acceso: NO lleva token propio. El login del portal es por código de
 * email de Clerk contra la misma dirección a la que llega este email, así que
 * el link apunta al login y el propio Clerk valida la identidad. Por eso el
 * email no es un secreto compartido: reenviarlo no da acceso a nadie.
 */
import { escAttr, escHtml } from '../../../lib/emails/esc'

export interface PortalWelcomeParams {
  /** Nombre de pila del contacto; si no lo tenemos, el saludo cae a algo neutro. */
  firstName?: string | null
  /** Nombre del proyecto (deal) que el cliente va a ver en el panel. */
  dealName: string
  /** Email al que llega — se muestra para que sepa con cuál entrar. */
  email: string
  /** URL del login del portal (respeta white-label). */
  loginUrl: string
}

export function portalWelcomeSubject(dealName: string): string {
  return `Tu panel de proyecto ya está listo — ${dealName}`
}

export function portalWelcomeHtml(p: PortalWelcomeParams): string {
  const saludo = p.firstName ? `Hola ${escHtml(p.firstName)},` : 'Hola,'

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tu panel de proyecto</title>
</head>
<body style="margin: 0; padding: 0; background: #f5f5f4;">
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #1c1917; max-width: 560px; margin: 0 auto; padding: 32px 24px;">

    <div style="background: #0c0a09; border-radius: 16px; padding: 32px 28px; margin-bottom: 24px;">
      <p style="margin: 0 0 8px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #a8a29e;">Tu proyecto arrancó</p>
      <h1 style="margin: 0; font-size: 26px; line-height: 1.25; font-weight: 600; color: #fafaf9;">${escHtml(p.dealName)}</h1>
    </div>

    <p style="font-size: 15px; line-height: 1.6;">${saludo}</p>

    <p style="font-size: 15px; line-height: 1.6;">
      Ya tenés acceso a tu panel de cliente. Ahí vas a poder seguir en qué fase está el
      proyecto, ver las novedades que publica el equipo, revisar y aprobar entregables,
      completar los formularios que te pidamos y consultar tus documentos y facturas.
    </p>

    <p style="font-size: 15px; line-height: 1.6;">
      El primer paso es el <strong>onboarding</strong>: unas pantallas cortas para que
      sepas cómo trabajamos y para que nos pases la información del negocio con la que
      arrancamos. Te va a aparecer apenas entres.
    </p>

    <p style="margin: 28px 0;">
      <a href="${escAttr(p.loginUrl)}"
         style="display: inline-block; padding: 14px 28px; background: #0c0a09; color: #fafaf9; border-radius: 999px; text-decoration: none; font-size: 15px; font-weight: 600;">
        Entrar a mi panel
      </a>
    </p>

    <div style="background: #ffffff; border: 1px solid #e7e5e4; border-radius: 12px; padding: 16px 18px; margin: 24px 0;">
      <p style="margin: 0 0 6px; font-size: 13px; color: #57534e;">Entrás con este email:</p>
      <p style="margin: 0; font-size: 15px; font-weight: 600;">${escHtml(p.email)}</p>
      <p style="margin: 10px 0 0; font-size: 13px; color: #57534e; line-height: 1.5;">
        No necesitás contraseña. Te vamos a mandar un código de acceso a esta misma
        dirección cada vez que entres.
      </p>
    </div>

    <p style="font-size: 15px; line-height: 1.6;">
      Si algo no funciona o tenés una duda, respondé este email y te contestamos.
    </p>

    <hr style="margin: 32px 0 16px; border: none; border-top: 1px solid #e7e5e4;" />
    <p style="font-size: 12px; color: #78716c; line-height: 1.5;">
      Si no esperabas este email, podés ignorarlo: sin acceso a esta casilla no se puede
      entrar al panel.
    </p>
  </div>
</body>
</html>`
}
