/**
 * project-update-published.ts — Aviso al cliente de una novedad del proyecto.
 *
 * Se manda cuando el equipo publica una `project_update`. Sin este email el
 * portal es "tiempo real" solo para quien se acuerda de entrar a mirarlo: la
 * novedad queda publicada y el cliente nunca se entera.
 *
 * El cuerpo de la novedad lo escribe el equipo en un textarea, así que va
 * escapado y convertido a párrafos (nunca interpolado como HTML crudo).
 */
import { escAttr, escHtml, escParagraphs } from '../../../lib/emails/esc'

export interface ProjectUpdateEmailParams {
  firstName?: string | null
  /** Nombre del proyecto (deal). */
  dealName: string
  /** Fase del proyecto a la que quedó asociada la novedad, si el deal está en Producción. */
  phaseLabel?: string | null
  /** Texto plano escrito por el equipo. */
  body: string
  /** URL del home del portal (respeta white-label). */
  portalUrl: string
}

export function projectUpdateSubject(dealName: string): string {
  return `Novedad de tu proyecto — ${dealName}`
}

export function projectUpdateHtml(p: ProjectUpdateEmailParams): string {
  const saludo = p.firstName ? `Hola ${escHtml(p.firstName)},` : 'Hola,'
  const fase = p.phaseLabel
    ? `<p style="margin: 0 0 16px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #78716c;">Fase: ${escHtml(p.phaseLabel)}</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Novedad de tu proyecto</title>
</head>
<body style="margin: 0; padding: 0; background: #f5f5f4;">
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #1c1917; max-width: 560px; margin: 0 auto; padding: 32px 24px;">

    <p style="margin: 0 0 4px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #78716c;">Novedad del proyecto</p>
    <h1 style="margin: 0 0 24px; font-size: 22px; line-height: 1.3; font-weight: 600;">${escHtml(p.dealName)}</h1>

    <p style="font-size: 15px; line-height: 1.6;">${saludo}</p>

    <div style="background: #ffffff; border: 1px solid #e7e5e4; border-radius: 12px; padding: 20px 22px; margin: 20px 0;">
      ${fase}
      ${escParagraphs(p.body, 'margin: 0 0 12px; font-size: 15px; line-height: 1.6;')}
    </div>

    <p style="margin: 24px 0;">
      <a href="${escAttr(p.portalUrl)}"
         style="display: inline-block; padding: 12px 24px; background: #0c0a09; color: #fafaf9; border-radius: 999px; text-decoration: none; font-size: 14px; font-weight: 600;">
        Ver el estado del proyecto
      </a>
    </p>

    <hr style="margin: 32px 0 16px; border: none; border-top: 1px solid #e7e5e4;" />
    <p style="font-size: 12px; color: #78716c; line-height: 1.5;">
      Recibís este aviso porque tenés un proyecto activo con nosotros.
      Respondé este email si querés hacernos una consulta.
    </p>
  </div>
</body>
</html>`
}
