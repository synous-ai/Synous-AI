/**
 * calendar.public.router.ts — Rutas PÚBLICAS del motor de scheduling
 *
 * Sin autenticación de hub_user. Expuestas bajo `/api/public/calendar`.
 * Son las rutas que consume el invitado (cliente / prospecto) para:
 *  - Ver la metadata del event type
 *  - Consultar slots disponibles
 *  - Crear un booking
 *
 * Patrón de registro: igual a proposalPublicRoutes.
 * El JSON parser de Fastify (ya registrado globalmente) maneja el body —
 * NO se necesita rawBody (eso es solo para webhooks con firma HMAC).
 *
 * Resolución de portal: por portalId directo (la tabla `portal` no tiene
 * columna `slug` — decisión de diseño confirmada en F1).
 */

import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ok } from '../../lib/response'
import { CreateBookingSchema, CancelBookingSchema, RescheduleByTokenSchema } from './calendar.schema'
import {
  getPublicEventType,
  getPublicSlots,
  createPublicBooking,
  cancelPublicBooking,
  reschedulePublicBooking,
} from './calendar.service'

const TAG = 'Calendario Público'

/** Validador inline para zona horaria IANA (reutilizado en querystring). */
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

/** Params comunes a las 3 rutas: portalId + eventSlug */
const EventTypeParamsSchema = z.object({
  portalId: z.string().min(1, 'portalId requerido'),
  eventSlug: z.string().min(1, 'eventSlug requerido'),
})

/**
 * Rutas públicas de calendario.
 * Registradas en app.ts bajo `/api/public/calendar`.
 *
 * Rutas:
 *  GET  /:portalId/:eventSlug          → metadata del event type
 *  GET  /:portalId/:eventSlug/slots    → slots disponibles (UTC + display en TZ del invitado)
 *  POST /:portalId/:eventSlug/book     → crear booking (anti-overlap via constraint PG + 409)
 */
