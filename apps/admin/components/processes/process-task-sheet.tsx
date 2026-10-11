'use client'

import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { useDeleteProcessTask, useUpdateProcessTask } from '@/lib/hooks'
import type { ChecklistStep, ProcessTask } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ChecklistEditor } from '@/components/tasks/checklist-editor'

/** Editor de una tarea de proceso: título, notas y checklist (sin estado "hecho"). Guarda con un botón. */
export function ProcessTaskSheet({
  processId,
  task,
  onClose,
}: {
  processId: string
  task: ProcessTask | null
  onClose: () => void
}): React.JSX.Element {
  return (
    <Sheet open={task != null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {task && <Body key={task.id} processId={processId} task={task} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

function Body({ processId, task, onClose }: { processId: string; task: ProcessTask; onClose: () => void }): React.JSX.Element {
  const update = useUpdateProcessTask(processId)
  const remove = useDeleteProcessTask(processId)
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes ?? '')
  const [steps, setSteps] = useState<ChecklistStep[]>(task.steps)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setTitle(task.title)
    setNotes(task.notes ?? '')
    setSteps(task.steps)
  }, [task.id, task.title, task.notes, task.steps])

  const dirty =
    title.trim() !== task.title ||
    notes !== (task.notes ?? '') ||
    JSON.stringify(steps) !== JSON.stringify(task.steps)

  function save(): void {
    const t = title.trim()
    if (!t) {
      toast.error('El título es obligatorio')
      return
    }
    update.mutate(
      {
        taskId: task.id,
        // Las plantillas no guardan estado: `done` siempre false.
        input: {
          title: t,
          notes: notes.trim() || null,
          steps: steps.map((s) => ({
            text: s.text,
            done: false,
            ...(s.children ? { children: s.children.map((c) => ({ text: c.text, done: false })) } : {}),
          })),
        },
      },
      {
        onSuccess: () => toast.success('Tarea guardada'),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar la tarea'),
      },
    )
  }

  function onDelete(): void {
    remove.mutate(task.id, {
      onSuccess: () => {
        setConfirmDelete(false)
        onClose()
        toast.success('Tarea eliminada del proceso')
      },
      onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar la tarea'),
    })
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Tarea del proceso</SheetTitle>
        <SheetDescription>Se copia a cada proyecto nuevo de este tipo.</SheetDescription>
      </SheetHeader>

      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor="ptask-title" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Título
          </label>
          <Input id="ptask-title" value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ptask-notes" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Notas
          </label>
          <Textarea id="ptask-notes" value={notes} rows={5} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Checklist</p>
          <ChecklistEditor steps={steps} onChange={setSteps} showDone={false} />
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" /> Eliminar
          </Button>
          <Button type="button" onClick={save} disabled={!dirty || update.isPending}>
            {update.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminar tarea del proceso"
        description="Se borra de la plantilla. Los proyectos que ya la copiaron la conservan."
        confirmLabel="Eliminar"
        destructive
        pending={remove.isPending}
        onConfirm={onDelete}
      />
    </>
  )
}
