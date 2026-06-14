'use client'

/**
 * Vista global de tareas del portal.
 * Tres modos: board (kanban por estado), lista y tabla.
 * Barra de filtros: responsable, proyecto/deal, estado, prioridad.
 * Cada filtro es local (no modifica la URL) — apropiado para dos usuarios.
 * La misma entidad `task` se usa para tareas globales y tareas de proyecto:
 * en el board global no se filtra por dealId (se muestran todas).
 */

import { useMemo, useState } from 'react'
import {
  LayoutGrid,
  List as ListIcon,
  Table as TableIcon,
  Flag,
  CalendarClock,
  Trash2,
  Clock,
  CircleDot,
  User as UserIcon,
  AlignLeft,
  ListTodo,
  FolderKanban,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTasks, useUpdateTask, useDeleteTask, useUsers, useDeals } from '@/lib/hooks'
import type { Task, TeamUser } from '@/lib/types'
import { cn, initials } from '@/lib/utils'
import { priority as priorityStatus, taskStatus } from '@/lib/status'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { TableShell } from '@/components/ui/data-table'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import { TaskDialog } from '@/components/tasks/task-dialog'
import { TaskBoard } from '@/components/tasks/task-board'
import type { Deal } from '@/lib/types'

type View = 'board' | 'list' | 'table'

const VIEW_BUTTONS: { mode: View; icon: typeof LayoutGrid; label: string }[] = [
  { mode: 'board', icon: LayoutGrid, label: 'Board' },
  { mode: 'list', icon: ListIcon, label: 'Lista' },
  { mode: 'table', icon: TableIcon, label: 'Tabla' },
]

// Opciones de estado visibles en el filtro (cancelled se puede ver en tabla/lista)
const FILTER_STATUS_OPTIONS = [
  { value: 'pending', label: 'Por hacer' },
  { value: 'in_progress', label: 'En curso' },
  { value: 'blocked', label: 'Bloqueada' },
  { value: 'completed', label: 'Hecho' },
  { value: 'cancelled', label: 'Cancelado' },
]

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Baja' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
]

