import type { FastifyInstance, FastifyRequest } from 'fastify'
import { ok } from '../../lib/response'
import { Errors } from '../../lib/errors'
import { authenticate } from '../../middleware/authenticate'
import { authenticateClient } from '../../middleware/authenticate-client'
import { verifyClerkToken, resolveHubUser, resolveClientAccount } from '../../middleware/clerk-auth'
import { saveUpload, readFile } from './files.service'

const TAG = 'Archivos'

/**
 * Descarga autenticada.
 *
 * ANTES esta ruta era pública: cualquiera con la URL bajaba el archivo, y la
 * única defensa era que el storageKey fuese un UUID difícil de adivinar. Eso
 * volvía decorativo el flag `visible_to_client` de documentos y entregables —
 * el listado ocultaba el ítem, pero los bytes seguían accesibles.
 *
 * Ahora exige una sesión válida de Clerk: hub_user (equipo) o client_account
 * (portal). Acepta el token por header `Authorization` o por query `?token=`,
 * porque las descargas nacen de un `<a href>`/`<img src>` del navegador, que no
 * puede mandar headers. El token es de Clerk y de vida corta (~60s).
 *
 * PENDIENTE (documentado a propósito): esto autentica pero todavía no autoriza
 * a nivel de recurso — cualquier usuario logueado del portal puede bajar
 * cualquier storageKey si lo conoce. El siguiente paso es resolver a qué
 * documento/entregable pertenece la key y validar deal + visible_to_client.
 * Requiere un índice por storageKey, así que va en su propio cambio.
 */
async function authenticateAny(request: FastifyRequest): Promise<void> {
  const header = request.headers.authorization
  const queryToken = (request.query as { token?: string }).token
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : queryToken

  if (!token) throw Errors.unauthorized('Falta el token de acceso')

  let clerkUserId: string
  try {
    clerkUserId = await verifyClerkToken(token)
  } catch {
    throw Errors.unauthorized('Token de acceso inválido o expirado')
  }

  // Sirve tanto al equipo como al cliente: alcanza con ser cualquiera de los dos.
  try {
    await resolveHubUser(clerkUserId)
    return
  } catch {
    /* no es del equipo, probamos como cliente */
  }
  try {
    await resolveClientAccount(clerkUserId)
  } catch {
    throw Errors.unauthorized('Usuario no autorizado')
  }
}

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

  // Descargar — requiere sesión (equipo o cliente)
  app.get(
    '/:key',
    { schema: { tags: [TAG], summary: 'Descargar archivo por key (requiere sesión)', security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      await authenticateAny(request)
      const { key } = request.params as { key: string }
      const f = await readFile(key)
      if (!f) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Archivo no encontrado' } })
      }
      return reply.type(f.mime).send(f.stream)
    },
  )
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
