import type { FastifyInstance } from 'fastify'
import { ok } from '../../lib/response'
import { Errors } from '../../lib/errors'
import { authenticate } from '../../middleware/authenticate'
import { authenticateClient } from '../../middleware/authenticate-client'
import { saveUpload, resolveFile, fileStream } from './files.service'

const TAG = 'Archivos'

/** Subida (admin + cliente) y descarga pública por key (el key es un UUID, no adivinable). */
export async function filesRoutes(app: FastifyInstance): Promise<void> {
  // Subir (admin)
  app.post(
    '/',
    { preHandler: [authenticate], schema: { tags: [TAG], summary: 'Subir archivo (admin)', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const file = await request.file()
      if (!file) throw Errors.badRequest('No se envió ningún archivo')
      const saved = await saveUpload(await file.toBuffer(), file.filename, file.mimetype)
      return reply.status(201).send(ok(saved))
    },
  )

  // Descargar (público por key)
  app.get('/:key', { schema: { tags: [TAG], summary: 'Descargar archivo por key' } }, async (request, reply) => {
    const { key } = request.params as { key: string }
    const f = resolveFile(key)
    if (!f) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Archivo no encontrado' } })
    return reply.type(f.mime).send(fileStream(f.path))
  })
}

/** Subida del cliente (portal) — para responder intakes con archivos. */
export async function clientFilesRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/',
    { preHandler: [authenticateClient], schema: { tags: ['Client Portal'], summary: 'Subir archivo (cliente)', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const file = await request.file()
      if (!file) throw Errors.badRequest('No se envió ningún archivo')
      const saved = await saveUpload(await file.toBuffer(), file.filename, file.mimetype)
      return reply.status(201).send(ok(saved))
    },
  )
}
