'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

/**
 * Scope visual del portal para el contenido que Radix saca del árbol (menús,
 * sheets).
 *
 * Los colores del portal son variables CSS scopeadas a `.portal-theme` y
 * `.portal-editorial` (ver app/portal/portal-theme.css). Radix monta ese
 * contenido en `document.body` por defecto, FUERA del scope, así que heredaba
 * la paleta del admin: con el sistema en modo oscuro, un menú casi negro sobre
 * el portal claro. Montándolo en un nodo DENTRO del scope hereda los mismos
 * tokens y fuentes que el resto de la página, en cualquier tema.
 *
 * El scope más cercano gana: el shell autenticado (`.portal-editorial`) pisa al
 * de `.portal-theme`. Fuera de un scope, Radix vuelve a `document.body`.
 */
const PortalContainerContext = createContext<HTMLElement | null>(null)

export function PortalScope({ className, children }: { className?: string; children: ReactNode }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <div className={className}>
      <PortalContainerContext.Provider value={container}>{children}</PortalContainerContext.Provider>
      {/* Sin alto ni flujo propio: lo que se monta acá es `position: fixed`. */}
      <div ref={setContainer} data-portal-overlay-root="" />
    </div>
  )
}

/** Nodo donde montar un Portal de Radix; `undefined` ⇒ `document.body`. */
export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext) ?? undefined
}
