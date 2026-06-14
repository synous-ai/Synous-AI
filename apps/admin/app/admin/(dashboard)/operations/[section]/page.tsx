'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus,
  Loader2,
  Bug,
  Lightbulb,
  Map,
  Trash2,
  User,
  Briefcase,
} from 'lucide-react'
import { ApiError } from '@/lib/api'
import {
  useWorkItems,
  useCreateWorkItem,
  useUpdateWorkItem,
  useDeleteWorkItem,
} from '@/lib/hooks'
import { useUsers } from '@/lib/hooks/settings'
import { useDeals } from '@/lib/hooks/deals'
import type { WorkItemType, WorkItemStatus, WorkItemPriority, WorkItemTimeframe, WorkItem } from '@/lib/types'
import type { TeamUser } from '@/lib/types'
import type { Deal } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { priority as priorityStatus, workItemStatus } from '@/lib/status'
import { StatusBadge } from '@/components/ui/status-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { DataPagination } from '@/components/ui/data-pagination'
import { usePagination } from '@/lib/use-pagination'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'

// ─── section config ────────────────────────────────────────────────────────────

interface SectionConfig {
  type: WorkItemType
  label: string
  eyebrow: string
  description: string
  icon: typeof Bug
}

/**
 * Secciones de Operaciones: Bugs, Mejoras, Roadmap.
 *
 * NOTA: "Procesos" fue removido de Operaciones (PO3).
 * Los procesos viven ahora como SOPs en Biblioteca → /admin/library/sops.
 * Si alguien accede a /admin/operations/processes, la página muestra
 * "Sección no encontrada" (config=undefined → rama de fallback del render).
 *
 * El CHECK constraint 'process' de work_item.type NO se eliminó —
 * hay filas archivadas con ese type y modificar el CHECK las rompería.
 */
