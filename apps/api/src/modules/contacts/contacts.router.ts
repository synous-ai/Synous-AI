import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { ListQuerySchema, IdParamSchema } from '../../lib/crm-schemas'
import { SearchBodySchema } from '../../lib/filter'
import { CreateContactSchema, UpdateContactSchema } from './contacts.schema'
import { listContacts, getContact, getContactDetail, searchContacts, createContact, updateContact, archiveContact } from './contacts.service'
import { ADMIN_SECURITY } from '../../lib/http'

const TAG = 'Contactos'
const security = ADMIN_SECURITY

export async function contactsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    { schema: { tags: [TAG], summary: 'Listar contactos', description: 'Listado paginado por cursor (no archivados).', security, querystring: ListQuerySchema } },
    async (request) => {
      const { items, nextCursor } = await listContacts(request.hubUser!.portalId, request.query)
      return ok(items, { nextCursor })
    },
  )

  r.get(
    '/:id',
    { schema: { tags: [TAG], summary: 'Obtener contacto', description: 'Devuelve un contacto por id.', security, params: IdParamSchema } },
    async (request) => {
      return ok(await getContact(request.hubUser!.portalId, request.params.id))
    },
  )

  r.get(
    '/:id/detail',
    {
      schema: {
        tags: [TAG],
        summary: 'Detalle completo del contacto',
        description: 'Contacto + deals + notas + tareas + historial. Alimenta el User Detail.',
        security,
        params: IdParamSchema,
      },
    },
    async (request) => ok(await getContactDetail(request.hubUser!.portalId, request.params.id)),
  )

  r.post(
    '/search',
    {
      schema: {
        tags: [TAG],
        summary: 'Búsqueda avanzada de contactos',
        description:
          'Filtra contactos con un filterBranch: árbol and/or de condiciones {field, operator, value} sobre campos permitidos (firstName, lastName, email, phone, jobTitle, lifecycleStage, companyId, ownerId, createdAt).',
        security,
        body: SearchBodySchema,
      },
    },
    async (request) => {
      const { items, nextCursor } = await searchContacts(request.hubUser!.portalId, request.body)
      return ok(items, { nextCursor })
    },
  )

  r.post(
    '/',
    { schema: { tags: [TAG], summary: 'Crear contacto', description: 'Crea un contacto. Requiere rol owner o member.', security, body: CreateContactSchema }, preHandler: [authorize('owner', 'member')] },
    async (request, reply) => {
      const created = await createContact(request.hubUser!.portalId, request.hubUser!.sub, request.body)
      return reply.status(201).send(ok(created))
    },
  )

  r.patch(
    '/:id',
    { schema: { tags: [TAG], summary: 'Actualizar contacto', description: 'Actualiza campos del contacto y registra los cambios en record_history. Requiere owner o member.', security, params: IdParamSchema, body: UpdateContactSchema }, preHandler: [authorize('owner', 'member')] },
    async (request) => {
      return ok(await updateContact(request.hubUser!.portalId, request.hubUser!.sub, request.params.id, request.body))
    },
  )

  r.delete(
    '/:id',
    { schema: { tags: [TAG], summary: 'Archivar contacto', description: 'Soft delete (archived = true). Requiere rol owner.', security, params: IdParamSchema }, preHandler: [authorize('owner')] },
    async (request) => {
      await archiveContact(request.hubUser!.portalId, request.hubUser!.sub, request.params.id)
      return ok({ success: true })
    },
  )
}
