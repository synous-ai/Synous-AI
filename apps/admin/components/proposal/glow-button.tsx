'use client'

import { useCallback, useEffect, useRef, type ReactNode } from 'react'

/** Where the inner light rests when the pointer is away. */
const IDLE_TRANSLATE = '-10%'
/** Matches the CSS transition, so the light finishes travelling before reset. */
const RESET_DELAY_MS = 1200

type GlowButtonProps = {
  href: string
  children: ReactNode
}

/**
 * CTA with a light that tracks the pointer: an inner glow slides across the
 * face while two blurred halos trade opacity behind it, so the button reads as
 * lit from wherever the cursor is rather than statically glowing.
 *
 * Pointer-driven only — with no pointer the button sits at its resting state,
 * which is a complete, legible button on its own.
 */
export function GlowButton({ href, children }: GlowButtonProps) {
  const shellRef = useRef<HTMLDivElement>(null)
  const faceRef = useRef<HTMLAnchorElement>(null)
  const resetTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(resetTimer.current), [])

  const handleMove = useCallback((event: React.PointerEvent<HTMLAnchorElement>) => {
    const shell = shellRef.current
    const face = faceRef.current
    if (!shell || !face) return

    clearTimeout(resetTimer.current)
    face.classList.add('is-tracking')

    const shellBox = shell.getBoundingClientRect()
    const ratio = Math.min(Math.max((event.clientX - shellBox.left) / shellBox.width, 0), 1)
    shell.style.setProperty('--halo-right', ratio.toFixed(2))
    shell.style.setProperty('--halo-left', (1 - ratio).toFixed(2))

    const faceBox = face.getBoundingClientRect()
    const travel = ((event.clientX - faceBox.left) / faceBox.width) * 100 - 100
    face.style.setProperty('--light-x', `${travel}%`)
  }, [])

  const handleLeave = useCallback(() => {
    const shell = shellRef.current
    const face = faceRef.current
    if (!shell || !face) return

    face.classList.remove('is-tracking')
    resetTimer.current = setTimeout(() => {
      shell.style.setProperty('--halo-right', '1')
      shell.style.setProperty('--halo-left', '0')
      face.style.setProperty('--light-x', IDLE_TRANSLATE)
    }, RESET_DELAY_MS)
  }, [])

  return (
    <div className="glow-button" ref={shellRef}>
      <a
        className="glow-button-face"
        href={href}
        ref={faceRef}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
      >
        {children}
        <svg viewBox="6742.32 9159.55 7528.14 3447.5" aria-hidden="true">
          <path
            fill="currentColor"
            d="M13269.45 10597.46c-1964.77,15.88 -3975.5,0.42 -5949.45,0.41 -192.16,0 -563.01,-55.48 -577.35,275.97 -5.7,131.93 62.65,216.31 151.32,263.33 123.85,65.68 1063.9,35.38 1239.9,35.38 1708.85,0 3417.71,0 5126.56,0 -24.04,56.99 -1.29,18.98 -40.47,66.96l-723.66 722.6c-110.92,110.93 -332.23,247.35 -211.58,493.66 36.78,75.08 117.58,140.42 228.7,149.76 147.85,12.44 199.36,-52.99 267.49,-123.63l1347.53 -1347.38c202.34,-198.95 176.65,-327.56 -2.38,-502.16l-1356.15 -1356.82c-195.06,-205.3 -415.09,-102.33 -484.18,34.4 -124.13,245.66 123.57,410.11 217.29,503.83 117.39,117.39 726.33,699.37 766.43,783.69z"
          />
        </svg>
      </a>
    </div>
  )
}