const SECTIONS: Record<string, SectionConfig> = {
  bugs: {
    type: 'bug',
    label: 'Bugs',
    eyebrow: 'Operaciones',
    description: 'Errores detectados en el sistema o en proyectos del equipo.',
    icon: Bug,
  },
  improvements: {
    type: 'improvement',
    label: 'Mejoras',
    eyebrow: 'Operaciones',
    description: 'Ideas y mejoras pendientes de implementar.',
    icon: Lightbulb,
  },
  roadmap: {
    type: 'roadmap',
    label: 'Roadmap interno',
    eyebrow: 'Operaciones',
    description: 'Iniciativas estratégicas y funcionalidades planificadas.',
    icon: Map,
  },
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Devuelve las iniciales de un hub_user (ej: "CA" para Carlos Andrés). */
function userInitials(user: TeamUser): string {
  const first = user.firstName?.[0] ?? ''
  const last = user.lastName?.[0] ?? ''
  return (first + last).toUpperCase() || user.email[0]?.toUpperCase() || '?'
}

/** Chip circular con iniciales del asignado. */
function AssigneeChip({ user }: { user: TeamUser }) {
  return (
    <span
      title={`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email}
      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
    >
      {userInitials(user)}
    </span>
  )
}

// ─── form schema ───────────────────────────────────────────────────────────────

/**
 * Esquema del formulario de creación/edición de work items.
 * El campo 'timeframe' solo aplica a roadmap — se valida a nivel de form,
 * pero el backend también tiene CHECK constraint para garantizarlo.
 */
const FormSchema = z.object({
  title: z.string().min(1, 'El título es requerido'),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  status: z.enum(['open', 'in_progress', 'done', 'cancelled']).default('open'),
  timeframe: z.enum(['now', 'next', 'later']).optional(),
  assignedTo: z.string().optional(),
  dealId: z.string().optional(),
})
type FormValues = z.infer<typeof FormSchema>

// ─── add dialog ────────────────────────────────────────────────────────────────

/**
 * Modal de creación de work items.
 * Para todos los tipos: title, description, priority, status, assignee, deal.
 * Solo para roadmap: campo adicional "Horizonte" (timeframe).
 */
function AddItemDialog({
  open,
  onClose,
  type,
}: {
  open: boolean
  onClose: () => void
  type: WorkItemType
}) {
  const create = useCreateWorkItem()
  const { data: users } = useUsers()
  const { data: deals } = useDeals()
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(FormSchema) })

  useEffect(() => {
    if (open) {
      reset({ title: '', description: '', priority: 'medium', status: 'open', timeframe: undefined, assignedTo: undefined, dealId: undefined })
      setError(null)
    }
  }, [open, reset])

  async function onSubmit(values: FormValues) {
    setError(null)
    try {
      await create.mutateAsync({
        type,
        title: values.title,
        description: values.description || undefined,
        priority: values.priority,
        status: values.status,
        // Timeframe solo se envía para roadmap; para otros tipos queda undefined.
        timeframe: type === 'roadmap' ? values.timeframe : undefined,
        assignedTo: values.assignedTo || undefined,
        dealId: values.dealId || undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  const isRoadmap = type === 'roadmap'

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar Ítem</DialogTitle>
          <DialogDescription className="sr-only">
            Formulario para agregar un ítem de operaciones.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          {/* title */}
          <div className="space-y-1.5">
            <Label htmlFor="wi-title">Título</Label>
            <Input id="wi-title" {...register('title')} placeholder="Ej: Error al guardar formulario" />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          {/* description */}
          <div className="space-y-1.5">
            <Label htmlFor="wi-description">Descripción (opcional)</Label>
            <Input id="wi-description" {...register('description')} placeholder="Contexto adicional" />
          </div>

          {/* priority — para todos los tipos */}
          <div className="space-y-1.5">
            <Label>Prioridad</Label>
            <Controller
              control={control}
              name="priority"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baja</SelectItem>
                    <SelectItem value="medium">Media</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* timeframe — solo para roadmap */}
          {isRoadmap && (
            <div className="space-y-1.5">
              <Label>Horizonte</Label>
              <Controller
                control={control}
                name="timeframe"
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={(v) => field.onChange(v || undefined)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sin clasificar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="now">Ahora</SelectItem>
                      <SelectItem value="next">Próximo</SelectItem>
                      <SelectItem value="later">Después</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}

          {/* status */}
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Abierto</SelectItem>
                    <SelectItem value="in_progress">En progreso</SelectItem>
                    <SelectItem value="done">Completado</SelectItem>
                    <SelectItem value="cancelled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* assignee */}
          <div className="space-y-1.5">
            <Label>Asignado a</Label>
            <Controller
              control={control}
              name="assignedTo"
              render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={(v) => field.onChange(v || undefined)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin asignar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned-placeholder">Sin asignar</SelectItem>
                    {users?.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {`${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* deal/proyecto */}
          <div className="space-y-1.5">
            <Label>Proyecto (deal)</Label>
            <Controller
              control={control}
              name="dealId"
              render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={(v) => field.onChange(v || undefined)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin proyecto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none-placeholder">Sin proyecto</SelectItem>
                    {deals?.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── item row ─────────────────────────────────────────────────────────────────

/**
 * Fila/card de un work item para las vistas de Bugs, Mejoras y Procesos.
 * Muestra: título, descripción, badges de prioridad/estado, iniciales del asignado,
 * nombre del deal vinculado, selector de estado inline y botón de borrar.
 */
function WorkItemRow({
  item,
  users,
  deals,
}: {
  item: WorkItem
  users: TeamUser[] | undefined
  deals: Deal[] | undefined
}) {
  const updateItem = useUpdateWorkItem()
  const deleteItem = useDeleteWorkItem()
  const [deleting, setDeleting] = useState(false)

  const assignee = item.assignedTo ? users?.find((u) => u.id === item.assignedTo) : null
  const deal = item.dealId ? deals?.find((d) => d.id === item.dealId) : null

  async function handleStatusChange(newStatus: WorkItemStatus) {
    await updateItem.mutateAsync({ id: item.id, input: { status: newStatus } })
  }

  async function handleDelete() {
    if (!window.confirm(`¿Eliminar "${item.title}"?`)) return
    setDeleting(true)
    try {
      await deleteItem.mutateAsync(item.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-start">
      {/* contenido principal */}
      <div className="min-w-0 flex-1">
        <p className={cn('font-semibold text-foreground', item.status === 'cancelled' && 'line-through text-muted-foreground')}>
          {item.title}
        </p>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
        )}

        {/* chips: prioridad, estado, asignado, deal */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {(() => {
            const p = priorityStatus(item.priority)
            const s = workItemStatus(item.status)
            return (
              <>
                <StatusBadge kind={p.kind}>{p.label}</StatusBadge>
                <StatusBadge kind={s.kind} className={item.status === 'cancelled' ? 'line-through' : undefined}>
                  {s.label}
                </StatusBadge>
              </>
            )
          })()}
          {/* asignado: iniciales */}
          {assignee && <AssigneeChip user={assignee} />}
          {/* deal vinculado */}
          {deal && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              <Briefcase className="h-3 w-3" />
              {deal.name}
            </span>
          )}
        </div>
      </div>

      {/* acciones */}
      <div className="flex shrink-0 items-center gap-2">
        <Select
          value={item.status}
          onValueChange={(v) => handleStatusChange(v as WorkItemStatus)}
          disabled={updateItem.isPending}
        >
          <SelectTrigger className="h-8 w-36 text-xs" aria-label="Cambiar estado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Abierto</SelectItem>
            <SelectItem value="in_progress">En progreso</SelectItem>
            <SelectItem value="done">Completado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleDelete}
          disabled={deleting}
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          title="Eliminar"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

// ─── roadmap card ─────────────────────────────────────────────────────────────

/**
 * Card compacta para la vista kanban del Roadmap.
 * Muestra: título, prioridad, asignado (iniciales), deal vinculado.
 * Reutiliza la misma lógica de borrar y cambiar estado que WorkItemRow.
 */
function RoadmapCard({
  item,
  users,
  deals,
}: {
  item: WorkItem
  users: TeamUser[] | undefined
  deals: Deal[] | undefined
}) {
  const updateItem = useUpdateWorkItem()
  const deleteItem = useDeleteWorkItem()
  const [deleting, setDeleting] = useState(false)

  const assignee = item.assignedTo ? users?.find((u) => u.id === item.assignedTo) : null
  const deal = item.dealId ? deals?.find((d) => d.id === item.dealId) : null

  async function handleStatusChange(newStatus: WorkItemStatus) {
    await updateItem.mutateAsync({ id: item.id, input: { status: newStatus } })
  }

  async function handleDelete() {
    if (!window.confirm(`¿Eliminar "${item.title}"?`)) return
    setDeleting(true)
    try {
      await deleteItem.mutateAsync(item.id)
    } finally {
      setDeleting(false)
    }
  }

  const p = priorityStatus(item.priority)
  const s = workItemStatus(item.status)

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm transition-shadow hover:shadow-md">
      <p className={cn('text-sm font-semibold leading-snug text-foreground', item.status === 'cancelled' && 'line-through text-muted-foreground')}>
        {item.title}
      </p>
      {item.description && (
        <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
      )}

      <div className="flex flex-wrap items-center gap-1">
        <StatusBadge kind={p.kind}>{p.label}</StatusBadge>
        <StatusBadge kind={s.kind}>{s.label}</StatusBadge>
        {assignee && <AssigneeChip user={assignee} />}
        {deal && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            <Briefcase className="h-3 w-3" />
            {deal.name}
          </span>
        )}
      </div>

      {/* selector de estado inline + borrar */}
      <div className="flex items-center gap-1.5 pt-1">
        <Select
          value={item.status}
          onValueChange={(v) => handleStatusChange(v as WorkItemStatus)}
          disabled={updateItem.isPending}
        >
          <SelectTrigger className="h-7 flex-1 text-xs" aria-label="Cambiar estado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Abierto</SelectItem>
            <SelectItem value="in_progress">En progreso</SelectItem>
            <SelectItem value="done">Completado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={handleDelete}
          disabled={deleting}
          title="Eliminar"
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  )
}

// ─── roadmap view ─────────────────────────────────────────────────────────────

const TIMEFRAME_LABELS: Record<WorkItemTimeframe | 'unclassified', string> = {
  now: 'Ahora',
  next: 'Próximo',
  later: 'Después',
  unclassified: 'Sin clasificar',
}

const TIMEFRAME_ORDER: Array<WorkItemTimeframe | 'unclassified'> = ['now', 'next', 'later', 'unclassified']

/**
 * Vista de Roadmap agrupada por horizonte temporal (timeframe).
 * Renderiza tres columnas: Ahora / Próximo / Después + columna "Sin clasificar"
 * para ítems sin timeframe asignado.
 */
function RoadmapView({
  items,
  users,
  deals,
  isLoading,
  sectionIcon: SectionIcon,
}: {
  items: WorkItem[] | undefined
  users: TeamUser[] | undefined
  deals: Deal[] | undefined
  isLoading: boolean
  sectionIcon: typeof Map
}) {
  // Agrupa los ítems por timeframe; los null van a 'unclassified'.
  const grouped = useMemo(() => {
    const result: Record<WorkItemTimeframe | 'unclassified', WorkItem[]> = {
      now: [],
      next: [],
      later: [],
      unclassified: [],
    }
    for (const item of items ?? []) {
      const key = (item.timeframe ?? 'unclassified') as WorkItemTimeframe | 'unclassified'
      result[key].push(item)
    }
    return result
  }, [items])

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-6 w-24 rounded" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        ))}
      </div>
    )
  }

  const hasItems = items && items.length > 0

  if (!hasItems) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyIllustration icon={SectionIcon} />
          <EmptyTitle>Sin Iniciativas Todavía</EmptyTitle>
          <EmptyDescription>Agregá la primera con el botón &quot;Agregar&quot;.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {TIMEFRAME_ORDER.map((tf) => {
        const colItems = grouped[tf]
        // Oculta la columna "Sin clasificar" si está vacía
        if (tf === 'unclassified' && colItems.length === 0) return null
        return (
          <div key={tf} className="flex flex-col gap-3">
            {/* encabezado de columna */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{TIMEFRAME_LABELS[tf]}</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {colItems.length}
              </span>
            </div>
            {/* cards */}
            {colItems.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Sin ítems</p>
            ) : (
              colItems.map((item) => (
                <RoadmapCard key={item.id} item={item} users={users} deals={deals} />
              ))
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── filter bar ───────────────────────────────────────────────────────────────

/**
 * Barra de filtros para bugs/mejoras: filtra por asignado.
 * El filtro vacío ('') equivale a "todos".
 */
function FilterBar({
  users,
  assignedTo,
  onAssignedToChange,
}: {
  users: TeamUser[] | undefined
  assignedTo: string
  onAssignedToChange: (v: string) => void
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <User className="h-4 w-4 text-muted-foreground" />
        <Select value={assignedTo} onValueChange={onAssignedToChange}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Todos los miembros" />
          </SelectTrigger>
          <SelectContent>
            {/* Valor vacío = sin filtro (todos) */}
            <SelectItem value="all">Todos los miembros</SelectItem>
            <SelectItem value="unassigned">Sin asignar</SelectItem>
            {users?.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {`${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

// ─── page ──────────────────────────────────────────────────────────────────────

export default function OperationsSectionPage() {
  const params = useParams()
  const section = typeof params.section === 'string' ? params.section : ''
  const config = SECTIONS[section]

  const [dialogOpen, setDialogOpen] = useState(false)
  // Filtro por asignado; '' = todos, 'unassigned' = sin asignar, cualquier ID = ese usuario.
  const [assignedToFilter, setAssignedToFilter] = useState<string>('all')

  // Solo pasamos assignedTo si no es 'all' — el backend ignorará ausencia del param.
  const assignedToParam = assignedToFilter === 'all' ? undefined : assignedToFilter

  const { data: items, isLoading } = useWorkItems({
    type: config?.type,
    assignedTo: assignedToParam,
  })

  // Carga lazy de usuarios y deals para el modal y las filas/cards.
  const { data: users } = useUsers()
  const { data: deals } = useDeals()

  const { page, setPage, pageCount, pageItems } = usePagination(
    // Roadmap no usa paginación (vista kanban), pasamos array vacío
    config?.type !== 'roadmap' ? (items ?? []) : [],
  )

  if (!config) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Sección no encontrada.</p>
      </div>
    )
  }

  const SectionIcon = config.icon
  const isRoadmap = config.type === 'roadmap'

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="eyebrow">{config.eyebrow}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{config.label}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{config.description}</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Agregar
        </Button>
      </div>

      {/* Filtros — no mostramos para Roadmap (el agrupado por timeframe ya filtra visualmente) */}
      {!isRoadmap && (
        <FilterBar
          users={users}
          assignedTo={assignedToFilter}
          onAssignedToChange={(v) => {
            setAssignedToFilter(v)
            setPage(1)
          }}
        />
      )}

      {/* Content */}
      {isRoadmap ? (
        // Vista Roadmap: kanban agrupado por timeframe
        <RoadmapView
          items={items}
          users={users}
          deals={deals}
          isLoading={isLoading}
          sectionIcon={SectionIcon}
        />
      ) : isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      ) : !items || items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyIllustration icon={SectionIcon} />
            <EmptyTitle>Sin Ítems Todavía</EmptyTitle>
            <EmptyDescription>Agregá el primero con el botón &quot;Agregar&quot;.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {pageItems.map((item) => (
              <WorkItemRow key={item.id} item={item} users={users} deals={deals} />
            ))}
          </div>
          <DataPagination page={page} pageCount={pageCount} onPageChange={setPage} />
        </>
      )}

      <AddItemDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        type={config.type}
      />
    </div>
  )
}
