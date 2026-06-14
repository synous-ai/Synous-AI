import { and, asc, eq, inArray } from 'drizzle-orm'
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
