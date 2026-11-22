'use client'

import { useEffect, useRef, useState } from 'react'

const DURATION_MS = 1200

/** "USD 1.500" → 1500. Devuelve null si el texto no trae un número entero. */
function parseAmount(text: string): { prefix: string; value: number } | null {
  const match = /^(\D*)(\d{1,3}(?:\.\d{3})*)$/.exec(text.trim())
  if (!match) return null
  return { prefix: match[1] ?? '', value: Number(match[2]!.replace(/\./g, '')) }
}

function format(prefix: string, value: number): string {
  return `${prefix}${value.toLocaleString('es-AR')}`
}

/**
 * Un monto que cuenta desde cero la primera vez que entra en pantalla.
 *
 * El HTML del servidor trae el valor final, así que sin JS (o con movimiento
 * reducido) se lee igual. Si el texto no es un monto simple, se muestra tal cual.
 */
export function CountUp({ value, className }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const parsed = parseAmount(value)
  const [text, setText] = useState(value)

  useEffect(() => {
    const node = ref.current
    if (!node || !parsed) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        const start = performance.now()
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / DURATION_MS)
          const eased = 1 - Math.pow(1 - t, 3)
          setText(format(parsed.prefix, Math.round(parsed.value * eased)))
          if (t < 1) frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
      },
      { threshold: 0.6 },
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
    // Solo depende del texto original.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  )
}
