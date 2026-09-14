'use client'

import Lenis from 'lenis'
import { useEffect } from 'react'
import 'lenis/dist/lenis.css'

/** Live instance, so an overlay can freeze the page behind it. */
let instance: Lenis | null = null

export function stopSmoothScroll(): void {
  instance?.stop()
}

export function startSmoothScroll(): void {
  instance?.start()
}

/**
 * Smooth scrolling via Lenis. Renders nothing; mount it once per page.
 *
 * Lenis does not advance on its own — `raf()` has to run every frame, hence
 * the loop below.
 *
 * `wheelMultiplier` is tuned per page length: a short page wants a shorter
 * wheel step so the inertia has room to travel. The proposal is long, so it
 * sits near 1 — lower values make a long page feel heavy to get through.
 *
 * `anchors: true` hands anchor links to Lenis, so the nav's in-page jumps ease
 * instead of fighting the smoothing. The header floats over the page, so the
 * offset matches the `scroll-margin-top` the CSS already sets on sections.
 *
 * Lenis drives the window scroll: any inner panel with its own scrollbar needs
 * `data-lenis-prevent` on it.
 */
export function SmoothScroll({ wheelMultiplier = 0.95 }: { wheelMultiplier?: number }) {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const lenis = new Lenis({
      duration: 2,
      wheelMultiplier,
      anchors: { offset: -110 },
    })
    instance = lenis

    let frame = 0
    const loop = (time: number) => {
      lenis.raf(time)
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(frame)
      lenis.destroy()
      instance = null
    }
  }, [wheelMultiplier])

  return null
}
