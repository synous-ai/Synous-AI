'use client'

import { cn } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

/**
 * Segmented-control style pill tabs — matches Resend's "Sending | Receiving" pattern.
 * Built internally on shadcn Tabs primitives while preserving the original controlled API.
 *
 * Usage:
 *   <PillTabs
 *     tabs={[{ key: 'a', label: 'Alpha' }, { key: 'b', label: 'Beta', count: 3 }]}
 *     active="a"
 *     onChange={(key) => setTab(key)}
 *   />
 */
export interface PillTab<T extends string = string> {
  key: T
  label: string
  count?: number
}

interface PillTabsProps<T extends string> {
  tabs: PillTab<T>[]
  active: T
  onChange: (key: T) => void
  /** Extra className on the outer container */
  className?: string
}

export function PillTabs<T extends string>({ tabs, active, onChange, className }: PillTabsProps<T>) {
  return (
    <Tabs value={active} onValueChange={(v) => onChange(v as T)} className={className}>
      <TabsList className="h-auto rounded-lg bg-muted/60 p-1">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.key}
            value={tab.key}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={cn(
                'rounded-full px-1.5 py-0.5 font-mono text-[10px] leading-none bg-border text-muted-foreground',
              )}>
                {tab.count}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
