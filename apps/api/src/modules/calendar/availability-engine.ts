import { and, asc, eq, inArray, or, sql } from 'drizzle-orm'
import { db, type DB } from '../../db'
import {
  meetingType,
  availabilityRule,
  availabilitySchedule,
  availabilityInterval,
  dateOverride,
  eventMembership,
  booking,
} from '../../db/schema'
import { Errors } from '../../lib/errors'
import type { Tx } from '../../lib/audit'
import { computeSlots } from './slots.service'
import type { ScheduleWithIntervals, WeeklyInterval, DateOverrideItem, BookingBusy, EventTypeConfig } from './slots.service'

type MeetingTypeRow = typeof meetingType.$inferSelect
type Executor = DB | Tx

/**
 * Carga el schedule del host del meeting type desde DB y lo convierte
 * al formato que entiende el motor de slots (computeSlots).
 *
 * Prioridad:
 *  1. Si el meeting_type tiene availability_schedule_id → usa ese schedule.
 *  2. Si no tiene (legacy) → construye un ScheduleWithIntervals desde availability_rule del owner.
 *
 * @param mt Fila del meeting_type
 * @param ownerId ID del owner (hub_user.id)
 */
export async function loadHostSchedule(
  mt: typeof meetingType.$inferSelect,
  ownerId: string,
): Promise<ScheduleWithIntervals> {
  if (mt.availabilityScheduleId) {
    // Usar el schedule vinculado al meeting type
    const [schedule] = await db
      .select()
      .from(availabilitySchedule)
      .where(and(eq(availabilitySchedule.id, mt.availabilityScheduleId), eq(availabilitySchedule.portalId, mt.portalId)))
      .limit(1)

    if (!schedule) {
      // El schedule fue eliminado → fallback a reglas simples
      return loadLegacyRules(ownerId)
    }

    // Cargar los intervalos semanales del schedule
    const intervals = await db
      .select()
      .from(availabilityInterval)
      .where(eq(availabilityInterval.scheduleId, schedule.id))
      .orderBy(asc(availabilityInterval.dayOfWeek), asc(availabilityInterval.startTime))

    // Cargar los overrides de fecha del schedule
    const overrides = await db
      .select()
      .from(dateOverride)
      .where(eq(dateOverride.scheduleId, schedule.id))

    const weeklyIntervals: WeeklyInterval[] = intervals.map((i) => ({
      dayOfWeek: i.dayOfWeek,
      // Los campos time en Drizzle/PG llegan como string 'HH:MM:SS' → tomar solo 'HH:MM'
      startTime: (i.startTime as string).slice(0, 5),
      endTime: (i.endTime as string).slice(0, 5),
    }))

    const dateOverrides: DateOverrideItem[] = overrides.map((o) => ({
      // date llega como string 'YYYY-MM-DD' desde Drizzle (campo date de PG)
      date: o.date as string,
      intervals: (o.intervals as Array<{ from: string; to: string }>) ?? [],
    }))

    return {
      timeZone: schedule.timeZone,
      intervals: weeklyIntervals,
      dateOverrides,
    }
  }

  // Fallback: usar availability_rule simples del owner
  return loadLegacyRules(ownerId)
}

/**
 * Construye un ScheduleWithIntervals desde las reglas simples (availability_rule)
 * del owner. Se usa cuando el meeting_type no tiene schedule vinculado.
 */
async function loadLegacyRules(ownerId: string): Promise<ScheduleWithIntervals> {
  const rules = await db
    .select()
    .from(availabilityRule)
    .where(eq(availabilityRule.ownerId, ownerId))
    .orderBy(asc(availabilityRule.dayOfWeek), asc(availabilityRule.startTime))

  // TZ del owner: si tiene reglas, usar la del primero; si no, Buenos Aires (default del schema)
  const timeZone = rules[0]?.timeZone ?? 'America/Argentina/Buenos_Aires'

  const intervals: WeeklyInterval[] = rules.map((r) => ({
    dayOfWeek: r.dayOfWeek,
    startTime: (r.startTime as string).slice(0, 5),
    endTime: (r.endTime as string).slice(0, 5),
  }))

  return {
    timeZone,
    intervals,
    dateOverrides: [],
  }
}

