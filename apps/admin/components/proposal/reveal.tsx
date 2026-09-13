'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

type RevealProps = {
  children: ReactNode
  /** Seconds to wait after the element enters view, for staggering siblings. */
  delay?: number
  className?: string
}

/**
 * Fades and lifts its children the first time they scroll into view.
 *
 * The observer disconnects after firing so the section settles for good — a
 * long page that re-animates on every pass reads as broken, not lively.
 * Respects `prefers-reduced-motion` by rendering visible from the start.
 */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setShown(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          setShown(true)
          observer.disconnect()
        }
      },
      // A small bottom margin holds the reveal until the block is properly in
      // view, rather than firing on the first pixel.
      { threshold: 0.1, rootMargin: '0px 0px -60px 0px' },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`reveal${shown ? ' is-shown' : ''}${className ? ` ${className}` : ''}`}
      style={delay ? { transitionDelay: `${delay}s` } : undefined}
    >
      {children}
    </div>
  )
}
