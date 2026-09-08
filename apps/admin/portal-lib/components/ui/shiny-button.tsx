'use client'

/**
 * ShinyButton — primary call to action for the onboarding wizard.
 *
 * The styles live in `app/portal/portal-theme.css` under `.shiny-cta` rather
 * than in a styled-jsx block: the wizard renders this button on every step, and
 * styled-jsx would inject the same `@property`/`@keyframes` declarations once
 * per instance. Colours read from `--primary`, so the button follows the brand.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@portal/lib/utils'

interface ShinyButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
}

export function ShinyButton({ children, className, type = 'button', ...props }: ShinyButtonProps) {
  return (
    <button type={type} className={cn('shiny-cta', className)} {...props}>
      <span className="inline-flex items-center gap-2">{children}</span>
    </button>
  )
}
