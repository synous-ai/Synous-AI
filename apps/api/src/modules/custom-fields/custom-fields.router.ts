import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { IdParamSchema } from '../../lib/crm-schemas'
import {
  CreateCustomFieldSchema,
  UpdateCustomFieldSchema,
  ListCustomFieldsQuerySchema,
} from './custom-fields.schema'
import {
  listCustomFields,
  createCustomField,
  updateCustomField,
  archiveCustomField,
} from './custom-fields.service'
import { ADMIN_SECURITY } from '../../lib/http'

const TAG = 'Configuración'
const security = ADMIN_SECURITY

export async function customFieldsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar campos personalizados',
        description:
          'Lista las definiciones de campos personalizados del portal. Los valores reales viven en el jsonb `custom` de cada entidad.',
        security,
        querystring: ListCustomFieldsQuerySchema,
      },
    },
    async (request) => {
      const fields = await listCustomFields(request.hubUser!.portalId, request.query)
      return ok(fields)
    },
  )

  r.post(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Crear campo personalizado',
        description:
          'Crea una nueva definición de campo personalizado. La clave (key) debe ser única por portal + entidad. Requiere rol owner o member.',
        security,
        body: CreateCustomFieldSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request, reply) => {
      const created = await createCustomField(request.hubUser!.portalId, request.body)
      return reply.status(201).send(ok(created))
    },
  )

  r.patch(
    '/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Actualizar campo personalizado',
        description:
          'Actualiza label, fieldType, options o displayOrder. La entityType y key no se pueden cambiar. Requiere rol owner o member.',
        security,
        params: IdParamSchema,
        body: UpdateCustomFieldSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) => {
      return ok(await updateCustomField(request.hubUser!.portalId, request.params.id, request.body))
    },
  )

  r.delete(
    '/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Archivar campo personalizado',
        description:
          'Archiva el campo (soft delete). Los valores ya guardados en el jsonb `custom` de las entidades no se borran. Requiere rol owner o member.',
        security,
        params: IdParamSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) => {
      await archiveCustomField(request.hubUser!.portalId, request.params.id)
      return ok({ success: true })
    },
  )
}