/** Mapea una fila de meeting_type a la config que entiende el motor de slots. */
export function toEventTypeConfig(mt: MeetingTypeRow): EventTypeConfig {
  return {
    durationMin: mt.durationMin,
    startTimeIncrementMin: mt.startTimeIncrementMin,
    minBookingNoticeMin: mt.minBookingNoticeMin,
    bufferBeforeMin: mt.bufferBeforeMin,
    bufferAfterMin: mt.bufferAfterMin,
    bookingWindowType: mt.bookingWindowType as 'rolling' | 'range' | 'unlimited',
    bookingWindowDays: mt.bookingWindowDays,
    bookingWindowStart: mt.bookingWindowStart as string | null | undefined,
    bookingWindowEnd: mt.bookingWindowEnd as string | null | undefined,
    dailyLimit: mt.dailyLimit,
  }
}

/**
 * Carga los schedules de los hosts relevantes para un meeting type.
 * Para 'solo' es solo el owner; para 'group' es un schedule por host (se intersectan).
 * Devuelve también los hostIds para resolver los bookings que bloquean tiempo.
 */
export async function getSchedulesForMeetingType(
  mt: MeetingTypeRow,
  executor: Executor = db,
): Promise<{ schedules: ScheduleWithIntervals[]; hostIds: string[] }> {
  if (mt.kind === 'group') {
    const hostIds = await getGroupHostIds(mt.id, executor)
    if (hostIds.length === 0) return { schedules: [], hostIds: [] }
    const schedules = await Promise.all(hostIds.map((hostId) => loadHostSchedule(mt, hostId)))
    return { schedules, hostIds }
  }
  return { schedules: [await loadHostSchedule(mt, mt.ownerId)], hostIds: [mt.ownerId] }
}

export async function getGroupHostIds(meetingTypeId: string, executor: Executor = db): Promise<string[]> {
  const memberships = await executor
    .select({ hostId: eventMembership.hostId })
    .from(eventMembership)
    .where(eq(eventMembership.meetingTypeId, meetingTypeId))
  return memberships.map((m) => m.hostId)
}

/**
 * Carga los bookings confirmados que bloquean tiempo para los hosts dados, por
 * host y NO por meeting_type (un booking de otro meeting_type del mismo host
 * también bloquea). Un host está ocupado en los bookings que es OWNER y también
 * en los de event types grupales donde es co-host: el booking de un grupal
 * guarda solo el owner_id, así que sin la segunda rama el co-host figuraba libre.
 *
 * @param hostIds          Hosts cuyas reuniones confirmadas bloquean tiempo
 * @param excludeBookingId Booking a ignorar (p. ej. el original al reprogramar)
 * @param executor         `tx` cuando el chequeo corre bajo los locks de la reserva
 */
export async function getBusyBookings(
  hostIds: string[],
  excludeBookingId?: string,
  executor: Executor = db,
): Promise<BookingBusy[]> {
  if (hostIds.length === 0) return []
  const groupTypesOfHosts = executor
    .select({ id: eventMembership.meetingTypeId })
    .from(eventMembership)
    .innerJoin(meetingType, eq(meetingType.id, eventMembership.meetingTypeId))
    .where(and(inArray(eventMembership.hostId, hostIds), eq(meetingType.kind, 'group')))
  const rows = await executor
    .select({ id: booking.id, startsAt: booking.startsAt, endsAt: booking.endsAt, status: booking.status })
    .from(booking)
    .where(
      and(
        eq(booking.status, 'confirmed'),
        or(inArray(booking.ownerId, hostIds), inArray(booking.meetingTypeId, groupTypesOfHosts)),
      ),
    )
  return rows
    .filter((b) => b.id !== excludeBookingId)
    .map((b) => ({
      startsAt: new Date(b.startsAt).toISOString(),
      endsAt: new Date(b.endsAt).toISOString(),
      status: b.status,
    }))
}

