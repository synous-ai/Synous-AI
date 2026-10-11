'use client'

/**
 * Vista global de tareas del portal.
 * Tres modos: board (kanban por estado), lista y tabla.
 * Sub-tabs "Abiertas" (default: oculta completadas y canceladas) / "Todas".
 * Barra de filtros: responsable, proyecto, estado, prioridad.
 * Todos los filtros son locales (no modifican la URL) y se aplican en el cliente:
 * el endpoint solo filtra por el responsable PRIMARIO y no filtra por prioridad,
 * así que filtrar en el servidor dejaría afuera tareas con varios responsables.
 * La misma entidad `task` se usa para tareas globales y tareas de proyecto.
 * Al hacer click en una tarea se abre el TaskPanel (checklist, responsables, etc.).
 */

import { useMemo, useState } from 'react'
import {
  LayoutGrid,
  List as ListIcon,
  Table as TableIcon,
  Flag,
  CircleDot,
  User as UserIcon,
  ListTodo,
  ListChecks,
  FolderKanban,
} from 'lucide-react'
import { useTasks, useUsers, useDeals, useProjects } from '@/lib/hooks'
import type { Task, TeamUser } from '@/lib/types'
import { cn } from '@/lib/utils'
import { priority as priorityStatus, taskStatus } from '@/lib/status'
import { PRIORITY_OPTIONS, TASK_STATUS_OPTIONS, checklistProgress } from '@/lib/projects'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { KanbanSkeleton, TableSkeleton, ListSkeleton } from '@/components/ui/skeletons'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PillTabs } from '@/components/ui/pill-tabs'
import { TableShell } from '@/components/ui/data-table'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import { TaskDialog } from '@/components/tasks/task-dialog'
import { TaskBoard } from '@/components/tasks/task-board'
import { TaskPanel } from '@/components/tasks/task-panel'
import { DueBadge } from '@/components/projects/due-badge'
import { MemberAvatars, type PersonLike } from '@/components/projects/member-avatars'

type View = 'board' | 'list' | 'table'

const VIEW_BUTTONS: { mode: View; icon: typeof LayoutGrid; label: string }[] = [
  { mode: 'board', icon: LayoutGrid, label: 'Board' },
  { mode: 'list', icon: ListIcon, label: 'Lista' },
  { mode: 'table', icon: TableIcon, label: 'Tabla' },
]

type Scope = 'open' | 'all'

function isClosed(t: Task): boolean {
  return t.status === 'completed' || t.status === 'cancelled'
}

/** Responsables: `assignees` (N:M) o, de respaldo, el primario resuelto en `userMap`. */
function assigneesOf(t: Task, userMap: Map<string, TeamUser>): PersonLike[] {
  if (t.assignees && t.assignees.length > 0) return t.assignees
  const primary = t.assignedTo ? userMap.get(t.assignedTo) : undefined
  return primary ? [primary] : []
}

