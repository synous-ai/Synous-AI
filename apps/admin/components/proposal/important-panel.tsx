'use client'

import { useEffect, useId, useRef, useState, type ReactNode, type TransitionEvent } from 'react'

/** Un poco más que la transición de cierre del CSS (0.4s), por si el evento no llega. */
const CLOSE_FALLBACK_MS = 600

type ImportantPanelProps = {
  icon: ReactNode
  title: string
  /** Una línea que anticipa lo que hay adentro, visible con la card cerrada. */
  summary: string
  openLabel: string
  closeLabel: string
  children: ReactNode
}

/**
 * Una card de "Información importante" que se abre y se cierra.
 *
 * Arranca cerrada para que la sección se escanee rápido, pero toda la cabecera
 * es el botón y el resumen anticipa el contenido: no se esconde nada, se
 * profundiza cuando se quiere. Cada card maneja su propio estado, así que las
 * dos pueden quedar abiertas a la vez.
 *
 * Mismo patrón que el FAQ: el contenido queda montado y se anima con
 * `grid-template-rows` (0fr → 1fr) más opacidad, sin alturas fijas.
 *
 * `is-expanded` sobrevive al cierre hasta que termina la animación. La grilla
 * lo usa para dejar de estirar las cards: si se sacara junto con `is-open`, la
 * card vecina se estiraría a la altura de la que todavía se está cerrando y se
 * achicaría con ella — el parpadeo que se veía al tocar "Ocultar".
 */
export function ImportantPanel({ icon, title, summary, openLabel, closeLabel, children }: ImportantPanelProps) {
  const baseId = useId()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  const titleId = `${baseId}-title`
  const summaryId = `${baseId}-summary`
  const bodyId = `${baseId}-body`

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  function toggle() {
    clearTimeout(closeTimer.current)
    if (open) {
      setOpen(false)
      // Respaldo: sin animación (reducir movimiento) el evento de fin no llega.
      closeTimer.current = setTimeout(() => setExpanded(false), CLOSE_FALLBACK_MS)
    } else {
      setExpanded(true)
      setOpen(true)
    }
  }

  function handleTransitionEnd(event: TransitionEvent<HTMLDivElement>) {
    if (open || event.target !== event.currentTarget || event.propertyName !== 'grid-template-rows') return
    clearTimeout(closeTimer.current)
    setExpanded(false)
  }

  return (
    <article className={`important-card important-panel${open ? ' is-open' : ''}${expanded ? ' is-expanded' : ''}`}>
      {/* Patrón de desplegable accesible: el botón vive dentro del encabezado,
          así el título sigue apareciendo en el índice de encabezados. El nombre
          accesible es sólo el título; el resumen queda como descripción y el
          estado lo anuncia `aria-expanded`. */}
      <h3 className="important-heading" aria-labelledby={titleId}>
        <button
          className="important-trigger"
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-labelledby={titleId}
          aria-describedby={summaryId}
          onClick={toggle}
        >
          {icon}
          <span className="important-title" id={titleId}>
            {title}
          </span>
          <span className="important-summary" id={summaryId}>
            {summary}
          </span>
          <span className="important-action">
            {open ? closeLabel : openLabel}
            <svg className="important-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </button>
      </h3>

      <div
        className="important-body"
        id={bodyId}
        role="region"
        aria-labelledby={titleId}
        aria-hidden={!open}
        onTransitionEnd={handleTransitionEnd}
      >
        <div className="important-body-inner">
          <div className="important-content">{children}</div>
        </div>
      </div>
    </article>
  )
}
