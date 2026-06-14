import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm'
import { addMinutes } from 'date-fns'
import { format as formatTz, toZonedTime } from 'date-fns-tz'
import jwt from 'jsonwebtoken'
import { db } from '../../db'
import {
  meetingType,
  availabilityRule,
  availabilitySchedule,
  availabilityInterval,
  dateOverride,
  eventMembership,
  hubUser,
  booking,
} from '../../db/schema'
import { Errors, AppError } from '../../lib/errors'
import { env } from '../../config/env'
import { sendEmail } from '../../lib/mailer'
import { computeSlots, toInviteeDisplay } from './slots.service'
import type { ScheduleWithIntervals, WeeklyInterval, DateOverrideItem, BookingBusy, EventTypeConfig } from './slots.service'
import type {
  CreateMeetingTypeDTO,
  UpdateMeetingTypeDTO,
  CreateAvailabilityRuleDTO,
  CreateBookingDTO,
  CreateScheduleDTO,
  UpdateScheduleDTO,
  CreateIntervalDTO,
  ReplaceIntervalsDTO,
  DateOverrideInputDTO,
  CreateEventTypeV2DTO,
  UpdateEventTypeV2DTO,
} from './calendar.schema'
import { bookingConfirmInviteeHtml } from './emails/booking-confirm-invitee'
import { bookingCancelledHtml } from './emails/booking-cancelled'
import { bookingHostNotifyHtml } from './emails/booking-host-notify'

type MeetingTypeRow = typeof meetingType.$inferSelect
type AvailabilityRow = typeof availabilityRule.$inferSelect

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ── Tipos de reunión ───────────────────────────────────
export async function listMeetingTypes(portalId: string): Promise<MeetingTypeRow[]> {
  return db.select().from(meetingType).where(eq(meetingType.portalId, portalId)).orderBy(asc(meetingType.name))
}

export async function createMeetingType(portalId: string, ownerId: string, input: CreateMeetingTypeDTO): Promise<MeetingTypeRow> {
  const [row] = await db
    .insert(meetingType)
    .values({
      portalId,
      ownerId,
      slug: input.slug ? slugify(input.slug) : slugify(input.name),
      name: input.name,
      durationMin: input.durationMin,
      bufferMin: input.bufferMin ?? 10,
      location: input.location,
      description: input.description,
      isActive: input.isActive ?? true,
    })
    .returning()
  if (!row) throw Errors.internal('No se pudo crear el tipo de reunión')
  return row
}

export async function updateMeetingType(portalId: string, id: string, input: UpdateMeetingTypeDTO): Promise<MeetingTypeRow> {
  const [existing] = await db
    .select()
    .from(meetingType)
    .where(and(eq(meetingType.portalId, portalId), eq(meetingType.id, id)))
    .limit(1)
  if (!existing) throw Errors.notFound('Tipo de reunión no encontrado')
  const [row] = await db
    .update(meetingType)
    .set({ ...input, slug: input.slug ? slugify(input.slug) : undefined })
    .where(eq(meetingType.id, id))
    .returning()
  return row!
}

export async function deleteMeetingType(portalId: string, id: string): Promise<void> {
  const res = await db
    .delete(meetingType)
    .where(and(eq(meetingType.portalId, portalId), eq(meetingType.id, id)))
    .returning({ id: meetingType.id })
  if (res.length === 0) throw Errors.notFound('Tipo de reunión no encontrado')
}

// ── Disponibilidad (por usuario) ───────────────────────
export async function listAvailabilityRules(ownerId: string): Promise<AvailabilityRow[]> {
  return db
    .select()
    .from(availabilityRule)
    .where(eq(availabilityRule.ownerId, ownerId))
    .orderBy(asc(availabilityRule.dayOfWeek), asc(availabilityRule.startTime))
}

export async function createAvailabilityRule(ownerId: string, input: CreateAvailabilityRuleDTO): Promise<AvailabilityRow> {
  if (input.endTime <= input.startTime) throw Errors.badRequest('La hora de fin debe ser posterior a la de inicio')
  const [row] = await db
    .insert(availabilityRule)
    .values({
      ownerId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      timeZone: input.timeZone ?? 'America/Bogota',
    })
    .returning()
  if (!row) throw Errors.internal('No se pudo crear la regla')
  return row
}

export async function deleteAvailabilityRule(ownerId: string, id: string): Promise<void> {
  const res = await db
    .delete(availabilityRule)
    .where(and(eq(availabilityRule.ownerId, ownerId), eq(availabilityRule.id, id)))
    .returning({ id: availabilityRule.id })
  if (res.length === 0) throw Errors.notFound('Regla no encontrada')
}

