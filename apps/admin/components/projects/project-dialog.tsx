'use client'

/**
 * Crear / editar proyecto. Con `project` edita (PATCH); sin él crea (POST).
 * `defaults` precarga campos al crear (p. ej. desde un deal: dealId, companyId, name).
 * Si el proyecto se crea con un `kind` (proceso), la API copia las tareas del proceso.
 */

import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import {
  useCompanies,
  useCreateProject,
  useDeals,
  useProcesses,
  useUpdateProject,
  useUsers,
} from '@/lib/hooks'
import type { CreateProjectInput, UpdateProjectInput } from '@/lib/hooks'
import type { Project, ProjectDetail } from '@/lib/types'
import { PRIORITY_OPTIONS, PROJECT_STAGE_OPTIONS, PROJECT_STATUS_OPTIONS } from '@/lib/projects'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { DateField } from '@/components/ui/date-field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UserMultiSelect } from '@/components/projects/user-multi-select'

const NONE = 'none'

/** URL opcional: vacío es válido; si hay texto tiene que ser http(s). */
const optionalHttpUrl = z
  .string()
  .trim()
  .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Tiene que ser una URL http(s) válida')

const Schema = z
  .object({
    name: z.string().trim().min(1, 'Requerido').max(200, 'Máximo 200 caracteres'),
    companyId: z.string(),
    dealId: z.string(),
    kind: z.string(),
    status: z.enum(['not_started', 'in_progress', 'in_review', 'waiting_client', 'on_hold', 'delivered']),
    stage: z.string(),
    priority: z.enum(['low', 'medium', 'high']),
    startDate: z.string().min(1, 'La fecha de inicio es obligatoria'),
    dueDate: z.string(),
    memberIds: z.array(z.string()),
    repoUrl: optionalHttpUrl,
    stagingUrl: optionalHttpUrl,
    productionUrl: optionalHttpUrl,
    notes: z.string().max(20000),
  })
  .refine((v) => !v.startDate || !v.dueDate || v.startDate <= v.dueDate, {
    message: 'El vencimiento no puede ser anterior al inicio',
    path: ['dueDate'],
  })
type FormValues = z.infer<typeof Schema>

export interface ProjectDialogDefaults {
  name?: string
  dealId?: string
  companyId?: string
}

