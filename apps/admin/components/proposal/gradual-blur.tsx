'use client'

import { useMemo } from 'react'

/**
 * A blur gradient pinned to the bottom edge of the viewport, built by stacking
 * masked layers: each one blurs a little more than the last, so the transition
 * has no visible step.
 *
 * Adapted from React Bits' GradualBlur, trimmed to what this page needs — fixed
 * to the bottom, no presets, no hover.
 */

type Curve = 'linear' | 'bezier' | 'ease-in' | 'ease-out'

type GradualBlurProps = {
  height?: string
  strength?: number
  divCount?: number
  exponential?: boolean
  curve?: Curve
  opacity?: number
  zIndex?: number
}

const CURVE_FUNCTIONS: Record<Curve, (p: number) => number> = {
  linear: (p) => p,
  bezier: (p) => p * p * (3 - 2 * p),
  'ease-in': (p) => p * p,
  'ease-out': (p) => 1 - Math.pow(1 - p, 2),
}

export function GradualBlur({
  height = '6rem',
  strength = 2,
  divCount = 5,
  exponential = true,
  curve = 'bezier',
  opacity = 1,
  zIndex = 9990,
}: GradualBlurProps) {
  const layers = useMemo(() => {
    const increment = 100 / divCount
    const curveFunc = CURVE_FUNCTIONS[curve] ?? CURVE_FUNCTIONS.linear

    return Array.from({ length: divCount }, (_, index) => {
      const i = index + 1
      const progress = curveFunc(i / divCount)

      const blurValue = exponential
        ? Math.pow(2, progress * 4) * 0.0625 * strength
        : 0.0625 * (progress * divCount + 1) * strength

      const p1 = Math.round((increment * i - increment) * 10) / 10
      const p2 = Math.round(increment * i * 10) / 10
      const p3 = Math.round((increment * i + increment) * 10) / 10
      const p4 = Math.round((increment * i + increment * 2) * 10) / 10

      let gradient = `transparent ${p1}%, black ${p2}%`
      if (p3 <= 100) gradient += `, black ${p3}%`
      if (p4 <= 100) gradient += `, transparent ${p4}%`

      const mask = `linear-gradient(to bottom, ${gradient})`

      return (
        <div
          key={i}
          style={{
            position: 'absolute',
            inset: 0,
            maskImage: mask,
            WebkitMaskImage: mask,
            backdropFilter: `blur(${blurValue.toFixed(3)}rem)`,
            WebkitBackdropFilter: `blur(${blurValue.toFixed(3)}rem)`,
            opacity,
            // backdrop-filter opens its own stacking context and recaptures the
            // pointer even when the parent disables it — without this, buttons
            // underneath stop responding.
            pointerEvents: 'none',
          }}
        />
      )
    })
  }, [curve, divCount, exponential, opacity, strength])

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height,
        zIndex,
        pointerEvents: 'none',
        isolation: 'isolate',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        {layers}
      </div>
    </div>
  )
}
