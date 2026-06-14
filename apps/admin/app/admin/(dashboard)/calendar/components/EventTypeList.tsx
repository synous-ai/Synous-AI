'use client'

/**
 * EventTypeList — Lista de event types del portal con acciones CRUD.
 *
 * Muestra todos los event types (activos e inactivos) con:
 *  - Color indicador, nombre, slug, duración, tipo (solo/group/collective).
 *  - Badge de estado activo/inactivo y de secreto.
 *  - Botón "Editar" que abre EventTypeForm en modo edición.
 *  - Botón "Eliminar" con confirmación inline.
 *  - URL pública para compartir (construida con el portalId y slug del event type).
 *
 * El portalId se pasa como prop desde la página padre (que lo tiene del hubUser).
 */

import { useState } from 'react'
import {
  Clock,
  Users,
  Trash2,
  Pencil,
  Copy,
  Check,
  Link2,
  EyeOff,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ListSkeleton } from '@/components/ui/skeletons'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import { useEventTypesV2, useDeleteEventTypeV2 } from '@/lib/hooks'
import type { EventTypeV2 } from '@/lib/types'
import { EventTypeForm } from './EventTypeForm'

interface Props {
  /** portalId del hub — se usa para construir la URL pública del event type */
  portalId: string
}

/** Construye la URL pública del booking page para un event type */
function buildPublicUrl(portalId: string, slug: string): string {
  // Ruta pública: /booking/:portalId/:slug
  // En producción tendrá el dominio del cliente; en dev es una ruta del portal.
  return `/booking/${portalId}/${slug}`
}

/** Formatea el tipo de evento para mostrar al admin */
function formatKind(et: EventTypeV2): string {
  if (et.poolingType === 'collective') return 'Colectivo'
  if (et.kind === 'group') return `Grupal (máx. ${et.maxInvitees ?? '∞'})`
  return 'Individual'
}

/** Componente de botón para copiar la URL pública al portapapeles */
function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-muted-foreground hover:text-foreground"
      title="Copiar URL pública"
      onClick={handleCopy}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  )
}

/** Fila de un event type individual */
function EventTypeRow({
  et,
  portalId,
  onEdit,
}: {
  et: EventTypeV2
  portalId: string
  onEdit: (et: EventTypeV2) => void
}) {
  const del = useDeleteEventTypeV2()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const publicUrl = buildPublicUrl(portalId, et.slug)

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      // Auto-cancelar confirmación después de 3 segundos
      setTimeout(() => setConfirmDelete(false), 3000)
      return
    }
    await del.mutateAsync(et.id)
  }

  return (
    <li className="group flex items-center gap-3 px-4 py-3">
      {/* Indicador de color del event type */}
      <span
        className="h-8 w-1 flex-shrink-0 rounded-full"
        style={{ backgroundColor: et.color ?? '#3b82f6' }}
        aria-hidden
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{et.name}</p>
          {et.secret && (
            <span title="Event type secreto — no aparece en listados públicos">
              <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          )}
          {!et.isActive && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              inactivo
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {et.durationMin} min
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {formatKind(et)}
          </span>
          <span className="flex items-center gap-1 font-mono">
            <Link2 className="h-3 w-3" />
            {publicUrl}
          </span>
          <CopyUrlButton url={publicUrl} />
        </div>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Editar"
          onClick={() => onEdit(et)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={del.isPending}
          className={`h-8 w-8 transition-colors ${
            confirmDelete
              ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
              : 'text-muted-foreground hover:text-destructive'
          }`}
          title={confirmDelete ? 'Confirmar eliminación' : 'Eliminar'}
          onClick={handleDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </li>
  )
}

export function EventTypeList({ portalId }: Props) {
  const { data, isLoading } = useEventTypesV2()
  const [showForm, setShowForm] = useState(false)
  const [editingEventType, setEditingEventType] = useState<EventTypeV2 | null>(null)

  function handleEdit(et: EventTypeV2) {
    setEditingEventType(et)
    setShowForm(true)
  }

  function handleClose() {
    setShowForm(false)
    setEditingEventType(null)
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {(data ?? []).length} tipo{(data ?? []).length !== 1 ? 's' : ''} de evento
        </p>
        <Button size="sm" onClick={() => setShowForm((o) => !o)}>
          {showForm && !editingEventType ? (
            'Cancelar'
          ) : (
            <>
              <Plus className="mr-1 h-4 w-4" />
              Nuevo Tipo
            </>
          )}
        </Button>
      </div>

      {/* Formulario de creación / edición */}
      {showForm && (
        <div className="mb-4">
          <EventTypeForm
            initialData={editingEventType ?? undefined}
            onClose={handleClose}
          />
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            /* h-14 coincide con la altura real de cada fila (icono + nombre + meta) */
            <div className="p-4">
              <ListSkeleton rows={3} rowClassName="h-14 rounded-lg" label="Cargando tipos de evento…" />
            </div>
          ) : (data ?? []).length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyIllustration icon={Clock} />
                <EmptyTitle>Sin Tipos de Evento</EmptyTitle>
                <EmptyDescription>
                  Creá tu primer tipo de evento con el botón &quot;Nuevo Tipo&quot;.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="divide-y">
              {data!.map((et) => (
                <EventTypeRow key={et.id} et={et} portalId={portalId} onEdit={handleEdit} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
