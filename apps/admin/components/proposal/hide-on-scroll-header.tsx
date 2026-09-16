'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Arriba de esta altura el header siempre se ve: no hay contenido que despejar. */
const REVEAL_ZONE = 120
/** Movimiento mínimo para cambiar de estado, así el temblor del scroll no lo hace parpadear. */
const MIN_DELTA = 8

/**
 * El header de la propuesta, que se esconde al bajar y vuelve al subir.
 *
 * Escucha el scroll de `window`: Lenis mueve ese mismo scroll, así que el
 * evento nativo llega igual con el suavizado activo. La lectura va dentro de
 * un `requestAnimationFrame` para no recalcular más de una vez por cuadro.
 *
 * Solo alterna la clase `is-hidden`; el movimiento lo hace el CSS.
 */
export function HideOnScrollHeader({ className, children }: { className: string; children: ReactNode }) {
  const [hidden, setHidden] = useState(false)
  const lastY = useRef(0)

  useEffect(() => {
    lastY.current = Math.max(window.scrollY, 0)
    let frame = 0

    const update = () => {
      frame = 0
      // El rebote de iOS da valores negativos: cuentan como el tope de la página.
      const y = Math.max(window.scrollY, 0)

      if (y < REVEAL_ZONE) {
        setHidden(false)
        lastY.current = y
        return
      }

      const delta = y - lastY.current
      if (Math.abs(delta) < MIN_DELTA) return

      setHidden(delta > 0)
      lastY.current = y
    }

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return <header className={hidden ? `${className} is-hidden` : className}>{children}</header>
}
