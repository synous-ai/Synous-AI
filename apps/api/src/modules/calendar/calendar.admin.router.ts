/**
 * calendar.admin.router.ts — Rutas admin V2 del módulo de calendario.
 *
 * Implementa los endpoints F4a (schedules, intervals, overrides, event types V2)
 * y F4b (vista semanal de bookings + cancelación admin) que el frontend llama y
 * que faltaban en el router legacy (calendar.router.ts).
 *
 * Seguridad:
 *  - Todos los endpoints requieren autenticación de admin (hub_user) via `authenticate`.
 *  - Los endpoints de mutación requieren además `authorize('owner','member')`.
 *  - El scope se limita siempre al `portalId` del admin autenticado.
 */
import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { IdParamSchema } from '../../lib/crm-schemas'
import { ADMIN_SECURITY } from '../../lib/http'
import {
  CreateScheduleSchema,
  UpdateScheduleSchema,
  ScheduleParamSchema,
  ScheduleIntervalParamSchema,
  ScheduleOverrideParamSchema,
  CreateIntervalSchema,
  ReplaceIntervalsSchema,
  DateOverrideInputSchema,
  CreateEventTypeV2Schema,
  UpdateEventTypeV2Schema,
  WeekBookingsQuerySchema,
} from './calendar.schema'
import {
  listSchedules,
  getSchedule,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  addScheduleInterval,
  replaceScheduleIntervals,
  deleteScheduleInterval,
  upsertDateOverride,
  deleteDateOverride,
  listEventTypesV2,
  getEventTypeV2,
  createEventTypeV2,
  updateEventTypeV2,
  deleteEventTypeV2,
  listWeekBookings,
  cancelAdminBooking,
} from './calendar.service'

const TAG = 'Calendario Admin V2'
const security = ADMIN_SECURITY

