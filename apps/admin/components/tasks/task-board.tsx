'use client'

import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Flag, CalendarClock } from 'lucide-react'
import { useUpdateTask } from '@/lib/hooks'
import type { Task, TeamUser } from '@/lib/types'
import { cn, initials } from '@/lib/utils'
import { priority as priorityStatus } from '@/lib/status'
import { StatusBadge } from '@/components/ui/status-badge'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ListTodo } from 'lucide-react'

export const TASK_COLUMNS = [
  { status: 'pending', label: 'Por Hacer', dot: 'bg-muted-foreground' },
  { status: 'in_progress', label: 'En Progreso', dot: 'bg-amber-400' },
  { status: 'blocked', label: 'Bloqueada', dot: 'bg-destructive' },
  { status: 'completed', label: 'Hecho', dot: 'bg-emerald-500' },
] as const

type TaskStatus = (typeof TASK_COLUMNS)[number]['status']

function fmtDue(dueDate: string): string {
  return new Date(dueDate).toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

function isOverdue(task: Task): boolean {
  return !!task.dueDate && task.status !== 'completed' && new Date(task.dueDate).getTime() < Date.now()
}

function TaskCard({
  task,
  userMap,
  onClick,
}: {
  task: Task
  userMap: Map<string, TeamUser>
  onClick: (t: Task) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
  const pr = priorityStatus(task.priority)
  const assignee = task.assignedTo ? userMap.get(task.assignedTo) ?? null : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onClick(task)}
      className={cn(
        'group cursor-grab rounded-2xl border bg-card p-3 shadow-card transition-all',
        'hover:-translate-y-0.5 hover:border-signal/40 hover:shadow-lift active:cursor-grabbing',
        isDragging && 'rotate-1 opacity-60 shadow-lift',
      )}
    >
      <p className="text-sm font-semibold leading-snug">{task.title}</p>
      {task.body && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.body}</p>}

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge kind={pr.kind}>
            <Flag className="h-3 w-3" />
            {pr.label}
          </StatusBadge>
          {task.dueDate && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs',
                isOverdue(task) ? 'font-medium text-destructive' : 'text-muted-foreground',
              )}
            >
              <CalendarClock className="h-3 w-3" />
              {fmtDue(task.dueDate)}
            </span>
          )}
        </div>
        {assignee ? (
          <div
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground"
            title={[assignee.firstName, assignee.lastName].filter(Boolean).join(' ') || assignee.email}
          >
            {initials(assignee.firstName, assignee.lastName)}
          </div>
        ) : (
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">
            ?
          </div>
        )}
      </div>
    </div>
  )
}

function Column({
  status,
  label,
  dot,
  tasks,
  userMap,
  onTaskClick,
}: {
  status: TaskStatus
  label: string
  dot: string
  tasks: Task[]
  userMap: Map<string, TeamUser>
  onTaskClick: (t: Task) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div className="flex min-w-[16rem] flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', dot)} />
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</h3>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex max-h-[calc(100vh-16rem)] min-h-[8rem] flex-col gap-2 overflow-y-auto rounded-xl border border-dashed p-2 transition-colors',
          isOver ? 'border-signal bg-signal/5' : 'border-border bg-card/40',
        )}
      >
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} userMap={userMap} onClick={onTaskClick} />
        ))}
        {tasks.length === 0 && (
          <Empty className="border-dashed py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ListTodo />
              </EmptyMedia>
              <EmptyTitle>Sin Tareas</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  )
}

export function TaskBoard({
  tasks,
  userMap,
  onTaskClick,
  queryKey,
}: {
  tasks: Task[]
  userMap: Map<string, TeamUser>
  onTaskClick: (t: Task) => void
  /** queryKey activa del hook useTasks() en el padre — necesaria para el optimistic update del drag. */
  queryKey: unknown[]
}) {
  const qc = useQueryClient()
  const updateTask = useUpdateTask()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function onDragEnd(event: DragEndEvent) {
    const taskId = String(event.active.id)
    const target = event.over?.id as TaskStatus | undefined
    if (!target || !TASK_COLUMNS.some((c) => c.status === target)) return
    const task = tasks.find((t) => t.id === taskId)
    if (!task || task.status === target) return

    qc.cancelQueries({ queryKey })
    const prev = qc.getQueryData<Task[]>(queryKey)
    qc.setQueryData<Task[]>(queryKey, (old) =>
      old?.map((t) => (t.id === taskId ? { ...t, status: target } : t)),
    )

    updateTask.mutate(
      { id: taskId, input: { status: target } },
      {
        onError: () => {
          if (prev) qc.setQueryData(queryKey, prev)
          toast.error('No se pudo mover la tarea. Intentá de nuevo.')
        },
      },
    )
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {TASK_COLUMNS.map((col) => (
          <Column
            key={col.status}
            status={col.status}
            label={col.label}
            dot={col.dot}
            tasks={tasks.filter((t) => t.status === col.status)}
            userMap={userMap}
            onTaskClick={onTaskClick}
          />
        ))}
      </div>
    </DndContext>
  )
}
