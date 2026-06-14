// ---------------------------------------------------------------------------
// TIPOS LEGACY (mantener para no romper los hooks existentes)
// ---------------------------------------------------------------------------

export interface MeetingType {
  id: string
  name: string
  slug: string
  durationMin: number
  bufferMin: number
  location: string | null
  description: string | null
  isActive: boolean
}

export interface AvailabilityRule {
  id: string
  ownerId: string
  dayOfWeek: number
  startTime: string
  endTime: string
  timeZone: string
}

export interface Booking {
  id: string
  guestName: string
  guestEmail: string
  startsAt: string
  endsAt: string
  status: string
  meetLink: string | null
  meetingTypeName: string
}

// ---------------------------------------------------------------------------
// TIPOS F4a — Modelo nuevo (Availability Schedules + Event Types V2)
// ---------------------------------------------------------------------------

/** Intervalo semanal de disponibilidad */
export interface AvailabilityInterval {
  id: string
  scheduleId: string
  dayOfWeek: number // 0=domingo … 6=sábado
  startTime: string // 'HH:mm:ss' (Drizzle devuelve con segundos)
  endTime: string
}

/** Override para una fecha específica. intervals=[] = día bloqueado. */
export interface DateOverride {
  id: string
  scheduleId: string
  date: string // 'YYYY-MM-DD'
  intervals: Array<{ from: string; to: string }>
}

/** Schedule de disponibilidad (con intervalos y overrides embebidos) */
export interface AvailabilitySchedule {
  id: string
  ownerId: string
  portalId: string
  name: string
  timeZone: string // IANA
  isDefault: boolean
  intervals: AvailabilityInterval[]
  dateOverrides: DateOverride[]
}

/** Pregunta personalizada del booking form */
export interface CustomQuestion {
  id: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'phone'
  required: boolean
  options?: string[]
}

/** Locación de reunión */
export interface MeetingLocation {
  type: 'video' | 'phone' | 'in_person' | 'custom'
  value?: string
}

/** Event type completo con todos los campos V2 */
export interface EventTypeV2 {
  id: string
  portalId: string
  ownerId: string
  slug: string
  name: string
  durationMin: number
  kind: string // 'solo' | 'group'
  poolingType: string | null // 'collective' | null
  color: string
  secret: boolean
  description: string | null
  isActive: boolean
  locations: MeetingLocation[]
  customQuestions: CustomQuestion[]
  startTimeIncrementMin: number
  minBookingNoticeMin: number
  bookingWindowType: string // 'rolling' | 'range' | 'unlimited'
  bookingWindowDays: number | null
  bookingWindowStart: string | null
  bookingWindowEnd: string | null
  bufferBeforeMin: number
  bufferAfterMin: number
  dailyLimit: number | null
  maxInvitees: number | null
  availabilityScheduleId: string | null
  hosts: string[] // hostIds (memberships)
}

// ---------------------------------------------------------------------------
// TIPOS F4b — Vista semanal y gestión admin de bookings
// ---------------------------------------------------------------------------

/** Booking enriquecido para la grilla semanal del admin */
export interface WeekBooking {
  id: string
  guestName: string
  guestEmail: string
  startsAt: string
  endsAt: string
  status: string
  meetLink: string | null
  inviteeTimeZone: string
  meetingTypeName: string
  meetingTypeColor: string | null
}

// Payloads de entrada para mutaciones

export interface CreateScheduleInput {
  name: string
  timeZone: string
  isDefault?: boolean
}

export interface UpdateScheduleInput {
  name?: string
  timeZone?: string
  isDefault?: boolean
}

export interface CreateIntervalInput {
  dayOfWeek: number
  startTime: string
  endTime: string
}

export interface DateOverrideInput {
  date: string
  intervals: Array<{ from: string; to: string }>
}

export interface CreateEventTypeV2Input {
  name: string
  slug?: string
  durationMin: number
  kind?: 'solo' | 'group'
  poolingType?: 'collective' | null
  color?: string
  secret?: boolean
  description?: string
  isActive?: boolean
  locations?: MeetingLocation[]
  customQuestions?: CustomQuestion[]
  startTimeIncrementMin?: number
  minBookingNoticeMin?: number
  bookingWindowType?: 'rolling' | 'range' | 'unlimited'
  bookingWindowDays?: number
  bookingWindowStart?: string | null
  bookingWindowEnd?: string | null
  bufferBeforeMin?: number
  bufferAfterMin?: number
  dailyLimit?: number | null
  maxInvitees?: number
  availabilityScheduleId?: string | null
  hostIds?: string[]
}

export type UpdateEventTypeV2Input = Partial<CreateEventTypeV2Input>
