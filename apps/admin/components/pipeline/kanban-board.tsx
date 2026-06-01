'use client'

import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core'
import { HelpCircle } from 'lucide-react'
import { useChangeStage } from '@/lib/hooks'
import type { Deal, Stage } from '@/lib/types'
import { cn, formatCurrency } from '@/lib/utils'

function DealCard({ deal, onClick }: { deal: Deal; onClick: (d: Deal) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onClick(deal)}
      className={cn(
        'group cursor-grab rounded-md border bg-card p-3 shadow-card transition-all hover:-translate-y-0.5 hover:border-signal/40 hover:shadow-lift active:cursor-grabbing',
        isDragging && 'rotate-1 opacity-60 shadow-lift',
      )}
    >
      <p className="text-sm font-medium leading-snug">{deal.name}</p>
      <p className="mt-1.5 font-mono text-xs text-muted-foreground">{formatCurrency(deal.amount, deal.currency)}</p>
    </div>
  )
}

function StageColumn({ stage, deals, onDealClick }: { stage: Stage; deals: Deal[]; onDealClick: (d: Deal) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  return (
    <div className="flex w-72 flex-shrink-0 flex-col">
      <div className="mb-2 px-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {stage.isWon && <span className="h-1.5 w-1.5 rounded-full bg-signal" />}
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{stage.label}</h3>
            {stage.exitCriteria && (
              <span title={stage.exitCriteria} aria-label={`Criterio de salida: ${stage.exitCriteria}`} className="flex-shrink-0">
                <HelpCircle className="h-3 w-3 text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-default" />
              </span>
            )}
          </div>
          <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">{deals.length}</span>
        </div>
        {stage.exitCriteria && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground/60 leading-tight">
            {stage.exitCriteria}
          </p>
        )}
      </div>
      {/* dnd-kit needs the droppable ref on the actual scroll container so we
          use a plain overflow-y-auto div. ScrollArea uses a nested Viewport that
          dnd-kit cannot reliably measure for pointer position. */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex max-h-[calc(100vh-16rem)] min-h-[8rem] flex-col gap-2 overflow-y-auto rounded-lg border border-dashed p-2 transition-colors',
          isOver ? 'border-signal bg-signal/5' : 'border-border bg-card/40',
        )}
      >
        {deals.map((d) => (
          <DealCard key={d.id} deal={d} onClick={onDealClick} />
        ))}
      </div>
    </div>
  )
}

export function KanbanBoard({
  stages,
  deals,
  onDealClick,
}: {
  stages: Stage[]
  deals: Deal[]
  onDealClick: (d: Deal) => void
}) {
  const changeStage = useChangeStage()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function onDragEnd(event: DragEndEvent) {
    const dealId = String(event.active.id)
    const targetStageId = event.over ? String(event.over.id) : null
    if (!targetStageId) return
    const deal = deals.find((d) => d.id === dealId)
    if (!deal || deal.stageId === targetStageId) return
    changeStage.mutate({ dealId, stageId: targetStageId })
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            deals={deals.filter((d) => d.stageId === stage.id)}
            onDealClick={onDealClick}
          />
        ))}
      </div>
    </DndContext>
  )
}
