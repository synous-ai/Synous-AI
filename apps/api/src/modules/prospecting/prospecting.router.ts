import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { IdParamSchema } from '../../lib/crm-schemas'
import { ADMIN_SECURITY } from '../../lib/http'
import {
  RunSearchSchema,
  ListSearchesQuerySchema,
  ListProspectsQuerySchema,
  SuggestServicesSchema,
} from './prospecting.schema'
import {
  getProspectingCapabilities,
  suggestProspectingServices,
  runProspectSearch,
  listSearches,
  getSearchWithProspects,
  listProspects,
  importProspect,
  discardProspect,
} from './prospecting.service'

const TAG = 'Prospección'
const security = ADMIN_SECURITY

export async function prospectingRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/capabilities',
    {
      schema: {
        tags: [TAG],
        summary: 'Estado de configuración (Places / IA)',
        description: 'Indica si Google Places y Vertex AI están configurados en la API.',
        security,
      },
    },
    async () => ok(getProspectingCapabilities()),
  )

  r.post(
    '/suggest-services',
    {
      schema: {
        tags: [TAG],
        summary: 'Sugerir descripción de servicios de la agencia',
        description: 'Redacta con IA el perfil de "qué ofrecemos" a partir de notas opcionales.',
        security,
        body: SuggestServicesSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) => {
      const services = await suggestProspectingServices(request.body.hint)
      return ok({ services })
    },
  )

  r.post(
    '/search',
    {
      schema: {
        tags: [TAG],
        summary: 'Buscar y analizar prospectos',
        description:
          'Busca negocios en Google Places, extrae emails y genera una propuesta con IA. No envía nada.',
        security,
        body: RunSearchSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request, reply) => {
      const result = await runProspectSearch(
        request.hubUser!.portalId,
        request.hubUser!.sub,
        request.body,
      )
      return reply.status(201).send(ok(result))
    },
  )

  r.get(
    '/searches',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar búsquedas de prospección',
        security,
        querystring: ListSearchesQuerySchema,
      },
    },
    async (request) => {
      const { items, nextCursor } = await listSearches(request.hubUser!.portalId, request.query)
      return ok(items, { nextCursor })
    },
  )

  r.get(
    '/searches/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Detalle de una búsqueda + sus prospectos',
        security,
        params: IdParamSchema,
      },
    },
    async (request) => {
      const result = await getSearchWithProspects(request.hubUser!.portalId, request.params.id)
      return ok(result)
    },
  )

  r.get(
    '/prospects',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar prospectos',
        description: 'Filtrable por búsqueda (searchId) y estado (new/imported/discarded).',
        security,
        querystring: ListProspectsQuerySchema,
      },
    },
    async (request) => {
      const items = await listProspects(request.hubUser!.portalId, request.query)
      return ok(items)
    },
  )

  r.post(
    '/prospects/:id/import',
    {
      schema: {
        tags: [TAG],
        summary: 'Importar prospecto al CRM como Lead',
        description: 'Crea una empresa + un contacto (lead) y marca el prospecto como importado.',
        security,
        params: IdParamSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request, reply) => {
      const result = await importProspect(
        request.hubUser!.portalId,
        request.hubUser!.sub,
        request.params.id,
      )
      return reply.status(201).send(ok(result))
    },
  )

  r.post(
    '/prospects/:id/discard',
    {
      schema: {
        tags: [TAG],
        summary: 'Descartar prospecto',
        security,
        params: IdParamSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) => {
      const result = await discardProspect(request.hubUser!.portalId, request.params.id)
      return ok(result)
    },
  )
}
