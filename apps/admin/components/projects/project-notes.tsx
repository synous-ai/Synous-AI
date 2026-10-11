'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { useUpdateProject } from '@/lib/hooks'
import type { ProjectDetail } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

/** Notas del proyecto: "Importante" (destacada) y notas generales. Guarda con un botón. */
export function ProjectNotes({ project }: { project: ProjectDetail }): React.JSX.Element {
  const update = useUpdateProject()
  const [important, setImportant] = useState(project.notesImportant ?? '')
  const [notes, setNotes] = useState(project.notes ?? '')

  // Re-sincroniza cuando el servidor trae otro valor (otra pestaña, edición desde el diálogo).
  useEffect(() => setImportant(project.notesImportant ?? ''), [project.notesImportant])
  useEffect(() => setNotes(project.notes ?? ''), [project.notes])

  const dirty = important !== (project.notesImportant ?? '') || notes !== (project.notes ?? '')

  function save(): void {
    update.mutate(
      { id: project.id, input: { notesImportant: important.trim() || null, notes: notes.trim() || null } },
      {
        onSuccess: () => toast.success('Notas guardadas'),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudieron guardar las notas'),
      },
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-4 dark:border-[rgba(250,204,21,0.25)] dark:bg-[rgba(250,204,21,0.08)]">
        <label
          htmlFor="notes-important"
          className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-[rgba(253,224,71,0.85)]"
        >
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Importante
        </label>
        <Textarea
          id="notes-important"
          value={important}
          onChange={(e) => setImportant(e.target.value)}
          rows={4}
          maxLength={20000}
          placeholder="Lo que nadie del equipo debería pasar por alto: accesos, acuerdos, riesgos…"
          className="bg-background/70"
        />
      </div>

      <div>
        <label htmlFor="notes-general" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Notas
        </label>
        <Textarea
          id="notes-general"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={10}
          maxLength={20000}
          placeholder="Notas generales del proyecto…"
        />
      </div>

      <div className="flex justify-end gap-2">
        {dirty && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setImportant(project.notesImportant ?? '')
              setNotes(project.notes ?? '')
            }}
          >
            Descartar
          </Button>
        )}
        <Button type="button" onClick={save} disabled={!dirty || update.isPending}>
          {update.isPending ? 'Guardando…' : 'Guardar notas'}
        </Button>
      </div>
    </div>
  )
}
