/**
 * slots.service.ts — Motor de cálculo de slots disponibles (FUNCIÓN PURA)
 *
 * Este servicio NO toca la base de datos. Recibe todos los datos por parámetro y
 * devuelve los slots disponibles en UTC. Es testeable de forma aislada y se usa
 * desde las rutas públicas y admin de calendario.
 *
 * Decisiones de diseño:
 *  - Se usa date-fns-tz (fromZonedTime / toZonedTime) para convertir horas locales
 *    del host a UTC de forma DST-safe: NUNCA se usa un offset fijo.
 *  - Para eventos colectivos se calcula la INTERSECCIÓN de ventanas de todos los hosts.
 *  - El daily_limit se cuenta por día en la TZ del host.
 *  - Los overrides de fecha REEMPLAZAN los intervalos semanales del día; array vacío = bloqueado.
 */

import { fromZonedTime, toZonedTime, format as formatTz } from 'date-fns-tz'
import { addMinutes, addDays, startOfDay, isBefore, isAfter, isEqual } from 'date-fns'

// ---------------------------------------------------------------------------
// Tipos de entrada — el motor NO importa de Drizzle para mantenerse puro
// ---------------------------------------------------------------------------

/** Intervalo semanal de disponibilidad del host */
export interface WeeklyInterval {
  /** 0=domingo … 6=sábado */
  dayOfWeek: number
  /** Formato 'HH:mm' en wall-clock del host */
  startTime: string
  /** Formato 'HH:mm' en wall-clock del host */
  endTime: string
}

/** Override de disponibilidad para una fecha específica */
export interface DateOverrideItem {
  /** Fecha en 'YYYY-MM-DD' en la TZ del schedule */
  date: string
  /** Intervalos del día: array vacío = día bloqueado */
  intervals: Array<{ from: string; to: string }>
}

/** Schedule de disponibilidad de un host */
export interface ScheduleWithIntervals {
  timeZone: string
  intervals: WeeklyInterval[]
  dateOverrides: DateOverrideItem[]
}

/** Booking existente que bloquea tiempo */
export interface BookingBusy {
  /** ISO UTC string */
  startsAt: string
  /** ISO UTC string */
  endsAt: string
  /** Solo se descuentan bookings confirmados */
  status: string
}

/** Configuración del event type (solo los campos que el motor necesita) */
export interface EventTypeConfig {
  durationMin: number
  startTimeIncrementMin: number
  minBookingNoticeMin: number
  bufferBeforeMin: number
  bufferAfterMin: number
  bookingWindowType: 'rolling' | 'range' | 'unlimited'
  /** Solo para bookingWindowType='rolling' */
  bookingWindowDays?: number | null
  /** Solo para bookingWindowType='range' (ISO date 'YYYY-MM-DD') */
  bookingWindowStart?: string | null
  /** Solo para bookingWindowType='range' (ISO date 'YYYY-MM-DD') */
  bookingWindowEnd?: string | null
  /** Máximo de bookings confirmados por día en host TZ (null = sin límite) */
  dailyLimit?: number | null
}

/** Input completo del motor de slots */
export interface SlotInput {
  eventType: EventTypeConfig
  /**
   * Para eventos one-on-one: un único schedule.
   * Para eventos colectivos: un schedule por host (se intersectan).
   */
  schedules: ScheduleWithIntervals[]
  /** Bookings existentes confirmados que bloquean tiempo */
  existingBookings: BookingBusy[]
  /** Fecha de inicio del rango (YYYY-MM-DD) */
  fromDate: string
  /** Fecha de fin del rango (YYYY-MM-DD) */
  toDate: string
  /** Zona horaria IANA del invitado (para conversión de display, no afecta el cómputo) */
  inviteeTimezone: string
  /** Momento "ahora" — inyectado para testabilidad, no se usa Date.now() internamente */
  now: Date
}

/** Slot disponible devuelto por el motor */
export interface SlotResult {
  /** Inicio del slot en ISO UTC */
  startUtc: string
  /** Fin del slot en ISO UTC */
  endUtc: string
}

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

