'use client'

import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useEffect, useRef } from 'react'

gsap.registerPlugin(ScrollTrigger)

/**
 * Scroll-in reveal: fade, rise and blur as an element enters the viewport.
 *
 * Elements opt in by data attribute inside the returned container:
 *  - `[data-reveal]`         → fade and rise
 *  - `[data-reveal="title"]` → the same with more travel and a longer duration
 *  - `[data-reveal-group]`   → direct children enter staggered
 *  - `[data-reveal-fade]`    → on a group, animates opacity only
 *
 * `data-reveal-fade` exists because animating `y` writes to `transform`: on a
 * child that already owns its transform (a tilt, a hover scale) the reveal
 * overwrites it and the effect breaks.
 *
 * These are `gsap.from()` animations, so the element's natural state is the
 * final one — if GSAP never runs, the content is visible rather than stuck
 * invisible. `prefers-reduced-motion` takes that path deliberately.
 */
export function useScrollReveal<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const ctx = gsap.context(() => {
      root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
        const isTitle = el.dataset['reveal'] === 'title'
        gsap.from(el, {
          scrollTrigger: { trigger: el, start: 'top 85%' },
          opacity: 0,
          y: isTitle ? 32 : 24,
          filter: 'blur(6px)',
          duration: isTitle ? 0.9 : 0.8,
          ease: 'power3.out',
        })
      })

      root.querySelectorAll<HTMLElement>('[data-reveal-group]').forEach((group) => {
        const fadeOnly = group.hasAttribute('data-reveal-fade')
        const children = Array.from(group.children) as HTMLElement[]

        children.forEach((child, i) => {
          gsap.from(child, {
            scrollTrigger: { trigger: child, start: 'top 88%' },
            opacity: 0,
            ...(fadeOnly ? {} : { y: 22 }),
            duration: 0.65,
            delay: i * 0.08,
            ease: 'power2.out',
          })
        })
      })
    }, root)

    return () => ctx.revert()
  }, [])

  return ref
}
