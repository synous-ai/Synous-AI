'use client'

import { useEffect, useRef, useState } from 'react'
import type { ProductVersion } from './product-vision-types'

/**
 * Indicador fijo del roadmap: V1 encendida y el resto atenuadas, con una barra
 * del avance de la lectura. Aparece al dejar atrás el hero (`#pv-hero`) y se
 * esconde al llegar al cierre (`#cierre`), donde taparía los botones.
 *
 * El avance se escribe en una variable CSS desde un rAF: no re-renderiza nada
 * mientras se hace scroll.
 */
export function VersionRail({
  versions,
  label,
  cta,
  href,
}: {
  versions: ProductVersion[]
  label: string
  cta: string
  href: string
}) {
  const ref = useRef<HTMLAnchorElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let frame = 0

    function update() {
      frame = 0
      const node = ref.current
      if (!node) return
      const doc = document.documentElement
      const max = doc.scrollHeight - window.innerHeight
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
      node.style.setProperty('--pv-rail-progress', progress.toFixed(4))

      const hero = document.getElementById('pv-hero')
      const close = document.getElementById('cierre')
      const pastHero = hero ? hero.getBoundingClientRect().bottom < window.innerHeight * 0.4 : true
      const atClose = close ? close.getBoundingClientRect().top < window.innerHeight * 0.9 : false
      setVisible(pastHero && !atClose)
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
    <a
      ref={ref}
      href={href}
      className={`pv-rail${visible ? ' is-visible' : ''}`}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      aria-label={`${label}: ${cta}`}
    >
      <span className="pv-rail-label">{label}</span>
      <span className="pv-rail-nodes" aria-hidden="true">
        {versions.map((version, index) => (
          <span key={version.code} className="pv-rail-node-wrap">
            {index > 0 && <i className="pv-rail-link" />}
            <span className={`pv-rail-node${version.current ? ' is-on' : ''}`}>{version.code}</span>
          </span>
        ))}
      </span>
      <span className="pv-rail-bar" aria-hidden="true">
        <i />
      </span>
    </a>
  )
}
