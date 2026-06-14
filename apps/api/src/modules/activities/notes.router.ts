import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { IdParamSchema } from '../../lib/crm-schemas'
import { CreateNoteSchema, NoteQuerySchema } from './activities.schema'
import { createNote, listNotes, deleteNote } from './activities.service'
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
    async (request) => ok(await listNotes(request.hubUser!.portalId, request.query)),
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
      schema: { tags: [TAG], summary: 'Eliminar nota', description: 'Borra una nota.', security, params: IdParamSchema },
      preHandler: [authorize('owner', 'member', 'collaborator')],
    },
    async (request) => {
      await deleteNote(request.hubUser!.portalId, request.params.id)
      return ok({ success: true })
    },
  )
}
