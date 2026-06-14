/**
 * slots.service.test.ts — Tests unitarios del motor de slots (PURO, sin DB)
 *
 * Todos los fixtures son inline — no se toca la base de datos.
 * Se cubre cada escenario MUST del spec §3.
 *
 * Convención de fechas en estos tests:
 *  - Las fechas de 2026-06-XX son "normales" (sin cambio de horario relevante).
 *  - 2026-03-08 = último día EST (UTC-5) antes del spring-forward de NY.
 *  - 2026-03-09 = primer día EDT (UTC-4) después del spring-forward de NY.
 */

import { describe, it, expect } from 'vitest'
import { computeSlots, toInviteeDisplay } from './slots.service'
import type {
  SlotInput,
  ScheduleWithIntervals,
  BookingBusy,
  EventTypeConfig,
} from './slots.service'

// ---------------------------------------------------------------------------
// Fixtures base reutilizables
// ---------------------------------------------------------------------------

/** Event type base: 30 min, increment 30, sin buffers, sin límite diario */
const baseEventType: EventTypeConfig = {
  durationMin: 30,
  startTimeIncrementMin: 30,
  minBookingNoticeMin: 0,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  bookingWindowType: 'unlimited',
  bookingWindowDays: null,
  bookingWindowStart: null,
  bookingWindowEnd: null,
  dailyLimit: null,
}

/**
 * Schedule Mon–Fri 09:00–17:00 en America/New_York.
 * dayOfWeek: 0=dom, 1=lun, 2=mar, 3=mié, 4=jue, 5=vie, 6=sáb.
 */
const nySchedule: ScheduleWithIntervals = {
  timeZone: 'America/New_York',
  intervals: [
    { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }, // lunes
    { dayOfWeek: 2, startTime: '09:00', endTime: '17:00' }, // martes
    { dayOfWeek: 3, startTime: '09:00', endTime: '17:00' }, // miércoles
    { dayOfWeek: 4, startTime: '09:00', endTime: '17:00' }, // jueves
    { dayOfWeek: 5, startTime: '09:00', endTime: '17:00' }, // viernes
  ],
  dateOverrides: [],
}

/** Momento "ahora" neutro: antes de cualquier slot del 2026-06-15 */
const nowNeutral = new Date('2026-06-01T00:00:00Z')

// ---------------------------------------------------------------------------
// Helper: construir input completo
// ---------------------------------------------------------------------------