// Opciones de estado del panel de detalle (incluye cancelled)
const DETAIL_STATUS_OPTIONS = ['pending', 'in_progress', 'blocked', 'completed', 'cancelled']

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtDateTime(s: string): string {
  return new Date(s).toLocaleString('es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function isOverdue(t: Task): boolean {
  return !!t.dueDate && t.status !== 'completed' && new Date(t.dueDate).getTime() < Date.now()
}
function userName(u: TeamUser | null | undefined): string {
  if (!u) return 'Sin asignar'
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email
}
function dealName(d: Deal | null | undefined): string {
  return d?.name ?? '—'
}

export function TasksView() {
  const [view, setView] = useState<View>('board')
  const [newOpen, setNewOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // ── Filtros locales ─────────────────────────────────────────────────────────
  const [filterAssignee, setFilterAssignee] = useState<string>('')
  const [filterDeal, setFilterDeal] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterPriority, setFilterPriority] = useState<string>('')

  // El board muestra todas las columnas por estado internamente, así que no filtramos
  // status en la query cuando estamos en board (el filtro de estado solo aplica en lista/tabla).
  const activeFilters = {
    assignedTo: filterAssignee || undefined,
    dealId: filterDeal || undefined,
    status: (view !== 'board' && filterStatus) ? filterStatus : undefined,
    priority: filterPriority || undefined,
  }

  const { data, isLoading } = useTasks(activeFilters)
  const { data: users } = useUsers()
  const { data: deals } = useDeals()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

  const tasks = useMemo(() => data ?? [], [data])
  const userMap = useMemo(() => {
    const m = new Map<string, TeamUser>()
    for (const u of users ?? []) m.set(u.id, u)
    return m
  }, [users])
  const dealMap = useMemo(() => {
    const m = new Map<string, Deal>()
    for (const d of deals ?? []) m.set(d.id, d)
    return m
  }, [deals])

  // En el board filtramos por estado localmente (sin round-trip) para no
  // colapsar todas las columnas al cambiar el filtro de estado.
  const boardTasks = useMemo(() => {
    if (!filterStatus) return tasks
    return tasks.filter((t) => t.status === filterStatus)
  }, [tasks, filterStatus])

  const selected = selectedId ? tasks.find((t) => t.id === selectedId) ?? null : null

  // queryKey real del hook — el board la necesita para el optimistic update de DnD
  const tasksQueryKey = ['tasks', activeFilters]

  function patch(id: string, input: Parameters<typeof updateTask.mutate>[0]['input']) {
    updateTask.mutate({ id, input })
  }

  function onDelete(t: Task) {
    deleteTask.mutate(t.id, {
      onSuccess: () => {
        setSelectedId(null)
        toast.success('Tarea eliminada')
      },
    })
  }

  function clearFilters() {
    setFilterAssignee('')
    setFilterDeal('')
    setFilterStatus('')
    setFilterPriority('')
  }

  const hasFilters = filterAssignee || filterDeal || filterStatus || filterPriority

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="eyebrow">Operaciones</p>
          <h1 className="text-3xl font-semibold tracking-tight">Tareas</h1>
        </div>
        <Button onClick={() => setNewOpen(true)}>Nueva Tarea</Button>
      </div>

      {/* View toggle + filtros */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {/* Toggle de vista */}
        <div className="flex rounded-lg border border-border bg-card p-1 shadow-card">
          {VIEW_BUTTONS.map(({ mode, icon: Icon, label }) => (
            <Button
              key={mode}
              variant="ghost"
              size="sm"
              onClick={() => setView(mode)}
              className={cn(
                'flex h-auto items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                view === mode
                  ? 'bg-accent text-accent-foreground shadow-sm hover:bg-accent'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Button>
          ))}
        </div>

        {/* Filtro: Responsable */}
        <Select value={filterAssignee || 'all'} onValueChange={(v) => setFilterAssignee(v === 'all' ? '' : v)}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <UserIcon className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue placeholder="Responsable" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {(users ?? []).map((u) => (
              <SelectItem key={u.id} value={u.id}>{userName(u)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Filtro: Proyecto/Deal */}
        <Select value={filterDeal || 'all'} onValueChange={(v) => setFilterDeal(v === 'all' ? '' : v)}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <FolderKanban className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue placeholder="Proyecto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los proyectos</SelectItem>
            {(deals ?? []).map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Filtro: Estado — en board aplica sobre las tarjetas localmente */}
        <Select value={filterStatus || 'all'} onValueChange={(v) => setFilterStatus(v === 'all' ? '' : v)}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <CircleDot className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {FILTER_STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Filtro: Prioridad */}
        <Select value={filterPriority || 'all'} onValueChange={(v) => setFilterPriority(v === 'all' ? '' : v)}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <Flag className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue placeholder="Prioridad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {PRIORITY_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs text-muted-foreground">
            Limpiar filtros
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : tasks.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyIllustration icon={ListTodo} />
            <EmptyTitle>Sin Tareas</EmptyTitle>
            <EmptyDescription>Creá tu primera tarea para empezar a organizar el trabajo.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setNewOpen(true)}>Nueva Tarea</Button>
          </EmptyContent>
        </Empty>
      ) : view === 'board' ? (
        <TaskBoard
          tasks={boardTasks}
          userMap={userMap}
          onTaskClick={(t) => setSelectedId(t.id)}
          queryKey={tasksQueryKey}
        />
      ) : view === 'list' ? (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {tasks.map((t) => {
                const pr = priorityStatus(t.priority)
                const st = taskStatus(t.status)
                const assignee = t.assignedTo ? userMap.get(t.assignedTo) : null
                const deal = t.dealId ? dealMap.get(t.dealId) : null
                return (
                  <li
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <span className={cn('h-2 w-2 flex-shrink-0 rounded-full',
                      t.status === 'completed' ? 'bg-emerald-500'
                      : t.status === 'in_progress' ? 'bg-amber-400'
                      : t.status === 'blocked' ? 'bg-destructive'
                      : 'bg-muted-foreground'
                    )} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
                    {deal && (
                      <span className="hidden truncate text-xs text-muted-foreground sm:block max-w-[120px]">{deal.name}</span>
                    )}
                    <span className="hidden text-xs text-muted-foreground sm:block">{userName(assignee)}</span>
                    <StatusBadge kind={st.kind}>{st.label}</StatusBadge>
                    <StatusBadge kind={pr.kind}>{pr.label}</StatusBadge>
                    {t.dueDate && (
                      <span className={cn('hidden items-center gap-1 text-xs sm:inline-flex', isOverdue(t) ? 'text-destructive' : 'text-muted-foreground')}>
                        <CalendarClock className="h-3 w-3" />
                        {fmtDate(t.dueDate)}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <TableShell
              columns={[
                { key: 'title', label: 'Título' },
                { key: 'status', label: 'Estado' },
                { key: 'priority', label: 'Prioridad' },
                { key: 'assignee', label: 'Responsable' },
                { key: 'deal', label: 'Proyecto' },
                { key: 'due', label: 'Vence' },
              ]}
              rows={tasks}
              emptyMessage="Sin Tareas"
              renderRow={(t) => {
                const pr = priorityStatus(t.priority)
                const st = taskStatus(t.status)
                const assignee = t.assignedTo ? userMap.get(t.assignedTo) : null
                const deal = t.dealId ? dealMap.get(t.dealId) : null
                return (
                  <tr key={t.id} onClick={() => setSelectedId(t.id)} className="cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/50">
                    <td className="px-4 py-3 text-sm font-medium">{t.title}</td>
                    <td className="px-4 py-3"><StatusBadge kind={st.kind}>{st.label}</StatusBadge></td>
                    <td className="px-4 py-3"><StatusBadge kind={pr.kind}>{pr.label}</StatusBadge></td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{userName(assignee)}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{dealName(deal)}</td>
                    <td className={cn('px-4 py-3 text-sm', isOverdue(t) ? 'text-destructive' : 'text-muted-foreground')}>{t.dueDate ? fmtDate(t.dueDate) : '—'}</td>
                  </tr>
                )
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Panel de detalle */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-6 text-left text-xl">{selected.title}</SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-4">
                <Row icon={Clock} label="Creada">
                  <span className="text-sm">{fmtDateTime(selected.createdAt)}</span>
                </Row>

                <Row icon={CircleDot} label="Estado">
                  <Select value={selected.status} onValueChange={(v) => patch(selected.id, { status: v as Task['status'] })}>
                    <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DETAIL_STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>{taskStatus(s).label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Row>

                <Row icon={Flag} label="Prioridad">
                  <Select value={selected.priority} onValueChange={(v) => patch(selected.id, { priority: v as Task['priority'] })}>
                    <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Row>

                <Row icon={CalendarClock} label="Vence">
                  <input
                    type="date"
                    value={selected.dueDate ? selected.dueDate.slice(0, 10) : ''}
                    onChange={(e) => patch(selected.id, { dueDate: e.target.value || undefined })}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  />
                </Row>

                <Row icon={UserIcon} label="Responsable">
                  <Select
                    value={selected.assignedTo ?? 'none'}
                    onValueChange={(v) => patch(selected.id, { assignedTo: v === 'none' ? undefined : v })}
                  >
                    <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin asignar</SelectItem>
                      {(users ?? []).map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          <span className="flex items-center gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-accent-foreground">
                              {initials(u.firstName, u.lastName)}
                            </span>
                            {userName(u)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Row>

                {/* Descripción editable (guarda al salir del campo) */}
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    <AlignLeft className="h-3 w-3" /> Descripción
                  </p>
                  <Textarea
                    defaultValue={selected.body ?? ''}
                    placeholder="Agregá una descripción…"
                    rows={4}
                    onBlur={(e) => {
                      const v = e.target.value
                      if (v !== (selected.body ?? '')) patch(selected.id, { body: v || undefined })
                    }}
                    className="border-0 bg-transparent p-0 focus-visible:ring-0"
                  />
                </div>

                <div className="flex justify-end border-t pt-4">
                  <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onDelete(selected)}>
                    <Trash2 className="h-4 w-4" />
                    Eliminar tarea
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <TaskDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  )
}

function Row({ icon: Icon, label, children }: { icon: typeof Flag; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex w-32 flex-shrink-0 items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
