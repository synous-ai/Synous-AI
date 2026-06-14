'use client'

import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@portal/lib/utils'

// Superelipse (squircle) normalizada a 96px — el sello visual de Resend.
const SQUIRCLE_96 =
  'path("M 48 0 C 72.6 0 77.4 0 82.7 1.8 C 88.3 3.9 92.1 7.7 94.2 13.3 C 96 18.6 96 23.4 96 48 C 96 72.6 96 77.4 94.2 82.7 C 92.1 88.3 88.3 92.1 82.7 94.2 C 77.4 96 72.6 96 48 96 C 23.4 96 18.6 96 13.3 94.2 C 7.7 92.1 3.9 88.3 1.8 82.7 C 0 77.4 0 72.6 0 48 C 0 23.4 0 18.6 1.8 13.3 C 3.9 7.7 7.7 3.9 13.3 1.8 C 18.6 0 23.4 0 48 0")'

/**
 * Ilustración de empty-state estilo Resend: glow difuminado + tile squircle 3D
 * embossed + ícono lucide muted, con float sutil. Decorativa (aria-hidden).
 * Reqs: keyframes `float`/`glow-breathe` en globals.css. Theme-aware.
 */
export function EmptyIllustration({
  icon: Icon,
  className,
}: {
  icon: LucideIcon
  className?: string
}): React.ReactElement {
  return (
    <div className={cn('relative flex shrink-0 items-center justify-center pb-3', className)}>
      {/* Glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 select-none motion-safe:animate-glow-breathe"
        style={{
          width: 320,
          height: 110,
          borderRadius: 100,
          background: 'linear-gradient(rgb(217,217,217) 0%, rgb(115,115,115) 100%)',
          filter: 'blur(54px)',
          opacity: 0.15,
          transform: 'translate(-50%,-50%) rotate(-15deg)',
        }}
      />
      {/* Tile squircle 3D embossed (flota) */}
      <div className="relative motion-safe:animate-float" aria-hidden>
        <div
          className={cn(
            'flex items-center justify-center',
            'bg-gradient-to-b from-white to-neutral-100',
            'dark:from-neutral-700 dark:to-neutral-900',
            'border border-black/[0.06] dark:border-white/[0.06]',
            'shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_10px_24px_-8px_rgba(0,0,0,0.25)]',
            'dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_24px_-8px_rgba(0,0,0,0.5)]',
          )}
          style={{ width: 96, height: 96, clipPath: SQUIRCLE_96 }}
        >
          <Icon
            className="h-9 w-9 text-neutral-500 dark:text-neutral-300"
            style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.15))' }}
            strokeWidth={1.75}
          />
        </div>
      </div>
    </div>
  )
}
