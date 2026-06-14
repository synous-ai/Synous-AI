'use client'

import { useDraggable } from '@dnd-kit/core'
import { Mail, Phone, Building2, Briefcase, User } from 'lucide-react'
import type { Contact, Company, TeamUser } from '@/lib/types'
import { cn, initials } from '@/lib/utils'
import { STAGE_LABELS, STAGE_DOT_CLASS } from '@/lib/status'
import { sourceLabel } from '@/lib/labels'

export { STAGE_LABELS, STAGE_DOT_CLASS }

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'ahora'
  if (m < 60) return `hace ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h}h`
  const d = Math.floor(h / 24)
  return `hace ${d}d`
}

interface LeadCardProps {
  contact: Contact
  companyMap: Map<string, Company>
  userMap: Map<string, TeamUser>
  onClick: (id: string) => void
}

export function LeadCard({ contact: c, companyMap, userMap, onClick }: LeadCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: c.id })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined

  const companyName = c.companyId ? (companyMap.get(c.companyId)?.name ?? null) : null
  const owner = c.ownerId ? userMap.get(c.ownerId) ?? null : null
  const source = sourceLabel((c.custom?.source as string | undefined) ?? null)
  const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || `#${c.id}`

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onClick(c.id)}
      className={cn(
        'group cursor-grab rounded-2xl border bg-card p-3 shadow-card transition-all',
        'hover:-translate-y-0.5 hover:border-signal/40 hover:shadow-lift active:cursor-grabbing',
        isDragging && 'rotate-1 opacity-60 shadow-lift',
      )}
    >
      {/* Top row: avatar + name + time */}
      <div className="mb-2.5 flex items-start gap-2.5">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-signal text-xs font-bold text-signal-foreground">
          {initials(c.firstName, c.lastName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{fullName}</p>
          <p className="font-mono text-[10px] text-muted-foreground">{timeAgo(c.createdAt)}</p>
        </div>
      </div>

      {/* Detail rows */}
      <div className="space-y-1.5">
        {c.email && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Mail className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{c.email}</span>
          </div>
        )}
        {c.phone && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Phone className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{c.phone}</span>
          </div>
        )}
        {companyName && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{companyName}</span>
          </div>
        )}
        {c.jobTitle && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Briefcase className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{c.jobTitle}</span>
          </div>
        )}
      </div>

      {/* Footer: source + owner */}
      <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <User className="h-3 w-3" />
          <span>{source ?? '—'}</span>
        </div>
        {owner ? (
          <div
            className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground"
            title={`Asignado: ${[owner.firstName, owner.lastName].filter(Boolean).join(' ') || owner.email}`}
          >
            {initials(owner.firstName, owner.lastName)}
          </div>
        ) : (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">
            ?
          </div>
        )}
      </div>
    </div>
  )
}