// ── Funciones públicas (sin autenticación hub_user) ───────────────────────────

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
async function loadHostSchedule(
  mt: typeof meetingType.$inferSelect,
  ownerId: string,
): Promise<ScheduleWithIntervals> {
  if (mt.availabilityScheduleId) {
    // Usar el schedule vinculado al meeting type
    const [schedule] = await db
      .select()
      .from(availabilitySchedule)
      .where(eq(availabilitySchedule.id, mt.availabilityScheduleId))
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

/**
 * Genera un JWT firmado para cancelar o reprogramar un booking.
 *
 * Diseño de seguridad:
 *  - El campo `type` discrimina el uso: un token de reschedule NO sirve para cancelar.
 *  - TTL = tiempo hasta el inicio de la reunión (el token expira cuando la reunión comienza).
 *  - Se usa ACCESS_TOKEN_SECRET para no requerir un secreto adicional en dev/staging.
 *  - El token se almacena en la DB (cancelToken / rescheduleToken) para permitir revocación.
 *
 * @param bookingId ID del booking
 * @param type      Discriminador de uso
 * @param startsAt  Inicio de la reunión (determina el TTL del token)
 */
function signBookingToken(
  bookingId: string,
  type: 'booking-cancel' | 'booking-reschedule',
  startsAt: Date,
): string {
  const nowSec = Math.floor(Date.now() / 1000)
  const expSec = Math.floor(startsAt.getTime() / 1000)
  // El token no puede expirar "en el pasado" al generarse; garantizar mínimo 60 s de vida.
  const exp = Math.max(expSec, nowSec + 60)

  return jwt.sign(
    { sub: bookingId, type },
    env.ACCESS_TOKEN_SECRET,
    { expiresIn: exp - nowSec } as jwt.SignOptions,
  )
}

/**
 * Verifica y decodifica un token de booking (cancel o reschedule).
 * Lanza UNAUTHORIZED si el token es inválido, expirado o del tipo incorrecto.
 *
 * @param token Token JWT
 * @param expectedType Tipo esperado para evitar reutilización cruzada
 */
function verifyBookingToken(
  token: string,
  expectedType: 'booking-cancel' | 'booking-reschedule',
): { sub: string; type: string } {
  try {
    const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET) as { sub: string; type: string }
    if (decoded.type !== expectedType) {
      throw Errors.unauthorized('Tipo de token inválido para esta operación')
    }
    return decoded
  } catch (err) {
    if (err instanceof AppError) throw err
    throw Errors.unauthorized('Token inválido o expirado')
  }
}

/**
 * Devuelve la metadata pública de un event type (meeting_type) activo.
 *
 * Los event types con secret=true responden igualmente — el invitado llega
 * por URL directa, no por listado público. Si el event type no existe o está
 * inactivo → 404.
 *
 * @param portalId  ID del portal que contiene el event type
 * @param eventSlug Slug del event type
 */
export async function getPublicEventType(portalId: string, eventSlug: string) {
  const [mt] = await db
    .select()
    .from(meetingType)
    .where(
      and(
        eq(meetingType.portalId, portalId),
        eq(meetingType.slug, eventSlug),
        eq(meetingType.isActive, true),
      ),
    )
    .limit(1)

  if (!mt) throw Errors.notFound('Tipo de reunión no encontrado o inactivo')

  // Devolver solo los campos públicos necesarios para renderizar la página de booking.
  // No se expone ownerId ni availability_schedule_id (datos internos del portal).
  return {
    id: mt.id,
    slug: mt.slug,
    name: mt.name,
    description: mt.description,
    durationMin: mt.durationMin,
    locations: mt.locations,
    customQuestions: mt.customQuestions,
    color: mt.color,
    kind: mt.kind,
    maxInvitees: mt.maxInvitees,
  }
}

/** Mapea una fila de meeting_type a la config que entiende el motor de slots. */
function toEventTypeConfig(mt: MeetingTypeRow): EventTypeConfig {
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
async function getSchedulesForMeetingType(
  mt: MeetingTypeRow,
): Promise<{ schedules: ScheduleWithIntervals[]; hostIds: string[] }> {
  if (mt.kind === 'group') {
    const memberships = await db
      .select({ hostId: eventMembership.hostId })
      .from(eventMembership)
      .where(eq(eventMembership.meetingTypeId, mt.id))
    const hostIds = memberships.map((m) => m.hostId)
    if (hostIds.length === 0) return { schedules: [], hostIds: [] }
    const schedules = await Promise.all(hostIds.map((hostId) => loadHostSchedule(mt, hostId)))
    return { schedules, hostIds }
  }
  return { schedules: [await loadHostSchedule(mt, mt.ownerId)], hostIds: [mt.ownerId] }
}

/**
 * Carga los bookings confirmados que bloquean tiempo para los hosts dados.
 * IMPORTANTE: el anti-overlap es por OWNER (constraint EXCLUDE en owner_id), por eso se
 * filtra por `booking.ownerId IN hostIds` y NO por meeting_type — así los slots mostrados
 * coinciden con la realidad (un booking de otro meeting_type del mismo host también bloquea).
 *
 * @param hostIds          Owners cuyas reuniones confirmadas bloquean tiempo
 * @param excludeBookingId Booking a ignorar (p. ej. el original al reprogramar)
 */
async function getBusyBookings(hostIds: string[], excludeBookingId?: string): Promise<BookingBusy[]> {
  if (hostIds.length === 0) return []
  const rows = await db
    .select({ id: booking.id, startsAt: booking.startsAt, endsAt: booking.endsAt, status: booking.status })
    .from(booking)
    .where(and(inArray(booking.ownerId, hostIds), eq(booking.status, 'confirmed')))
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
async function assertSlotAvailable(
  mt: MeetingTypeRow,
  startsAtIso: string,
  excludeBookingId?: string,
): Promise<void> {
  const startsAt = new Date(startsAtIso)
  if (Number.isNaN(startsAt.getTime())) throw Errors.badRequest('Fecha de inicio inválida')

  const { schedules, hostIds } = await getSchedulesForMeetingType(mt)
  if (schedules.length === 0) {
    throw Errors.badRequest('El horario seleccionado no está disponible')
  }

  const busy = await getBusyBookings(hostIds, excludeBookingId)

  // Ventana de ±1 día UTC alrededor del slot para cubrir bordes de zona horaria
  // (un slot a las 14:00 UTC puede pertenecer a otra fecha en la TZ del host).
  const dayMs = 24 * 60 * 60 * 1000
  const fromDate = new Date(startsAt.getTime() - dayMs).toISOString().slice(0, 10)
  const toDate = new Date(startsAt.getTime() + dayMs).toISOString().slice(0, 10)

  const slots = computeSlots({
    eventType: toEventTypeConfig(mt),
    schedules,
    existingBookings: busy,
    fromDate,
    toDate,
    inviteeTimezone: 'UTC',
    now: new Date(),
  })

  // Comparación por timestamp (no por string) para ser robustos a diferencias de formato.
  const target = startsAt.getTime()
  const available = slots.some((s) => new Date(s.startUtc).getTime() === target)
  if (!available) {
    throw Errors.badRequest('El horario seleccionado no está disponible')
  }
}

/**
 * Calcula y devuelve los slots disponibles para un event type en un rango de fechas.
 *
 * Flujo:
 *  1. Carga el meeting_type y valida que está activo.
 *  2. Carga el schedule de disponibilidad del owner (o de los hosts si es grupal).
 *  3. Carga los bookings confirmados actuales para excluirlos como ocupados.
 *  4. Delega el cálculo al motor puro `computeSlots` (sin efectos secundarios).
 *
 * @param portalId   ID del portal
 * @param eventSlug  Slug del event type
 * @param from       Fecha de inicio 'YYYY-MM-DD'
 * @param to         Fecha de fin 'YYYY-MM-DD'
 * @param tz         Zona horaria IANA del invitado (para display)
 */
export async function getPublicSlots(
  portalId: string,
  eventSlug: string,
  from: string,
  to: string,
  tz: string,
) {
  // Verificar que el event type existe y está activo
  const [mt] = await db
    .select()
    .from(meetingType)
    .where(
      and(
        eq(meetingType.portalId, portalId),
        eq(meetingType.slug, eventSlug),
        eq(meetingType.isActive, true),
      ),
    )
    .limit(1)

  if (!mt) throw Errors.notFound('Tipo de reunión no encontrado o inactivo')

  // Cargar schedules de todos los hosts relevantes (solo u group)
  const { schedules, hostIds } = await getSchedulesForMeetingType(mt)
  if (schedules.length === 0) {
    // Sin hosts/schedule configurado → sin slots disponibles
    return []
  }

  // Bookings confirmados que bloquean tiempo: por OWNER (no por meeting_type), para que
  // los slots mostrados coincidan con lo que el constraint EXCLUDE (por owner_id) permite.
  const existingBookings = await getBusyBookings(hostIds)

  // Delegar el cálculo al motor puro de slots
  const slots = computeSlots({
    eventType: toEventTypeConfig(mt),
    schedules,
    existingBookings,
    fromDate: from,
    toDate: to,
    inviteeTimezone: tz,
    now: new Date(),
  })

  // Enriquecer cada slot con el display en la TZ del invitado
  return slots.map((s) => ({
    startUtc: s.startUtc,
    endUtc: s.endUtc,
    startLocal: toInviteeDisplay(s.startUtc, tz, 'yyyy-MM-dd HH:mm'),
  }))
}

/**
 * Crea un booking confirmado para el slot pedido.
 *
 * Flujo:
 *  1. Validar que el meeting_type existe y está activo.
 *  2. Calcular endsAt = startsAt + durationMin.
 *  3. INSERT en transacción → el constraint EXCLUDE booking_no_overlap de PG
 *     captura double-booking concurrente → error código 23P01 → HTTP 409.
 *  4. Generar cancelToken y rescheduleToken (JWT firmados).
 *  5. Actualizar el booking con los tokens.
 *  6. Enviar emails de confirmación al invitado y al host (best-effort).
 *
 * El error 23P01 (exclusion_violation) se captura explícitamente para devolver
 * 409 con mensaje claro en lugar de un 500 genérico.
 *
 * @param portalId   ID del portal
 * @param eventSlug  Slug del event type
 * @param input      Datos del invitado y el slot elegido
 * @param baseUrl    Raíz del frontend (para construir las URLs de cancel/reschedule)
 */
export async function createPublicBooking(
  portalId: string,
  eventSlug: string,
  input: CreateBookingDTO,
  baseUrl: string,
) {
  // Verificar que el event type existe y está activo
  const [mt] = await db
    .select()
    .from(meetingType)
    .where(
      and(
        eq(meetingType.portalId, portalId),
        eq(meetingType.slug, eventSlug),
        eq(meetingType.isActive, true),
      ),
    )
    .limit(1)

  if (!mt) throw Errors.notFound('Tipo de reunión no encontrado o inactivo')

  // Revalidar el slot en el SERVER antes de insertar — nunca confiar en el datetime del
  // cliente. Cierra el hueco de reservar fuera de horario, en días bloqueados, en el pasado
  // o ignorando minNotice/ventana/buffers. El EXCLUDE sigue siendo la red de concurrencia.
  await assertSlotAvailable(mt, input.startsAt)

  const startsAt = new Date(input.startsAt)
  const endsAt = addMinutes(startsAt, mt.durationMin)

  // Obtener el email del owner para el email de notificación al host
  const [owner] = await db
    .select({ email: hubUser.email, firstName: hubUser.firstName, lastName: hubUser.lastName })
    .from(hubUser)
    .where(eq(hubUser.id, mt.ownerId))
    .limit(1)

  // INSERT dentro de transacción para que el constraint EXCLUDE actúe de forma atómica
  let newBooking: typeof booking.$inferSelect
  try {
    newBooking = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(booking)
        .values({
          meetingTypeId: mt.id,
          ownerId: mt.ownerId,
          guestName: input.guestName,
          guestEmail: input.guestEmail,
          startsAt,
          endsAt,
          status: 'confirmed',
          inviteeTimeZone: input.inviteeTimeZone,
          questionAnswers: input.questionAnswers ?? {},
          guestEmails: input.guestEmails ?? [],
          notes: input.notes ?? null,
        })
        .returning()

      if (!row) throw Errors.internal('No se pudo crear el booking')
      return row
    })
  } catch (err) {
    // Error 23P01 = exclusion_violation (constraint EXCLUDE USING gist)
    // Se produce cuando otro booking confirmado ya ocupa ese slot.
    const pgErr = err as { code?: string }
    if (pgErr.code === '23P01') {
      throw Errors.conflict('El horario seleccionado ya fue reservado. Por favor elegí otro slot.')
    }
    throw err
  }

  // Generar los tokens JWT para autoservicio (cancel / reschedule)
  const cancelToken = signBookingToken(newBooking.id, 'booking-cancel', startsAt)
  const rescheduleToken = signBookingToken(newBooking.id, 'booking-reschedule', startsAt)

  // Persistir los tokens en el booking (UPDATE fuera de la transacción — no requiere atomicidad)
  const [updated] = await db
    .update(booking)
    .set({ cancelToken, rescheduleToken })
    .where(eq(booking.id, newBooking.id))
    .returning()

  const finalBooking = updated ?? newBooking

  // Construir URLs de autoservicio para el invitado
  const cancelUrl = `${baseUrl}/book/cancel?token=${cancelToken}`
  const rescheduleUrl = `${baseUrl}/book/reschedule?token=${rescheduleToken}`

  // Formatear la hora en la TZ del invitado para el email
  const startLocal = toInviteeDisplay(startsAt.toISOString(), input.inviteeTimeZone, 'yyyy-MM-dd HH:mm')
  // Primera ubicación configurada en el meeting type (si existe)
  const location = Array.isArray(mt.locations) && mt.locations.length > 0
    ? (mt.locations[0] as { link?: string; address?: string })?.link
      ?? (mt.locations[0] as { link?: string; address?: string })?.address
      ?? null
    : null

  // Envío de emails — best-effort: si falla no rompe el booking
  try {
    await sendEmail({
      to: input.guestEmail,
      subject: `Confirmación: ${mt.name}`,
      html: bookingConfirmInviteeHtml({
        guestName: input.guestName,
        eventName: mt.name,
        startLocal: `${startLocal} (${input.inviteeTimeZone})`,
        durationMin: mt.durationMin,
        location,
        cancelUrl,
        rescheduleUrl,
      }),
    })
  } catch (emailErr) {
    console.error('[calendar.service] Error al enviar email de confirmación al invitado', emailErr)
  }

  // Notificar al host si tiene email
  if (owner?.email) {
    try {
      // Mostrar la hora al host en la TZ del schedule del owner
      const ownerSchedule = await loadHostSchedule(mt, mt.ownerId)
      const startLocalHost = formatTz(
        toZonedTime(startsAt, ownerSchedule.timeZone),
        'yyyy-MM-dd HH:mm',
        { timeZone: ownerSchedule.timeZone },
      )

      await sendEmail({
        to: owner.email,
        subject: `Nueva reunión: ${mt.name} con ${input.guestName}`,
        html: bookingHostNotifyHtml({
          hostEmail: owner.email,
          hostName: owner.firstName,
          guestName: input.guestName,
          guestEmail: input.guestEmail,
          eventName: mt.name,
          startLocalHost: `${startLocalHost} (${ownerSchedule.timeZone})`,
          durationMin: mt.durationMin,
          location,
          notes: input.notes ?? null,
        }),
      })
    } catch (emailErr) {
      console.error('[calendar.service] Error al enviar email de notificación al host', emailErr)
    }
  }

  return {
    booking: finalBooking,
    cancelUrl,
    rescheduleUrl,
  }
}

/**
 * Cancela un booking usando el token firmado de cancelación.
 *
 * Flujo:
 *  1. Verificar JWT (tipo 'booking-cancel', no expirado).
 *  2. Buscar el booking en DB — el token debe coincidir (revocación).
 *  3. Verificar estado actual (no ya cancelado).
 *  4. UPDATE: status='cancelled', cancelledAt=now(), limpiar cancelToken.
 *  5. Enviar email de cancelación al invitado (best-effort).
 *
 * Al pasar a 'cancelled' el constraint EXCLUDE deja de contar ese booking,
 * liberando el slot automáticamente para nuevas reservas.
 *
 * @param token JWT de tipo 'booking-cancel'
 */
export async function cancelPublicBooking(token: string) {
  // Verificar el token (lanza UNAUTHORIZED si es inválido o expirado)
  const decoded = verifyBookingToken(token, 'booking-cancel')

  // Buscar el booking por ID y verificar que el token almacenado coincide (revocación)
  const [existing] = await db
    .select()
    .from(booking)
    .where(eq(booking.id, decoded.sub))
    .limit(1)

  if (!existing) throw Errors.notFound('Booking no encontrado')

  // Si el token almacenado no coincide, ya fue revocado (usado o cancelado antes)
  if (existing.cancelToken !== token) {
    throw Errors.unauthorized('Token de cancelación ya revocado o inválido')
  }

  if (existing.status === 'cancelled') {
    throw Errors.conflict('El booking ya está cancelado')
  }

  // Cancelar el booking y revocar el token
  const [cancelled] = await db
    .update(booking)
    .set({
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelToken: null, // Revocar para que no pueda usarse dos veces
    })
    .where(eq(booking.id, existing.id))
    .returning()

  // Obtener el nombre del meeting type para el email
  const [mt] = await db
    .select({ name: meetingType.name })
    .from(meetingType)
    .where(eq(meetingType.id, existing.meetingTypeId))
    .limit(1)

  // Email de cancelación al invitado — best-effort
  try {
    const startLocal = toInviteeDisplay(
      new Date(existing.startsAt).toISOString(),
      existing.inviteeTimeZone,
      'yyyy-MM-dd HH:mm',
    )
    await sendEmail({
      to: existing.guestEmail,
      subject: `Reunión cancelada: ${mt?.name ?? 'Reunión'}`,
      html: bookingCancelledHtml({
        guestName: existing.guestName,
        eventName: mt?.name ?? 'Reunión',
        startLocal: `${startLocal} (${existing.inviteeTimeZone})`,
      }),
    })
  } catch (emailErr) {
    console.error('[calendar.service] Error al enviar email de cancelación', emailErr)
  }

  return { booking: cancelled ?? existing }
}

/**
 * Reprograma un booking usando el token firmado de reschedule.
 *
 * Flujo:
 *  1. Verificar JWT (tipo 'booking-reschedule', no expirado).
 *  2. Buscar el booking original en DB — token debe coincidir.
 *  3. Buscar el meeting_type y calcular el endsAt del nuevo slot.
 *  4. En transacción:
 *     a. Marcar el booking original como 'cancelled' (libera el slot).
 *     b. INSERT del nuevo booking con status='confirmed' y rescheduledFromId=original.id.
 *  5. El constraint EXCLUDE captura double-booking → 409.
 *  6. Generar nuevos tokens para el booking nuevo.
 *  7. Enviar email de confirmación con las nuevas URLs.
 *
 * @param token          JWT de tipo 'booking-reschedule'
 * @param rescheduleData Nuevo slot y TZ opcional del invitado
 * @param baseUrl        Raíz del frontend para las URLs de autoservicio
 */
export async function reschedulePublicBooking(
  token: string,
  rescheduleData: { newStartsAt: string; inviteeTimeZone?: string },
  baseUrl: string,
) {
  // Verificar el token (lanza UNAUTHORIZED si es inválido o expirado)
  const decoded = verifyBookingToken(token, 'booking-reschedule')

  // Buscar el booking original
  const [original] = await db
    .select()
    .from(booking)
    .where(eq(booking.id, decoded.sub))
    .limit(1)

  if (!original) throw Errors.notFound('Booking no encontrado')

  if (original.rescheduleToken !== token) {
    throw Errors.unauthorized('Token de reprogramación ya revocado o inválido')
  }

  if (original.status === 'cancelled') {
    throw Errors.badRequest('No se puede reprogramar un booking cancelado')
  }

  // Cargar el meeting type para calcular endsAt y obtener metadata
  const [mt] = await db
    .select()
    .from(meetingType)
    .where(eq(meetingType.id, original.meetingTypeId))
    .limit(1)

  if (!mt) throw Errors.notFound('Tipo de reunión no encontrado')

  // Revalidar el nuevo slot en el server (igual que en la reserva). Se ignora el booking
  // original al chequear ocupación: se va a cancelar en la misma transacción, así que no
  // debe bloquearse a sí mismo si el nuevo horario solapa con el viejo.
  await assertSlotAvailable(mt, rescheduleData.newStartsAt, original.id)

  const newStartsAt = new Date(rescheduleData.newStartsAt)
  const newEndsAt = addMinutes(newStartsAt, mt.durationMin)
  // Mantener la TZ original si no se proporciona una nueva
  const inviteeTimeZone = rescheduleData.inviteeTimeZone ?? original.inviteeTimeZone

  let newBooking: typeof booking.$inferSelect
  try {
    newBooking = await db.transaction(async (tx) => {
      // Cancelar el booking original dentro de la transacción para atomicidad
      await tx
        .update(booking)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelToken: null,
          rescheduleToken: null, // Revocar ambos tokens del original
        })
        .where(eq(booking.id, original.id))

      // Crear el nuevo booking reprogramado
      const [row] = await tx
        .insert(booking)
        .values({
          meetingTypeId: original.meetingTypeId,
          ownerId: original.ownerId,
          contactId: original.contactId,
          dealId: original.dealId,
          guestName: original.guestName,
          guestEmail: original.guestEmail,
          startsAt: newStartsAt,
          endsAt: newEndsAt,
          status: 'confirmed',
          inviteeTimeZone,
          questionAnswers: original.questionAnswers as Record<string, string>,
          guestEmails: original.guestEmails as string[],
          notes: original.notes,
          rescheduledFromId: original.id,
        })
        .returning()

      if (!row) throw Errors.internal('No se pudo crear el booking reprogramado')
      return row
    })
  } catch (err) {
    // Error 23P01 = exclusion_violation → el nuevo slot ya fue tomado por concurrencia
    const pgErr = err as { code?: string }
    if (pgErr.code === '23P01') {
      throw Errors.conflict('El nuevo horario ya fue reservado. Por favor elegí otro slot.')
    }
    throw err
  }

  // Generar nuevos tokens para el booking reprogramado
  const cancelToken = signBookingToken(newBooking.id, 'booking-cancel', newStartsAt)
  const rescheduleToken = signBookingToken(newBooking.id, 'booking-reschedule', newStartsAt)

  const [updated] = await db
    .update(booking)
    .set({ cancelToken, rescheduleToken })
    .where(eq(booking.id, newBooking.id))
    .returning()

  const finalBooking = updated ?? newBooking

  // Construir URLs de autoservicio para el nuevo booking
  const cancelUrl = `${baseUrl}/book/cancel?token=${cancelToken}`
  const rescheduleUrl = `${baseUrl}/book/reschedule?token=${rescheduleToken}`

  // Formatear la hora en la TZ del invitado para el email
  const startLocal = toInviteeDisplay(newStartsAt.toISOString(), inviteeTimeZone, 'yyyy-MM-dd HH:mm')
  const location = Array.isArray(mt.locations) && mt.locations.length > 0
    ? (mt.locations[0] as { link?: string; address?: string })?.link
      ?? (mt.locations[0] as { link?: string; address?: string })?.address
      ?? null
    : null

  // Email de confirmación con las nuevas URLs — best-effort
  try {
    await sendEmail({
      to: original.guestEmail,
      subject: `Reunión reprogramada: ${mt.name}`,
      html: bookingConfirmInviteeHtml({
        guestName: original.guestName,
        eventName: mt.name,
        startLocal: `${startLocal} (${inviteeTimeZone})`,
        durationMin: mt.durationMin,
        location,
        cancelUrl,
        rescheduleUrl,
      }),
    })
  } catch (emailErr) {
    console.error('[calendar.service] Error al enviar email de reprogramación', emailErr)
  }

  return {
    booking: finalBooking,
    cancelUrl,
    rescheduleUrl,
  }
}

