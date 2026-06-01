'use client'

import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useUpdateContact } from '@/lib/hooks'
import type { Contact, Company, TeamUser } from '@/lib/types'
import { cn } from '@/lib/utils'
import { LeadCard } from './lead-card'
import { STAGE_LABELS, STAGE_DOT_CLASS } from '@/lib/status'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Users } from 'lucide-react'

const STAGES = ['lead', 'mql', 'sql', 'opportunity'] as const
type Stage = typeof STAGES[number]

function StageColumn({
  stage,
  leads,
  companyMap,
  userMap,
  onLeadClick,
}: {
  stage: Stage
  leads: Contact[]
  companyMap: Map<string, Company>
  userMap: Map<string, TeamUser>
  onLeadClick: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  return (
    <div className="flex min-w-[15rem] flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', STAGE_DOT_CLASS[stage] ?? 'bg-muted')} />
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {STAGE_LABELS[stage]}
          </h3>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {leads.length}
        </span>
      </div>
      {/* Plain overflow-y-auto — dnd-kit needs to measure the droppable
          container directly. Using ScrollArea (nested Viewport) breaks pointer
          tracking for drag events. */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex max-h-[calc(100vh-16rem)] min-h-[8rem] flex-col gap-2 overflow-y-auto rounded-xl border border-dashed p-2 transition-colors',
          isOver ? 'border-signal bg-signal/5' : 'border-border bg-card/40',
        )}
      >
        {leads.map((c) => (
          <LeadCard
            key={c.id}
            contact={c}
            companyMap={companyMap}
            userMap={userMap}
            onClick={onLeadClick}
          />
        ))}
        {leads.length === 0 && (
          <Empty className="border-dashed py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Users />
              </EmptyMedia>
              <EmptyTitle>Sin Leads</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  )
}

interface LeadBoardProps {
  leads: Contact[]
  companyMap: Map<string, Company>
  userMap: Map<string, TeamUser>
  onLeadClick: (id: string) => void
}

export function LeadBoard({ leads, companyMap, userMap, onLeadClick }: LeadBoardProps) {
  const qc = useQueryClient()
  const updateContact = useUpdateContact()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function onDragEnd(event: DragEndEvent) {
    const contactId = String(event.active.id)
    const targetStage = event.over?.id as Stage | undefined
    if (!targetStage || !STAGES.includes(targetStage)) return
    const lead = leads.find((c) => c.id === contactId)
    if (!lead || lead.lifecycleStage === targetStage) return

    // Optimistic update
    qc.cancelQueries({ queryKey: ['leads'] })
    const prev = qc.getQueryData<Contact[]>(['leads'])
    qc.setQueryData<Contact[]>(['leads'], (old) =>
      old?.map((c) => (c.id === contactId ? { ...c, lifecycleStage: targetStage } : c)),
    )

    updateContact.mutate(
      { id: contactId, input: { lifecycleStage: targetStage } },
      {
        onError: () => {
          if (prev) qc.setQueryData(['leads'], prev)
          toast.error('No se pudo mover el lead. Intentá de nuevo.')
        },
        onSettled: () => {
          qc.invalidateQueries({ queryKey: ['leads'] })
          qc.invalidateQueries({ queryKey: ['clients'] })
          qc.invalidateQueries({ queryKey: ['contacts'] })
        },
      },
    )
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => (
          <StageColumn
            key={stage}
            stage={stage}
            leads={leads.filter((c) => c.lifecycleStage === stage)}
            companyMap={companyMap}
            userMap={userMap}
            onLeadClick={onLeadClick}
          />
        ))}
      </div>
    </DndContext>
  )
}
