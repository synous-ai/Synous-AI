'use client'

import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'

export function EmptyState({
  icon: Icon,
  message,
  hint,
}: {
  icon: typeof FileText
  message: string
  hint: string
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyIllustration icon={Icon} />
        <EmptyTitle>{message}</EmptyTitle>
        <EmptyDescription>{hint}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
  bg,
}: {
  label: string
  value: string
  icon: typeof FileText
  accent: string
  bg: string
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', bg)}>
          <Icon className={cn('h-5 w-5', accent)} />
        </div>
        <p className="min-w-0 truncate text-sm font-medium text-muted-foreground">{label}</p>
      </div>
      <p className={cn('truncate text-3xl font-medium tracking-tight tabular-nums', accent)}>{value}</p>
    </div>
  )
}