// ── Admin V2: Availability Schedules ───────────────────────────────────────────

/**
 * Lista todos los schedules de disponibilidad de un portal con sus intervalos y overrides.
 * El frontend espera objetos AvailabilitySchedule con arrays embebidos.
 */
export async function listSchedules(portalId: string) {
  // Obtener todos los schedules del portal
  const schedules = await db
    .select()
    .from(availabilitySchedule)
    .where(eq(availabilitySchedule.portalId, portalId))
    .orderBy(asc(availabilitySchedule.name))

  if (schedules.length === 0) return []

  const scheduleIds = schedules.map((s) => s.id)

  // Cargar intervalos y overrides de todos los schedules en 2 queries (no N+1)
  const [intervals, overrides] = await Promise.all([
    db
      .select()
      .from(availabilityInterval)
      .where(inArray(availabilityInterval.scheduleId, scheduleIds))
      .orderBy(asc(availabilityInterval.dayOfWeek), asc(availabilityInterval.startTime)),
    db
      .select()
      .from(dateOverride)
      .where(inArray(dateOverride.scheduleId, scheduleIds)),
  ])

  // Agrupar por scheduleId
  return schedules.map((s) => ({
    ...s,
    intervals: intervals.filter((i) => i.scheduleId === s.id),
    dateOverrides: overrides.filter((o) => o.scheduleId === s.id),
  }))
}