/** Ventana de disponibilidad en UTC absoluto para un día dado */
interface UtcWindow {
  /** Inicio de la ventana en UTC (Date) */
  start: Date
  /** Fin de la ventana en UTC (Date) */
  end: Date
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convierte una hora en formato 'HH:mm' + una fecha 'YYYY-MM-DD' en host TZ
 * a un Date UTC DST-safe usando date-fns-tz.
 * NUNCA usa offset fijo — fromZonedTime resuelve el DST puntual de esa fecha.
 */
function wallClockToUtc(date: string, time: string, hostTz: string): Date {
  // Construir la fecha/hora en formato local del host — sin offset
  const localStr = `${date}T${time}:00`
  return fromZonedTime(localStr, hostTz)
}

/**
 * Devuelve la fecha en formato 'YYYY-MM-DD' según la TZ del host.
 * Se usa para contar el daily_limit por día en la TZ del host.
 */
function utcDateInHostTz(utcDate: Date, hostTz: string): string {
  return formatTz(toZonedTime(utcDate, hostTz), 'yyyy-MM-dd', { timeZone: hostTz })
}

/**
 * Genera la lista de fechas 'YYYY-MM-DD' entre fromDate y toDate (inclusive).
 */
function eachDayInRange(fromDate: string, toDate: string): string[] {
  const days: string[] = []
  let current = new Date(`${fromDate}T00:00:00Z`)
  const end = new Date(`${toDate}T00:00:00Z`)
  while (!isAfter(current, end)) {
    // Extraer la fecha como string YYYY-MM-DD usando UTC para no depender de TZ local
    const y = current.getUTCFullYear()
    const m = String(current.getUTCMonth() + 1).padStart(2, '0')
    const d = String(current.getUTCDate()).padStart(2, '0')
    days.push(`${y}-${m}-${d}`)
    current = addDays(current, 1)
  }
  return days
}

/**
 * dayOfWeek del estándar JS: getDay() en UTC.
 * Se obtiene de la fecha 'YYYY-MM-DD' interpretada en UTC.
 */
function weekdayOfDate(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay()
}

/**
 * Verifica si dos ventanas se solapan (sin incluir el extremo, es decir
 * [a.start, a.end) ∩ [b.start, b.end) ≠ ∅).
 */
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return isBefore(aStart, bEnd) && isBefore(bStart, aEnd)
}

// ---------------------------------------------------------------------------
// Motor principal
// ---------------------------------------------------------------------------

/**
 * Calcula las ventanas de disponibilidad en UTC para un schedule dado,
 * para un único día (dateStr en formato 'YYYY-MM-DD').
 *
 * Aplica la lógica de override: si existe un override para ese día, usa
 * sus intervalos en lugar de los semanales (array vacío = bloqueado).
 */
function getWindowsForDay(
  dateStr: string,
  schedule: ScheduleWithIntervals,
): UtcWindow[] {
  const { timeZone, intervals, dateOverrides } = schedule

  // Buscar override para esta fecha exacta
  const override = dateOverrides.find((o) => o.date === dateStr)

  if (override) {
    // Override presente: array vacío = día bloqueado
    if (override.intervals.length === 0) return []
    return override.intervals.map(({ from, to }) => ({
      start: wallClockToUtc(dateStr, from, timeZone),
      end: wallClockToUtc(dateStr, to, timeZone),
    }))
  }

  // Sin override: usar intervalos semanales del día de la semana
  const dow = weekdayOfDate(dateStr)
  const dayIntervals = intervals.filter((i) => i.dayOfWeek === dow)
  return dayIntervals.map((i) => ({
    start: wallClockToUtc(dateStr, i.startTime, timeZone),
    end: wallClockToUtc(dateStr, i.endTime, timeZone),
  }))
}

/**
 * Intersecta dos listas de ventanas UTC.
 * Devuelve solo los sub-intervalos presentes en AMBAS listas.
 * Se usa para eventos colectivos (todos los hosts deben estar libres).
 */
function intersectWindows(a: UtcWindow[], b: UtcWindow[]): UtcWindow[] {
  const result: UtcWindow[] = []
  for (const wa of a) {
    for (const wb of b) {
      // Calcular la intersección de los dos intervalos
      const start = isAfter(wa.start, wb.start) ? wa.start : wb.start
      const end = isBefore(wa.end, wb.end) ? wa.end : wb.end
      if (isBefore(start, end)) {
        result.push({ start, end })
      }
    }
  }
  return result
}

/**
 * Verifica si un slot está dentro del booking window del event type.
 * @param slotStart Inicio del slot en UTC
 * @param now Momento actual (inyectado)
 * @param et Configuración del event type
 */
function isWithinBookingWindow(slotStart: Date, now: Date, et: EventTypeConfig): boolean {
  if (et.bookingWindowType === 'unlimited') return true

  if (et.bookingWindowType === 'rolling') {
    const days = et.bookingWindowDays ?? 60
    // La ventana es [now, now + days días)
    const windowEnd = addDays(startOfDay(now), days + 1) // +1 para incluir el último día completo
    return !isAfter(slotStart, windowEnd)
  }

  if (et.bookingWindowType === 'range') {
    if (!et.bookingWindowStart || !et.bookingWindowEnd) return false
    const rangeStart = new Date(`${et.bookingWindowStart}T00:00:00Z`)
    const rangeEnd = new Date(`${et.bookingWindowEnd}T23:59:59Z`)
    return !isBefore(slotStart, rangeStart) && !isAfter(slotStart, rangeEnd)
  }

  return false
}

/**
 * computeSlots — función PURA principal del motor de scheduling.
 *
 * Recibe todos los datos por parámetro (sin tocar DB) y devuelve
 * los slots disponibles en UTC dentro del rango solicitado.
 *
 * Algoritmo por día:
 *  1. Obtener ventanas del schedule (override → semanal).
 *  2. Para colectivos: intersectar ventanas de todos los hosts.
 *  3. Por cada ventana, generar candidatos cada startTimeIncrementMin.
 *  4. Filtrar: booking_no_overlap + buffers, minNotice, bookingWindow, dailyLimit.
 */
