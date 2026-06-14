'use client'

/**
 * WeekView — Grilla semanal de bookings del portal.
 *
 * Muestra los bookings confirmados (y cancelados) del portal en una semana
 * seleccionada. Permite navegar Hoy / semana anterior / siguiente.
 *
 * Diseño:
 *  - Grilla 7 columnas (Lun–Dom).
 *  - Cada booking aparece como una card de color en la columna del día correspondiente.
 *  - Solo se cargan bookings del portal autenticado (GET /api/calendar/bookings/week).
 *  - Estética admin (no el glassmorphism del portal público).
 */

import { useState, useCallback, useMemo } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useWeekBookings } from '@/lib/hooks'
import type { WeekBooking } from '@/lib/types'

// ---------------------------------------------------------------------------
// Helpers de fecha
// ---------------------------------------------------------------------------

/** Devuelve el lunes de la semana de la fecha dada (ISO, hora 00:00 local). */
function getMondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=dom...6=sáb
  // Si es domingo (0) → restamos 6; si es lunes (1) → 0; martes (2) → 1, etc.
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Formatea como YYYY-MM-DD (sin TZ offset — para los query params de la API). */
function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Formatea hora de una fecha ISO para mostrar en la grilla. */
function formatTime(isoStr: string): string {
  try {
    return new Intl.DateTimeFormat('es', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(isoStr))
  } catch {
    return isoStr
  }
}

/** Devuelve el YYYY-MM-DD de un ISO string (en hora local del browser). */
function dateOfBooking(isoStr: string): string {
  const d = new Date(isoStr)
  return toDateStr(d)
}

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const STATUS_BADGE: Record<string, string> = {
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500 line-through',
  pending: 'bg-yellow-100 text-yellow-700',
}

// ---------------------------------------------------------------------------
// Card de booking en la grilla
// ---------------------------------------------------------------------------

function BookingCard({ booking }: { booking: WeekBooking }) {
  const color = booking.meetingTypeColor ?? '#3b82f6'
  const badgeClass = STATUS_BADGE[booking.status] ?? 'bg-accent text-accent-foreground'

  return (
    <div
      className="rounded-lg p-2 text-xs mb-1.5 border-l-4"
      style={{ borderLeftColor: color, backgroundColor: `${color}15` }}
    >
      <p className="font-semibold text-gray-900 truncate">{booking.guestName}</p>
      <p className="text-gray-500 truncate">{booking.meetingTypeName}</p>
      <p className="text-gray-500 mt-0.5">
        {formatTime(booking.startsAt)} – {formatTime(booking.endsAt)}
      </p>
      <span className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badgeClass}`}>
        {booking.status}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function WeekView() {
  // Semana actual: lunes de la semana de hoy
  const [weekStart, setWeekStart] = useState<Date>(() => getMondayOf(new Date()))

  const weekEnd = useMemo(() => {
    const end = new Date(weekStart)
    end.setDate(end.getDate() + 6)
    end.setHours(23, 59, 59, 999)
    return end
  }, [weekStart])

  const fromStr = toDateStr(weekStart)
  const toStr = toDateStr(weekEnd)

  const { data: bookings, isLoading } = useWeekBookings(fromStr, toStr)

  // Agrupar bookings por día (YYYY-MM-DD)
  const byDay = useMemo(() => {
    const map: Record<string, WeekBooking[]> = {}
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      map[toDateStr(d)] = []
    }
    for (const b of bookings ?? []) {
      const ds = dateOfBooking(b.startsAt)
      if (ds in map) map[ds]!.push(b)
    }
    return map
  }, [bookings, weekStart])

  const goToToday = useCallback(() => setWeekStart(getMondayOf(new Date())), [])
  const prevWeek = useCallback(() => {
    setWeekStart((w) => {
      const d = new Date(w)
      d.setDate(d.getDate() - 7)
      return d
    })
  }, [])
  const nextWeek = useCallback(() => {
    setWeekStart((w) => {
      const d = new Date(w)
      d.setDate(d.getDate() + 7)
      return d
    })
  }, [])

  const todayStr = toDateStr(new Date())
  // ¿La semana mostrada ya es la actual? Si sí, "Hoy" no tiene efecto → se deshabilita
  // para que se note que ya estás parado en hoy (en vez de parecer que "no hace nada").
  const onCurrentWeek = fromStr === toDateStr(getMondayOf(new Date()))

  // Rango de texto del encabezado
  const rangeLabel = `${weekStart.toLocaleDateString('es', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}`

  return (
    <div>
      {/* Controles de navegación */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToToday} disabled={onCurrentWeek}>
            <CalendarDays className="mr-1.5 h-4 w-4" />
            Hoy
          </Button>
          <Button variant="ghost" size="icon" onClick={prevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={nextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <span className="text-sm font-medium text-muted-foreground capitalize">{rangeLabel}</span>
      </div>

      {/* Grilla semanal */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className="grid grid-cols-7 min-w-[700px]">
            {/* Encabezados de días */}
            {Array.from({ length: 7 }).map((_, i) => {
              const day = new Date(weekStart)
              day.setDate(day.getDate() + i)
              const ds = toDateStr(day)
              const isToday = ds === todayStr
              return (
                <div
                  key={i}
                  className={[
                    'border-b border-r last:border-r-0 px-2 py-2 text-center',
                    isToday ? 'bg-accent/50' : '',
                  ].join(' ')}
                >
                  <p className={`text-xs font-medium ${isToday ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {DAY_LABELS[i]}
                  </p>
                  <p
                    className={[
                      'text-lg font-semibold',
                      isToday
                        ? 'bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center mx-auto'
                        : 'text-foreground',
                    ].join(' ')}
                  >
                    {day.getDate()}
                  </p>
                </div>
              )
            })}

            {/* Celdas de bookings */}
            {Array.from({ length: 7 }).map((_, i) => {
              const day = new Date(weekStart)
              day.setDate(day.getDate() + i)
              const ds = toDateStr(day)
              const dayBookings = byDay[ds] ?? []
              const isToday = ds === todayStr

              return (
                <div
                  key={i}
                  className={[
                    'border-r last:border-r-0 p-2 min-h-[180px] align-top',
                    isToday ? 'bg-accent/20' : '',
                  ].join(' ')}
                >
                  {isLoading ? (
                    <div className="space-y-1.5">
                      <Skeleton className="h-14 rounded-lg" />
                      <Skeleton className="h-10 rounded-lg" />
                    </div>
                  ) : dayBookings.length === 0 ? (
                    <p className="text-center text-[10px] text-muted-foreground/50 mt-4">—</p>
                  ) : (
                    dayBookings.map((b) => <BookingCard key={b.id} booking={b} />)
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Barra de carga sutil mientras se traen los bookings de la semana */}
      {isLoading && (
        <div className="mt-2 flex gap-2 px-1">
          <Skeleton className="h-1.5 flex-1 rounded-full" />
          <Skeleton className="h-1.5 flex-1 rounded-full" />
          <Skeleton className="h-1.5 flex-1 rounded-full" />
        </div>
      )}
    </div>
  )
}