/**
 * Obtiene un schedule específico del portal con sus intervalos y overrides.
 * Lanza 404 si no existe o no pertenece al portal.
 */
export async function getSchedule(portalId: string, scheduleId: string) {
  const [schedule] = await db
    .select()
    .from(availabilitySchedule)
    .where(and(eq(availabilitySchedule.id, scheduleId), eq(availabilitySchedule.portalId, portalId)))
    .limit(1)

  if (!schedule) throw Errors.notFound('Schedule no encontrado')

  const [intervals, overrides] = await Promise.all([
    db
      .select()
      .from(availabilityInterval)
      .where(eq(availabilityInterval.scheduleId, scheduleId))
      .orderBy(asc(availabilityInterval.dayOfWeek), asc(availabilityInterval.startTime)),
    db
      .select()
      .from(dateOverride)
      .where(eq(dateOverride.scheduleId, scheduleId)),
  ])

  return { ...schedule, intervals, dateOverrides: overrides }
}

/**
 * Crea un nuevo schedule de disponibilidad.
 * Si es el primero del owner, o si isDefault=true, lo marca como default
 * y desactiva el default anterior (en transacción).
 */
export async function createSchedule(portalId: string, ownerId: string, input: CreateScheduleDTO) {
  return db.transaction(async (tx) => {
    // Verificar si ya existe algún schedule del owner
    const existing = await tx
      .select({ id: availabilitySchedule.id })
      .from(availabilitySchedule)
      .where(
        and(eq(availabilitySchedule.portalId, portalId), eq(availabilitySchedule.ownerId, ownerId)),
      )

    // Es default si se pide explícitamente, o si no hay ningún schedule del owner todavía
    const makeDefault = input.isDefault === true || existing.length === 0

    if (makeDefault && existing.length > 0) {
      // Desactivar el default anterior del owner
      await tx
        .update(availabilitySchedule)
        .set({ isDefault: false })
        .where(
          and(
            eq(availabilitySchedule.portalId, portalId),
            eq(availabilitySchedule.ownerId, ownerId),
          ),
        )
    }

    const [row] = await tx
      .insert(availabilitySchedule)
      .values({ portalId, ownerId, name: input.name, timeZone: input.timeZone, isDefault: makeDefault })
      .returning()

    if (!row) throw Errors.internal('No se pudo crear el schedule')
    return { ...row, intervals: [], dateOverrides: [] }
  })
}

