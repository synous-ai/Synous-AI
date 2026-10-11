'use client'

/**
 * Kanban de tareas de un proyecto. Tres columnas:
 *  - Por comenzar: pending
 *  - En proceso:   in_progress + in_review + blocked (la tarjeta muestra un badge para in_review/blocked)
 *  - Terminado:    completed
 * Las canceladas no se muestran. Arrastrar dentro o entre columnas llama a
 * POST /projects/:id/tasks/move con los ids COMPLETOS de la columna destino.
 * Se usa solo @dnd-kit/core (el repo no tiene @dnd-kit/sortable): cada tarjeta
 * es draggable y droppable a la vez, y la posición de inserción sale de si el
 * puntero está en la mitad superior o inferior de la tarjeta sobre la que cae.
 */

import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { ListChecks, ListTodo, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { useCreateTask, useMoveProjectTask } from '@/lib/hooks'
import type { Task, TaskStatus } from '@/lib/types'
import { taskStatus } from '@/lib/status'
import { checklistProgress } from '@/lib/projects'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { DueBadge } from '@/components/projects/due-badge'
import { MemberAvatars } from '@/components/projects/member-avatars'

type ColumnKey = 'todo' | 'doing' | 'done'

interface ColumnDef {
  key: ColumnKey
  label: string
  dot: string
  statuses: readonly TaskStatus[]
  /** Estado al que pasa una tarea soltada acá (si no está ya en uno de `statuses`). */
  dropStatus: TaskStatus
}

export const BOARD_COLUMNS: readonly ColumnDef[] = [
  { key: 'todo', label: 'Por comenzar', dot: 'bg-muted-foreground', statuses: ['pending'], dropStatus: 'pending' },
  {
    key: 'doing',
    label: 'En proceso',
    dot: 'bg-amber-400',
    statuses: ['in_progress', 'in_review', 'blocked'],
    dropStatus: 'in_progress',
  },
  { key: 'done', label: 'Terminado', dot: 'bg-emerald-500', statuses: ['completed'], dropStatus: 'completed' },
]

const COL_PREFIX = 'col:'
const columnDroppableId = (k: ColumnKey): string => `${COL_PREFIX}${k}`

const STATUS_RANK: Record<string, number> = { pending: 0, in_progress: 0, in_review: 1, blocked: 2, completed: 0 }

function columnOf(status: TaskStatus): ColumnKey | null {
  return BOARD_COLUMNS.find((c) => c.statuses.includes(status))?.key ?? null
}

/** Orden de una columna: posición, luego estado, luego antigüedad (estable ante empates). */
function sortColumn(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) =>
      a.position - b.position ||
      (STATUS_RANK[a.status] ?? 0) - (STATUS_RANK[b.status] ?? 0) ||
      a.createdAt.localeCompare(b.createdAt),
  )
}

/** Prefiere la tarjeta bajo el puntero sobre la columna que la contiene. */
const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args)
  const hits = pointer.length > 0 ? pointer : rectIntersection(args)
  const cards = hits.filter((h) => !String(h.id).startsWith(COL_PREFIX))
  return cards.length > 0 ? cards : hits
}

// ─── Tarjeta ──────────────────────────────────────────────────────────────────

function CardBody({ task }: { task: Task }): React.JSX.Element {
  const progress = checklistProgress(task.steps)
  const st = taskStatus(task.status)
  const done = task.status === 'completed' || task.status === 'cancelled'
  return (
    <>
      <p className={cn('text-sm font-semibold leading-snug', task.status === 'completed' && 'text-muted-foreground line-through')}>
        {task.title}
      </p>
      {(task.status === 'in_review' || task.status === 'blocked') && (
        <div className="mt-2">
          <StatusBadge kind={st.kind}>{st.label}</StatusBadge>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <DueBadge date={task.dueDate} done={done} />
          {progress.total > 0 && (
            <span
              className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground"
              title="Checklist"
            >
              <ListChecks className="h-3 w-3" aria-hidden="true" />
              {progress.done}/{progress.total}
              <span className="sr-only"> pasos completados</span>
            </span>
          )}
        </div>
        <MemberAvatars members={task.assignees ?? []} max={3} size="sm" />
      </div>
    </>
  )
}

function BoardCard({ task, onOpen }: { task: Task; onOpen: (t: Task) => void }): React.JSX.Element {
  const drag = useDraggable({ id: task.id })
  const drop = useDroppable({ id: task.id })
  const { listeners } = drag
  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node)
        drop.setNodeRef(node)
      }}
      {...drag.attributes}
      {...listeners}
      role="button"
      aria-label={`Abrir tarea ${task.title}`}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e)
        if (e.key === 'Enter') onOpen(task)
      }}
      className={cn(
        'cursor-grab touch-manipulation rounded-xl border bg-card p-3 shadow-card transition-colors',
        'hover:border-signal/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing',
        drag.isDragging && 'opacity-40',
        drop.isOver && !drag.isDragging && 'border-signal',
      )}
    >
      <CardBody task={task} />
    </div>
  )
}

// ─── Alta rápida ──────────────────────────────────────────────────────────────

