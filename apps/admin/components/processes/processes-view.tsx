'use client'

/**
 * Pestaña "Procesos" de /admin/tasks: plantillas (SOPs) de tareas que se copian
 * al crear un proyecto de ese tipo. Lista a la izquierda, editor a la derecha
 * (nombre, tareas reordenables con dnd-kit, checklist de cada tarea).
 */

import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { Archive, GripVertical, ListChecks, Pencil, Plus, Workflow } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import {
  useArchiveProcess,
  useCreateProcessTask,
  useProcess,
  useProcesses,
  useReorderProcessTasks,
} from '@/lib/hooks'
import type { ProcessDetail, ProcessListItem, ProcessTask } from '@/lib/types'
import { checklistProgress } from '@/lib/projects'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import { Input } from '@/components/ui/input'
import { ListSkeleton } from '@/components/ui/skeletons'
import { ProcessDialog } from '@/components/processes/process-dialog'
import { ProcessTaskSheet } from '@/components/processes/process-task-sheet'

// ─── Fila de tarea (draggable por el handle + droppable) ──────────────────────

function TaskRow({
  task,
  index,
  onOpen,
}: {
  task: ProcessTask
  index: number
  onOpen: (t: ProcessTask) => void
}): React.JSX.Element {
  const drag = useDraggable({ id: task.id })
  const drop = useDroppable({ id: task.id })
  const progress = checklistProgress(task.steps)
  return (
    <li
      ref={(node) => {
        drag.setNodeRef(node)
        drop.setNodeRef(node)
      }}
      className={cn(
        'flex items-center gap-2 rounded-lg border bg-card px-2 py-2 transition-colors',
        drag.isDragging && 'opacity-40',
        drop.isOver && !drag.isDragging && 'border-signal',
      )}
    >
      <button
        type="button"
        {...drag.attributes}
        {...drag.listeners}
        aria-label={`Reordenar "${task.title}" (espacio para tomar, flechas para mover)`}
        className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-6 text-center font-mono text-xs text-muted-foreground">{index + 1}</span>
      <button
        type="button"
        onClick={() => onOpen(task)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{task.title}</span>
        {progress.total > 0 && (
          <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
            <ListChecks className="h-3 w-3" aria-hidden="true" />
            {progress.total}
            <span className="sr-only"> pasos</span>
          </span>
        )}
        <Pencil className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Editar</span>
      </button>
    </li>
  )
}

function arrayMove<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  if (item !== undefined) next.splice(to, 0, item)
  return next
}

// ─── Editor del proceso seleccionado ──────────────────────────────────────────

function ProcessEditor({
  summary,
  onEdit,
  onArchive,
}: {
  summary: ProcessListItem
  onEdit: () => void
  onArchive: () => void
}): React.JSX.Element {
  const { data, isLoading, isError, refetch } = useProcess(summary.id)
  const reorder = useReorderProcessTasks(summary.id)
  const addTask = useCreateProcessTask(summary.id)
  const [newTitle, setNewTitle] = useState('')
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
  )

  const tasks = useMemo(() => (data as ProcessDetail | undefined)?.tasks ?? [], [data])
  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) ?? null : null
  const activeTask = activeId ? tasks.find((t) => t.id === activeId) ?? null : null

  function onDragEnd(e: DragEndEvent): void {
    setActiveId(null)
    if (!e.over || e.over.id === e.active.id) return
    const from = tasks.findIndex((t) => t.id === e.active.id)
    const to = tasks.findIndex((t) => t.id === e.over?.id)
    if (from < 0 || to < 0) return
    reorder.mutate(arrayMove(tasks, from, to).map((t) => t.id), {
      onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo reordenar'),
    })
  }

  function submitNew(): void {
    const t = newTitle.trim()
    if (!t) return
    addTask.mutate(
      { title: t },
      {
        onSuccess: () => setNewTitle(''),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo agregar la tarea'),
      },
    )
  }

  return (
    <Card className="min-w-0 flex-1">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">{summary.name}</h2>
            <p className="font-mono text-xs text-muted-foreground">{summary.slug}</p>
            {summary.description && <p className="mt-2 text-sm text-muted-foreground">{summary.description}</p>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" /> Editar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/5"
              onClick={onArchive}
            >
              <Archive className="h-3.5 w-3.5" /> Archivar
            </Button>
          </div>
        </div>

        {isLoading ? (
          <ListSkeleton rows={4} rowClassName="h-11 rounded-lg" label="Cargando tareas del proceso…" />
        ) : isError ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            No se pudieron cargar las tareas.
            <Button size="sm" onClick={() => void refetch()}>
              Reintentar
            </Button>
          </div>
        ) : (
          <>
            {tasks.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Este proceso todavía no tiene tareas. Agregá la primera abajo.
              </p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={(e) => setActiveId(String(e.active.id))}
                onDragEnd={onDragEnd}
                onDragCancel={() => setActiveId(null)}
              >
                <ol className="space-y-2" aria-label="Tareas del proceso">
                  {tasks.map((t, i) => (
                    <TaskRow key={t.id} task={t} index={i} onOpen={(x) => setOpenTaskId(x.id)} />
                  ))}
                </ol>
                <DragOverlay dropAnimation={null}>
                  {activeTask ? (
                    <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-lift">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{activeTask.title}</span>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}

            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                submitNew()
              }}
            >
              <Input
                value={newTitle}
                maxLength={300}
                placeholder="Nueva tarea del proceso…"
                aria-label="Título de la nueva tarea del proceso"
                disabled={addTask.isPending}
                onChange={(e) => setNewTitle(e.target.value)}
              />
              <Button type="submit" disabled={!newTitle.trim() || addTask.isPending}>
                <Plus className="h-4 w-4" /> Agregar
              </Button>
            </form>
          </>
        )}
      </CardContent>

      <ProcessTaskSheet processId={summary.id} task={openTask} onClose={() => setOpenTaskId(null)} />
    </Card>
  )
}