/**
 * Actualiza nombre, timezone o isDefault de un schedule.
 * Si isDefault=true, desactiva el default anterior del owner en transacción.
 * Verifica que el schedule pertenece al portal antes de modificar.
 */
export async function updateSchedule(portalId: string, scheduleId: string, input: UpdateScheduleDTO) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(availabilitySchedule)
      .where(and(eq(availabilitySchedule.id, scheduleId), eq(availabilitySchedule.portalId, portalId)))
      .limit(1)

    if (!existing) throw Errors.notFound('Schedule no encontrado')

    // Si se está marcando como default, desactivar el anterior del mismo owner
    if (input.isDefault === true && !existing.isDefault) {
      await tx
        .update(availabilitySchedule)
        .set({ isDefault: false })
        .where(
          and(
            eq(availabilitySchedule.portalId, portalId),
            eq(availabilitySchedule.ownerId, existing.ownerId),
          ),
        )
    }

    const updateData: Partial<typeof availabilitySchedule.$inferInsert> = {}
    if (input.name !== undefined) updateData.name = input.name
    if (input.timeZone !== undefined) updateData.timeZone = input.timeZone
    if (input.isDefault !== undefined) updateData.isDefault = input.isDefault

    const [updated] = await tx
      .update(availabilitySchedule)
      .set(updateData)
      .where(eq(availabilitySchedule.id, scheduleId))
      .returning()

    if (!updated) throw Errors.internal('No se pudo actualizar el schedule')

    // Devolver con arrays embebidos
    const [intervals, overrides] = await Promise.all([
      tx
        .select()
        .from(availabilityInterval)
        .where(eq(availabilityInterval.scheduleId, scheduleId))
        .orderBy(asc(availabilityInterval.dayOfWeek), asc(availabilityInterval.startTime)),
      tx.select().from(dateOverride).where(eq(dateOverride.scheduleId, scheduleId)),
    ])

    return { ...updated, intervals, dateOverrides: overrides }
  })
}