/**
 * Revalida en el SERVER que `startsAtIso` es un slot disponible real del meeting type.
 * El server NUNCA confía en el datetime que manda el cliente: recomputa los slots con el
 * mismo motor puro (`computeSlots`) y exige que el horario pedido sea exactamente uno de
 * ellos. Esto cierra el hueco de reservar fuera de horario, en días bloqueados, en el
 * pasado o ignorando minNotice/ventana/buffers. El constraint EXCLUDE queda como red de
 * concurrencia, no como única defensa.
 *
 * @param mt               Meeting type ya validado (activo)
 * @param startsAtIso      Inicio del slot pedido (ISO UTC)
 * @param excludeBookingId Booking a ignorar al chequear ocupación (reschedule)
 */
export async function assertSlotAvailable(
  mt: MeetingTypeRow,
  startsAtIso: string,
  excludeBookingId?: string,
  executor: Executor = db,
): Promise<void> {
  const startsAt = new Date(startsAtIso)
  if (Number.isNaN(startsAt.getTime())) throw Errors.badRequest('Fecha de inicio inválida')

  const { schedules, hostIds } = await getSchedulesForMeetingType(mt, executor)
  if (schedules.length === 0) {
    throw Errors.badRequest('El horario seleccionado no está disponible')
  }

  const busy = await getBusyBookings(hostIds, excludeBookingId, executor)

  // Ventana de ±1 día UTC alrededor del slot para cubrir bordes de zona horaria
  // (un slot a las 14:00 UTC puede pertenecer a otra fecha en la TZ del host).
  const dayMs = 24 * 60 * 60 * 1000
  const fromDate = new Date(startsAt.getTime() - dayMs).toISOString().slice(0, 10)
  const toDate = new Date(startsAt.getTime() + dayMs).toISOString().slice(0, 10)

  const now = new Date()
  const slotsFor = (existingBookings: BookingBusy[]) =>
    computeSlots({
      eventType: toEventTypeConfig(mt),
      schedules,
      existingBookings,
      fromDate,
      toDate,
      inviteeTimezone: 'UTC',
      now,
    })

  // Comparación por timestamp (no por string) para ser robustos a diferencias de formato.
  const target = startsAt.getTime()
  const includesTarget = (slots: ReturnType<typeof computeSlots>) =>
    slots.some((s) => new Date(s.startUtc).getTime() === target)
  if (!includesTarget(slotsFor(busy))) {
    // Un slot válido del horario que solo falta por los bookings existentes es
    // el mismo caso que el 23P01: otra reserva lo tomó (409), no un pedido inválido.
    if (busy.length > 0 && includesTarget(slotsFor([]))) {
      throw Errors.conflict('El horario seleccionado ya fue reservado. Por favor elegí otro slot.')
    }
    throw Errors.badRequest('El horario seleccionado no está disponible')
  }
}

/**
 * Serializa las reservas que comparten algún host. El EXCLUDE booking_no_overlap
 * solo cubre owner_id; los co-hosts de un grupal quedaban protegidos únicamente
 * por el chequeo de disponibilidad (leer y después escribir), así que dos
 * reservas simultáneas de event types distintos con un co-host en común podían
 * pasar las dos. Con el lock por host, la segunda espera al commit de la primera
 * y su chequeo ya la ve. El orden fijo de adquisición evita deadlocks entre
 * reservas que comparten más de un host.
 */
export async function lockBookingHosts(tx: Tx, mt: MeetingTypeRow): Promise<void> {
  const groupHostIds = mt.kind === 'group' ? await getGroupHostIds(mt.id, tx) : []
  const hostIds = [...new Set([mt.ownerId, ...groupHostIds])].sort()
  for (const hostId of hostIds) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`booking-host:${hostId}`}))`)
  }
}
