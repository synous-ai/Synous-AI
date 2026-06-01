import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { IdParamSchema } from '../../lib/crm-schemas'
import { CreateMeetingTypeSchema, UpdateMeetingTypeSchema, CreateAvailabilityRuleSchema } from './calendar.schema'
import {
  listMeetingTypes,
  createMeetingType,
  updateMeetingType,
  deleteMeetingType,
  listAvailabilityRules,
  createAvailabilityRule,
  deleteAvailabilityRule,
  listBookings,
} from './calendar.service'
import { ADMIN_SECURITY } from '../../lib/http'

const TAG = 'Calendario'
const security = ADMIN_SECURITY

export async function calendarRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  // Tipos de reunión
  r.get(
    '/meeting-types',
    { schema: { tags: [TAG], summary: 'Listar tipos de reunión', security } },
    async (request) => ok(await listMeetingTypes(request.hubUser!.portalId)),
  )
  r.post(
    '/meeting-types',
    { schema: { tags: [TAG], summary: 'Crear tipo de reunión', security, body: CreateMeetingTypeSchema }, preHandler: [authorize('owner', 'member')] },
    async (request, reply) => {
      const created = await createMeetingType(request.hubUser!.portalId, request.hubUser!.sub, request.body)
      return reply.status(201).send(ok(created))
    },
  )
  r.patch(
    '/meeting-types/:id',
    { schema: { tags: [TAG], summary: 'Actualizar tipo de reunión', security, params: IdParamSchema, body: UpdateMeetingTypeSchema }, preHandler: [authorize('owner', 'member')] },
    async (request) => ok(await updateMeetingType(request.hubUser!.portalId, request.params.id, request.body)),
  )
  r.delete(
    '/meeting-types/:id',
    { schema: { tags: [TAG], summary: 'Eliminar tipo de reunión', security, params: IdParamSchema }, preHandler: [authorize('owner', 'member')] },
    async (request) => {
      await deleteMeetingType(request.hubUser!.portalId, request.params.id)
      return ok({ success: true })
    },
  )

  // Disponibilidad (del usuario autenticado)
  r.get(
    '/availability',
    { schema: { tags: [TAG], summary: 'Listar reglas de disponibilidad', description: 'Reglas semanales del usuario autenticado.', security } },
    async (request) => ok(await listAvailabilityRules(request.hubUser!.sub)),
  )
  r.post(
    '/availability',
    { schema: { tags: [TAG], summary: 'Crear regla de disponibilidad', security, body: CreateAvailabilityRuleSchema }, preHandler: [authorize('owner', 'member')] },
    async (request, reply) => {
      const created = await createAvailabilityRule(request.hubUser!.sub, request.body)
      return reply.status(201).send(ok(created))
    },
  )
  r.delete(
    '/availability/:id',
    { schema: { tags: [TAG], summary: 'Eliminar regla de disponibilidad', security, params: IdParamSchema }, preHandler: [authorize('owner', 'member')] },
    async (request) => {
      await deleteAvailabilityRule(request.hubUser!.sub, request.params.id)
      return ok({ success: true })
    },
  )

  // Reuniones agendadas
  r.get(
    '/bookings',
    { schema: { tags: [TAG], summary: 'Listar reuniones agendadas', security } },
    async (request) => ok(await listBookings(request.hubUser!.portalId)),
  )
}