/**
 * Elimina un schedule del portal.
 * Los intervalos y overrides se eliminan por CASCADE (onDelete: 'cascade' en el schema).
 */
export async function deleteSchedule(portalId: string, scheduleId: string): Promise<void> {
  const res = await db
    .delete(availabilitySchedule)
    .where(and(eq(availabilitySchedule.id, scheduleId), eq(availabilitySchedule.portalId, portalId)))
    .returning({ id: availabilitySchedule.id })

  if (res.length === 0) throw Errors.notFound('Schedule no encontrado')
}

/**
 * Verifica que un schedule pertenece al portal.
 * Util helper interno para validar permisos antes de tocar hijos del schedule.
 */
async function assertScheduleOwnership(portalId: string, scheduleId: string): Promise<void> {
  const [s] = await db
    .select({ id: availabilitySchedule.id })
    .from(availabilitySchedule)
    .where(and(eq(availabilitySchedule.id, scheduleId), eq(availabilitySchedule.portalId, portalId)))
    .limit(1)

  if (!s) throw Errors.notFound('Schedule no encontrado')
}

/**
 * Agrega un intervalo semanal a un schedule.
 * Valida que endTime > startTime y que el schedule pertenece al portal.
 */
export async function addScheduleInterval(
  portalId: string,
  scheduleId: string,
  input: CreateIntervalDTO,
) {
  // Verificar que el schedule pertenece al portal
  await assertScheduleOwnership(portalId, scheduleId)

  // Validar que endTime > startTime (la DB también lo enforce vía CHECK)
  if (input.endTime <= input.startTime) {
    throw Errors.badRequest('La hora de fin debe ser posterior a la de inicio')
  }

  const [row] = await db
    .insert(availabilityInterval)
    .values({
      scheduleId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
    })
    .returning()

  if (!row) throw Errors.internal('No se pudo agregar el intervalo')
  return row
}

/**
 * Reemplaza ATÓMICAMENTE todos los intervalos de un schedule.
 * En una sola transacción: borra todos los existentes e inserta los nuevos.
 * Útil para el guardado masivo del editor de horario semanal.
 */
export async function replaceScheduleIntervals(
  portalId: string,
  scheduleId: string,
  input: ReplaceIntervalsDTO,
) {
  await assertScheduleOwnership(portalId, scheduleId)

  // Validar cada intervalo antes de tocar la DB
  for (const interval of input.intervals) {
    if (interval.endTime <= interval.startTime) {
      throw Errors.badRequest(
        `Intervalo del día ${interval.dayOfWeek}: la hora de fin debe ser posterior a la de inicio`,
      )
    }
  }

  return db.transaction(async (tx) => {
    // Borrar todos los intervalos existentes del schedule
    await tx
      .delete(availabilityInterval)
      .where(eq(availabilityInterval.scheduleId, scheduleId))

    if (input.intervals.length === 0) return []

    // Insertar los nuevos intervalos
    const rows = await tx
      .insert(availabilityInterval)
      .values(
        input.intervals.map((i) => ({
          scheduleId,
          dayOfWeek: i.dayOfWeek,
          startTime: i.startTime,
          endTime: i.endTime,
        })),
      )
      .returning()

    return rows
  })
}

/**
 * Elimina un intervalo individual de un schedule.
 * Verifica que el schedule pertenece al portal y que el intervalo existe.
 */
export async function deleteScheduleInterval(
  portalId: string,
  scheduleId: string,
  intervalId: string,
): Promise<void> {
  await assertScheduleOwnership(portalId, scheduleId)

  const res = await db
    .delete(availabilityInterval)
    .where(
      and(eq(availabilityInterval.id, intervalId), eq(availabilityInterval.scheduleId, scheduleId)),
    )
    .returning({ id: availabilityInterval.id })

  if (res.length === 0) throw Errors.notFound('Intervalo no encontrado')
}

/**
 * Upsert de un date override para una fecha específica de un schedule.
 * intervals=[] significa que el día está bloqueado.
 * La constraint unique(scheduleId, date) garantiza que solo existe uno por fecha.
 */
