'use client'

import { useEffect, useRef } from 'react'
import type { ProductVersion } from './product-vision-types'

/** Altura de la pantalla (en fracción) donde "llega" la línea al hacer scroll. */
const REACH = 0.6
/** Cuántos píxeles antes de llegar a un nodo empieza a completarse su círculo. */
const NODE_RAMP = 90

/**
 * La línea de tiempo del roadmap: una versión por fila, unidas por una línea
 * que se llena con el scroll. Al acercarse a cada versión su círculo se va
 * completando y, al llegar, la versión se enciende.
 *
 * Todo se escribe en variables CSS y `data-reached` desde un rAF, sin
 * re-renderizar. Con movimiento reducido arranca todo encendido.
 */
export function VersionTimeline({ versions }: { versions: ProductVersion[] }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const track = root.querySelector<HTMLElement>('.pv-timeline-track')
    const items = Array.from(root.querySelectorAll<HTMLElement>('.pv-timeline-item'))

    function paint(reachY: number | null) {
      if (track) {
        const rect = track.getBoundingClientRect()
        const fill = reachY === null ? 1 : Math.min(1, Math.max(0, (reachY - rect.top) / rect.height))
        root!.style.setProperty('--pv-fill', fill.toFixed(4))
      }
      for (const item of items) {
        const node = item.querySelector<HTMLElement>('.pv-timeline-node')
        if (!node) continue
        let progress = 1
        if (reachY !== null) {
          const rect = node.getBoundingClientRect()
          const center = rect.top + rect.height / 2
          progress = Math.min(1, Math.max(0, (reachY - (center - NODE_RAMP)) / NODE_RAMP))
        }
        item.style.setProperty('--pv-node', progress.toFixed(4))
        item.dataset.reached = progress >= 1 ? 'true' : 'false'
      }
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      paint(null)
      return
    }

    let frame = 0
    function update() {
      frame = 0
      paint(window.innerHeight * REACH)
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [])

  return (
    <div ref={ref} className="pv-timeline">
      <span className="pv-timeline-track" aria-hidden="true">
        <i />
      </span>
      <ol className="pv-timeline-list">
        {versions.map((version) => (
          <li key={version.code} className={`pv-timeline-item${version.current ? ' is-current' : ''}`}>
            <span className="pv-timeline-node" aria-hidden="true" />
            <article className="pv-version">
              <header className="pv-version-head">
                <span className="pv-version-code">{version.code}</span>
                <span className={`pv-version-tag${version.current ? ' is-current' : ''}`}>{version.tag}</span>
              </header>
              <h3 className="pv-version-name">{version.name}</h3>
              <p className="pv-version-summary">{version.summary}</p>
              <p className="pv-version-open">
                <span aria-hidden="true">+</span>
                {version.open}
              </p>
            </article>
          </li>
        ))}
      </ol>
    </div>
  )
}
