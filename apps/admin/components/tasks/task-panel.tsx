'use client'

/**
 * Panel lateral de una tarea (Sheet). Reutilizable desde /admin/tasks y desde el
 * detalle de proyecto. Cada campo guarda con PATCH /api/tasks/:id al cambiar
 * (selects/fechas/checklist) o al salir del campo (título/descripción).
 */

import { useEffect, useMemo, useState } from 'react'
import {
  AlignLeft,
  CalendarClock,
  CircleDot,
  Flag,
  FolderKanban,
  ListChecks,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { useDeleteTask, useProjects, useUpdateTask, useUsers } from '@/lib/hooks'
import type { UpdateTaskInput } from '@/lib/hooks'
import type { ChecklistStep, Task, TaskStatus } from '@/lib/types'
import { PRIORITY_OPTIONS, TASK_STATUS_OPTIONS, dateOnlyOf, dateOnlyToTaskIso } from '@/lib/projects'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DateField } from '@/components/ui/date-field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ChecklistEditor } from '@/components/tasks/checklist-editor'
import { UserMultiSelect } from '@/components/projects/user-multi-select'

function assigneeIdsOf(task: Task): string[] {
  if (task.assignees) return task.assignees.map((a) => a.id)
  return task.assignedTo ? [task.assignedTo] : []
}

export function TaskPanel({
  task,
  onClose,
}: {
  task: Task | null
  onClose: () => void
}): React.JSX.Element {
  return (
    <Sheet open={task != null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {task && <TaskPanelBody key={task.id} task={task} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

function TaskPanelBody({ task, onClose }: { task: Task; onClose: () => void }): React.JSX.Element {
  const update = useUpdateTask()
  const remove = useDeleteTask()
  const { data: users } = useUsers()
  const { data: projects } = useProjects()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [title, setTitle] = useState(task.title)
  const [steps, setSteps] = useState<ChecklistStep[]>(task.steps ?? [])
  const serverSteps = useMemo(() => JSON.stringify(task.steps ?? []), [task.steps])

  // Re-sincroniza el checklist con el servidor, salvo que haya un guardado en vuelo
  // (si no, el refetch pisaría una edición más nueva).
  useEffect(() => {
    if (!update.isPending) setSteps(JSON.parse(serverSteps) as ChecklistStep[])
  }, [serverSteps, update.isPending])
  useEffect(() => setTitle(task.title), [task.title])

  function save(input: UpdateTaskInput): void {
    update.mutate(
      { id: task.id, input },
      {
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el cambio'),
      },
    )
  }

  function commitTitle(): void {
    const t = title.trim()
    if (!t) {
      setTitle(task.title)
      return
    }
    if (t !== task.title) save({ title: t })
  }

  function onChecklist(next: ChecklistStep[]): void {
    setSteps(next)
    save({ steps: next })
  }

  function onDelete(): void {
    remove.mutate(task.id, {
      onSuccess: () => {
        setConfirmDelete(false)
        onClose()
        toast.success('Tarea eliminada')
      },
      onError: () => toast.error('No se pudo eliminar la tarea'),
    })
  }

  const dueDay = task.dueDate ? dateOnlyOf(task.dueDate) : undefined

  return (
    <>
      <SheetHeader>
        <SheetTitle className="sr-only">Tarea: {task.title}</SheetTitle>
        <SheetDescription className="sr-only">Detalle y edición de la tarea.</SheetDescription>
        <label htmlFor="task-panel-title" className="sr-only">
          Título
        </label>
        <Input
          id="task-panel-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="h-auto border-0 px-0 pr-6 text-xl font-semibold shadow-none focus-visible:ring-0"
        />
      </SheetHeader>

      <div className="mt-4 space-y-4">
        <Row icon={CircleDot} label="Estado" htmlFor="task-panel-status">
          <Select value={task.status} onValueChange={(v) => save({ status: v as TaskStatus })}>
            <SelectTrigger id="task-panel-status" className="h-8 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        <Row icon={Flag} label="Prioridad" htmlFor="task-panel-priority">
          <Select value={task.priority} onValueChange={(v) => save({ priority: v as Task['priority'] })}>
            <SelectTrigger id="task-panel-priority" className="h-8 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        <Row icon={CalendarClock} label="Vence">
          <div className="flex items-center gap-1">
            <DateField
              value={dueDay}
              onChange={(iso) => save({ dueDate: iso ? dateOnlyToTaskIso(iso) : null })}
              placeholder="Sin fecha"
              className="h-8 w-48"
            />
            {dueDay && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Quitar fecha de vencimiento"
                onClick={() => save({ dueDate: null })}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </Row>

        <Row icon={Users} label="Responsables" htmlFor="task-panel-assignees">
          <UserMultiSelect
            id="task-panel-assignees"
            users={users ?? []}
            value={assigneeIdsOf(task)}
            onChange={(ids) => save({ assigneeIds: ids })}
            className="h-8"
          />
        </Row>

        <Row icon={FolderKanban} label="Proyecto" htmlFor="task-panel-project">
          <Select
            value={task.projectId ?? 'none'}
            onValueChange={(v) => save({ projectId: v === 'none' ? null : v })}
          >
            <SelectTrigger id="task-panel-project" className="h-8">
              <SelectValue placeholder="Sin proyecto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin proyecto</SelectItem>
              {(projects ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            <AlignLeft className="h-3 w-3" /> Descripción
          </p>
          <Textarea
            defaultValue={task.body ?? ''}
            aria-label="Descripción"
            placeholder="Agregá una descripción…"
            rows={4}
            onBlur={(e) => {
              const v = e.target.value
              if (v !== (task.body ?? '')) save({ body: v })
            }}
            className="border-0 bg-transparent p-0 focus-visible:ring-0"
          />
        </div>

        <div className="rounded-lg border p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            <ListChecks className="h-3 w-3" /> Checklist
          </p>
          <ChecklistEditor steps={steps} onChange={onChecklist} />
        </div>

        <div className="flex justify-end border-t pt-4">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
            Eliminar tarea
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminar tarea"
        description="La tarea se archiva y deja de aparecer en el tablero y en las listas."
        confirmLabel="Eliminar"
        destructive
        pending={remove.isPending}
        onConfirm={onDelete}
      />
    </>
  )
}

function Row({
  icon: Icon,
  label,
  htmlFor,
  children,
}: {
  icon: typeof Flag
  label: string
  htmlFor?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-4">
      <label
        htmlFor={htmlFor}
        className="flex w-32 flex-shrink-0 items-center gap-2 text-sm text-muted-foreground"
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
