import { z } from 'zod'

/**
 * Validador de zona horaria IANA reutilizable.
 * Se usa en CreateBookingSchema y RescheduleByTokenSchema.
 */
const ianaTimezone = z.string().refine(
  (tz) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz })
      return true
    } catch {
      return false
    }
  },
  { message: 'Zona horaria IANA inválida (ej. America/Bogota, Europe/Madrid)' },
)

/**
 * Body para crear un booking público (POST /:portalId/:eventSlug/book).
 *
 * El invitado envía sus datos, el slot elegido (en UTC) y las respuestas
 * a las custom questions del meeting type. El campo guestEmails permite
 * agregar invitados adicionales para reuniones grupales.
 */
export const CreateBookingSchema = z.object({
  /** Nombre del invitado principal. */
  guestName: z.string().min(1, 'El nombre es requerido'),
  /** Email del invitado principal. */
  guestEmail: z.string().email('Email inválido'),
  /** Inicio del slot elegido — ISO 8601 UTC. */
  startsAt: z.string().datetime({ message: 'startsAt debe ser ISO 8601 UTC' }),
  /** Zona horaria IANA del invitado (para mostrar la hora en sus emails). */
  inviteeTimeZone: ianaTimezone,
  /** Respuestas del invitado a las customQuestions del meeting type (clave → valor). */
  questionAnswers: z.record(z.string()).optional().default({}),
  /** Emails de invitados adicionales para reuniones grupales. */
  guestEmails: z.array(z.string().email()).optional().default([]),
  /** Notas libres del invitado (ej. contexto de la reunión). */
  notes: z.string().optional(),
})
export type CreateBookingDTO = z.infer<typeof CreateBookingSchema>

/**
 * Body para cancelar un booking sin autenticación (POST /booking/cancel).
 *
 * El token de cancelación se recibe en el body (no en la URL) para evitar
 * que quede en logs de proxy/CDN y para no confundir al router de Fastify
 * con los puntos del JWT en segmentos de ruta.
 */
export const CancelBookingSchema = z.object({
  /** JWT de tipo 'booking-cancel' enviado al invitado en el email de confirmación. */
  token: z.string().min(1, 'El token es requerido'),
  /** Motivo opcional de cancelación (para log interno). */
  reason: z.string().optional(),
})
export type CancelBookingDTO = z.infer<typeof CancelBookingSchema>

/**
 * Body para reprogramar un booking sin autenticación (POST /booking/reschedule).
 *
 * El token de reschedule se recibe en el body por las mismas razones que CancelBookingSchema.
 * El invitado elige un nuevo slot (newStartsAt en UTC) y puede actualizar su TZ.
 */
export const RescheduleByTokenSchema = z.object({
  /** JWT de tipo 'booking-reschedule' enviado al invitado en el email de confirmación. */
  token: z.string().min(1, 'El token es requerido'),
  /** Nuevo inicio del slot elegido — ISO 8601 UTC. */
  newStartsAt: z.string().datetime({ message: 'newStartsAt debe ser ISO 8601 UTC' }),
  /** Zona horaria IANA actualizada del invitado (opcional; si no viene, se mantiene la original). */
  inviteeTimeZone: ianaTimezone.optional(),
})
export type RescheduleByTokenDTO = z.infer<typeof RescheduleByTokenSchema>

export const CreateMeetingTypeSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  durationMin: z.number().int().positive(),
  bufferMin: z.number().int().min(0).optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
})
export type CreateMeetingTypeDTO = z.infer<typeof CreateMeetingTypeSchema>

export const UpdateMeetingTypeSchema = CreateMeetingTypeSchema.partial()
export type UpdateMeetingTypeDTO = z.infer<typeof UpdateMeetingTypeSchema>

export const CreateAvailabilityRuleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  timeZone: z.string().optional(),
})
export type CreateAvailabilityRuleDTO = z.infer<typeof CreateAvailabilityRuleSchema>

// ── Schemas V2: Availability Schedules ─────────────────────────────────────────

/** Crea un schedule de disponibilidad nombrado. */
export const CreateScheduleSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  timeZone: z.string().min(1, 'La zona horaria es requerida'),
  isDefault: z.boolean().optional(),
})
export type CreateScheduleDTO = z.infer<typeof CreateScheduleSchema>