export async function upsertDateOverride(
  portalId: string,
  scheduleId: string,
  input: DateOverrideInputDTO,
) {
  await assertScheduleOwnership(portalId, scheduleId)

  // Buscar si ya existe un override para esa fecha en el schedule
  const [existing] = await db
    .select()
    .from(dateOverride)
    .where(and(eq(dateOverride.scheduleId, scheduleId), eq(dateOverride.date, input.date)))
    .limit(1)

  if (existing) {
    // Actualizar el override existente
    const [updated] = await db
      .update(dateOverride)
      .set({ intervals: input.intervals })
      .where(eq(dateOverride.id, existing.id))
      .returning()

    return updated!
  }

  // Crear un nuevo override
  const [row] = await db
    .insert(dateOverride)
    .values({ scheduleId, date: input.date, intervals: input.intervals })
    .returning()

  if (!row) throw Errors.internal('No se pudo crear el override')
  return row
}

/**
 * Elimina un date override de un schedule.
 * Verifica que el schedule pertenece al portal y que el override existe.
 */
export async function deleteDateOverride(
  portalId: string,
  scheduleId: string,
  overrideId: string,
): Promise<void> {
  await assertScheduleOwnership(portalId, scheduleId)

  const res = await db
    .delete(dateOverride)
    .where(and(eq(dateOverride.id, overrideId), eq(dateOverride.scheduleId, scheduleId)))
    .returning({ id: dateOverride.id })

  if (res.length === 0) throw Errors.notFound('Override no encontrado')
}

// ── Admin V2: Event Types (meetingType completo) ────────────────────────────────

/**
 * Mapea una fila de meetingType + hostIds al shape EventTypeV2 que espera el frontend.
 */
function toEventTypeV2(mt: typeof meetingType.$inferSelect, hosts: string[]) {
  return {
    id: mt.id,
    portalId: mt.portalId,
    ownerId: mt.ownerId,
    slug: mt.slug,
    name: mt.name,
    durationMin: mt.durationMin,
    kind: mt.kind,
    poolingType: mt.poolingType,
    color: mt.color,
    secret: mt.secret,
    description: mt.description,
    isActive: mt.isActive,
    locations: mt.locations,
    customQuestions: mt.customQuestions,
    startTimeIncrementMin: mt.startTimeIncrementMin,
    minBookingNoticeMin: mt.minBookingNoticeMin,
    bookingWindowType: mt.bookingWindowType,
    bookingWindowDays: mt.bookingWindowDays,
    bookingWindowStart: mt.bookingWindowStart,
    bookingWindowEnd: mt.bookingWindowEnd,
    bufferBeforeMin: mt.bufferBeforeMin,
    bufferAfterMin: mt.bufferAfterMin,
    dailyLimit: mt.dailyLimit,
    maxInvitees: mt.maxInvitees,
    availabilityScheduleId: mt.availabilityScheduleId,
    hosts,
  }
}

/**
 * Lista todos los event types del portal (activos e inactivos) con sus hosts.
 */
export async function listEventTypesV2(portalId: string) {
  const types = await db
    .select()
    .from(meetingType)
    .where(eq(meetingType.portalId, portalId))
    .orderBy(asc(meetingType.name))

  if (types.length === 0) return []

  const typeIds = types.map((t) => t.id)

  // Cargar memberships en un solo query (evitar N+1)
  const memberships = await db
    .select({ meetingTypeId: eventMembership.meetingTypeId, hostId: eventMembership.hostId })
    .from(eventMembership)
    .where(inArray(eventMembership.meetingTypeId, typeIds))

  return types.map((t) => {
    const hosts = memberships.filter((m) => m.meetingTypeId === t.id).map((m) => m.hostId)
    return toEventTypeV2(t, hosts)
  })
}

/**
 * Obtiene un event type del portal por ID con sus hosts.
 * Lanza 404 si no existe o no pertenece al portal.
 */
export async function getEventTypeV2(portalId: string, id: string) {
  const [mt] = await db
    .select()
    .from(meetingType)
    .where(and(eq(meetingType.id, id), eq(meetingType.portalId, portalId)))
    .limit(1)

  if (!mt) throw Errors.notFound('Event type no encontrado')

  const memberships = await db
    .select({ hostId: eventMembership.hostId })
    .from(eventMembership)
    .where(eq(eventMembership.meetingTypeId, id))

  return toEventTypeV2(mt, memberships.map((m) => m.hostId))
}

/**
 * Crea un event type V2 con todos los campos.
 * Para kind='group' inserta también las event_membership (hostIds) en transacción.
 */
export async function createEventTypeV2(
  portalId: string,
  ownerId: string,
  input: CreateEventTypeV2DTO,
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(meetingType)
      .values({
        portalId,
        ownerId,
        slug: input.slug ? slugify(input.slug) : slugify(input.name),
        name: input.name,
        durationMin: input.durationMin,
        kind: input.kind ?? 'solo',
        poolingType: input.poolingType ?? null,
        color: input.color ?? '#3b82f6',
        secret: input.secret ?? false,
        description: input.description ?? null,
        isActive: input.isActive ?? true,
        locations: input.locations ?? [],
        customQuestions: input.customQuestions ?? [],
        startTimeIncrementMin: input.startTimeIncrementMin ?? 30,
        minBookingNoticeMin: input.minBookingNoticeMin ?? 240,
        bookingWindowType: input.bookingWindowType ?? 'rolling',
        bookingWindowDays: input.bookingWindowDays ?? null,
        bookingWindowStart: input.bookingWindowStart ?? null,
        bookingWindowEnd: input.bookingWindowEnd ?? null,
        bufferBeforeMin: input.bufferBeforeMin ?? 0,
        bufferAfterMin: input.bufferAfterMin ?? 0,
        dailyLimit: input.dailyLimit ?? null,
        maxInvitees: input.maxInvitees ?? 1,
        availabilityScheduleId: input.availabilityScheduleId ?? null,
        // bufferMin se mantiene para compatibilidad con el schema legacy
        bufferMin: 0,
      })
      .returning()

    if (!row) throw Errors.internal('No se pudo crear el event type')

    // Para meetings grupales, insertar las memberships
    const hostIds = input.hostIds ?? []
    if (hostIds.length > 0) {
      await tx
        .insert(eventMembership)
        .values(hostIds.map((hostId) => ({ meetingTypeId: row.id, hostId })))
    }

    return toEventTypeV2(row, hostIds)
  })
}

/**
 * Actualiza parcialmente un event type V2.
 * Si vienen hostIds y el kind es group, reemplaza las memberships en transacción.
 */