export async function calendarPublicRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()

  // Anti-spam más estricto que el global para el endpoint de booking
  // (cada POST crea un registro confirmado y dispara notificaciones).
  // El GET de slots es más permisivo porque es consultivo.

  /**
   * GET /:portalId/:eventSlug
   *
   * Devuelve la metadata pública del event type: nombre, duración, descripción,
   * locaciones, preguntas custom, color, kind, hosts.
   *
   * Los event types con secret=true no aparecen en listados pero sí responden
   * a este endpoint (el invitado llega por URL directa compartida por el host).
   * Si el event type no existe o está inactivo → 404.
   */
  r.get(
    '/:portalId/:eventSlug',
    {
      schema: {
        tags: [TAG],
        summary: 'Metadata pública de un event type (sin auth)',
        description:
          'Devuelve nombre, duración, locaciones, preguntas custom y configuración de un event type activo. Disponible sin autenticación para que el invitado pueda cargar la página de booking.',
        params: EventTypeParamsSchema,
      },
      // Rate limit moderado: el frontend puede llamar esto al cargar la página
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request) => {
      const { portalId, eventSlug } = request.params
      return ok(await getPublicEventType(portalId, eventSlug))
    },
  )

  /**
   * GET /:portalId/:eventSlug/slots?from&to&tz
   *
   * Devuelve los slots disponibles en el rango [from, to] (YYYY-MM-DD) para
   * el event type, expresados en UTC y con el display en la TZ del invitado.
   *
   * Parámetros:
   *  - from: fecha de inicio 'YYYY-MM-DD'
   *  - to:   fecha de fin 'YYYY-MM-DD' (máx. from + 60 días para evitar sobrecarga)
   *  - tz:   zona horaria IANA del invitado
   */
  r.get(
    '/:portalId/:eventSlug/slots',
    {
      schema: {
        tags: [TAG],
        summary: 'Slots disponibles de un event type (sin auth)',
        description:
          'Calcula los slots libres del event type en el rango de fechas dado. Devuelve startUtc (UTC), endUtc (UTC) y startLocal (en la TZ del invitado).',
        params: EventTypeParamsSchema,
        querystring: z.object({
          from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from debe ser YYYY-MM-DD'),
          to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to debe ser YYYY-MM-DD'),
          tz: ianaTimezone,
        }),
      },
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { portalId, eventSlug } = request.params
      const { from, to, tz } = request.query

      // Guardia básica: no más de 90 días por request (anti-DoS en el motor de slots)
      const fromMs = new Date(from).getTime()
      const toMs = new Date(to).getTime()
      const maxRangeMs = 90 * 24 * 60 * 60 * 1000
      if (toMs - fromMs > maxRangeMs) {
        return reply.status(400).send({
          error: {
            code: 'BAD_REQUEST',
            message: 'El rango máximo de consulta es 90 días',
          },
        })
      }

      const slots = await getPublicSlots(portalId, eventSlug, from, to, tz)
      return ok({ slots })
    },
  )

  /**
   * POST /:portalId/:eventSlug/book
   *
   * Crea un booking confirmado para el slot pedido.
   *
   * Flujo:
   *  1. Validar Zod (guestName, guestEmail, startsAt ISO, inviteeTimeZone, answers).
   *  2. Recomputar que el slot sigue disponible (defensa lógica en service).
   *  3. INSERT booking en transacción → constraint EXCLUDE atrapa double-booking.
   *  4. PG error 23P01 → HTTP 409 con mensaje claro.
   *  5. Devuelve booking + cancelUrl + rescheduleUrl.
   *
   * Rate limit estricto: máx. 10 bookings por minuto por IP.
   */
  r.post(
    '/:portalId/:eventSlug/book',
    {
      schema: {
        tags: [TAG],
        summary: 'Crear un booking (sin auth)',
        description:
          'Reserva un slot para el event type dado. Devuelve el booking creado con las URLs de cancelación y reprogramación para autoservicio. Si el slot ya fue tomado por concurrencia → 409.',
        params: EventTypeParamsSchema,
        body: CreateBookingSchema,
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { portalId, eventSlug } = request.params

      // Armar la base URL del FRONTEND para los links de cancel/reschedule en los emails.
      // DISEÑO: usamos el origen del request (o env NEXT_PUBLIC_APP_URL si está configurado)
      // para que los links apunten al frontend Next.js (/book/cancel, /book/reschedule)
      // y no al API. En dev la API corre en :3001 pero el front en :3000.
      const protocol = request.headers['x-forwarded-proto'] ?? 'http'
      const frontendHost = process.env['NEXT_PUBLIC_APP_URL']
        ?? `${protocol}://${request.headers['x-forwarded-host'] ?? 'localhost:3000'}`
      // baseUrl = raíz del frontend (sin trailing slash)
      const baseUrl = frontendHost.endsWith('/') ? frontendHost.slice(0, -1) : frontendHost

      const result = await createPublicBooking(portalId, eventSlug, request.body, baseUrl)
      return reply.status(201).send(ok(result))
    },
  )

  /**
   * POST /booking/cancel
   *
   * Cancela un booking usando el token firmado enviado en el email de confirmación.
   *
   * DISEÑO: El token va en el BODY (no en la URL) por dos razones:
   *  1. Los JWT contienen '.' que confunden el router de Fastify (find-my-way) cuando
   *     van en segmentos de ruta seguidos de más segmentos → 404 falso positivo.
   *  2. Los tokens en URLs quedan en logs de servidores y proxies → riesgo de seguridad.
   *
   * Seguridad:
   *  - El JWT debe ser válido y no expirado (TTL = hasta starts_at).
   *  - El `type` del payload debe ser exactamente 'booking-cancel'.
   *    Un token de reschedule NO sirve para cancelar (discriminador de tipo).
   *  - El token almacenado en la DB debe coincidir (revocación: el token se limpia
   *    al cancelar, así no puede usarse dos veces).
   *
   * Liberación del slot:
   *  El constraint EXCLUDE (booking_no_overlap) solo aplica a status='confirmed'.
   *  Al pasar a 'cancelled', el EXCLUDE deja de contar ese booking → el slot
   *  queda libre automáticamente para nuevas reservas.
   *
   * Respuestas:
   *  200 → cancelado OK
   *  401 → token inválido, expirado, mal tipo, o ya revocado
   *  404 → booking no encontrado
   *  409 → booking ya estaba cancelado
   */
  r.post(
    '/booking/cancel',
    {
      schema: {
        tags: [TAG],
        summary: 'Cancelar un booking por token (sin auth)',
        description:
          'Cancela el booking asociado al token firmado de cancelación. El token va en el body (no en la URL). El slot queda libre automáticamente (el constraint EXCLUDE solo aplica a status=confirmed).',
        body: CancelBookingSchema,
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { token } = request.body
      const result = await cancelPublicBooking(token)
      return reply.status(200).send(ok(result))
    },
  )

  /**
   * POST /booking/reschedule
   *
   * Reprograma un booking usando el token firmado de reschedule.
   *
   * DISEÑO: El token va en el BODY (no en la URL) — misma razón que /booking/cancel.
   *
   * Flujo:
   *  1. Verifica JWT (tipo 'booking-reschedule', no expirado, token coincide en DB).
   *  2. Valida que el nuevo slot está disponible.
   *  3. En transacción: marca el viejo como 'cancelled' + crea el nuevo (confirmed).
   *  4. PG 23P01 → 409 si el nuevo slot fue tomado por concurrencia.
   *  5. Devuelve el nuevo booking con nuevas URLs de cancel/reschedule.
   *
   * Body: { token, newStartsAt: ISO UTC, inviteeTimeZone?: IANA }
   *
   * Respuestas:
   *  201 → reprogramado OK (nuevo booking creado)
   *  400 → slot no disponible / minNotice / fuera de ventana
   *  401 → token inválido, expirado, mal tipo, o ya revocado
   *  404 → booking o event type no encontrado
   *  409 → slot nuevo tomado por concurrencia (doble booking)
   */
  r.post(
    '/booking/reschedule',
    {
      schema: {
        tags: [TAG],
        summary: 'Reprogramar un booking por token (sin auth)',
        description:
          'Cancela el booking original y crea uno nuevo en el slot indicado. El token va en el body (no en la URL). Devuelve el nuevo booking con nuevas URLs de autoservicio.',
        body: RescheduleByTokenSchema,
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { token, ...rescheduleData } = request.body

      // Construir base URL del frontend (igual que en /book)
      const protocol = request.headers['x-forwarded-proto'] ?? 'http'
      const frontendHost = process.env['NEXT_PUBLIC_APP_URL']
        ?? `${protocol}://${request.headers['x-forwarded-host'] ?? 'localhost:3000'}`
      const baseUrl = frontendHost.endsWith('/') ? frontendHost.slice(0, -1) : frontendHost

      const result = await reschedulePublicBooking(token, rescheduleData, baseUrl)
      return reply.status(201).send(ok(result))
    },
  )
}
