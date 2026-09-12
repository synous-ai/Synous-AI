/**
 * booking-reminders.test.ts — Recordatorios de reunión (24h / 1h).
 *
 * Lo que importa verificar acá no es que "se mande un email", sino las dos
 * propiedades que hacen que el worker sea seguro corriendo cada 15 minutos:
 *
 *  1. IDEMPOTENCIA — la segunda corrida sobre el mismo booking no manda nada.
 *  2. VENTANAS DISJUNTAS — un booking a 30 minutos vista recibe el de '1h' y
 *     NO el de '24h'; si no, reservar sobre la hora dispararía los dos juntos.
 *
 * El mailer va mockeado para poder afirmar destinatarios y asuntos.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, closeDb } from '../../db'
import { booking, bookingReminder, meetingType, availabilitySchedule } from '../../db/schema'
import { createId } from '../../lib/id'
import { ensurePortalAndUser } from '../../test/helpers'
import { sendDueBookingReminders } from './booking-reminders.service'
import { sendEmail } from '../../lib/mailer'

vi.mock('../../lib/mailer', () => ({ sendEmail: vi.fn(async () => {}) }))
const sendEmailMock = vi.mocked(sendEmail)

let portalId: string
let userId: string
let meetingTypeId: string

const HOUR = 60 * 60 * 1000

beforeAll(async () => {
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  userId = ctx.userId

  const [sch] = await db
    .insert(availabilitySchedule)
    .values({ portalId, ownerId: userId, name: `rem-${createId()}`, timeZone: 'America/Argentina/Buenos_Aires' })
    .returning()

  const [mt] = await db
    .insert(meetingType)
    .values({
      portalId,
      ownerId: userId,
      slug: `rem-${createId()}`,
      name: 'Reunión de prueba',
      durationMin: 30,
      isActive: true,
      kind: 'solo',
      availabilityScheduleId: sch!.id,
    })
    .returning()
  meetingTypeId = mt!.id
})

afterAll(async () => {
  if (meetingTypeId) await db.delete(booking).where(eq(booking.meetingTypeId, meetingTypeId))
  await closeDb()
})

beforeEach(async () => {
  sendEmailMock.mockClear()
  // La tabla booking tiene un EXCLUDE (booking_no_overlap) por owner: sin
  // limpiar, los bookings de un test se solapan con los del siguiente y el
  // INSERT falla. Se borra por meeting type para no tocar los de otras suites.
  await db.delete(booking).where(eq(booking.meetingTypeId, meetingTypeId))
})

/** Crea un booking confirmado que empieza dentro de `inMs` a partir de `now`. */
async function seedBooking(now: Date, inMs: number, guest = 'Ana Invitada'): Promise<string> {
  const startsAt = new Date(now.getTime() + inMs)
  const [b] = await db
    .insert(booking)
    .values({
      meetingTypeId,
      ownerId: userId,
      guestName: guest,
      guestEmail: `rem-${createId()}@test.com`,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
      status: 'confirmed',
      inviteeTimeZone: 'America/Argentina/Buenos_Aires',
      cancelToken: createId(),
      rescheduleToken: createId(),
    })
    .returning()
  return b!.id
}

describe('sendDueBookingReminders', () => {
  it('manda el recordatorio de 24h a invitado y host, y lo deja marcado', async () => {
    const now = new Date()
    const id = await seedBooking(now, 20 * HOUR)

    const sent = await sendDueBookingReminders(now)

    expect(sent).toBe(2) // invitado + host
    const marks = await db.select().from(bookingReminder).where(eq(bookingReminder.bookingId, id))
    expect(marks).toHaveLength(1)
    expect(marks[0]!.kind).toBe('24h')

    const subjects = sendEmailMock.mock.calls.map((c) => c[0].subject)
    expect(subjects.every((s) => s.startsWith('Mañana:'))).toBe(true)
  })

  it('NO reenvía en la segunda corrida — el worker corre cada 15 minutos', async () => {
    const now = new Date()
    await seedBooking(now, 20 * HOUR)

    await sendDueBookingReminders(now)
    sendEmailMock.mockClear()

    await sendDueBookingReminders(now)
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('un booking a 30 minutos recibe SOLO el de 1h, no los dos', async () => {
    const now = new Date()
    const id = await seedBooking(now, 30 * 60 * 1000)

    await sendDueBookingReminders(now)

    const marks = await db.select().from(bookingReminder).where(eq(bookingReminder.bookingId, id))
    expect(marks).toHaveLength(1)
    expect(marks[0]!.kind).toBe('1h')

    const subjects = sendEmailMock.mock.calls.map((c) => c[0].subject)
    expect(subjects.every((s) => s.startsWith('En 1 hora:'))).toBe(true)
  })

  it('ignora bookings fuera de ventana (más de 24h) y cancelados', async () => {
    const now = new Date()
    await seedBooking(now, 40 * HOUR) // demasiado lejos

    const cancelledId = await seedBooking(now, 20 * HOUR)
    await db.update(booking).set({ status: 'cancelled' }).where(eq(booking.id, cancelledId))

    await sendDueBookingReminders(now)

    expect(sendEmailMock).not.toHaveBeenCalled()
    const marks = await db.select().from(bookingReminder).where(eq(bookingReminder.bookingId, cancelledId))
    expect(marks).toHaveLength(0)
  })

  it('el email del invitado lleva su zona horaria y links de autoservicio', async () => {
    const now = new Date()
    await seedBooking(now, 20 * HOUR)

    await sendDueBookingReminders(now)

    const inviteeMail = sendEmailMock.mock.calls[0]![0]
    expect(inviteeMail.html).toContain('America/Argentina/Buenos_Aires')
    expect(inviteeMail.html).toContain('/book/cancel?token=')
    expect(inviteeMail.html).toContain('/book/reschedule?token=')
  })

  it('el de 1h no ofrece reprogramar — a esa altura solo sirve entrar', async () => {
    const now = new Date()
    await seedBooking(now, 30 * 60 * 1000)

    await sendDueBookingReminders(now)

    const inviteeMail = sendEmailMock.mock.calls[0]![0]
    expect(inviteeMail.html).not.toContain('/book/reschedule?token=')
  })
})
