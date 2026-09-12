/**
 * booking-reminders.service.ts — Recordatorios de reunión (24h y 1h antes).
 *
 * Lo dispara el worker de reminders, que corre cada 15 minutos. Por eso la
 * idempotencia NO puede depender de "fijarse si ya se mandó y después mandar":
 * entre la lectura y el envío entra otro tick. La garantía la da la base — un
 * UNIQUE (booking_id, kind) en `booking_reminder` — y el orden es al revés:
 * primero se inserta la marca con ON CONFLICT DO NOTHING y el email sale SOLO si
 * la fila la insertó esta corrida.
 *
 * Ventanas (con `now` = N), pensadas para no solaparse:
 *   - 24h → N + 1h  <  startsAt <= N + 24h
 *   - 1h  → N       <  startsAt <= N + 1h
 * Que sean disjuntas evita el caso absurdo de reservar a 30 minutos vista y
 * recibir en el mismo tick el recordatorio de "es mañana" y el de "en 1 hora".
 */
import { and, eq, gt, lte } from 'drizzle-orm'
import { db } from '../../db'
import { booking, bookingReminder, meetingType, hubUser, portal } from '../../db/schema'
import { env } from '../../config/env'
import { sendEmail } from '../../lib/mailer'
import { toInviteeDisplay } from './slots.service'
import { bookingReminderHtml, bookingReminderSubject, type ReminderKind } from './emails/booking-reminder'

const HOUR_MS = 60 * 60 * 1000

/** Ventana de disparo de cada recordatorio, en offsets desde `now`. */
const WINDOWS: { kind: ReminderKind; fromMs: number; toMs: number }[] = [
  { kind: '24h', fromMs: 1 * HOUR_MS, toMs: 24 * HOUR_MS },
  { kind: '1h', fromMs: 0, toMs: 1 * HOUR_MS },
]

/** Primera ubicación configurada del meeting type (link o dirección). */
function firstLocation(locations: unknown): string | null {
  if (!Array.isArray(locations) || locations.length === 0) return null
  const l = locations[0] as { link?: string; address?: string }
  return l?.link ?? l?.address ?? null
}

function baseUrl(): string {
  return (env.ADMIN_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
}

/**
 * Manda los recordatorios que corresponden en este momento.
 *
 * @param now Inyectable para testear sin depender del reloj.
 * @returns cuántos emails se enviaron.
 */
export async function sendDueBookingReminders(now: Date = new Date()): Promise<number> {
  let sent = 0

  for (const w of WINDOWS) {
    const from = new Date(now.getTime() + w.fromMs)
    const to = new Date(now.getTime() + w.toMs)

    const rows = await db
      .select({
        bookingId: booking.id,
        guestName: booking.guestName,
        guestEmail: booking.guestEmail,
        startsAt: booking.startsAt,
        inviteeTimeZone: booking.inviteeTimeZone,
        cancelToken: booking.cancelToken,
        rescheduleToken: booking.rescheduleToken,
        eventName: meetingType.name,
        durationMin: meetingType.durationMin,
        locations: meetingType.locations,
        hostEmail: hubUser.email,
        hostFirstName: hubUser.firstName,
        portalTimeZone: portal.timeZone,
      })
      .from(booking)
      .innerJoin(meetingType, eq(meetingType.id, booking.meetingTypeId))
      .innerJoin(hubUser, eq(hubUser.id, booking.ownerId))
      .innerJoin(portal, eq(portal.id, meetingType.portalId))
      .where(and(eq(booking.status, 'confirmed'), gt(booking.startsAt, from), lte(booking.startsAt, to)))

    for (const r of rows) {
      // Reclamo del envío: si otra corrida ya lo tomó, `inserted` viene vacío.
      const inserted = await db
        .insert(bookingReminder)
        .values({ bookingId: r.bookingId, kind: w.kind })
        .onConflictDoNothing()
        .returning({ id: bookingReminder.id })
      if (inserted.length === 0) continue

      const location = firstLocation(r.locations)
      const startIso = new Date(r.startsAt).toISOString()

      try {
        // ── Invitado — en SU zona horaria, la que guardó al reservar.
        await sendEmail({
          to: r.guestEmail,
          subject: bookingReminderSubject(w.kind, r.eventName),
          html: bookingReminderHtml({
            recipientName: r.guestName,
            eventName: r.eventName,
            startLocal: `${toInviteeDisplay(startIso, r.inviteeTimeZone, 'yyyy-MM-dd HH:mm')} (${r.inviteeTimeZone})`,
            durationMin: r.durationMin,
            withWhom: r.hostFirstName,
            location,
            cancelUrl: r.cancelToken ? `${baseUrl()}/book/cancel?token=${r.cancelToken}` : null,
            rescheduleUrl: r.rescheduleToken ? `${baseUrl()}/book/reschedule?token=${r.rescheduleToken}` : null,
            kind: w.kind,
          }),
        })
        sent++

        // ── Host — en la zona horaria del portal, y sin links de autoservicio:
        // cancelar o reprogramar lo hace desde el CRM, no por token público.
        await sendEmail({
          to: r.hostEmail,
          subject: bookingReminderSubject(w.kind, `${r.eventName} — ${r.guestName}`),
          html: bookingReminderHtml({
            recipientName: r.hostFirstName,
            eventName: r.eventName,
            startLocal: `${toInviteeDisplay(startIso, r.portalTimeZone, 'yyyy-MM-dd HH:mm')} (${r.portalTimeZone})`,
            durationMin: r.durationMin,
            withWhom: r.guestName,
            location,
            kind: w.kind,
          }),
        })
        sent++
      } catch (err) {
        // Best-effort: la marca ya quedó puesta, así que no se reintenta en el
        // próximo tick. Es deliberado — reintentar cada 15 minutos un email que
        // falla por una dirección inválida sería spamear al proveedor.
        console.error('[booking-reminders] No se pudo enviar el recordatorio', {
          bookingId: r.bookingId,
          kind: w.kind,
          error: (err as Error)?.message ?? err,
        })
      }
    }
  }

  return sent
}
