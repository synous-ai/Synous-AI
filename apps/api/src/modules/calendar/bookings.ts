import { and, asc, eq, gte, lte } from 'drizzle-orm'
import type { ListQuery } from '../../lib/crm-schemas'
import { cursorWhere, decodeCursor, paginateRows } from '../../lib/pagination'
import { addMinutes } from 'date-fns'
import { format as formatTz, toZonedTime } from 'date-fns-tz'
import { db } from '../../db'
import { meetingType, hubUser, booking } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { sendEmail } from '../../lib/mailer'
import { toInviteeDisplay } from './slots.service'
import type { CreateBookingDTO } from './calendar.schema'
import { bookingConfirmInviteeHtml } from './emails/booking-confirm-invitee'
import { bookingCancelledHtml } from './emails/booking-cancelled'
import { bookingHostNotifyHtml } from './emails/booking-host-notify'
import { signBookingToken, verifyBookingToken } from './booking-tokens'
import { resolvePortalRef } from './public-event-types'
import { loadHostSchedule, lockBookingHosts, assertSlotAvailable } from './availability-engine'

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
  portalRef: string,
  eventSlug: string,
  input: CreateBookingDTO,
  baseUrl: string,
) {
  const portalId = await resolvePortalRef(portalRef)
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

  const startsAt = new Date(input.startsAt)
  const endsAt = addMinutes(startsAt, mt.durationMin)

  // Obtener el email del owner para el email de notificación al host
  const [owner] = await db
    .select({ email: hubUser.email, firstName: hubUser.firstName, lastName: hubUser.lastName })
    .from(hubUser)
    .where(eq(hubUser.id, mt.ownerId))
    .limit(1)

  let newBooking: typeof booking.$inferSelect
  try {
    newBooking = await db.transaction(async (tx) => {
      // Revalidar el slot en el SERVER — nunca confiar en el datetime del cliente
      // (fuera de horario, días bloqueados, pasado, minNotice/ventana/buffers) — bajo
      // los locks de los hosts, para que el chequeo y el INSERT sean atómicos respecto
      // de otras reservas que comparten host. El EXCLUDE sigue como última red.
      await lockBookingHosts(tx, mt)
      await assertSlotAvailable(mt, input.startsAt, undefined, tx)
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

  const newStartsAt = new Date(rescheduleData.newStartsAt)
  const newEndsAt = addMinutes(newStartsAt, mt.durationMin)
  // Mantener la TZ original si no se proporciona una nueva
  const inviteeTimeZone = rescheduleData.inviteeTimeZone ?? original.inviteeTimeZone

  let newBooking: typeof booking.$inferSelect
  try {
    newBooking = await db.transaction(async (tx) => {
      // Revalidar el nuevo slot bajo los locks de los hosts (igual que en la reserva). Se
      // ignora el booking original al chequear ocupación: se cancela en esta misma
      // transacción, así que no debe bloquearse a sí mismo si el nuevo horario solapa.
      await lockBookingHosts(tx, mt)
      await assertSlotAvailable(mt, rescheduleData.newStartsAt, original.id, tx)

      // Cancelar el booking original dentro de la transacción para atomicidad. Condicionado
      // al token: dos reprogramaciones simultáneas del mismo booking no pueden aplicarse ambas.
      const [cancelled] = await tx
        .update(booking)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelToken: null,
          rescheduleToken: null, // Revocar ambos tokens del original
        })
        .where(and(eq(booking.id, original.id), eq(booking.rescheduleToken, token)))
        .returning({ id: booking.id })
      if (!cancelled) throw Errors.unauthorized('Token de reprogramación ya revocado o inválido')

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
/**
 * Orden cronológico (startsAt asc, id asc): es el de la agenda. `starts_at` no
 * cambia nunca en una fila — reprogramar crea un booking nuevo —, así que el
 * cursor sobre (starts_at, id) es estable entre páginas.
 */
export async function listBookings(portalId: string, query: ListQuery) {
  const cursor = decodeCursor(query.cursor)
  const rows = await db
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
    .where(and(eq(meetingType.portalId, portalId), cursor ? cursorWhere(booking.startsAt, booking.id, cursor, 'asc') : undefined))
    .orderBy(asc(booking.startsAt), asc(booking.id))
    .limit(query.limit + 1)
  return paginateRows(rows, query.limit, (b) => ({ createdAt: b.startsAt, id: b.id }))
}
