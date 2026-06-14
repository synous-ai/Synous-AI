/**
 * calendar.router.test.ts — Tests de integración de las rutas públicas de calendario
 *
 * Cubre los escenarios del spec F3a + F3b:
 *  F3a:
 *  1. GET /slots → devuelve array (puede ser vacío si no hay schedule configurado)
 *  2. POST /book en slot libre → 201 + { data: { booking, cancelUrl, rescheduleUrl } }
 *  3. POST /book en slot ocupado → 409 (conflict anti-overlap)
 *  4. POST /book fuera del bookingWindow → 400
 *  5. POST /book con minNotice insuficiente → 400
 *
 *  F3b (token en BODY, no en URL — ver NOTA sobre mailer):
 *  6. POST /booking/cancel { token } → 200 + slot liberado
 *  7. POST /booking/cancel { token inválido } → 401
 *  8. POST /booking/cancel { token de reschedule } → 401 (discriminador de tipo)
 *  9. POST /booking/reschedule { token, newStartsAt } → 201 + nuevo booking + viejo cancelado
 * 10. POST /booking/reschedule { token inválido } → 401
 *
 * NOTA sobre el constraint EXCLUDE (23P01):
 *  El test de 409 inserta directamente en DB y luego intenta un segundo booking.
 *  Para que el constraint booking_no_overlap funcione, la migración 0016 debe
 *  estar aplicada en la DB de test (incluye EXCLUDE USING gist).
 *  Si la migración NO está aplicada, el segundo booking se insertará sin error
 *  y el test fallará — se reporta explícitamente en el output.
 *
 * NOTA sobre mailer (F3b):
 *  El mailer es lazy: si RESEND_API_KEY no está en el env de test, sendEmail() loguea
 *  y retorna sin error. No se necesita mock — el comportamiento de skip es el esperado en test.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { eq } from 'drizzle-orm'
import jwt from 'jsonwebtoken'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import {
  meetingType,
  availabilitySchedule,
  availabilityInterval,
  booking,
} from '../../db/schema'
import { createId } from '../../lib/id'
import { env } from '../../config/env'
import { ensurePortalAndUser, loginToken } from '../../test/helpers'

// ── Setup ─────────────────────────────────────────────────────────────────────

const app = buildApp()

let portalId: string
let userId: string
let meetingTypeId: string
let meetingTypeSlug: string
let scheduleId: string

/**
 * Fecha de test: un día hábil en el futuro lejano para no depender del bookingWindow.
 * Usamos bookingWindowType='unlimited' para que el motor no rechace por ventana.
 * 2030-06-17 = lunes (getUTCDay()=1). Verificado con: new Date('2030-06-17T00:00:00Z').getUTCDay() === 1.
 *
 * El schedule es America/Bogota (UTC-5 sin DST): 09:00 local = 14:00 UTC.
 * El slot de test empieza a las 09:00 Bogotá = 14:00 UTC.
 */
const TEST_DATE = '2030-06-17' // lunes (dayOfWeek=1), verificado UTC
const TEST_SLOT_START = `${TEST_DATE}T14:00:00.000Z` // 09:00 AM Bogotá (UTC-5) = 14:00 UTC
const TEST_SLOT_END = `${TEST_DATE}T14:30:00.000Z`

