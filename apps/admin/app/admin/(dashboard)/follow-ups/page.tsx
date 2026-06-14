'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Check,
  Clock,
  AlertTriangle,
  Calendar,
  ChevronRight,
  Plus,
  Briefcase,
  Activity,
  TrendingUp,
  CheckCircle2,
  Inbox,
} from 'lucide-react'
import { useFocus, useUpdateTask } from '@/lib/hooks'
import type { FollowUpItem, AttentionDeal } from '@/lib/types'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { priority as priorityStatus } from '@/lib/status'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ListSkeleton } from '@/components/ui/skeletons'
import { SkeletonGroup } from '@/components/ui/loading-region'
import { TaskDialog } from '@/components/tasks/task-dialog'
import { DataPagination } from '@/components/ui/data-pagination'
import { usePagination } from '@/lib/use-pagination'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'

// ── Helpers ───────────────────────────────────────────────────────────────────

function entityHref(entity: FollowUpItem['entity']): string | null {
  if (!entity) return null
  if (entity.kind === 'deal') return `/deals`
  if (entity.kind === 'contact') return `/leads/${entity.id}`
  return null
}

// ── Follow-up row ─────────────────────────────────────────────────────────────

function FollowUpRow({
  item,
  variant,
  onComplete,
}: {
  item: FollowUpItem
  variant: 'overdue' | 'today' | 'upcoming'
  onComplete: (id: string) => void
}) {
  const href = entityHref(item.entity)
  const isCompleting = false

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
        variant === 'overdue'
          ? 'border-destructive/30 bg-destructive/5'
          : 'border-border bg-card hover:bg-accent/30',
      )}
    >
      {/* Complete checkbox */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onComplete(item.id)}
        disabled={isCompleting}
        aria-label="Marcar como completada"
        className={cn(
          'h-5 w-5 flex-shrink-0 rounded border transition-colors',
          'border-input hover:border-primary hover:bg-primary/10',
        )}
      >
        <Check className="h-3.5 w-3.5 text-muted-foreground opacity-0 hover:opacity-50 transition-opacity" />
      </Button>

      {/* Title + entity */}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-sm font-medium',
            variant === 'overdue' && 'text-destructive',
          )}
        >
          {item.title}
        </p>
        {item.entity && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            {item.entity.kind === 'deal' && <Briefcase className="h-3 w-3" />}
            {item.entity.kind === 'contact' && <Activity className="h-3 w-3" />}
            {href ? (
              <Link href={href} className="hover:text-foreground hover:underline">
                {item.entity.label}
              </Link>
            ) : (
              <span>{item.entity.label}</span>
            )}
          </p>
        )}
      </div>

      {/* Due date */}
      <span
        className={cn(
          'flex-shrink-0 font-mono text-xs',
          variant === 'overdue' ? 'text-destructive font-semibold' : 'text-muted-foreground',
        )}
      >
        {formatDate(item.dueDate, { day: 'numeric', month: 'short' })}
      </span>

      {/* Priority */}
      {(() => {
        const { kind, label } = priorityStatus(item.priority)
        return <StatusBadge kind={kind} className="flex-shrink-0">{label}</StatusBadge>
      })()}
    </div>
  )
}

// ── Attention deal row ────────────────────────────────────────────────────────