export function computeSlots(input: SlotInput): SlotResult[] {
  const { eventType: et, schedules, existingBookings, fromDate, toDate, now } = input

  if (schedules.length === 0) return []

  // Solo se descuentan bookings confirmados
  const confirmedBookings = existingBookings.filter((b) => b.status === 'confirmed')

  // Umbral de min_booking_notice: los slots que empiecen antes de este momento se excluyen
  const noticeThreshold = addMinutes(now, et.minBookingNoticeMin)

  const slots: SlotResult[] = []

  // Contador de bookings confirmados por día (en la TZ del primer schedule)
  // para respetar el daily_limit
  const primaryTz = schedules[0]?.timeZone ?? 'UTC'

  // Pre-computar cuántos bookings confirmados hay por día (en host TZ)
  const confirmedByDay = new Map<string, number>()
  for (const b of confirmedBookings) {
    const dayStr = utcDateInHostTz(new Date(b.startsAt), primaryTz)
    confirmedByDay.set(dayStr, (confirmedByDay.get(dayStr) ?? 0) + 1)
  }

  // Iterar sobre cada día del rango
  for (const dateStr of eachDayInRange(fromDate, toDate)) {
    // Verificar daily_limit para este día
    if (et.dailyLimit !== null && et.dailyLimit !== undefined) {
      const dayKey = dateStr // Ya está en 'YYYY-MM-DD'
      const booked = confirmedByDay.get(dayKey) ?? 0
      if (booked >= et.dailyLimit) continue
    }

    // Calcular ventanas disponibles para este día
    let windows: UtcWindow[]

    if (schedules.length === 1) {
      // Evento solo/group: solo un schedule
      windows = getWindowsForDay(dateStr, schedules[0]!)
    } else {
      // Evento colectivo: intersectar todos los schedules
      let combined: UtcWindow[] | null = null
      for (const schedule of schedules) {
        const dayWindows = getWindowsForDay(dateStr, schedule)
        if (combined === null) {
          combined = dayWindows
        } else {
          combined = intersectWindows(combined, dayWindows)
        }
      }
      windows = combined ?? []
    }

    if (windows.length === 0) continue

    // Conteo de slots generados este día (para daily_limit restante tras bookings)
    let slotsToday = 0

    // Generar slots dentro de cada ventana
    for (const window of windows) {
      let cursor = window.start

      while (true) {
        const slotEnd = addMinutes(cursor, et.durationMin)

        // El slot completo debe caber en la ventana
        if (isAfter(slotEnd, window.end)) break

        // Verificar daily_limit (slots ya emitidos + bookings existentes)
        if (et.dailyLimit !== null && et.dailyLimit !== undefined) {
          const dayKey = dateStr
          const booked = confirmedByDay.get(dayKey) ?? 0
          if (booked + slotsToday >= et.dailyLimit) break
        }

        // Filtro: min_booking_notice
        if (isBefore(cursor, noticeThreshold)) {
          cursor = addMinutes(cursor, et.startTimeIncrementMin)
          continue
        }

        // Filtro: booking_window
        if (!isWithinBookingWindow(cursor, now, et)) {
          cursor = addMinutes(cursor, et.startTimeIncrementMin)
          continue
        }

        // Filtro: bookings existentes + buffers before/after
        const slotWithBufferStart = addMinutes(cursor, -et.bufferBeforeMin)
        const slotWithBufferEnd = addMinutes(slotEnd, et.bufferAfterMin)

        const isBlocked = confirmedBookings.some((b) => {
          const bStart = new Date(b.startsAt)
          const bEnd = new Date(b.endsAt)
          // El slot (con buffers) solapa con el booking (con sus propios buffers ya considerados)
          return overlaps(slotWithBufferStart, slotWithBufferEnd, bStart, bEnd)
        })

        if (!isBlocked) {
          slots.push({
            startUtc: cursor.toISOString(),
            endUtc: slotEnd.toISOString(),
          })
          slotsToday++
        }

        cursor = addMinutes(cursor, et.startTimeIncrementMin)
      }
    }
  }

  return slots
}

// ---------------------------------------------------------------------------
// Helper de display
// ---------------------------------------------------------------------------

/**
 * Formatea un slot UTC en la zona horaria del invitado.
 * Ejemplo: '2026-06-15T14:00:00.000Z' + 'America/Bogota' → '09:00 AM'
 *
 * @param slotUtc ISO UTC string del slot
 * @param tz Zona horaria IANA del invitado
 * @param fmt Formato date-fns (default: 'HH:mm')
 */
export function toInviteeDisplay(
  slotUtc: string,
  tz: string,
  fmt: string = 'HH:mm',
): string {
  const zonedDate = toZonedTime(new Date(slotUtc), tz)
  return formatTz(zonedDate, fmt, { timeZone: tz })
}
