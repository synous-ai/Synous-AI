'use client'

import type { ProductVisionContent } from './product-vision-types'

/**
 * El botón del cierre: abre WhatsApp con un mensaje ya escrito.
 *
 * Además avisa al equipo (notificación "quiere avanzar" en el panel) por el
 * proxy `/p/<token>/interest`. Va con `keepalive` para que el aviso salga
 * aunque el navegador ya esté saltando a WhatsApp; si falla, el link funciona
 * igual. Sin token (vista previa interna) no se avisa nada.
 */
export function InterestCta({ copy, token }: { copy: ProductVisionContent['close']; token: string | null }) {
  const href = `https://wa.me/${copy.whatsappNumber}?text=${encodeURIComponent(copy.whatsappMessage)}`

  function notifyTeam() {
    if (!token) return
    // El aviso es un extra: el link a WhatsApp no depende de él.
    void fetch(`/p/${encodeURIComponent(token)}/interest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'advance' }),
      keepalive: true,
    }).catch(() => undefined)
  }

  return (
    <div className="pv-cta">
      <a className="pv-button is-primary" href={href} target="_blank" rel="noopener noreferrer" onClick={notifyTeam}>
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 2s.8 2.3.9 2.5c.1.2 1.6 2.5 4 3.5 1.5.6 2 .7 2.8.6.4-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.2Z" />
        </svg>
        {copy.cta}
      </a>
    </div>
  )
}