function todayDateOnly(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function memberIdsOf(project: Project & { members?: { id: string }[] }): string[] {
  return (project.members ?? []).map((m) => m.id)
}

function valuesFor(
  project: (Project & { members?: { id: string }[] }) | undefined,
  defaults: ProjectDialogDefaults | undefined,
): FormValues {
  if (project) {
    return {
      name: project.name,
      companyId: project.companyId ?? '',
      dealId: project.dealId ?? '',
      kind: project.kind ?? '',
      status: project.status,
      stage: project.stage ?? '',
      priority: project.priority,
      startDate: project.startDate ?? '',
      dueDate: project.dueDate ?? '',
      memberIds: memberIdsOf(project),
      repoUrl: project.repoUrl ?? '',
      stagingUrl: project.stagingUrl ?? '',
      productionUrl: project.productionUrl ?? '',
      notes: project.notes ?? '',
    }
  }
  return {
    name: defaults?.name ?? '',
    companyId: defaults?.companyId ?? '',
    dealId: defaults?.dealId ?? '',
    kind: '',
    status: 'not_started',
    stage: '',
    priority: 'medium',
    startDate: todayDateOnly(),
    dueDate: '',
    memberIds: [],
    repoUrl: '',
    stagingUrl: '',
    productionUrl: '',
    notes: '',
  }
}

export function ProjectDialog({
  open,
  onClose,
  project,
  defaults,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  /** Proyecto a editar; omitido = crear. */
  project?: Project & { members?: { id: string }[] }
  defaults?: ProjectDialogDefaults
  /** Se llama con el proyecto ya guardado (útil para navegar tras crear). */
  onSaved?: (saved: ProjectDetail) => void
}): React.JSX.Element {
  const isEdit = project != null
  const create = useCreateProject()
  const update = useUpdateProject()
  const { data: companies } = useCompanies()
  const { data: deals } = useDeals()
  const { data: users } = useUsers()
  const { data: processes } = useProcesses()
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: valuesFor(project, defaults),
  })

  useEffect(() => {
    if (open) {
      form.reset(valuesFor(project, defaults))
      setError(null)
    }
    // `project`/`defaults` cambian de identidad en cada render del padre; solo
    // reiniciamos al abrir o al cambiar de proyecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?.id])

  const activeDeals = useMemo(() => deals ?? [], [deals])
  const watchedKind = form.watch('kind')

  function onDealChange(dealId: string): void {
    form.setValue('dealId', dealId)
    // Comodidad: al elegir un deal sin empresa elegida, hereda la del deal.
    const deal = activeDeals.find((d) => d.id === dealId)
    if (deal?.companyId && !form.getValues('companyId')) form.setValue('companyId', deal.companyId)
  }

  async function onSubmit(v: FormValues): Promise<void> {
    setError(null)
    const common = {
      name: v.name.trim(),
      kind: v.kind || null,
      status: v.status,
      stage: (v.stage || null) as CreateProjectInput['stage'],
      priority: v.priority,
      dueDate: v.dueDate || null,
      repoUrl: v.repoUrl.trim() || null,
      stagingUrl: v.stagingUrl.trim() || null,
      productionUrl: v.productionUrl.trim() || null,
      notes: v.notes.trim() || null,
      companyId: v.companyId || null,
      dealId: v.dealId || null,
      memberIds: v.memberIds,
    }
    try {
      if (project) {
        const input: UpdateProjectInput = { ...common, startDate: v.startDate }
        const saved = await update.mutateAsync({ id: project.id, input })
        toast.success('Proyecto actualizado')
        onSaved?.(saved)
      } else {
        const saved = await create.mutateAsync({ ...common, startDate: v.startDate })
        toast.success('Proyecto creado')
        onSaved?.(saved)
      }
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el proyecto')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar proyecto' : 'Nuevo proyecto'}</DialogTitle>
          <DialogDescription className="sr-only">
            Formulario para {isEdit ? 'editar' : 'crear'} un proyecto interno.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input {...field} autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="companyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Empresa</FormLabel>
                    <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? '' : v)}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sin empresa" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Sin empresa</SelectItem>
                        {(companies ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dealId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deal (opcional)</FormLabel>
                    <Select value={field.value || NONE} onValueChange={(v) => onDealChange(v === NONE ? '' : v)}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sin deal" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Sin deal</SelectItem>
                        {activeDeals.map((d) => (
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
            </div>

            <FormField
              control={form.control}
              name="kind"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de proyecto</FormLabel>
                  <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? '' : v)}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sin proceso" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>Sin proceso</SelectItem>
                      {(processes ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.slug}>
                          {p.name}
                        </SelectItem>
                      ))}
                      {/* Un proceso archivado sigue siendo el `kind` guardado del proyecto. */}
                      {isEdit &&
                        watchedKind &&
                        !(processes ?? []).some((p) => p.slug === watchedKind) && (
                          <SelectItem value={watchedKind}>{watchedKind}</SelectItem>
                        )}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {isEdit
                      ? 'Cambiar el tipo no vuelve a copiar tareas.'
                      : 'Copia las tareas del proceso'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-3">
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
                        {PROJECT_STATUS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="stage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Etapa</FormLabel>
                    <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? '' : v)}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sin etapa" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Sin etapa</SelectItem>
                        {PROJECT_STAGE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
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
                        {PRIORITY_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Inicio</FormLabel>
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
              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vencimiento</FormLabel>
                    <div className="flex items-center gap-1">
                      <FormControl>
                        <DateField
                          value={field.value || undefined}
                          onChange={(iso) => field.onChange(iso ?? '')}
                          placeholder="Sin fecha"
                        />
                      </FormControl>
                      {field.value && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => field.onChange('')}
                          aria-label="Quitar vencimiento"
                        >
                          Quitar
                        </Button>
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="memberIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Miembros</FormLabel>
                  <UserMultiSelect
                    users={users ?? []}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Sin miembros"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              {(
                [
                  ['repoUrl', 'Repositorio'],
                  ['stagingUrl', 'Staging'],
                  ['productionUrl', 'Producción'],
                ] as const
              ).map(([name, label]) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{label}</FormLabel>
                      <FormControl>
                        <Input {...field} type="url" inputMode="url" placeholder="https://" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Guardando…' : isEdit ? 'Guardar' : 'Crear proyecto'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