function QuickAdd({ projectId, status, label }: { projectId: string; status: TaskStatus; label: string }): React.JSX.Element {
  const create = useCreateTask()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')

  function submit(): void {
    const t = title.trim()
    if (!t) {
      setOpen(false)
      return
    }
    create.mutate(
      { title: t, projectId, status },
      {
        onSuccess: () => {
          setTitle('')
          // El input queda abierto para cargar varias seguidas.
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo crear la tarea'),
      },
    )
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full justify-start text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4" />
        Agregar tarea
        <span className="sr-only"> en {label}</span>
      </Button>
    )
  }
  return (
    <input
      autoFocus
      value={title}
      disabled={create.isPending}
      maxLength={300}
      placeholder="Título de la tarea…"
      aria-label={`Nueva tarea en ${label}`}
      onChange={(e) => setTitle(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          submit()
        }
        if (e.key === 'Escape') {
          setTitle('')
          setOpen(false)
        }
      }}
      onBlur={() => {
        if (title.trim()) submit()
        setOpen(false)
      }}
      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
    />
  )
}

// ─── Columna ──────────────────────────────────────────────────────────────────

function BoardColumn({
  def,
  projectId,
  tasks,
  onOpen,
}: {
  def: ColumnDef
  projectId: string
  tasks: Task[]
  onOpen: (t: Task) => void
}): React.JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: columnDroppableId(def.key) })
  return (
    <section className="flex min-w-[16rem] flex-1 flex-col" aria-label={def.label}>
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', def.dot)} aria-hidden="true" />
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{def.label}</h3>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-[8rem] flex-col gap-2 rounded-xl border border-dashed p-2 transition-colors',
          isOver ? 'border-signal bg-signal/5' : 'border-border bg-card/40',
        )}
      >
        {tasks.map((t) => (
          <BoardCard key={t.id} task={t} onOpen={onOpen} />
        ))}
        {tasks.length === 0 && (
          <p className="flex flex-1 items-center justify-center gap-1.5 py-4 text-xs text-muted-foreground">
            <ListTodo className="h-3.5 w-3.5" aria-hidden="true" /> Sin tareas
          </p>
        )}
        <QuickAdd projectId={projectId} status={def.dropStatus} label={def.label} />
      </div>
    </section>
  )
}

// ─── Board ────────────────────────────────────────────────────────────────────

export function ProjectTaskBoard({
  projectId,
  tasks,
  onOpenTask,
}: {
  projectId: string
  tasks: Task[]
  onOpenTask: (t: Task) => void
}): React.JSX.Element {
  const move = useMoveProjectTask(projectId)
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Solo Space inicia el arrastre con teclado: Enter queda para abrir la tarea.
    useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
  )

  const byColumn = useMemo(() => {
    const map: Record<ColumnKey, Task[]> = { todo: [], doing: [], done: [] }
    for (const t of tasks) {
      const key = columnOf(t.status)
      if (key) map[key].push(t) // canceladas: sin columna → ocultas
    }
    return { todo: sortColumn(map.todo), doing: sortColumn(map.doing), done: sortColumn(map.done) }
  }, [tasks])

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) ?? null : null

  function onDragStart(e: DragStartEvent): void {
    setActiveId(String(e.active.id))
  }

  function onDragEnd(e: DragEndEvent): void {
    setActiveId(null)
    const { active, over } = e
    if (!over) return
    const taskId = String(active.id)
    const overId = String(over.id)
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    const fromKey = columnOf(task.status)
    if (!fromKey) return

    // Columna destino e índice de inserción.
    let toKey: ColumnKey
    let insertAt: number
    const without = (key: ColumnKey): Task[] => byColumn[key].filter((t) => t.id !== taskId)

    if (overId.startsWith(COL_PREFIX)) {
      toKey = overId.slice(COL_PREFIX.length) as ColumnKey
      insertAt = without(toKey).length // soltar en el fondo de la columna
    } else {
      const overTask = tasks.find((t) => t.id === overId)
      const overKey = overTask ? columnOf(overTask.status) : null
      if (!overTask || !overKey || overTask.id === taskId) return
      toKey = overKey
      const list = without(toKey)
      const overIndex = list.findIndex((t) => t.id === overId)
      const activeRect = active.rect.current.translated
      const below = activeRect
        ? activeRect.top + activeRect.height / 2 > over.rect.top + over.rect.height / 2
        : false
      insertAt = below ? overIndex + 1 : overIndex
    }

    const dest = BOARD_COLUMNS.find((c) => c.key === toKey)
    if (!dest) return
    const list = without(toKey)
    const ordered = [...list.slice(0, insertAt), task, ...list.slice(insertAt)]
    const orderedIds = ordered.map((t) => t.id)

    // En "En proceso" una tarea que ya estaba in_review/blocked conserva su estado.
    const nextStatus: TaskStatus = dest.statuses.includes(task.status) ? task.status : dest.dropStatus

    const sameSpot =
      fromKey === toKey &&
      nextStatus === task.status &&
      byColumn[toKey].map((t) => t.id).join() === orderedIds.join()
    if (sameSpot) return

    move.mutate(
      { taskId, status: nextStatus, orderedIds },
      { onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo mover la tarea') },
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-4 overflow-x-auto pb-2">
        {BOARD_COLUMNS.map((def) => (
          <BoardColumn key={def.key} def={def} projectId={projectId} tasks={byColumn[def.key]} onOpen={onOpenTask} />
        ))}
      </div>
      {/* El overlay evita que la tarjeta arrastrada quede recortada por el scroll de la columna. */}
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="rotate-1 cursor-grabbing rounded-xl border bg-card p-3 shadow-lift">
            <CardBody task={activeTask} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