export async function updateEventTypeV2(
  portalId: string,
  id: string,
  input: UpdateEventTypeV2DTO,
) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(meetingType)
      .where(and(eq(meetingType.id, id), eq(meetingType.portalId, portalId)))
      .limit(1)

    if (!existing) throw Errors.notFound('Event type no encontrado')

    // Construir el objeto de actualización solo con los campos presentes
    const updateData: Partial<typeof meetingType.$inferInsert> = {}
    if (input.name !== undefined) updateData.name = input.name
    if (input.slug !== undefined) updateData.slug = slugify(input.slug)
    if (input.durationMin !== undefined) updateData.durationMin = input.durationMin
    if (input.kind !== undefined) updateData.kind = input.kind
    if (input.poolingType !== undefined) updateData.poolingType = input.poolingType ?? null
    if (input.color !== undefined) updateData.color = input.color
    if (input.secret !== undefined) updateData.secret = input.secret
    if (input.description !== undefined) updateData.description = input.description
    if (input.isActive !== undefined) updateData.isActive = input.isActive
    if (input.locations !== undefined) updateData.locations = input.locations
    if (input.customQuestions !== undefined) updateData.customQuestions = input.customQuestions
    if (input.startTimeIncrementMin !== undefined) updateData.startTimeIncrementMin = input.startTimeIncrementMin
    if (input.minBookingNoticeMin !== undefined) updateData.minBookingNoticeMin = input.minBookingNoticeMin
    if (input.bookingWindowType !== undefined) updateData.bookingWindowType = input.bookingWindowType
    if (input.bookingWindowDays !== undefined) updateData.bookingWindowDays = input.bookingWindowDays
    if (input.bookingWindowStart !== undefined) updateData.bookingWindowStart = input.bookingWindowStart
    if (input.bookingWindowEnd !== undefined) updateData.bookingWindowEnd = input.bookingWindowEnd
    if (input.bufferBeforeMin !== undefined) updateData.bufferBeforeMin = input.bufferBeforeMin
    if (input.bufferAfterMin !== undefined) updateData.bufferAfterMin = input.bufferAfterMin
    if (input.dailyLimit !== undefined) updateData.dailyLimit = input.dailyLimit
    if (input.maxInvitees !== undefined) updateData.maxInvitees = input.maxInvitees
    if (input.availabilityScheduleId !== undefined) updateData.availabilityScheduleId = input.availabilityScheduleId

    const [updated] = await tx
      .update(meetingType)
      .set(updateData)
      .where(eq(meetingType.id, id))
      .returning()

    if (!updated) throw Errors.internal('No se pudo actualizar el event type')

    // Si vienen hostIds, reemplazar las memberships en la misma transacción
    let hostIds: string[]
    if (input.hostIds !== undefined) {
      await tx.delete(eventMembership).where(eq(eventMembership.meetingTypeId, id))

      if (input.hostIds.length > 0) {
        await tx
          .insert(eventMembership)
          .values(input.hostIds.map((hostId) => ({ meetingTypeId: id, hostId })))
      }

      hostIds = input.hostIds
    } else {
      // Mantener los hosts actuales
      const memberships = await tx
        .select({ hostId: eventMembership.hostId })
        .from(eventMembership)
        .where(eq(eventMembership.meetingTypeId, id))

      hostIds = memberships.map((m) => m.hostId)
    }

    return toEventTypeV2(updated, hostIds)
  })
}

/**
 * Elimina un event type del portal.
 * Lanza 404 si no existe o no pertenece al portal.
 */
export async function deleteEventTypeV2(portalId: string, id: string): Promise<void> {
  const res = await db
    .delete(meetingType)
    .where(and(eq(meetingType.id, id), eq(meetingType.portalId, portalId)))
    .returning({ id: meetingType.id })

  if (res.length === 0) throw Errors.notFound('Event type no encontrado')
}

// ── Admin V2: Bookings admin ────────────────────────────────────────────────────

/**
 * Lista los bookings del portal en un rango de fechas (vista semanal del admin).
 * Filtra por startsAt en [from 00:00:00 UTC, to 23:59:59 UTC].
 * Incluye el nombre y color del meeting type para la grilla semanal.
 */
export async function listWeekBookings(portalId: string, from: string, to: string) {
  const fromDate = new Date(`${from}T00:00:00.000Z`)
  const toDate = new Date(`${to}T23:59:59.999Z`)

  return db
    .select({
      id: booking.id,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      status: booking.status,
      meetLink: booking.meetLink,
      inviteeTimeZone: booking.inviteeTimeZone,
      meetingTypeName: meetingType.name,
      meetingTypeColor: meetingType.color,
    })
    .from(booking)
    .innerJoin(meetingType, eq(booking.meetingTypeId, meetingType.id))
    .where(
      and(
        eq(meetingType.portalId, portalId),
        gte(booking.startsAt, fromDate),
        lte(booking.startsAt, toDate),
      ),
    )
    .orderBy(asc(booking.startsAt))
}

/**
 * Cancela un booking desde el panel de admin (sin token de invitado).
 * Verifica que el booking pertenece al portal del admin antes de cancelar.
 * Limpia cancelToken y rescheduleToken al cancelar.
 */
export async function cancelAdminBooking(portalId: string, bookingId: string) {
  // Buscar el booking y verificar que pertenece a un meeting_type del portal del admin
  const [existing] = await db
    .select({
      id: booking.id,
      status: booking.status,
      portalId: meetingType.portalId,
    })
    .from(booking)
    .innerJoin(meetingType, eq(booking.meetingTypeId, meetingType.id))
    .where(eq(booking.id, bookingId))
    .limit(1)

  if (!existing) throw Errors.notFound('Booking no encontrado')

  // Verificar que el booking pertenece al portal del admin que realiza la acción
  if (existing.portalId !== portalId) throw Errors.notFound('Booking no encontrado')

  if (existing.status === 'cancelled') {
    throw Errors.conflict('El booking ya está cancelado')
  }

  // Cancelar: limpiar tokens para que no puedan usarse post-cancelación
  const [cancelled] = await db
    .update(booking)
    .set({
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelToken: null,
      rescheduleToken: null,
    })
    .where(eq(booking.id, bookingId))
    .returning({ id: booking.id })

  return { bookingId: cancelled!.id }
}

// ── Bookings (reuniones agendadas) ─────────────────────
export async function listBookings(portalId: string) {
  return db
    .select({
      id: booking.id,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      status: booking.status,
      meetLink: booking.meetLink,
      meetingTypeName: meetingType.name,
    })
    .from(booking)
    .innerJoin(meetingType, eq(booking.meetingTypeId, meetingType.id))
    .where(eq(meetingType.portalId, portalId))
    .orderBy(asc(booking.startsAt))
    .limit(100)
}
