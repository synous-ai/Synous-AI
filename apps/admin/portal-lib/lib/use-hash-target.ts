'use client'

import { useEffect, useState } from 'react'

/**
 * Resuelve el ancla `#<id>` de la URL para destacar UN ítem dentro de un
 * listado.
 *
 * Por qué hace falta un hook y no alcanza el scroll nativo del browser: las
 * secciones del portal pintan su lista recién cuando resuelve la query, así
 * que en el momento en que el router navega a `/deliverables#deliverable-abc`
 * ese elemento todavía no existe en el DOM y el salto no ocurre. `ready`
 * retrasa el intento hasta que los datos están, que es cuando el nodo existe
 * de verdad.
 *
 * Esto es lo que permite que el Inicio lleve al ÍTEM concreto y no al listado
 * general: las secciones de entregables, formularios y facturas son listas en
 * una sola página (no tienen ruta de detalle propia, a diferencia de
 * solicitudes), y el ancla es la forma de apuntar a una fila sin inventarles
 * una ruta.
 *
 * Devuelve el id destacado, o `null`. El caller decide cómo se ve — acá no se
 * escribe ninguna clase.
 *
 * @param ready `true` cuando la lista ya está renderizada (datos cargados).
 */
export function useHashTarget(ready: boolean): string | null {
  const [targetId, setTargetId] = useState<string | null>(null)

  useEffect(() => {
    if (!ready || typeof window === 'undefined') return

    const id = window.location.hash.slice(1)
    if (!id) return

    setTargetId(id)

    // Un frame de margen: `ready` se vuelve true en el mismo render en el que
    // la lista se pinta, y el nodo recién existe después de que React haga
    // commit al DOM.
    const frame = requestAnimationFrame(() => {
      const el = document.getElementById(id)
      // `block: 'center'` y no 'start': el header del portal es sticky y con
      // 'start' el ítem quedaba medio tapado.
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })

    return () => cancelAnimationFrame(frame)
  }, [ready])

  return targetId
}

/**
 * Clases del ítem apuntado por el ancla. Centralizadas para que las tres
 * secciones destaquen igual — un anillo del color de foco, sin mover el
 * layout (`ring` no ocupa espacio, a diferencia de un `border` más grueso).
 */
export const HASH_TARGET_CLASS = 'ring-2 ring-primary/60 ring-offset-2 ring-offset-background'

/** Margen de scroll para que el header sticky no tape el ítem destacado. */
export const HASH_SCROLL_MARGIN = 'scroll-mt-24'
