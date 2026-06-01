'use client'

import type { StatusKind } from '@/lib/status'
import { BADGE_CLASS } from '@/lib/status'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  kind: StatusKind
  children: React.ReactNode
  className?: string
}

/**
 * StatusBadge — presentational badge for semantic status display.
 *
 * Keeps the base pill styles and merges the kind-specific colour classes.
 * All colour/label decisions live in lib/status.ts — this component is
 * intentionally dumb: it just renders what it receives.
 *
 * @example
 *   import { StatusBadge } from '@/components/ui/status-badge'
 *   import { invoiceStatus } from '@/lib/status'
 *
 *   const { kind, label } = invoiceStatus(invoice.status)
 *   return <StatusBadge kind={kind}>{label}</StatusBadge>
 */
export function StatusBadge({ kind, children, className }: StatusBadgeProps) {
  return (
    <span className={cn(BADGE_CLASS.base, BADGE_CLASS[kind], className)}>
      {children}
    </span>
  )
}
