/**
 * onboarding-completed.ts — Email de confirmación al completar el onboarding.
 *
 * Se envía tras el paso 8, cuando el deal ya pasó al pipeline "Producción".
 * `stageLabel` es la fase real resuelta por moveDealToProduction (hoy
 * "Diagnóstico"), no un literal — si el seed cambia, el email acompaña.
 */

export interface OnboardingCompletedParams {
  firstName?: string | null
  dealName: string
  stageLabel: string
  /** Raíz del Client Portal (sin ticket: el cliente ya tiene sesión). */
  portalUrl: string
}

export function onboardingCompletedHtml(p: OnboardingCompletedParams): string {
  const greeting = p.firstName ? `Hola ${escHtml(p.firstName)},` : 'Hola,'

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Onboarding completo</title>
</head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2>¡Onboarding completo!</h2>

  <p>${greeting}</p>
  <p>
    Recibimos todo lo que necesitábamos para arrancar.
    Tu proyecto <strong>${escHtml(p.dealName)}</strong> ya está en fase de
    <strong>${escHtml(p.stageLabel)}</strong>.
  </p>
  <p>
    A partir de acá vas a ver los avances directamente en tu portal — sin tener que
    preguntarnos "¿cómo vamos?".
  </p>

  <p style="margin: 28px 0;">
    <a href="${escAttr(p.portalUrl)}"
       style="display: inline-block; padding: 12px 22px; background: #111; color: #fff; border-radius: 6px; text-decoration: none;">
      Ir a mi portal
    </a>
  </p>

  <hr style="margin: 32px 0; border: none; border-top: 1px solid #e2e8f0;" />
  <p style="font-size: 12px; color: #64748b;">
    Si tenés alguna duda, respondé este email y te contestamos.
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
