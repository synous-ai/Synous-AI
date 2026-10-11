'use client'

/**
 * Modal de creación de tarea.
 * Expone todos los campos relevantes: título, detalle, prioridad, vencimiento,
 * estado inicial, responsables (multi) y proyecto.
 * Responsables y proyecto son opcionales — "Sin asignar" / "Sin proyecto".
 * `fixedDealId` / `fixedProjectId` fijan el vínculo cuando se abre desde un deal o un proyecto.
 */

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ApiError } from '@/lib/api'
import { useCreateTask, useUsers, useProjects, useDeals } from '@/lib/hooks'
import { PRIORITY_OPTIONS, TASK_STATUS_OPTIONS, dateOnlyToTaskIso } from '@/lib/projects'
import { UserMultiSelect } from '@/components/projects/user-multi-select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { DateField } from '@/components/ui/date-field'

const Schema = z.object({
  title: z.string().min(1, 'Requerido'),
  body: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']),
  status: z.enum(['pending', 'in_progress', 'in_review', 'blocked', 'completed', 'cancelled']),
  dueDate: z.string().optional(),
  assigneeIds: z.array(z.string()),
  projectId: z.string().optional(),
  dealId: z.string().optional(),
})
type FormValues = z.infer<typeof Schema>

export function TaskDialog({
  open,
  onClose,
  /** dealId fijo cuando se abre desde el detalle de un deal. */
  fixedDealId,
  /** projectId fijo cuando se abre desde el detalle de un proyecto. Oculta el selector. */
  fixedProjectId,
}: {
  open: boolean
  onClose: () => void
  fixedDealId?: string
  fixedProjectId?: string
}) {
  const create = useCreateTask()
  const { data: users } = useUsers()
  const { data: projects } = useProjects()
  const { data: deals } = useDeals()
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { priority: 'medium', status: 'pending', assigneeIds: [] },
  })

  useEffect(() => {
    if (open) {
      form.reset({ title: '', body: '', priority: 'medium', status: 'pending', dueDate: '', assigneeIds: [], projectId: '', dealId: '' })
      setError(null)
    }
  }, [open, form])

  async function onSubmit(values: FormValues): Promise<void> {
    setError(null)
    try {
      await create.mutateAsync({
        title: values.title,
        body: values.body || undefined,
        priority: values.priority,
        status: values.status,
        dueDate: values.dueDate ? dateOnlyToTaskIso(values.dueDate) : undefined,
        assigneeIds: values.assigneeIds.length > 0 ? values.assigneeIds : undefined,
        dealId: fixedDealId ?? (values.dealId || undefined),
        projectId: fixedProjectId ?? (values.projectId || undefined),
      })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear la tarea')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva Tarea</DialogTitle>
          <DialogDescription className="sr-only">
            Formulario para crear una nueva tarea.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Título */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Detalle */}
            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Detalle</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Responsables */}
            <FormField
              control={form.control}
              name="assigneeIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Responsables</FormLabel>
                  <UserMultiSelect users={users ?? []} value={field.value} onChange={field.onChange} />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Estado + Prioridad */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TASK_STATUS_OPTIONS.filter((o) => o.value !== 'cancelled').map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prioridad</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {[...PRIORITY_OPTIONS].reverse().map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Proyecto — se oculta cuando hay un proyecto fijo */}
            {!fixedProjectId && (
              <FormField
                control={form.control}
                name="projectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Proyecto</FormLabel>
                    <Select value={field.value || 'none'} onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sin proyecto" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Sin proyecto</SelectItem>
                        {(projects ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Deal — se oculta cuando hay un deal fijo */}
            {!fixedDealId && (
              <FormField
                control={form.control}
                name="dealId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deal</FormLabel>
                    <Select value={field.value || 'none'} onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sin deal" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Sin deal</SelectItem>
                        {(deals ?? []).map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Vencimiento */}
            <FormField
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vencimiento</FormLabel>
                  <FormControl>
                    <DateField
                      value={field.value || undefined}
                      onChange={(iso) => field.onChange(iso ?? '')}
                      placeholder="Elegí una fecha"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Guardando…' : 'Crear'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