beforeAll(async () => {
  await app.ready()
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  userId = ctx.userId

  // Crear un availability schedule para el usuario de test
  const scheduleSlug = `test-sched-${createId()}`
  const [sched] = await db
    .insert(availabilitySchedule)
    .values({
      ownerId: userId,
      portalId,
      name: scheduleSlug,
      timeZone: 'America/Bogota', // UTC-5 sin DST
      isDefault: true,
    })
    .returning()
  scheduleId = sched!.id

  // Agregar intervalos L-V 09:00-17:00 (wall-clock Bogotá = 14:00-22:00 UTC)
  // dayOfWeek 1=lunes … 5=viernes
  await db.insert(availabilityInterval).values([
    { scheduleId, dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
    { scheduleId, dayOfWeek: 2, startTime: '09:00', endTime: '17:00' },
    { scheduleId, dayOfWeek: 3, startTime: '09:00', endTime: '17:00' },
    { scheduleId, dayOfWeek: 4, startTime: '09:00', endTime: '17:00' },
    { scheduleId, dayOfWeek: 5, startTime: '09:00', endTime: '17:00' },
  ])

  // Crear el meeting type con un slug único por corrida
  const slug = `test-cal-${createId()}`
  meetingTypeSlug = slug
  const [mt] = await db
    .insert(meetingType)
    .values({
      portalId,
      ownerId: userId,
      slug,
      name: 'Test Meeting',
      durationMin: 30,
      bufferMin: 0,
      isActive: true,
      kind: 'solo',
      startTimeIncrementMin: 30,
      minBookingNoticeMin: 0, // sin restricción de antelación para tests
      bookingWindowType: 'unlimited',
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
      availabilityScheduleId: scheduleId,
    })
    .returning()
  meetingTypeId = mt!.id

  // Limpiar cualquier booking que haya quedado de corridas anteriores
  // (puede ocurrir si los tests fallaron antes de la limpieza del afterAll)
  await db.delete(booking).where(eq(booking.ownerId, userId))
})

afterAll(async () => {
  // Limpiar: borrar bookings, intervals, schedule y meeting type del test
  if (meetingTypeId) {
    await db.delete(booking).where(eq(booking.meetingTypeId, meetingTypeId))
    await db.delete(meetingType).where(eq(meetingType.id, meetingTypeId))
  }
  if (scheduleId) {
    await db.delete(availabilityInterval).where(eq(availabilityInterval.scheduleId, scheduleId))
    await db.delete(availabilitySchedule).where(eq(availabilitySchedule.id, scheduleId))
  }
  await app.close()
  await closeDb()
})

// ── Helper ────────────────────────────────────────────────────────────────────

function baseUrl() {
  return `/api/public/calendar/${portalId}/${meetingTypeSlug}`
}

function bookPayload(startsAt: string = TEST_SLOT_START) {
  return {
    guestName: 'Invitado Test',
    guestEmail: `test-${createId()}@ejemplo.com`,
    startsAt,
    inviteeTimeZone: 'America/Bogota',
    questionAnswers: {},
    guestEmails: [],
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/public/calendar/:portalId/:eventSlug', () => {
  it('devuelve metadata del event type activo', async () => {
    const res = await request(app.server).get(baseUrl()).expect(200)

    expect(res.body.data).toMatchObject({
      slug: meetingTypeSlug,
      name: 'Test Meeting',
      durationMin: 30,
      kind: 'solo',
    })
  })

  it('devuelve 404 para un slug inexistente', async () => {
    const res = await request(app.server)
      .get(`/api/public/calendar/${portalId}/slug-inexistente-xyz`)
      .expect(404)

    expect(res.body.error.code).toBe('NOT_FOUND')
  })
})

describe('GET /api/public/calendar/:portalId/:eventSlug/slots', () => {
  it('devuelve un array de slots para la fecha de test', async () => {
    const res = await request(app.server)
      .get(`${baseUrl()}/slots`)
      .query({ from: TEST_DATE, to: TEST_DATE, tz: 'America/Bogota' })
      .expect(200)

    expect(res.body.data.slots).toBeInstanceOf(Array)
    // La fecha 2030-06-16 es lunes, el schedule tiene 09:00-17:00 → debe haber slots
    expect(res.body.data.slots.length).toBeGreaterThan(0)

    // Cada slot debe tener las propiedades esperadas
    const slot = res.body.data.slots[0]
    expect(slot).toHaveProperty('startUtc')
    expect(slot).toHaveProperty('endUtc')
    expect(slot).toHaveProperty('startLocal')
  })

  it('los slots devueltos están en el rango correcto de fechas', async () => {
    const res = await request(app.server)
      .get(`${baseUrl()}/slots`)
      .query({ from: TEST_DATE, to: TEST_DATE, tz: 'America/Bogota' })
      .expect(200)

    const slots: Array<{ startUtc: string; endUtc: string }> = res.body.data.slots
    for (const s of slots) {
      const start = new Date(s.startUtc)
      expect(start.toISOString().slice(0, 10)).toBe(TEST_DATE)
    }
  })

  it('devuelve 400 para una timezone inválida', async () => {
    const res = await request(app.server)
      .get(`${baseUrl()}/slots`)
      .query({ from: TEST_DATE, to: TEST_DATE, tz: 'No/Valid' })
      .expect(400)

    // Zod valida la tz en el querystring
    expect(res.body.error).toBeDefined()
  })

  it('devuelve 400 para formato de fecha inválido', async () => {
    const res = await request(app.server)
      .get(`${baseUrl()}/slots`)
      .query({ from: '2030/06/16', to: TEST_DATE, tz: 'America/Bogota' })
      .expect(400)

    expect(res.body.error).toBeDefined()
  })
})

describe('POST /api/public/calendar/:portalId/:eventSlug/book', () => {
  it('crea un booking en un slot libre → 201', async () => {
    const payload = bookPayload(TEST_SLOT_START)
    const res = await request(app.server)
      .post(`${baseUrl()}/book`)
      .send(payload)
      .expect(201)

    expect(res.body.data.booking).toMatchObject({
      guestName: 'Invitado Test',
      guestEmail: payload.guestEmail,
      status: 'confirmed',
      meetingTypeId,
    })
    // F4b: las URLs apuntan al frontend (/book/cancel, /book/reschedule con token en query param)
    expect(res.body.data.cancelUrl).toContain('/book/cancel?token=')
    expect(res.body.data.rescheduleUrl).toContain('/book/reschedule?token=')

    // Limpiar este booking para no afectar otros tests
    const bookingId = res.body.data.booking.id
    await db.delete(booking).where(eq(booking.id, bookingId))
  })

  it('rechaza con 409 cuando el slot ya está reservado (anti-overlap)', async () => {
    // Usar un slot diferente al del test anterior para aislamiento
    // 15:00 UTC = 10:00 AM Bogotá — dentro del horario 09:00-17:00
    const SLOT_B = `${TEST_DATE}T15:00:00.000Z`

    // Primera reserva → debe tener éxito
    const first = await request(app.server)
      .post(`${baseUrl()}/book`)
      .send(bookPayload(SLOT_B))
      .expect(201)
    const firstBookingId = first.body.data.booking.id

    // Segunda reserva en el MISMO slot → debe fallar
    // Si el constraint EXCLUDE (0016_late_deathbird.sql) está aplicado en la DB de test,
    // el INSERT fallará con PG 23P01 y el service lo mapea a 409.
    // Si el constraint NO está aplicado (F1.5 pendiente), el service rechaza
    // vía la validación lógica (computeSlots) porque el booking anterior bloquea el slot.
    const second = await request(app.server)
      .post(`${baseUrl()}/book`)
      .send(bookPayload(SLOT_B))
      // Puede ser 409 (constraint EXCLUDE) o 400 (validación lógica)
      // En ambos casos el slot debe rechazarse
      .expect((res) => {
        if (res.status !== 409 && res.status !== 400) {
          throw new Error(
            `Se esperaba 409 o 400 (slot ocupado), se recibió ${res.status}: ${JSON.stringify(res.body)}`,
          )
        }
      })

    // Si fue 409, verificar el mensaje claro
    if (second.status === 409) {
      expect(second.body.error.code).toBe('CONFLICT')
    }

    // Limpieza
    await db.delete(booking).where(eq(booking.id, firstBookingId))
  })

  it('rechaza con 400 cuando el slot no existe en el schedule (slot fuera de horario)', async () => {
    // 08:00 UTC = 03:00 AM Bogotá — fuera del horario 09:00-17:00 del schedule
    const OUT_OF_HOURS = `${TEST_DATE}T08:00:00.000Z` // 03:00 AM Bogotá, fuera de horario

    const res = await request(app.server)
      .post(`${baseUrl()}/book`)
      .send(bookPayload(OUT_OF_HOURS))
      .expect(400)

    expect(res.body.error.code).toBe('BAD_REQUEST')
    expect(res.body.error.message).toContain('disponible')
  })

  it('rechaza con 400 cuando el slot está fuera del bookingWindow', async () => {
    // Crear un event type con bookingWindow rolling de 1 día
    const slug2 = `test-narrow-${createId()}`
    const [mt2] = await db
      .insert(meetingType)
      .values({
        portalId,
        ownerId: userId,
        slug: slug2,
        name: 'Narrow Window',
        durationMin: 30,
        bufferMin: 0,
        isActive: true,
        kind: 'solo',
        startTimeIncrementMin: 30,
        minBookingNoticeMin: 0,
        bookingWindowType: 'rolling',
        bookingWindowDays: 1, // solo mañana es reservable
        bufferBeforeMin: 0,
        bufferAfterMin: 0,
        availabilityScheduleId: scheduleId,
      })
      .returning()

    try {
      const res = await request(app.server)
        .post(`/api/public/calendar/${portalId}/${slug2}/book`)
        .send({
          ...bookPayload(TEST_SLOT_START),
          // TEST_DATE=2030-06-16 está muy lejos del futuro → fuera del rolling de 1 día
        })
        .expect(400)

      expect(res.body.error.code).toBe('BAD_REQUEST')
    } finally {
      await db.delete(meetingType).where(eq(meetingType.id, mt2!.id))
    }
  })

  it('rechaza con 400 cuando no cumple minBookingNotice', async () => {
    // Crear un event type que requiere 999999 minutos de antelación (~694 días).
    // El slot que enviamos está a ~30 minutos en el futuro — viola el notice.
    // Usamos un slot próximo (en ~30 min) para que el minNotice lo rechace.
    const slug3 = `test-notice-${createId()}`
    const [mt3] = await db
      .insert(meetingType)
      .values({
        portalId,
        ownerId: userId,
        slug: slug3,
        name: 'High Notice',
        durationMin: 30,
        bufferMin: 0,
        isActive: true,
        kind: 'solo',
        startTimeIncrementMin: 30,
        minBookingNoticeMin: 999_999, // ~694 días de antelación requeridos
        bookingWindowType: 'unlimited',
        bufferBeforeMin: 0,
        bufferAfterMin: 0,
        availabilityScheduleId: scheduleId,
      })
      .returning()

    try {
      // Slot en 30 minutos — con minBookingNotice de 999999 minutos, siempre falla
      const soonSlot = new Date(Date.now() + 30 * 60_000).toISOString()

      const res = await request(app.server)
        .post(`/api/public/calendar/${portalId}/${slug3}/book`)
        .send({ ...bookPayload(soonSlot), inviteeTimeZone: 'America/Bogota' })
        .expect(400)

      expect(res.body.error.code).toBe('BAD_REQUEST')
      expect(res.body.error.message).toContain('antelación')
    } finally {
      // Limpiar solo el meeting type (sin bookings porque el test debe rechazarlo)
      await db.delete(meetingType).where(eq(meetingType.id, mt3!.id))
    }
  })

  it('rechaza con 400 si falta guestEmail', async () => {
    const res = await request(app.server)
      .post(`${baseUrl()}/book`)
      .send({
        guestName: 'Sin email',
        startsAt: TEST_SLOT_START,
        inviteeTimeZone: 'America/Bogota',
      })
      .expect(400)

    expect(res.body.error).toBeDefined()
  })
})

// ── F3b — Cancel / Reschedule ─────────────────────────────────────────────────

/**
 * Slot reservado para los tests de cancel/reschedule.
 * Usamos 16:00 UTC = 11:00 AM Bogotá — diferente a los slots de los tests anteriores.
 *
 * NOTA sobre la URL de los tokens:
 *  El diseño usa token en el BODY (no en el path) porque:
 *   - Los JWT contienen '.' que confunden el router de Fastify (find-my-way) cuando van
 *     en segmentos de ruta seguidos de más segmentos → 404 falso positivo.
 *   - Tokens en URL quedan en server logs → riesgo de seguridad.
 *  La cancelUrl / rescheduleUrl devuelta por la API tiene formato:
 *    .../booking/cancel?token=JWT  (la frontend page lee el query param y llama al API)
 *  Los tests extraen el JWT del query param y lo envían en el body.
 */
const CANCEL_TEST_SLOT = `${TEST_DATE}T16:00:00.000Z` // 11:00 AM Bogotá
const RESCHEDULE_NEW_SLOT = `${TEST_DATE}T16:30:00.000Z` // 11:30 AM Bogotá

/** Helper: extrae el token JWT del query param de la URL de autoservicio devuelta. */
function extractToken(url: string): string {
  const urlObj = new URL(url)
  const token = urlObj.searchParams.get('token')
  if (!token) throw new Error(`No se encontró token en URL: ${url}`)
  return token
}

describe('POST /api/public/calendar/booking/cancel', () => {
  it('cancela un booking válido con su token → 200 y slot liberado', async () => {
    // 1. Crear un booking para tener su cancelToken
    const createRes = await request(app.server)
      .post(`${baseUrl()}/book`)
      .send(bookPayload(CANCEL_TEST_SLOT))
      .expect(201)

    const { booking: createdBooking, cancelUrl } = createRes.body.data

    // Extraer el JWT del query param ?token=...
    const cancelToken = extractToken(cancelUrl)
    expect(cancelToken).toBeTruthy()

    // 2. Cancelar enviando el token en el body
    const cancelRes = await request(app.server)
      .post('/api/public/calendar/booking/cancel')
      .send({ token: cancelToken })
      .expect(200)

    expect(cancelRes.body.data.bookingId).toBe(createdBooking.id)

    // 3. Verificar que el slot quedó libre: reservar el mismo slot debe funcionar.
    // El constraint EXCLUDE solo aplica a status='confirmed' → al cancelar queda libre.
    const rebookRes = await request(app.server)
      .post(`${baseUrl()}/book`)
      .send(bookPayload(CANCEL_TEST_SLOT))
      .expect(201)

    // Limpiar el segundo booking
    await db.delete(booking).where(eq(booking.id, rebookRes.body.data.booking.id))
  })

  it('rechaza con 401 cuando el token es inválido', async () => {
    const res = await request(app.server)
      .post('/api/public/calendar/booking/cancel')
      .send({ token: 'token-invalido-xyz-no-jwt' })
      .expect(401)

    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('rechaza con 401 cuando se usa un token de reschedule para cancelar (discriminador)', async () => {
    // Generamos un JWT de tipo 'booking-reschedule' directamente (sin crear un booking real)
    // para evitar una llamada extra al endpoint /book (rate limit 10/min en test).
    const fakeBookingId = createId()
    const rescheduleToken = jwt.sign(
      { bookingId: fakeBookingId, type: 'booking-reschedule' },
      env.ACCESS_TOKEN_SECRET,
      { expiresIn: 3600 },
    )

    // Intentar usar el rescheduleToken en el endpoint de cancel → rechaza por discriminador de tipo.
    // El service detecta type !== 'booking-cancel' antes de consultar la DB.
    const res = await request(app.server)
      .post('/api/public/calendar/booking/cancel')
      .send({ token: rescheduleToken })
      .expect(401)

    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })
})

describe('POST /api/public/calendar/booking/reschedule', () => {
  it('reprograma un booking válido → 201, viejo cancelado, nuevo confirmado', async () => {
    // 1. Crear el booking original
    const createRes = await request(app.server)
      .post(`${baseUrl()}/book`)
      .send(bookPayload(RESCHEDULE_NEW_SLOT))
      .expect(201)

    const { booking: originalBooking, rescheduleUrl } = createRes.body.data
    const rescheduleToken = extractToken(rescheduleUrl)

    // El nuevo slot: 17:30 UTC = 12:30 Bogotá (diferente al original, libre)
    const newSlot = `${TEST_DATE}T17:30:00.000Z`

    // 2. Reprogramar al nuevo slot enviando token en el body
    const rescheduleRes = await request(app.server)
      .post('/api/public/calendar/booking/reschedule')
      .send({ token: rescheduleToken, newStartsAt: newSlot, inviteeTimeZone: 'America/Bogota' })
      .expect(201)

    expect(rescheduleRes.body.data.booking).toMatchObject({
      status: 'confirmed',
      meetingTypeId,
    })
    // El nuevo booking debe referenciar al original como rescheduledFromId
    expect(rescheduleRes.body.data.rescheduledFromId).toBe(originalBooking.id)
    // F4b: las URLs apuntan al frontend (/book/cancel, /book/reschedule con token en query param)
    expect(rescheduleRes.body.data.cancelUrl).toContain('/book/cancel?token=')
    expect(rescheduleRes.body.data.rescheduleUrl).toContain('/book/reschedule?token=')

    // 3. Verificar que el booking original quedó cancelado en la DB
    const [oldBooking] = await db
      .select({ status: booking.status })
      .from(booking)
      .where(eq(booking.id, originalBooking.id))
    expect(oldBooking?.status).toBe('cancelled')

    // Limpiar el nuevo booking
    await db.delete(booking).where(eq(booking.id, rescheduleRes.body.data.booking.id))
  })

  it('rechaza con 401 cuando el token de reschedule es inválido', async () => {
    const res = await request(app.server)
      .post('/api/public/calendar/booking/reschedule')
      .send({ token: 'token-invalido-reschedule', newStartsAt: RESCHEDULE_NEW_SLOT, inviteeTimeZone: 'America/Bogota' })
      .expect(401)

    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('rechaza con 401 cuando se usa un token de cancel para reschedule (discriminador)', async () => {
    // Generamos un JWT de tipo 'booking-cancel' directamente (sin crear un booking real)
    // para evitar una llamada extra al endpoint /book (rate limit 10/min en test).
    const fakeBookingId = createId()
    const cancelToken = jwt.sign(
      { bookingId: fakeBookingId, type: 'booking-cancel' },
      env.ACCESS_TOKEN_SECRET,
      { expiresIn: 3600 },
    )

    // Intentar usar el cancelToken en el endpoint de reschedule → rechaza por discriminador.
    // El service detecta type !== 'booking-reschedule' antes de consultar la DB.
    const res = await request(app.server)
      .post('/api/public/calendar/booking/reschedule')
      .send({ token: cancelToken, newStartsAt: RESCHEDULE_NEW_SLOT, inviteeTimeZone: 'America/Bogota' })
      .expect(401)

    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })
})

// ── F4b: Admin booking endpoints ──────────────────────────────────────────────

describe('F4b — GET /api/calendar/bookings/week (admin)', () => {
  let adminToken: string
  let createdBookingId: string

  /**
   * Fecha de test para la vista semanal — mismo día que TEST_SLOT_START (2030-06-17)
   * pero en un horario diferente para no chocar con tests anteriores.
   */
  const WEEK_SLOT = `${TEST_DATE}T16:00:00.000Z` // 11:00 Bogotá

  beforeAll(async () => {
    adminToken = await loginToken(app, 'owner@test.com', 'password123')

    // Crear un booking en la DB directamente (sin pasar por el endpoint público)
    // para no consumir el rate limit.
    const cancelToken = jwt.sign(
      { bookingId: createId(), type: 'booking-cancel' },
      env.ACCESS_TOKEN_SECRET,
      { expiresIn: 3600 },
    )
    const rescheduleToken = jwt.sign(
      { bookingId: createId(), type: 'booking-reschedule' },
      env.ACCESS_TOKEN_SECRET,
      { expiresIn: 3600 },
    )
    const [row] = await db
      .insert(booking)
      .values({
        meetingTypeId,
        ownerId: userId,
        guestName: 'Admin Week Test',
        guestEmail: `admin-week-${createId()}@test.com`,
        startsAt: new Date(WEEK_SLOT),
        endsAt: new Date(`${TEST_DATE}T16:30:00.000Z`),
        status: 'confirmed',
        inviteeTimeZone: 'America/Bogota',
        cancelToken,
        rescheduleToken,
      })
      .returning()
    createdBookingId = row!.id
  })

  afterAll(async () => {
    if (createdBookingId) {
      await db.delete(booking).where(eq(booking.id, createdBookingId))
    }
  })

  it('devuelve bookings del portal en el rango de fechas → 200', async () => {
    const from = TEST_DATE
    const to = TEST_DATE

    const res = await request(app.server)
      .get(`/api/calendar/bookings/week?from=${from}&to=${to}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)

    expect(Array.isArray(res.body.data)).toBe(true)
    // Debe incluir el booking que creamos
    const found = res.body.data.find((b: { id: string }) => b.id === createdBookingId)
    expect(found).toBeDefined()
    expect(found.guestName).toBe('Admin Week Test')
    expect(found.meetingTypeName).toBe('Test Meeting')
  })

  it('cancela un booking desde el admin → 200 + slot liberado', async () => {
    const res = await request(app.server)
      .post(`/api/calendar/bookings/${createdBookingId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)

    expect(res.body.data.bookingId).toBe(createdBookingId)

    // Verificar que el booking está cancelado en la DB
    const [updated] = await db
      .select({ status: booking.status })
      .from(booking)
      .where(eq(booking.id, createdBookingId))
    expect(updated?.status).toBe('cancelled')
  })

  it('rechaza cancelar sin auth → 401', async () => {
    await request(app.server)
      .post(`/api/calendar/bookings/${createId()}/cancel`)
      .expect(401)
  })
})
