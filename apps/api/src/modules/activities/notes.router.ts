import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { IdParamSchema } from '../../lib/crm-schemas'
import { CreateNoteSchema, NoteQuerySchema } from './activities.schema'
import { createNote, listNotes, archiveNote } from './activities.service'
import { ADMIN_SECURITY } from '../../lib/http'

const TAG = 'Notas'
const security = ADMIN_SECURITY

export async function notesRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar notas',
        description: 'Notas filtradas por contacto/deal/empresa (más recientes primero).',
        security,
        querystring: NoteQuerySchema,
      },
    },
    async (request) => {
      const { items, nextCursor } = await listNotes(request.hubUser!.portalId, request.query)
      return ok(items, { nextCursor })
    },
  )

  r.post(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Crear nota',
        description: 'Crea una nota asociada a un contacto, deal y/o empresa.',
        security,
        body: CreateNoteSchema,
      },
      preHandler: [authorize('owner', 'member', 'collaborator')],
    },
    async (request, reply) => {
      const created = await createNote(request.hubUser!.portalId, request.hubUser!.sub, request.body)
      return reply.status(201).send(ok(created))
    },
  )

  r.delete(
    '/:id',
    {
      schema: { tags: [TAG], summary: 'Eliminar nota', description: 'Archiva una nota (soft delete): deja de aparecer en listados, detalles y timeline.', security, params: IdParamSchema },
      preHandler: [authorize('owner', 'member', 'collaborator')],
    },
    async (request) => {
      await archiveNote(request.hubUser!.portalId, request.hubUser!.sub, request.params.id)
      return ok({ success: true })
    },
  )
}