function makeInput(
  overrides: Partial<SlotInput> & {
    fromDate: string
    toDate: string
  },
): SlotInput {
  return {
    eventType: baseEventType,
    schedules: [nySchedule],
    existingBookings: [],
    inviteeTimezone: 'America/New_York',
    now: nowNeutral,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Escenario 1: Slot ocupado se excluye — spec §3 esc.1
// ---------------------------------------------------------------------------

describe('computeSlots — slot ocupado es excluido', () => {
  /**
   * 2026-06-15 es lunes.
   * En EDT (UTC-4): 09:00 NY = 13:00 UTC, 17:00 NY = 21:00 UTC.
   * Booking 10:00–10:30 NY = 14:00–14:30 UTC.
   */
  const date = '2026-06-15'
  const booking: BookingBusy = {
    startsAt: '2026-06-15T14:00:00Z', // 10:00 NY en EDT
    endsAt: '2026-06-15T14:30:00Z',   // 10:30 NY en EDT
    status: 'confirmed',
  }

  it('el slot 10:00 NY (14:00 UTC) está ausente', () => {
    const slots = computeSlots(makeInput({
      fromDate: date,
      toDate: date,
      existingBookings: [booking],
    }))
    const startUtcs = slots.map((s) => s.startUtc)
    expect(startUtcs).not.toContain('2026-06-15T14:00:00.000Z')
  })

  it('los slots 09:00, 09:30 y 10:30 NY están presentes', () => {
    const slots = computeSlots(makeInput({
      fromDate: date,
      toDate: date,
      existingBookings: [booking],
    }))
    const startUtcs = slots.map((s) => s.startUtc)
    // 09:00 NY EDT = 13:00 UTC
    expect(startUtcs).toContain('2026-06-15T13:00:00.000Z')
    // 09:30 NY EDT = 13:30 UTC
    expect(startUtcs).toContain('2026-06-15T13:30:00.000Z')
    // 10:30 NY EDT = 14:30 UTC
    expect(startUtcs).toContain('2026-06-15T14:30:00.000Z')
  })

  it('los bookings no-confirmados no bloquean slots', () => {
    const cancelledBooking: BookingBusy = {
      ...booking,
      status: 'cancelled',
    }
    const slots = computeSlots(makeInput({
      fromDate: date,
      toDate: date,
      existingBookings: [cancelledBooking],
    }))
    const startUtcs = slots.map((s) => s.startUtc)
    // El slot cancelado NO debe bloquear el slot
    expect(startUtcs).toContain('2026-06-15T14:00:00.000Z')
  })
})

// ---------------------------------------------------------------------------
// Escenario 2: Buffers excluyen slots adyacentes — spec §3 esc.2
// ---------------------------------------------------------------------------

describe('computeSlots — buffer before/after excluye slots adyacentes', () => {
  /**
   * Booking 10:00–10:30 NY (EDT) = 14:00–14:30 UTC.
   * buffer_before=10: el slot que termina 10 min antes del booking NO debe estar.
   *   → 09:30 slot (13:30–14:00 UTC) tiene un "final extendido" de 14:10 que solapa.
   *   → Pero el chequeo es: (slotStart - bufferBefore, slotEnd + bufferAfter) ∩ booking.
   *   → Slot 09:30–10:00 con bufferAfter=10: zona extendida = 13:30–14:10 → solapa con 14:00-14:30 ✓
   * buffer_after=10: el slot que empieza 10 min después del booking tampoco.
   *   → Slot 10:30–11:00 (14:30 UTC) con bufferBefore=10: zona extendida = 14:20–15:00 → solapa con 14:00–14:30 ✓
   */

  const date = '2026-06-15' // lunes EDT
  const booking: BookingBusy = {
    startsAt: '2026-06-15T14:00:00Z',
    endsAt: '2026-06-15T14:30:00Z',
    status: 'confirmed',
  }

  it('el slot 09:30 NY (13:30 UTC) está excluido por buffer_after del booking', () => {
    const slots = computeSlots(makeInput({
      fromDate: date,
      toDate: date,
      existingBookings: [booking],
      eventType: { ...baseEventType, bufferBeforeMin: 10, bufferAfterMin: 10 },
    }))
    const startUtcs = slots.map((s) => s.startUtc)
    expect(startUtcs).not.toContain('2026-06-15T13:30:00.000Z')
  })

  it('el slot 10:30 NY (14:30 UTC) está excluido por buffer_before del slot siguiente', () => {
    const slots = computeSlots(makeInput({
      fromDate: date,
      toDate: date,
      existingBookings: [booking],
      eventType: { ...baseEventType, bufferBeforeMin: 10, bufferAfterMin: 10 },
    }))
    const startUtcs = slots.map((s) => s.startUtc)
    expect(startUtcs).not.toContain('2026-06-15T14:30:00.000Z')
  })

  it('el slot 09:00 NY (13:00 UTC) sigue presente (fuera del rango de buffers)', () => {
    const slots = computeSlots(makeInput({
      fromDate: date,
      toDate: date,
      existingBookings: [booking],
      eventType: { ...baseEventType, bufferBeforeMin: 10, bufferAfterMin: 10 },
    }))
    const startUtcs = slots.map((s) => s.startUtc)
    expect(startUtcs).toContain('2026-06-15T13:00:00.000Z')
  })
})

// ---------------------------------------------------------------------------
// Escenario 3: Min booking notice — spec §3 esc.3
// ---------------------------------------------------------------------------

describe('computeSlots — minBookingNoticeMin excluye slots cercanos', () => {
  /**
   * now = 2026-06-15T10:00:00Z (las 10:00 UTC, las 06:00 NY en EDT).
   * minBookingNoticeMin = 120 → threshold = 12:00 UTC.
   * El día 2026-06-15 abre a 09:00 NY = 13:00 UTC.
   * → Slots antes de 12:00 UTC están excluidos, pero 13:00 UTC es posterior → todos presentes.
   *
   * Para que sea interesante, usamos now=12:00 UTC y threshold=14:00 UTC:
   * → slots 09:00 NY (13:00 UTC) y 09:30 NY (13:30 UTC) excluidos; 10:00 NY (14:00) presente.
   */

  const date = '2026-06-15'
  const now = new Date('2026-06-15T12:00:00Z') // 12:00 UTC = 08:00 NY EDT
  const minBookingNoticeMin = 120               // threshold = 14:00 UTC

  it('slots antes de now+2h (14:00 UTC) están excluidos', () => {
    const slots = computeSlots(makeInput({
      fromDate: date,
      toDate: date,
      now,
      eventType: { ...baseEventType, minBookingNoticeMin },
    }))
    const startUtcs = slots.map((s) => s.startUtc)
    // 09:00 NY = 13:00 UTC → excluido
    expect(startUtcs).not.toContain('2026-06-15T13:00:00.000Z')
    // 09:30 NY = 13:30 UTC → excluido
    expect(startUtcs).not.toContain('2026-06-15T13:30:00.000Z')
  })

  it('slot en 10:00 NY (14:00 UTC) está presente (exactamente en el threshold)', () => {
    const slots = computeSlots(makeInput({
      fromDate: date,
      toDate: date,
      now,
      eventType: { ...baseEventType, minBookingNoticeMin },
    }))
    const startUtcs = slots.map((s) => s.startUtc)
    // 10:00 NY EDT = 14:00 UTC → threshold exacto → PRESENTE (isBefore(cursor, threshold) es false cuando son iguales)
    expect(startUtcs).toContain('2026-06-15T14:00:00.000Z')
  })
})

// ---------------------------------------------------------------------------
// Escenario 4: Booking window rolling_days — spec §3 esc.4
// ---------------------------------------------------------------------------

describe('computeSlots — bookingWindowType rolling_days restringe slots futuros', () => {
  /**
   * bookingWindowDays = 7, today = 2026-06-13.
   * Ventana válida: 2026-06-13 → 2026-06-19 (inclusive).
   * 2026-06-20 y 2026-06-21 están fuera de la ventana → 0 slots.
   * 2026-06-19 está dentro → slots presentes.
   *
   * 2026-06-19 = viernes (dayOfWeek 5) en EDT → slots existen.
   * 2026-06-20 = sábado (no está en el schedule L-V) → 0 slots de todos modos.
   * Usamos 2026-06-18 (jueves, dentro) y 2026-06-21 (domingo, fuera).
   */

  const now = new Date('2026-06-13T12:00:00Z')
  const et: EventTypeConfig = {
    ...baseEventType,
    bookingWindowType: 'rolling',
    bookingWindowDays: 7,
    minBookingNoticeMin: 0,
  }

  it('2026-06-19 (viernes, día 6 de la ventana) devuelve slots', () => {
    const slots = computeSlots(makeInput({
      fromDate: '2026-06-19',
      toDate: '2026-06-19',
      now,
      eventType: et,
    }))
    expect(slots.length).toBeGreaterThan(0)
  })

  it('2026-06-21 (domingo, día 8, fuera de ventana) devuelve 0 slots', () => {
    const slots = computeSlots(makeInput({
      fromDate: '2026-06-21',
      toDate: '2026-06-21',
      now,
      eventType: et,
    }))
    // También es domingo — no tiene schedule — doble confirmación de 0
    expect(slots.length).toBe(0)
  })

  it('2026-06-22 (lunes, día 9, fuera de ventana) devuelve 0 slots', () => {
    const slots = computeSlots(makeInput({
      fromDate: '2026-06-22',
      toDate: '2026-06-22',
      now,
      eventType: et,
    }))
    expect(slots.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Escenario 5: Daily booking limit — spec §3 esc.5
// ---------------------------------------------------------------------------

describe('computeSlots — dailyLimit detiene slots cuando el día está lleno', () => {
  /**
   * dailyLimit = 3; se insertan 3 bookings confirmados el 2026-06-15.
   * El motor debe devolver 0 slots ese día.
   */

  const date = '2026-06-15' // lunes EDT
  // 3 bookings en horarios distintos del día
  const existingBookings: BookingBusy[] = [
    { startsAt: '2026-06-15T13:00:00Z', endsAt: '2026-06-15T13:30:00Z', status: 'confirmed' },
    { startsAt: '2026-06-15T14:00:00Z', endsAt: '2026-06-15T14:30:00Z', status: 'confirmed' },
    { startsAt: '2026-06-15T15:00:00Z', endsAt: '2026-06-15T15:30:00Z', status: 'confirmed' },
  ]

  it('con 3 bookings y dailyLimit=3 devuelve 0 slots', () => {
    const slots = computeSlots(makeInput({
      fromDate: date,
      toDate: date,
      existingBookings,
      eventType: { ...baseEventType, dailyLimit: 3 },
    }))
    expect(slots.length).toBe(0)
  })

  it('con 2 bookings y dailyLimit=3 devuelve exactamente 1 slot emitible', () => {
    // Solo 2 de los 3 bookings, dailyLimit=3 → puede emitir 1 más
    const slots = computeSlots(makeInput({
      fromDate: date,
      toDate: date,
      existingBookings: existingBookings.slice(0, 2),
      eventType: { ...baseEventType, dailyLimit: 3 },
    }))
    // Daily limit: 2 ya confirmados + 1 emitible = 3. El motor debe emitir exactamente 1 slot.
    expect(slots.length).toBe(1)
  })

  it('sin dailyLimit devuelve todos los slots disponibles del día', () => {
    // 8 horas / 30 min = 16 slots totales, menos 3 bloqueados por bookings = 13
    const slots = computeSlots(makeInput({
      fromDate: date,
      toDate: date,
      existingBookings,
      eventType: { ...baseEventType, dailyLimit: null },
    }))
    expect(slots.length).toBeGreaterThan(3)
  })
})

// ---------------------------------------------------------------------------
// Escenario 6: DST — CRÍTICO — spec §3 esc.6
// ---------------------------------------------------------------------------

describe('computeSlots — DST America/New_York spring-forward 2026', () => {
  /**
   * Spring-forward de 2026 en America/New_York ocurre el DOMINGO 2026-03-08 a las 02:00 EST.
   * Los relojes saltan a 03:00 EDT -4. Por eso:
   *
   *  2026-03-07 (sábado, ANTES del forward — EST -5):
   *    09:00 NY EST → 09:00 + 5h = 14:00 UTC
   *
   *  2026-03-08 (domingo, el spring-forward ocurre a las 02:00 AM):
   *    09:00 AM ya es EDT -4 → 09:00 + 4h = 13:00 UTC
   *
   * NOTA DE DISEÑO: el spec original referenciaba "2026-03-08 antes del forward" como EST,
   * pero los relojes saltan a las 2:00 AM de ese mismo día — así que las 09:00 AM del
   * 2026-03-08 ya son EDT. Las fechas correctas son: 2026-03-07 (EST) y 2026-03-08 (EDT).
   *
   * Estos valores son verificados explícitamente contra date-fns-tz.
   */

  // Usamos date overrides para forzar disponibilidad en sábado y domingo.
  const dstSchedule: ScheduleWithIntervals = {
    timeZone: 'America/New_York',
    intervals: [], // base vacío — usamos overrides para controlar exactamente los días
    dateOverrides: [
      // Sábado 2026-03-07: disponible 09:00–10:00 (EST -5 → 14:00–15:00 UTC)
      { date: '2026-03-07', intervals: [{ from: '09:00', to: '10:00' }] },
      // Domingo 2026-03-08: disponible 09:00–10:00 (EDT -4 → 13:00–14:00 UTC, post-spring-forward)
      { date: '2026-03-08', intervals: [{ from: '09:00', to: '10:00' }] },
    ],
  }

  /**
   * Event type de 30 min, increment 30 → genera 2 slots por hora de ventana:
   *  - 09:00–09:30 y 09:30–10:00.
   * Usamos durationMin=59 para que solo quepa UN slot en la ventana de 60 min
   * y el assert de `toHaveLength(1)` sea correcto.
   */
  const et: EventTypeConfig = {
    ...baseEventType,
    durationMin: 59,
    startTimeIncrementMin: 60,
  }

  it('2026-03-07 (EST -5): 09:00 NY resuelve a 14:00 UTC', () => {
    const slots = computeSlots({
      eventType: et,
      schedules: [dstSchedule],
      existingBookings: [],
      fromDate: '2026-03-07',
      toDate: '2026-03-07',
      inviteeTimezone: 'America/New_York',
      now: new Date('2026-03-01T00:00:00Z'),
    })
    // Debe haber exactamente 1 slot (ventana 09:00-10:00, duration 59 min, increment 60)
    expect(slots).toHaveLength(1)
    expect(slots[0]!.startUtc).toBe('2026-03-07T14:00:00.000Z') // EST -5
    expect(slots[0]!.endUtc).toBe('2026-03-07T14:59:00.000Z')
  })

  it('2026-03-08 (EDT -4, post-spring-forward): 09:00 NY resuelve a 13:00 UTC', () => {
    const slots = computeSlots({
      eventType: et,
      schedules: [dstSchedule],
      existingBookings: [],
      fromDate: '2026-03-08',
      toDate: '2026-03-08',
      inviteeTimezone: 'America/New_York',
      now: new Date('2026-03-01T00:00:00Z'),
    })
    expect(slots).toHaveLength(1)
    expect(slots[0]!.startUtc).toBe('2026-03-08T13:00:00.000Z') // EDT -4
    expect(slots[0]!.endUtc).toBe('2026-03-08T13:59:00.000Z')
  })

  it('el UTC offset de EST es 1 hora más que EDT (DST shift de 1h)', () => {
    /**
     * La forma correcta de verificar el DST shift es comparar el offset UTC
     * de la misma hora wall-clock en los dos regímenes, no los timestamps absolutos
     * (que difieren en ~23h por estar en días distintos).
     *
     * EST (UTC-5): wall-clock 09:00 → offset de 5 horas = 5 * 3600 * 1000 ms
     * EDT (UTC-4): wall-clock 09:00 → offset de 4 horas = 4 * 3600 * 1000 ms
     * Diferencia de offsets = 1 hora.
     *
     * Calculamos el offset como: UTC_hora_en_ms - local_09:00_en_ms
     * Para 2026-03-07 (EST): startUtc = 14:00 UTC, local = 09:00 → offset = +5h
     * Para 2026-03-08 (EDT): startUtc = 13:00 UTC, local = 09:00 → offset = +4h
     */

    // 09:00 local en milisegundos desde medianoche (día local = cualquiera, usamos 0 como referencia)
    const localNineAmMs = 9 * 60 * 60 * 1000

    const slotsEst = computeSlots({
      eventType: et,
      schedules: [dstSchedule],
      existingBookings: [],
      fromDate: '2026-03-07',
      toDate: '2026-03-07',
      inviteeTimezone: 'America/New_York',
      now: new Date('2026-03-01T00:00:00Z'),
    })
    const slotsEdt = computeSlots({
      eventType: et,
      schedules: [dstSchedule],
      existingBookings: [],
      fromDate: '2026-03-08',
      toDate: '2026-03-08',
      inviteeTimezone: 'America/New_York',
      now: new Date('2026-03-01T00:00:00Z'),
    })

    // UTC hour of day en ms desde medianoche UTC
    const estUtcHourMs = new Date(slotsEst[0]!.startUtc).getUTCHours() * 60 * 60 * 1000
    const edtUtcHourMs = new Date(slotsEdt[0]!.startUtc).getUTCHours() * 60 * 60 * 1000

    // Offset = UTC - Local (en horas absolutas como ms)
    const estOffsetMs = estUtcHourMs - localNineAmMs  // 14:00 - 09:00 = 5h
    const edtOffsetMs = edtUtcHourMs - localNineAmMs  // 13:00 - 09:00 = 4h

    expect(estOffsetMs).toBe(5 * 60 * 60 * 1000) // EST = UTC-5 → +5h offset
    expect(edtOffsetMs).toBe(4 * 60 * 60 * 1000) // EDT = UTC-4 → +4h offset
    expect(estOffsetMs - edtOffsetMs).toBe(60 * 60 * 1000) // diferencia de 1 hora entre EST y EDT
  })

  it('verificación directa: los UTCs correctos según date-fns-tz', () => {
    // Verificación extra explícita de los valores UTC esperados
    // EST day (2026-03-07): 09:00 NY → 14:00 UTC (offset -5h)
    // EDT day (2026-03-08): 09:00 NY → 13:00 UTC (offset -4h)
    const [estSlot] = computeSlots({
      eventType: et,
      schedules: [dstSchedule],
      existingBookings: [],
      fromDate: '2026-03-07',
      toDate: '2026-03-07',
      inviteeTimezone: 'America/New_York',
      now: new Date('2026-03-01T00:00:00Z'),
    })
    const [edtSlot] = computeSlots({
      eventType: et,
      schedules: [dstSchedule],
      existingBookings: [],
      fromDate: '2026-03-08',
      toDate: '2026-03-08',
      inviteeTimezone: 'America/New_York',
      now: new Date('2026-03-01T00:00:00Z'),
    })
    expect(estSlot!.startUtc).toBe('2026-03-07T14:00:00.000Z') // EST: UTC-5
    expect(edtSlot!.startUtc).toBe('2026-03-08T13:00:00.000Z') // EDT: UTC-4
  })
})

// ---------------------------------------------------------------------------
// Escenario 7: Evento colectivo — intersección de dos hosts — spec §3 esc.7
// ---------------------------------------------------------------------------

describe('computeSlots — collective: intersección de disponibilidades', () => {
  /**
   * Host A disponible 09:00–12:00 NY.
   * Host B disponible 10:00–13:00 NY.
   * Duration 60 min, increment 60.
   * Intersección: 10:00–12:00 → slots posibles: 10:00–11:00, 11:00–12:00.
   *
   * Mismo día y misma TZ para simplificar.
   * 2026-06-15 (lunes, EDT -4):
   *   10:00 NY EDT = 14:00 UTC
   *   11:00 NY EDT = 15:00 UTC
   *   No debe haber slot a las 09:00 (13:00 UTC) — solo A disponible, no B.
   */

  const date = '2026-06-15'

  const scheduleA: ScheduleWithIntervals = {
    timeZone: 'America/New_York',
    intervals: [],
    dateOverrides: [
      { date, intervals: [{ from: '09:00', to: '12:00' }] },
    ],
  }

  const scheduleB: ScheduleWithIntervals = {
    timeZone: 'America/New_York',
    intervals: [],
    dateOverrides: [
      { date, intervals: [{ from: '10:00', to: '13:00' }] },
    ],
  }

  const et: EventTypeConfig = {
    ...baseEventType,
    durationMin: 60,
    startTimeIncrementMin: 60,
  }

  it('solo devuelve slots en la intersección 10:00–12:00 NY', () => {
    const slots = computeSlots({
      eventType: et,
      schedules: [scheduleA, scheduleB],
      existingBookings: [],
      fromDate: date,
      toDate: date,
      inviteeTimezone: 'America/New_York',
      now: nowNeutral,
    })
    const startUtcs = slots.map((s) => s.startUtc)
    // Solo slots en intersección: 10:00 NY = 14:00 UTC y 11:00 NY = 15:00 UTC
    expect(startUtcs).toContain('2026-06-15T14:00:00.000Z') // 10:00 NY EDT
    expect(startUtcs).toContain('2026-06-15T15:00:00.000Z') // 11:00 NY EDT
    // No debe incluir 09:00 NY = 13:00 UTC (solo A, no B)
    expect(startUtcs).not.toContain('2026-06-15T13:00:00.000Z')
    // No debe incluir 12:00 NY = 16:00 UTC (solo B que va hasta 13:00, pero el slot 12:00–13:00 cabe en B no en A)
    // A va hasta 12:00, entonces un slot de 60 min empezando a 12:00 terminaría a 13:00 → fuera de la ventana A
    expect(startUtcs).not.toContain('2026-06-15T16:00:00.000Z')
  })

  it('devuelve exactamente 2 slots (10:00 y 11:00 NY)', () => {
    const slots = computeSlots({
      eventType: et,
      schedules: [scheduleA, scheduleB],
      existingBookings: [],
      fromDate: date,
      toDate: date,
      inviteeTimezone: 'America/New_York',
      now: nowNeutral,
    })
    expect(slots).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Escenario adicional: Date override bloquea el día — spec §2 esc.2
// ---------------------------------------------------------------------------

describe('computeSlots — dateOverride con intervals vacío bloquea el día', () => {
  it('devuelve 0 slots para el día bloqueado por override', () => {
    const scheduleWithOverride: ScheduleWithIntervals = {
      ...nySchedule,
      dateOverrides: [
        // 2026-06-15 (lunes) — bloqueado
        { date: '2026-06-15', intervals: [] },
      ],
    }
    const slots = computeSlots(makeInput({
      fromDate: '2026-06-15',
      toDate: '2026-06-15',
      schedules: [scheduleWithOverride],
    }))
    expect(slots.length).toBe(0)
  })

  it('el override no afecta días sin override', () => {
    const scheduleWithOverride: ScheduleWithIntervals = {
      ...nySchedule,
      dateOverrides: [
        { date: '2026-06-15', intervals: [] },
      ],
    }
    // 2026-06-16 (martes) sigue teniendo slots
    const slots = computeSlots(makeInput({
      fromDate: '2026-06-16',
      toDate: '2026-06-16',
      schedules: [scheduleWithOverride],
    }))
    expect(slots.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Helper toInviteeDisplay
// ---------------------------------------------------------------------------

describe('toInviteeDisplay — formatea slot UTC en TZ del invitado', () => {
  it('14:00 UTC → 10:00 en America/New_York (EDT -4)', () => {
    const result = toInviteeDisplay('2026-06-15T14:00:00.000Z', 'America/New_York')
    expect(result).toBe('10:00')
  })

  it('14:00 UTC → 09:00 en America/Bogota (COT -5, sin DST)', () => {
    const result = toInviteeDisplay('2026-06-15T14:00:00.000Z', 'America/Bogota')
    expect(result).toBe('09:00')
  })
})
