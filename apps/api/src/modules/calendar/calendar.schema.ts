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
