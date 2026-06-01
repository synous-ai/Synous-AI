'use client'

import { useEffect, useState } from 'react'
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
  Shuffle,
  Trash2,
} from 'lucide-react'
import { ApiError } from '@/lib/api'
import {
  useWorkItems,
  useCreateWorkItem,
  useUpdateWorkItem,
  useDeleteWorkItem,
} from '@/lib/hooks'
import type { WorkItemType, WorkItemStatus, WorkItemPriority } from '@/lib/types'
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
  processes: {
    type: 'process',
    label: 'Procesos',
    eyebrow: 'Operaciones',
    description: 'Procesos y flujos de trabajo del equipo.',
    icon: Shuffle,
  },
}

// ─── form schema ───────────────────────────────────────────────────────────────

const FormSchema = z.object({
  title: z.string().min(1, 'El título es requerido'),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  status: z.enum(['open', 'in_progress', 'done', 'cancelled']).default('open'),
})
type FormValues = z.infer<typeof FormSchema>

// ─── add dialog ────────────────────────────────────────────────────────────────

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
      reset({ title: '', description: '', priority: 'medium', status: 'open' })
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
      })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

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

        {/* priority */}
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

function WorkItemRow({ item }: { item: { id: string; title: string; description: string | null; status: WorkItemStatus; priority: WorkItemPriority } }) {
  const updateItem = useUpdateWorkItem()
  const deleteItem = useDeleteWorkItem()
  const [deleting, setDeleting] = useState(false)

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
      {/* text */}
      <div className="min-w-0 flex-1">
        <p className={cn('font-semibold text-foreground', item.status === 'cancelled' && 'line-through text-muted-foreground')}>
          {item.title}
        </p>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
        )}
        {/* chips */}
        <div className="mt-2 flex flex-wrap gap-1.5">
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
        </div>
      </div>

      {/* actions */}
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

// ─── page ──────────────────────────────────────────────────────────────────────

export default function OperationsSectionPage() {
  const params = useParams()
  const section = typeof params.section === 'string' ? params.section : ''
  const config = SECTIONS[section]

  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: items, isLoading } = useWorkItems({ type: config?.type })
  const { page, setPage, pageCount, pageItems } = usePagination(items ?? [])

  // Unknown section
  if (!config) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Sección no encontrada.</p>
      </div>
    )
  }

  const SectionIcon = config.icon

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

      {/* Content */}
      {isLoading ? (
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
              <WorkItemRow key={item.id} item={item} />
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
