import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { IdParamSchema } from '../../lib/crm-schemas'
import { ADMIN_SECURITY } from '../../lib/http'
import { CreateDocumentSchema, ListDocumentsQuerySchema } from './documents.schema'
import { listDocuments, createDocument, deleteDocument } from './documents.service'

const TAG = 'Documentos'
const security = ADMIN_SECURITY

export async function documentsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar documentos',
        description: 'Lista los documentos del portal, opcionalmente filtrados por deal.',
        security,
        querystring: ListDocumentsQuerySchema,
      },
    },
    async (request) => {
      const docs = await listDocuments(request.hubUser!.portalId, request.query)
      return ok(docs)
    },
  )

  r.post(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Crear documento',
        security,
        body: CreateDocumentSchema,
      },
    },
    async (request, reply) => {
      const doc = await createDocument(
        request.hubUser!.portalId,
        request.hubUser!.sub,
        request.body,
      )
      return reply.status(201).send(ok(doc))
    },
  )

  r.delete(
    '/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Eliminar documento',
        security,
        params: IdParamSchema,
      },
    },
    async (request, reply) => {
      await deleteDocument(request.hubUser!.portalId, request.params.id)
      return reply.status(204).send()
    },
  )
}