// ─── Vista ────────────────────────────────────────────────────────────────────

export function ProcessesView({ tabs }: { tabs?: React.ReactNode }): React.JSX.Element {
  const { data, isLoading, isError, refetch } = useProcesses()
  const archive = useArchiveProcess()
  const processes = useMemo(() => data ?? [], [data])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)

  // Selecciona el primero al cargar y re-apunta si el seleccionado se archivó.
  useEffect(() => {
    if (processes.length === 0) {
      setSelectedId(null)
    } else if (!selectedId || !processes.some((p) => p.id === selectedId)) {
      setSelectedId(processes[0]?.id ?? null)
    }
  }, [processes, selectedId])

  const selected = processes.find((p) => p.id === selectedId) ?? null

  function onArchive(): void {
    if (!selected) return
    archive.mutate(selected.id, {
      onSuccess: () => {
        toast.success('Proceso archivado')
        setArchiveOpen(false)
      },
      onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo archivar el proceso'),
    })
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="eyebrow">Proyectos</p>
          <h1 className="text-3xl font-semibold tracking-tight">Tareas</h1>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Nuevo proceso
        </Button>
      </div>
      {tabs && <div className="mb-6">{tabs}</div>}

      {isLoading ? (
        <ListSkeleton rows={4} label="Cargando procesos…" />
      ) : isError ? (
        <Empty>
          <EmptyHeader>
            <EmptyIllustration icon={Workflow} />
            <EmptyTitle>No se pudieron cargar los procesos</EmptyTitle>
            <EmptyDescription>Revisá tu conexión e intentá de nuevo.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => void refetch()}>
              Reintentar
            </Button>
          </EmptyContent>
        </Empty>
      ) : processes.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyIllustration icon={Workflow} />
            <EmptyTitle>Sin procesos</EmptyTitle>
            <EmptyDescription>
              Un proceso es una plantilla de tareas con checklist que se copia al crear un proyecto.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              Nuevo proceso
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          <nav className="w-full lg:w-72 lg:flex-shrink-0" aria-label="Procesos">
            <ul className="space-y-2">
              {processes.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-current={p.id === selectedId ? 'true' : undefined}
                    onClick={() => setSelectedId(p.id)}
                    className={cn(
                      'w-full rounded-xl border bg-card p-3 text-left shadow-card transition-colors',
                      'hover:border-signal/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      p.id === selectedId && 'border-signal bg-signal/5',
                    )}
                  >
                    <span className="block truncate text-sm font-semibold">{p.name}</span>
                    <span className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-mono">{p.slug}</span>
                      <span>
                        {p.taskCount} {p.taskCount === 1 ? 'tarea' : 'tareas'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {selected && (
            <ProcessEditor
              key={selected.id}
              summary={selected}
              onEdit={() => setEditOpen(true)}
              onArchive={() => setArchiveOpen(true)}
            />
          )}
        </div>
      )}

      <ProcessDialog open={createOpen} onClose={() => setCreateOpen(false)} onSaved={(p) => setSelectedId(p.id)} />
      <ProcessDialog open={editOpen} onClose={() => setEditOpen(false)} process={selected ?? undefined} />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archivar proceso"
        description={
          selected
            ? `"${selected.name}" deja de ofrecerse al crear proyectos. Los proyectos existentes conservan sus tareas.`
            : undefined
        }
        confirmLabel="Archivar"
        destructive
        pending={archive.isPending}
        onConfirm={onArchive}
      />
    </div>
  )
}