function AttentionDealRow({
  deal,
  variant,
  onCreateTask,
}: {
  deal: AttentionDeal
  variant: 'noNextAction' | 'stale'
  onCreateTask: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <TrendingUp className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{deal.name}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
            {deal.stageLabel}
          </span>
          {deal.amount != null && (
            <span className="font-mono">{formatCurrency(deal.amount, 'USD')}</span>
          )}
          {variant === 'stale' && deal.daysSinceActivity != null && (
            <span className="text-amber-600 font-semibold">
              hace {deal.daysSinceActivity} {deal.daysSinceActivity === 1 ? 'día' : 'días'}
            </span>
          )}
        </p>
      </div>
      {variant === 'noNextAction' && (
        <Button size="sm" variant="outline" onClick={onCreateTask} className="flex-shrink-0 gap-1">
          <Plus className="h-3.5 w-3.5" />
          Tarea
        </Button>
      )}
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  iconClass,
  count,
  children,
  empty,
}: {
  title: string
  icon: typeof AlertTriangle
  iconClass: string
  count: number
  children: React.ReactNode
  empty: string
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Icon className={cn('h-4 w-4', iconClass)} />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {count > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      {count === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground/50" />
          <span>{empty}</span>
        </div>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FollowUpsPage() {
  const [mine, setMine] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const { data, isLoading } = useFocus(mine)
  const updateTask = useUpdateTask()

  const focus = data

  function completeTask(id: string): void {
    updateTask.mutate({ id, input: { status: 'completed' } })
  }

  const overdueItems = focus?.followUps.overdue ?? []
  const todayItems = focus?.followUps.today ?? []
  const upcomingItems = focus?.followUps.upcoming ?? []
  const noNextActionItems = focus?.attention.noNextAction ?? []
  const staleItems = focus?.attention.stale ?? []

  const overduePag = usePagination(overdueItems, 15)
  const todayPag = usePagination(todayItems, 15)
  const upcomingPag = usePagination(upcomingItems, 15)

  const overdueCount = overdueItems.length
  const todayCount = todayItems.length
  const upcomingCount = upcomingItems.length
  const noNextActionCount = noNextActionItems.length
  const staleCount = staleItems.length
  const totalFollowUps = overdueCount + todayCount + upcomingCount

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Seguimientos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tareas abiertas y deals que necesitan atención
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={mine}
              onChange={(e) => setMine(e.target.checked)}
              className="rounded border-input"
            />
            Solo los míos
          </label>
          <Button onClick={() => setTaskOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Nueva Tarea
          </Button>
        </div>
      </div>

      {isLoading ? (
        /* Skeleton fiel: imita la estructura real —
           Card con 3 secciones (Vencidos / Hoy / Próximos 7d) + grilla de 2 deals. */
        <div className="space-y-8">
          {/* Card de follow-ups con 3 secciones */}
          <SkeletonGroup label="Cargando seguimientos…" className="rounded-2xl border bg-card p-6 space-y-6">
            {/* Sección Vencidos */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-6 rounded-full" />
              </div>
              <ListSkeleton rows={3} rowClassName="h-12 rounded-xl" label="Cargando vencidos…" />
            </div>
            {/* Sección Hoy */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-10" />
              </div>
              <ListSkeleton rows={2} rowClassName="h-12 rounded-xl" label="Cargando tareas de hoy…" />
            </div>
            {/* Sección Próximos 7 días */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-32" />
              </div>
              <ListSkeleton rows={2} rowClassName="h-12 rounded-xl" label="Cargando próximos…" />
            </div>
          </SkeletonGroup>

          {/* Grilla de 2 cards de deals que necesitan atención */}
          <div>
            <Skeleton className="h-6 w-52 mb-4" />
            <div className="grid gap-6 lg:grid-cols-2">
              <SkeletonGroup label="Cargando deals sin próxima acción…" className="rounded-2xl border bg-card p-6 space-y-3">
                <div className="flex items-center gap-2 mb-3">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 w-36" />
                </div>
                <ListSkeleton rows={3} rowClassName="h-12 rounded-xl" />
              </SkeletonGroup>
              <SkeletonGroup label="Cargando deals sin actividad reciente…" className="rounded-2xl border bg-card p-6 space-y-3">
                <div className="flex items-center gap-2 mb-3">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 w-44" />
                </div>
                <ListSkeleton rows={3} rowClassName="h-12 rounded-xl" />
              </SkeletonGroup>
            </div>
          </div>
        </div>
      ) : totalFollowUps === 0 && noNextActionCount === 0 && staleCount === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="py-4">
            <Empty className="border-dashed">
              <EmptyHeader>
                <EmptyIllustration icon={CheckCircle2} />
                <EmptyTitle>Todo al Día</EmptyTitle>
                <EmptyDescription>No hay tareas vencidas ni deals sin actividad. Sigue así.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* ── Follow-ups ──────────────────────────────────────────────── */}
          <Card className="rounded-2xl">
            <CardContent className="space-y-6 p-6">
              <Section
                title="Vencidos"
                icon={AlertTriangle}
                iconClass="text-destructive"
                count={overdueCount}
                empty="Sin tareas vencidas — ¡bien hecho!"
              >
                {overduePag.pageItems.map((item: FollowUpItem) => (
                  <FollowUpRow
                    key={item.id}
                    item={item}
                    variant="overdue"
                    onComplete={completeTask}
                  />
                ))}
                <DataPagination
                  page={overduePag.page}
                  pageCount={overduePag.pageCount}
                  onPageChange={overduePag.setPage}
                />
              </Section>

              <Section
                title="Hoy"
                icon={Clock}
                iconClass="text-amber-500"
                count={todayCount}
                empty="Nada programado para hoy."
              >
                {todayPag.pageItems.map((item: FollowUpItem) => (
                  <FollowUpRow
                    key={item.id}
                    item={item}
                    variant="today"
                    onComplete={completeTask}
                  />
                ))}
                <DataPagination
                  page={todayPag.page}
                  pageCount={todayPag.pageCount}
                  onPageChange={todayPag.setPage}
                />
              </Section>

              <Section
                title="Próximos 7 días"
                icon={Calendar}
                iconClass="text-primary"
                count={upcomingCount}
                empty="Sin seguimientos en los próximos 7 días."
              >
                {upcomingPag.pageItems.map((item: FollowUpItem) => (
                  <FollowUpRow
                    key={item.id}
                    item={item}
                    variant="upcoming"
                    onComplete={completeTask}
                  />
                ))}
                <DataPagination
                  page={upcomingPag.page}
                  pageCount={upcomingPag.pageCount}
                  onPageChange={upcomingPag.setPage}
                />
              </Section>
            </CardContent>
          </Card>

          {/* ── Deals que necesitan atención ────────────────────────────── */}
          <div>
            <h2 className="mb-4 text-lg font-bold">Deals que Necesitan Atención</h2>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Sin próxima acción */}
              <Card className="rounded-2xl">
                <CardContent className="p-6">
                  <Section
                    title="Sin próxima acción"
                    icon={ChevronRight}
                    iconClass="text-amber-500"
                    count={noNextActionCount}
                    empty="Todos los deals tienen al menos una tarea abierta. ✦"
                  >
                    {noNextActionItems.map((deal: AttentionDeal) => (
                      <AttentionDealRow
                        key={deal.id}
                        deal={deal}
                        variant="noNextAction"
                        onCreateTask={() => setTaskOpen(true)}
                      />
                    ))}
                  </Section>
                </CardContent>
              </Card>

              {/* Sin actividad reciente */}
              <Card className="rounded-2xl">
                <CardContent className="p-6">
                  <Section
                    title="Sin actividad reciente (+14 días)"
                    icon={Activity}
                    iconClass="text-amber-600"
                    count={staleCount}
                    empty="Todos los deals tuvieron actividad reciente. ✦"
                  >
                    {staleItems.map((deal: AttentionDeal) => (
                      <AttentionDealRow
                        key={deal.id}
                        deal={deal}
                        variant="stale"
                        onCreateTask={() => setTaskOpen(true)}
                      />
                    ))}
                  </Section>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      <TaskDialog open={taskOpen} onClose={() => setTaskOpen(false)} />
    </div>
  )
}