/** Actualiza parcialmente un schedule. */
export const UpdateScheduleSchema = CreateScheduleSchema.partial()
export type UpdateScheduleDTO = z.infer<typeof UpdateScheduleSchema>

/** Params para rutas que reciben scheduleId. */
export const ScheduleParamSchema = z.object({
  scheduleId: z.string().min(1),
})

/** Params para rutas que reciben scheduleId + intervalId. */
export const ScheduleIntervalParamSchema = z.object({
  scheduleId: z.string().min(1),
  intervalId: z.string().min(1),
})

/** Params para rutas que reciben scheduleId + overrideId. */
export const ScheduleOverrideParamSchema = z.object({
  scheduleId: z.string().min(1),
  overrideId: z.string().min(1),
})

/** Un único intervalo semanal: día + hora de inicio y fin. */
export const IntervalInputSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
})
export type IntervalInputDTO = z.infer<typeof IntervalInputSchema>

/** Body para agregar un intervalo individual a un schedule. */
export const CreateIntervalSchema = IntervalInputSchema
export type CreateIntervalDTO = z.infer<typeof CreateIntervalSchema>

/** Body para reemplazar atómicamente todos los intervalos de un schedule. */
export const ReplaceIntervalsSchema = z.object({
  intervals: z.array(IntervalInputSchema),
})
export type ReplaceIntervalsDTO = z.infer<typeof ReplaceIntervalsSchema>

/** Un rango horario de un date override: { from: 'HH:MM', to: 'HH:MM' }. */
const TimeRangeSchema = z.object({
  from: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  to: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
})

/** Body para upsert de un date override. intervals=[] bloquea el día. */
export const DateOverrideInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
  intervals: z.array(TimeRangeSchema),
})
export type DateOverrideInputDTO = z.infer<typeof DateOverrideInputSchema>

// ── Schemas V2: Event Types ────────────────────────────────────────────────────

/**
 * Pregunta personalizada del formulario de booking.
 * Se almacena en la columna customQuestions (jsonb).
 */
const CustomQuestionSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['text', 'textarea', 'select', 'phone']),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
})

/** Locación de reunión configurada en el event type. */
const MeetingLocationSchema = z.object({
  type: z.enum(['video', 'phone', 'in_person', 'custom']),
  value: z.string().optional(),
})

/** Body para crear un event type V2 con todos los campos. */
export const CreateEventTypeV2Schema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  slug: z.string().optional(),
  durationMin: z.number().int().positive(),
  kind: z.enum(['solo', 'group']).optional().default('solo'),
  poolingType: z.enum(['collective']).nullable().optional(),
  color: z.string().optional().default('#3b82f6'),
  secret: z.boolean().optional().default(false),
  description: z.string().optional(),
  isActive: z.boolean().optional().default(true),
  locations: z.array(MeetingLocationSchema).optional().default([]),
  customQuestions: z.array(CustomQuestionSchema).optional().default([]),
  startTimeIncrementMin: z.number().int().positive().optional().default(30),
  minBookingNoticeMin: z.number().int().min(0).optional().default(240),
  bookingWindowType: z.enum(['rolling', 'range', 'unlimited']).optional().default('rolling'),
  bookingWindowDays: z.number().int().positive().nullable().optional(),
  bookingWindowStart: z.string().nullable().optional(),
  bookingWindowEnd: z.string().nullable().optional(),
  bufferBeforeMin: z.number().int().min(0).optional().default(0),
  bufferAfterMin: z.number().int().min(0).optional().default(0),
  dailyLimit: z.number().int().positive().nullable().optional(),
  maxInvitees: z.number().int().positive().optional(),
  availabilityScheduleId: z.string().nullable().optional(),
  hostIds: z.array(z.string()).optional(),
})
export type CreateEventTypeV2DTO = z.infer<typeof CreateEventTypeV2Schema>

/** Body para actualizar parcialmente un event type V2. */
export const UpdateEventTypeV2Schema = CreateEventTypeV2Schema.partial()
export type UpdateEventTypeV2DTO = z.infer<typeof UpdateEventTypeV2Schema>

// ── Schemas V2: Bookings admin ─────────────────────────────────────────────────

/** Query params para la vista semanal de bookings del admin. */
export const WeekBookingsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
})
