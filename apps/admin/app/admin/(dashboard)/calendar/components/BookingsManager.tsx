'use client'

/**
 * BookingsManager — Listado de bookings con gestión (cancelar) desde el admin.
 *
 * Reemplaza el BookingsTab legacy en la CalendarPage. Muestra todos los bookings
 * del portal (ordenados por fecha asc) con:
 *  - Nombre del invitee, email, nombre del event type, fecha/hora.
 *  - Badge de estado (confirmed / cancelled / pending).
 *  - Botón "Cancelar" con confirmación inline de 3 segundos (patrón consistente
 *    con el delete de EventTypeList).
 *
 * Usa POST /api/calendar/bookings/:id/cancel (endpoint admin autenticado) — F4b.
 */

import { useState, useCallback } from 'react'
import { CalendarX, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import { useBookings, useCancelAdminBooking } from '@/lib/hooks'
import type { Booking } from '@/lib/types'

// ---------------------------------------------------------------------------
// Badge de estado
// ---------------------------------------------------------------------------

const STATUS_CLASSES: Record<string, string> = {
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
  pending: 'bg-yellow-100 text-yellow-700',
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_CLASSES[status] ?? 'bg-accent text-accent-foreground'
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {status}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Fila de booking con acción de cancelar
// ---------------------------------------------------------------------------

function BookingRow({ booking }: { booking: Booking }) {
  const [confirming, setConfirming] = useState(false)
  const { mutate: cancelBooking, isPending } = useCancelAdminBooking()

  const handleCancel = useCallback(() => {
    if (!confirming) {
      // Primera pulsación: mostrar estado de confirmación por 3 segundos
      setConfirming(true)
      setTimeout(() => setConfirming(false), 3000)
      return
    }
    // Segunda pulsación dentro de los 3 segundos: cancelar
    cancelBooking(booking.id, {
      onSettled: () => setConfirming(false),
    })
  }, [confirming, cancelBooking, booking.id])

  const canCancel = booking.status === 'confirmed' || booking.status === 'pending'

  return (
    <li className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">
          {booking.guestName}
          <span className="mx-1 text-muted-foreground">·</span>
          <span className="text-muted-foreground">{booking.meetingTypeName}</span>
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          {new Date(booking.startsAt).toLocaleString('es', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
        <p className="text-xs text-muted-foreground/70">{booking.guestEmail}</p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <StatusBadge status={booking.status} />
        {canCancel && (
          <Button
            variant={confirming ? 'destructive' : 'ghost'}
            size="sm"
            onClick={handleCancel}
            disabled={isPending}
            className="gap-1.5 text-xs"
          >
            {isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : confirming ? (
              <><AlertTriangle className="h-3 w-3" /> Confirmar</>
            ) : (
              'Cancelar'
            )}
          </Button>
        )}
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function BookingsManager() {
  const { data, isLoading } = useBookings()

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </CardContent>
      </Card>
    )
  }

  const bookings = data ?? []

  if (bookings.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <Empty>
            <EmptyHeader>
              <EmptyIllustration icon={CalendarX} />
              <EmptyTitle>Sin Reuniones Agendadas</EmptyTitle>
              <EmptyDescription>
                Las reservas de clientes aparecerán aquí con opciones de gestión.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-2">
        <ul className="divide-y">
          {bookings.map((b) => (
            <BookingRow key={b.id} booking={b} />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
