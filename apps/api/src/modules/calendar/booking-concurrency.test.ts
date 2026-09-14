/**
 * booking-concurrency.test.ts — Reservas concurrentes con hosts compartidos.
 *
 * El EXCLUDE booking_no_overlap solo cubre owner_id. Estos tests fijan que un
 * co-host de event types grupales tampoco puede quedar con dos reuniones en el
 * mismo horario, ni por reservas simultáneas ni por una reprogramación, y que
 * el lock por host no serializa reservas de hosts que no tienen nada en común.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { inArray, sql } from 'drizzle-orm'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import {
  availabilityInterval,
  availabilitySchedule,
  booking,
  eventMembership,
  hubUser,
  meetingType,
} from '../../db/schema'
import { createId } from '../../lib/id'
import { ensurePortalAndUser, listenForSupertest } from '../../test/helpers'

const app = buildApp({ rateLimit: false })

// 2030-06-18 = martes. Schedule America/Bogota (UTC-5): 09:00 local = 14:00 UTC.
const TEST_DATE = '2030-06-18'
const slot = (utcHour: string) => `${TEST_DATE}T${utcHour}:00.000Z`

let portalId: string
let scheduleId: string
const userIds: string[] = []
const meetingTypeIds: string[] = []
/** slugs por rol: dos grupales que comparten co-host y dos solos sin relación. */
const slugs = { groupA: '', groupB: '', soloFree: '', soloCoHost: '' }
let coHostId: string

async function createHost(label: string): Promise<string> {
  const [u] = await db
    .insert(hubUser)
    .values({ portalId, email: `${label}-${createId()}@test.com`, role: 'member', firstName: label })
    .returning({ id: hubUser.id })
  userIds.push(u!.id)
  return u!.id
}

async function createEventType(ownerId: string, kind: 'solo' | 'group', hostIds: string[] = []): Promise<string> {
  const slug = `cohost-${createId()}`
  const [mt] = await db
    .insert(meetingType)
    .values({
      portalId,
      ownerId,
      slug,
      name: `Concurrencia ${kind}`,
      durationMin: 30,
      bufferMin: 0,
      isActive: true,
      kind,
      startTimeIncrementMin: 30,
      minBookingNoticeMin: 0,
      bookingWindowType: 'unlimited',
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
      availabilityScheduleId: scheduleId,
    })
    .returning({ id: meetingType.id })
  meetingTypeIds.push(mt!.id)
  if (hostIds.length > 0) {
    await db.insert(eventMembership).values(hostIds.map((hostId) => ({ meetingTypeId: mt!.id, hostId })))
  }
  return slug
}

function book(slug: string, startsAt: string) {
  return request(app.server)
    .post(`/api/public/calendar/${portalId}/${slug}/book`)
    .send({
      guestName: 'Invitado Concurrencia',
      guestEmail: `guest-${createId()}@ejemplo.com`,
      startsAt,
      inviteeTimeZone: 'America/Bogota',
      questionAnswers: {},
      guestEmails: [],
    })
}

function tokenFrom(url: string): string {
  const token = new URL(url).searchParams.get('token')
  if (!token) throw new Error(`URL sin token: ${url}`)
  return token
}

beforeAll(async () => {
  await listenForSupertest(app)
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId

  const [sched] = await db
    .insert(availabilitySchedule)
    .values({ ownerId: ctx.userId, portalId, name: `cohost-sched-${createId()}`, timeZone: 'America/Bogota' })
    .returning({ id: availabilitySchedule.id })
  scheduleId = sched!.id
  await db.insert(availabilityInterval).values(
    [1, 2, 3, 4, 5].map((dayOfWeek) => ({ scheduleId, dayOfWeek, startTime: '09:00', endTime: '17:00' })),
  )

  const ownerA = await createHost('owner-a')
  const ownerB = await createHost('owner-b')
  coHostId = await createHost('cohost')
  const unrelated = await createHost('unrelated')

  // Owners distintos → el EXCLUDE por owner_id no ve el choque; solo lo comparte el co-host.
  slugs.groupA = await createEventType(ownerA, 'group', [ownerA, coHostId])
  slugs.groupB = await createEventType(ownerB, 'group', [ownerB, coHostId])
  slugs.soloFree = await createEventType(unrelated, 'solo')
  slugs.soloCoHost = await createEventType(coHostId, 'solo')
})

afterAll(async () => {
  if (meetingTypeIds.length > 0) {
    await db.delete(booking).where(inArray(booking.meetingTypeId, meetingTypeIds))
    await db.delete(meetingType).where(inArray(meetingType.id, meetingTypeIds))
  }
  if (scheduleId) {
    await db.delete(availabilityInterval).where(inArray(availabilityInterval.scheduleId, [scheduleId]))
    await db.delete(availabilitySchedule).where(inArray(availabilitySchedule.id, [scheduleId]))
  }
  if (userIds.length > 0) await db.delete(hubUser).where(inArray(hubUser.id, userIds))
  await app.close()
  await closeDb()
})

describe('reservas con co-host compartido', () => {
  it('dos reservas simultáneas del mismo slot en grupales que comparten co-host → una 201 y una 409', async () => {
    const results = await Promise.all([book(slugs.groupA, slot('14:00')), book(slugs.groupB, slot('14:00'))])
    const statuses = results.map((r) => r.status).sort()
    expect(statuses).toEqual([201, 409])
    const conflict = results.find((r) => r.status === 409)
    expect(conflict?.body.error.code).toBe('CONFLICT')
  })

  it('el slot ocupado por un grupal no se ofrece en los slots de otro event type del co-host', async () => {
    const res = await request(app.server)
      .get(`/api/public/calendar/${portalId}/${slugs.soloCoHost}/slots`)
      .query({ from: TEST_DATE, to: TEST_DATE, tz: 'UTC' })
      .expect(200)
    const starts = (res.body.data.slots as Array<{ startUtc: string }>).map((s) => new Date(s.startUtc).getTime())
    expect(starts).not.toContain(new Date(slot('14:00')).getTime())
    expect(starts).toContain(new Date(slot('15:00')).getTime())
  })

  it('reprogramar a un slot que el co-host ya tiene tomado → 409 y el booking original sigue confirmado', async () => {
    const taken = await book(slugs.groupB, slot('16:00'))
    expect(taken.status).toBe(201)

    const original = await book(slugs.groupA, slot('17:00'))
    expect(original.status).toBe(201)

    const res = await request(app.server)
      .post('/api/public/calendar/booking/reschedule')
      .send({ token: tokenFrom(original.body.data.rescheduleUrl), newStartsAt: slot('16:00') })
    expect(res.status).toBe(409)

    const [row] = await db
      .select({ status: booking.status })
      .from(booking)
      .where(inArray(booking.id, [original.body.data.booking.id as string]))
    expect(row?.status).toBe('confirmed')
  })

  it('el lock es por host: una reserva del co-host en espera no frena la de un host sin relación', async () => {
    let release!: () => void
    const released = new Promise<void>((resolve) => { release = resolve })
    let lockTaken!: () => void
    const locked = new Promise<void>((resolve) => { lockTaken = resolve })
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`booking-host:${coHostId}`}))`)
      lockTaken()
      await released
    })
    await locked

    let blockedDone = false
    const blocked = book(slugs.soloCoHost, slot('19:00')).then((r) => {
      blockedDone = true
      return r
    })

    const free = await book(slugs.soloFree, slot('19:00'))
    expect(free.status).toBe(201)
    expect(blockedDone).toBe(false)

    release()
    await holder
    expect((await blocked).status).toBe(201)
  })
})
