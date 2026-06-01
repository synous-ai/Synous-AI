import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { LogCallSchema, LogMeetingSchema, LogEmailSchema, TimelineQuerySchema } from './timeline.schema'
import { logCall, logMeeting, logEmail, getTimeline } from './timeline.service'
import { ADMIN_SECURITY } from '../../lib/http'

const TAG = 'Actividades'
const security = ADMIN_SECURITY

export async function timelineRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  // ── GET / — unified timeline ───────────────────────────────────────────
  r.get(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Timeline unificado',
        description:
          'Devuelve el timeline unificado (llamadas, reuniones, emails, notas, tareas, historial de cambios) para un deal, contacto o empresa. Exactamente uno de los tres filtros es requerido.',
        security,
        querystring: TimelineQuerySchema,
      },
    },
    async (request) => {
      const items = await getTimeline(request.hubUser!.portalId, request.query)
      return ok(items)
    },
  )

  // ── POST /calls ────────────────────────────────────────────────────────
  r.post(
    '/calls',
    {
      schema: {
        tags: [TAG],
        summary: 'Registrar llamada',
        description: 'Registra manualmente una llamada (entrante o saliente) asociada a un deal o contacto.',
        security,
        body: LogCallSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request, reply) => {
      const created = await logCall(
        request.hubUser!.portalId,
        request.hubUser!.sub,
        request.body,
      )
      return reply.status(201).send(ok(created))
    },
  )

  // ── POST /meetings ─────────────────────────────────────────────────────
  r.post(
    '/meetings',
    {
      schema: {
        tags: [TAG],
        summary: 'Registrar reunión',
        description: 'Registra manualmente una reunión asociada a un deal o contacto.',
        security,
        body: LogMeetingSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request, reply) => {
      const created = await logMeeting(
        request.hubUser!.portalId,
        request.hubUser!.sub,
        request.body,
      )
      return reply.status(201).send(ok(created))
    },
  )

  // ── POST /emails ───────────────────────────────────────────────────────
  r.post(
    '/emails',
    {
      schema: {
        tags: [TAG],
        summary: 'Registrar email enviado',
        description: 'Registra manualmente un email enviado (for logging purposes). El trackingId se genera automáticamente en la base de datos.',
        security,
        body: LogEmailSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request, reply) => {
      const created = await logEmail(
        request.hubUser!.portalId,
        request.hubUser!.sub,
        request.body,
      )
      return reply.status(201).send(ok(created))
    },
  )
}
