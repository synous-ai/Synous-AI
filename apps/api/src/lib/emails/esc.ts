/**
 * esc.ts — Escapado de HTML para templates de email.
 *
 * Los templates interpolan contenido que viene de la DB (nombre del cliente,
 * cuerpo de una novedad escrito por el equipo, nombre del deal). Nada de eso es
 * confiable como HTML, así que SIEMPRE se escapa antes de interpolar.
 *
 * Los templates del módulo calendar tienen su propia copia privada de estos
 * helpers (son anteriores a este archivo); no se tocaron para no mezclar un
 * refactor con el fix de los emails que faltaban.
 */

/** Escapa texto para interpolar en el cuerpo del HTML. */
export function escHtml(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escapa texto para interpolar dentro de un atributo HTML (ej. href). */
export function escAttr(s: string | null | undefined): string {
  if (!s) return '#'
  return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/**
 * Convierte texto plano multilínea en párrafos HTML escapados.
 * Se usa para el cuerpo de las novedades, que el equipo escribe en un textarea.
 */
export function escParagraphs(s: string, style = ''): string {
  const attr = style ? ` style="${style}"` : ''
  return s
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p${attr}>${escHtml(block).replace(/\n/g, '<br />')}</p>`)
    .join('\n')
}
