import type { FastifyInstance, FastifyRequest } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { handleUploadPresigned } from '@vercel/blob/client'
import { env } from '../../config/env'
import { ok } from '../../lib/response'
import { ADMIN_SECURITY, CLIENT_SECURITY } from '../../lib/http'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { authenticateClient } from '../../middleware/authenticate-client'
import { BlobTokenRequestSchema, CreateUploadIntentSchema, UploadIdParamSchema } from './uploads.schema'
import {
  createUploadIntent,
  findPendingUploadForActor,
  getSignedUploadToken,
  receiveServerContent,
} from './uploads.service'
import type { StorageActor } from './uploads.types'

const RATE_LIMIT = { rateLimit: { max: 30, timeWindow: '1 minute' } }

/**
 * `handleUploadPresigned` valida que exista una clave pública de webhook aunque
 * solo la use para verificar callbacks `upload-completed`. Esta API no acepta
 * ese evento (el schema del body lo rechaza antes), así que en Production —
 * donde la variable no está configurada — se pasa un valor que nunca verifica
 * nada: si algún día el evento llegara a este punto, la verificación falla
 * cerrada.
 */
const COMPLETION_CALLBACKS_DISABLED = 'completion-callbacks-disabled'

type ActorResolver = (request: FastifyRequest) => StorageActor

const hubActor: ActorResolver = (request) => ({
  kind: 'hub',
  userId: request.hubUser!.sub,
  portalId: request.hubUser!.portalId,
})

const clientActor: ActorResolver = (request) => ({
  kind: 'client',
  clientId: request.clientAccount!.sub,
  portalId: request.clientAccount!.portalId,
})

function registerUploadRoutes(app: FastifyInstance, resolveActor: ActorResolver, tag: string, security: typeof ADMIN_SECURITY): void {
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.post(
    '/',
    {
      schema: {
        tags: [tag],
        summary: 'Reservar una subida (intent)',
        description: 'Valida propósito, tipo y tamaño, y devuelve la storageKey generada por el server y el modo (blob | server).',
        security,
        body: CreateUploadIntentSchema,
      },
      config: RATE_LIMIT,
    },
    async (request, reply) => reply.status(201).send(ok(await createUploadIntent(resolveActor(request), request.body))),
  )

  // Respuesta SIN envoltorio `{ data }`: la consume `uploadPresigned` del SDK,
  // que lee `presignedUrlPayload` en la raíz del JSON.
  r.post(
    '/blob-token',
    {
      schema: {
        tags: [tag],
        summary: 'Token de subida directa a Vercel Blob (modo blob)',
        security,
        body: BlobTokenRequestSchema,
      },
      config: RATE_LIMIT,
    },
    async (request) => {
      const actor = resolveActor(request)
      const body = request.body
      return handleUploadPresigned({
        body: {
          type: body.type,
          payload: {
            pathname: body.payload.pathname,
            clientPayload: body.payload.clientPayload ?? null,
            multipart: body.payload.multipart ?? false,
          },
        },
        request: request.raw,
        webhookPublicKey: env.BLOB_WEBHOOK_PUBLIC_KEY ?? COMPLETION_CALLBACKS_DISABLED,
        getSignedToken: (pathname) => getSignedUploadToken(actor, pathname),
      })
    },
  )

  r.put(
    '/:uploadId/content',
    {
      schema: {
        tags: [tag],
        summary: 'Subir el contenido del archivo (modo server, solo desarrollo)',
        description: 'Multipart con un único archivo.',
        security,
        params: UploadIdParamSchema,
      },
      config: RATE_LIMIT,
    },
    async (request) => {
      const actor = resolveActor(request)
      const { row, maxBytes } = await findPendingUploadForActor(actor, request.params.uploadId)
      // El límite global de multipart (25 MB) se reemplaza por el tamaño declarado en el intent.
      const part = await request.file({ limits: { fileSize: maxBytes, files: 1 } })
      return ok(await receiveServerContent(actor, row, part))
    },
  )
}

export async function hubUploadsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', authorize('owner', 'member', 'collaborator'))
  registerUploadRoutes(app, hubActor, 'Archivos', ADMIN_SECURITY)
}

export async function clientUploadsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateClient)
  registerUploadRoutes(app, clientActor, 'Client Portal', CLIENT_SECURITY)
}