export function TasksView() {
  const [view, setView] = useState<View>('board')
  const [scope, setScope] = useState<Scope>('open')
  const [newOpen, setNewOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // ── Filtros locales ─────────────────────────────────────────────────────────
  const [filterAssignee, setFilterAssignee] = useState<string>('')
  const [filterProject, setFilterProject] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterPriority, setFilterPriority] = useState<string>('')

  const { data, isLoading, isError, refetch } = useTasks()
  const { data: users } = useUsers()
  const { data: projects } = useProjects()
  const { data: deals } = useDeals()

  const tasks = useMemo(() => data ?? [], [data])
  const userMap = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users])
  const projectMap = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects])
  const dealMap = useMemo(() => new Map((deals ?? []).map((d) => [d.id, d])), [deals])

  /** Columna "Proyecto": el proyecto interno; si no hay, el deal (tareas viejas). */
  function projectLabel(t: Task): string {
    if (t.projectId) return projectMap.get(t.projectId)?.name ?? '—'
    if (t.dealId) return dealMap.get(t.dealId)?.name ?? '—'
    return '—'
  }

  const openCount = useMemo(() => tasks.filter((t) => !isClosed(t)).length, [tasks])

  const visible = useMemo(
    () =>
      tasks.filter((t) => {
        if (scope === 'open' && isClosed(t)) return false
        if (filterStatus && t.status !== filterStatus) return false
        if (filterPriority && t.priority !== filterPriority) return false
        if (filterProject && t.projectId !== filterProject) return false
        if (filterAssignee && !assigneesOf(t, userMap).some((a) => a.id === filterAssignee)) return false
        return true
      }),
    [tasks, scope, filterStatus, filterPriority, filterProject, filterAssignee, userMap],
  )

  const selected = selectedId ? tasks.find((t) => t.id === selectedId) ?? null : null

  // queryKey real del hook — el board la necesita para el optimistic update de DnD
  const tasksQueryKey = ['tasks', {}]

  function onStatusFilter(v: string): void {
    const next = v === 'all' ? '' : v
    setFilterStatus(next)
    // Elegir un estado cerrado en "Abiertas" daría una lista vacía: pasamos a "Todas".
    if (next === 'completed' || next === 'cancelled') setScope('all')
  }

  function clearFilters() {
    setFilterAssignee('')
    setFilterProject('')
    setFilterStatus('')
    setFilterPriority('')
  }

  const hasFilters = filterAssignee || filterProject || filterStatus || filterPriority

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="eyebrow">Proyectos</p>
          <h1 className="text-3xl font-semibold tracking-tight">Tareas</h1>
        </div>
        <Button onClick={() => setNewOpen(true)}>Nueva Tarea</Button>
      </div>

      {/* Sub-tabs + view toggle + filtros */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <PillTabs
          tabs={[
            { key: 'open', label: 'Abiertas', count: openCount },
            { key: 'all', label: 'Todas', count: tasks.length },
          ]}
          active={scope}
          onChange={setScope}
        />

        {/* Toggle de vista */}
        <div className="flex rounded-lg border border-border bg-card p-1 shadow-card" role="group" aria-label="Vista">
          {VIEW_BUTTONS.map(({ mode, icon: Icon, label }) => (
            <Button
              key={mode}
              variant="ghost"
              size="sm"
              aria-pressed={view === mode}
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
          <SelectTrigger className="h-8 w-40 text-xs" aria-label="Filtrar por responsable">
            <UserIcon className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue placeholder="Responsable" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {(users ?? []).map((u) => (
              <SelectItem key={u.id} value={u.id}>{[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Filtro: Proyecto */}
        <Select value={filterProject || 'all'} onValueChange={(v) => setFilterProject(v === 'all' ? '' : v)}>
          <SelectTrigger className="h-8 w-44 text-xs" aria-label="Filtrar por proyecto">
            <FolderKanban className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue placeholder="Proyecto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los proyectos</SelectItem>
            {(projects ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Filtro: Estado */}
        <Select value={filterStatus || 'all'} onValueChange={onStatusFilter}>
          <SelectTrigger className="h-8 w-40 text-xs" aria-label="Filtrar por estado">
            <CircleDot className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {TASK_STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Filtro: Prioridad */}
        <Select value={filterPriority || 'all'} onValueChange={(v) => setFilterPriority(v === 'all' ? '' : v)}>
          <SelectTrigger className="h-8 w-36 text-xs" aria-label="Filtrar por prioridad">
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
        // El skeleton varía según el view mode activo → CLS ≈ 0 en todos los modos
        view === 'board' ? (
          <KanbanSkeleton columns={4} cardsPerColumn={3} label="Cargando tareas…" />
        ) : view === 'list' ? (
          <ListSkeleton rows={8} label="Cargando tareas…" />
        ) : (
          <TableSkeleton columns={6} rows={8} label="Cargando tareas…" />
        )
      ) : isError ? (
        <Empty>
          <EmptyHeader>
            <EmptyIllustration icon={ListTodo} />
            <EmptyTitle>No se pudieron cargar las tareas</EmptyTitle>
            <EmptyDescription>Revisá tu conexión e intentá de nuevo.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => void refetch()}>Reintentar</Button>
          </EmptyContent>
        </Empty>
      ) : visible.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyIllustration icon={ListTodo} />
            <EmptyTitle>{tasks.length === 0 ? 'Sin Tareas' : 'Sin resultados'}</EmptyTitle>
            <EmptyDescription>
              {tasks.length === 0
                ? 'Creá tu primera tarea para empezar a organizar el trabajo.'
                : scope === 'open' && !hasFilters
                  ? 'No hay tareas abiertas. Mirá la pestaña "Todas" para ver las completadas.'
                  : 'Ninguna tarea coincide con los filtros.'}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {tasks.length === 0 ? (
              <Button size="sm" onClick={() => setNewOpen(true)}>Nueva Tarea</Button>
            ) : hasFilters ? (
              <Button size="sm" variant="outline" onClick={clearFilters}>Limpiar filtros</Button>
            ) : null}
          </EmptyContent>
        </Empty>
      ) : view === 'board' ? (
        <TaskBoard
          tasks={visible}
          userMap={userMap}
          onTaskClick={(t) => setSelectedId(t.id)}
          queryKey={tasksQueryKey}
          hideCompleted={scope === 'open'}
        />
      ) : view === 'list' ? (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {visible.map((t) => {
                const pr = priorityStatus(t.priority)
                const st = taskStatus(t.status)
                const progress = checklistProgress(t.steps)
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
                      {progress.total > 0 && (
                        <span className="hidden items-center gap-1 font-mono text-xs text-muted-foreground sm:inline-flex">
                          <ListChecks className="h-3 w-3" aria-hidden="true" />
                          {progress.done}/{progress.total}
                        </span>
                      )}
                      <span className="hidden max-w-[140px] truncate text-xs text-muted-foreground sm:block">{projectLabel(t)}</span>
                      <MemberAvatars members={assigneesOf(t, userMap)} max={3} className="hidden sm:flex" />
                      <StatusBadge kind={st.kind}>{st.label}</StatusBadge>
                      <StatusBadge kind={pr.kind} className="hidden sm:inline-flex">{pr.label}</StatusBadge>
                      <DueBadge date={t.dueDate} done={isClosed(t)} />
                    </button>
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
                { key: 'assignee', label: 'Responsables' },
                { key: 'project', label: 'Proyecto' },
                { key: 'due', label: 'Vence' },
              ]}
              rows={visible}
              emptyMessage="Sin Tareas"
              renderRow={(t) => {
                const pr = priorityStatus(t.priority)
                const st = taskStatus(t.status)
                return (
                  <tr
                    key={t.id}
                    tabIndex={0}
                    onClick={() => setSelectedId(t.id)}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedId(t.id)}
                    className="cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                  >
                    <td className="px-4 py-3 text-sm font-medium">{t.title}</td>
                    <td className="px-4 py-3"><StatusBadge kind={st.kind}>{st.label}</StatusBadge></td>
                    <td className="px-4 py-3"><StatusBadge kind={pr.kind}>{pr.label}</StatusBadge></td>
                    <td className="px-4 py-3"><MemberAvatars members={assigneesOf(t, userMap)} max={3} /></td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{projectLabel(t)}</td>
                    <td className="px-4 py-3"><DueBadge date={t.dueDate} done={isClosed(t)} /></td>
                  </tr>
                )
              }}
            />
          </CardContent>
        </Card>
      )}

      <TaskPanel task={selected} onClose={() => setSelectedId(null)} />
      <TaskDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  )
}
