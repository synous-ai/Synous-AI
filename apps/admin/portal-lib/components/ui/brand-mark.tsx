import * as React from 'react'
import { cn } from '@portal/lib/utils'

/**
 * Brand mark estilo Resend: squircle tinta con glow verde, sheen vidrioso y
 * borde hairline. Decorativo salvo la inicial.
 */
export function BrandMark({
  letter = 'D',
  className,
}: {
  letter?: string
  className?: string
}): React.ReactElement {
  return (
    <div
      className={cn(
        'relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[9px]',
        'bg-neutral-900 ring-1 ring-inset ring-white/10',
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-2.5 -right-1 h-6 w-6 rounded-full bg-emerald-400/70 blur-md"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/15 to-transparent"
      />
      <span className="relative z-10 font-display text-sm font-bold text-white">{letter}</span>
    </div>
  )
}