export async function calendarAdminRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()

  // Todos los endpoints de este router requieren autenticación de admin
  r.addHook('preHandler', authenticate)

  // ── F4a: Availability Schedules ─────────────────────────────────────────────

  /**
   * GET /schedules
   * Lista todos los schedules del portal con intervalos y dateOverrides embebidos.
   */
  r.get(
    '/schedules',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar schedules de disponibilidad del portal',
        security,
      },
    },
    async (request) => ok(await listSchedules(request.hubUser!.portalId)),
  )

  /**
   * GET /schedules/:id
   * Obtiene un schedule por ID con sus intervalos y dateOverrides.
   */
  r.get(
    '/schedules/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Obtener un schedule por ID',
        security,
        params: IdParamSchema,
      },
    },
    async (request) => ok(await getSchedule(request.hubUser!.portalId, request.params.id)),
  )

  /**
   * POST /schedules
   * Crea un nuevo schedule de disponibilidad.
   * Si es el primero del owner o isDefault=true, se marca como default
   * y se desactiva el default anterior (en transacción).
   */
  r.post(
    '/schedules',
    {
      schema: {
        tags: [TAG],
        summary: 'Crear schedule de disponibilidad',
        security,
        body: CreateScheduleSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request, reply) => {
      const created = await createSchedule(
        request.hubUser!.portalId,
        request.hubUser!.sub,
        request.body,
      )
      return reply.status(201).send(ok(created))
    },
  )

  /**
   * PATCH /schedules/:id
   * Actualiza nombre, timezone o isDefault de un schedule.
   */
  r.patch(
    '/schedules/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Actualizar schedule',
        security,
        params: IdParamSchema,
        body: UpdateScheduleSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) =>
      ok(await updateSchedule(request.hubUser!.portalId, request.params.id, request.body)),
  )

  /**
   * DELETE /schedules/:id
   * Elimina un schedule del portal (los intervalos y overrides se borran por CASCADE).
   */
  r.delete(
    '/schedules/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Eliminar schedule',
        security,
        params: IdParamSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) => {
      await deleteSchedule(request.hubUser!.portalId, request.params.id)
      return ok({ success: true })
    },
  )

  // ── F4a: Intervals ───────────────────────────────────────────────────────────

  /**
   * POST /schedules/:scheduleId/intervals
   * Agrega un único intervalo semanal a un schedule.
   */
  r.post(
    '/schedules/:scheduleId/intervals',
    {
      schema: {
        tags: [TAG],
        summary: 'Agregar intervalo a un schedule',
        security,
        params: ScheduleParamSchema,
        body: CreateIntervalSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request, reply) => {
      const created = await addScheduleInterval(
        request.hubUser!.portalId,
        request.params.scheduleId,
        request.body,
      )
      return reply.status(201).send(ok(created))
    },
  )

  /**
   * PATCH /schedules/:scheduleId/intervals
   * Reemplaza ATÓMICAMENTE todos los intervalos del schedule.
   * Body: { intervals: [{dayOfWeek, startTime, endTime}, ...] }
   */
  r.patch(
    '/schedules/:scheduleId/intervals',
    {
      schema: {
        tags: [TAG],
        summary: 'Reemplazar todos los intervalos de un schedule (atómico)',
        security,
        params: ScheduleParamSchema,
        body: ReplaceIntervalsSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) =>
      ok(
        await replaceScheduleIntervals(
          request.hubUser!.portalId,
          request.params.scheduleId,
          request.body,
        ),
      ),
  )

  /**
   * DELETE /schedules/:scheduleId/intervals/:intervalId
   * Elimina un intervalo individual de un schedule.
   */
  r.delete(
    '/schedules/:scheduleId/intervals/:intervalId',
    {
      schema: {
        tags: [TAG],
        summary: 'Eliminar un intervalo de un schedule',
        security,
        params: ScheduleIntervalParamSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) => {
      await deleteScheduleInterval(
        request.hubUser!.portalId,
        request.params.scheduleId,
        request.params.intervalId,
      )
      return ok({ success: true })
    },
  )

  // ── F4a: Date Overrides ──────────────────────────────────────────────────────

  /**
   * POST /schedules/:scheduleId/overrides
   * Upsert de un date override para una fecha (crea o actualiza).
   * intervals=[] significa que el día está bloqueado.
   */
  r.post(
    '/schedules/:scheduleId/overrides',
    {
      schema: {
        tags: [TAG],
        summary: 'Upsert de date override en un schedule',
        security,
        params: ScheduleParamSchema,
        body: DateOverrideInputSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) =>
      ok(
        await upsertDateOverride(
          request.hubUser!.portalId,
          request.params.scheduleId,
          request.body,
        ),
      ),
  )

  /**
   * DELETE /schedules/:scheduleId/overrides/:overrideId
   * Elimina un date override de un schedule.
   */
  r.delete(
    '/schedules/:scheduleId/overrides/:overrideId',
    {
      schema: {
        tags: [TAG],
        summary: 'Eliminar un date override de un schedule',
        security,
        params: ScheduleOverrideParamSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) => {
      await deleteDateOverride(
        request.hubUser!.portalId,
        request.params.scheduleId,
        request.params.overrideId,
      )
      return ok({ success: true })
    },
  )

  // ── F4a: Event Types V2 ──────────────────────────────────────────────────────

  /**
   * GET /event-types
   * Lista todos los event types del portal (activos e inactivos) con sus hosts.
   */
  r.get(
    '/event-types',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar event types V2 del portal',
        security,
      },
    },
    async (request) => ok(await listEventTypesV2(request.hubUser!.portalId)),
  )

  /**
   * GET /event-types/:id
   * Obtiene un event type por ID con sus hosts.
   */
  r.get(
    '/event-types/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Obtener event type V2 por ID',
        security,
        params: IdParamSchema,
      },
    },
    async (request) => ok(await getEventTypeV2(request.hubUser!.portalId, request.params.id)),
  )

  /**
   * POST /event-types
   * Crea un event type V2 con todos los campos.
   * Para kind='group', insertará eventMembership por cada hostId en transacción.
   */
  r.post(
    '/event-types',
    {
      schema: {
        tags: [TAG],
        summary: 'Crear event type V2',
        security,
        body: CreateEventTypeV2Schema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request, reply) => {
      const created = await createEventTypeV2(
        request.hubUser!.portalId,
        request.hubUser!.sub,
        request.body,
      )
      return reply.status(201).send(ok(created))
    },
  )

  /**
   * PATCH /event-types/:id
   * Actualiza parcialmente un event type V2.
   * Si vienen hostIds, reemplaza las memberships en transacción.
   */
  r.patch(
    '/event-types/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Actualizar event type V2',
        security,
        params: IdParamSchema,
        body: UpdateEventTypeV2Schema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) =>
      ok(await updateEventTypeV2(request.hubUser!.portalId, request.params.id, request.body)),
  )

  /**
   * DELETE /event-types/:id
   * Elimina un event type del portal.
   */
  r.delete(
    '/event-types/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Eliminar event type V2',
        security,
        params: IdParamSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) => {
      await deleteEventTypeV2(request.hubUser!.portalId, request.params.id)
      return ok({ success: true })
    },
  )

  // ── F4b: Bookings admin ──────────────────────────────────────────────────────

  /**
   * GET /bookings/week?from=YYYY-MM-DD&to=YYYY-MM-DD
   * Devuelve los bookings del portal en el rango de fechas dado (vista semanal).
   * Incluye meetingTypeName y meetingTypeColor para la grilla del admin.
   *
   * IMPORTANTE: esta ruta debe registrarse ANTES de /bookings/:id/cancel para que
   * Fastify no confunda "week" con un ID de booking.
   */
  r.get(
    '/bookings/week',
    {
      schema: {
        tags: [TAG],
        summary: 'Bookings del portal en rango de fechas (vista semanal admin)',
        security,
        querystring: WeekBookingsQuerySchema,
      },
    },
    async (request) => {
      const { from, to } = request.query as z.infer<typeof WeekBookingsQuerySchema>
      return ok(await listWeekBookings(request.hubUser!.portalId, from, to))
    },
  )

  /**
   * POST /bookings/:id/cancel
   * Cancela un booking desde el panel de admin sin necesitar el token del invitado.
   * Verifica que el booking pertenece al portal del admin autenticado.
   * Devuelve { bookingId } al cancelar correctamente.
   */
  r.post(
    '/bookings/:id/cancel',
    {
      schema: {
        tags: [TAG],
        summary: 'Cancelar booking desde el admin',
        security,
        params: IdParamSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) =>
      ok(await cancelAdminBooking(request.hubUser!.portalId, request.params.id)),
  )
}
