/**
 * signature-request.ts — Pedido de firma de un documento.
 *
 * Lo manda el CRM y no DocuSeal (la submission se crea con `send_email: false`)
 * para que el cliente reciba el pedido con la marca de la agencia y no con la
 * de una herramienta que no conoce.
 */
import { escAttr, escHtml } from '../../../lib/emails/esc'

export interface SignatureRequestParams {
  firstName?: string | null
  documentName: string
  /** URL pública de firma en DocuSeal. */
  signingUrl: string
}

export function signatureRequestSubject(documentName: string): string {
  return `Para tu firma: ${documentName}`
}

export function signatureRequestHtml(p: SignatureRequestParams): string {
  const saludo = p.firstName ? `Hola ${escHtml(p.firstName)},` : 'Hola,'

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Documento para firmar</title>
</head>
<body style="margin: 0; padding: 0; background: #f5f5f4;">
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #1c1917; max-width: 560px; margin: 0 auto; padding: 32px 24px;">

    <p style="margin: 0 0 4px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #78716c;">Documento para firmar</p>
    <h1 style="margin: 0 0 20px; font-size: 22px; line-height: 1.3; font-weight: 600;">${escHtml(p.documentName)}</h1>

    <p style="font-size: 15px; line-height: 1.6;">${saludo}</p>
    <p style="font-size: 15px; line-height: 1.6;">
      Te dejamos el documento listo para que lo revises y lo firmes. Se firma
      online, desde el navegador — no hace falta imprimir ni escanear nada.
    </p>

    <p style="margin: 28px 0;">
      <a href="${escAttr(p.signingUrl)}"
         style="display: inline-block; padding: 14px 28px; background: #0c0a09; color: #fafaf9; border-radius: 999px; text-decoration: none; font-size: 15px; font-weight: 600;">
        Revisar y firmar
      </a>
    </p>

    <p style="font-size: 15px; line-height: 1.6;">
      Si algo del documento no te cierra, respondé este email antes de firmar y
      lo vemos.
    </p>

    <hr style="margin: 32px 0 16px; border: none; border-top: 1px solid #e7e5e4;" />
    <p style="font-size: 12px; color: #78716c; line-height: 1.5;">
      Este link es personal: es tu enlace de firma, no lo compartas.
    </p>
  </div>
</body>
</html>`
}
