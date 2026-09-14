import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ok } from '../../lib/response'
import { Errors } from '../../lib/errors'
import { verifyClerkToken, resolveHubUser, resolveClientAccount } from '../../middleware/clerk-auth'
import {
  MIME_BY_EXTENSION,
  createReadUrl,
  currentStorageMode,
  isReadableStorageKey,
  openLocalObject,
  verifyRawSignature,
  type StorageLogContext,
} from '../../lib/storage'
import { assertCanReadFile, findBrandLogoPortal, isServablePublicLogo, type FileActor } from './files.authz'

const TAG = 'Archivos'

/**
 * Tipos que se muestran inline. Todo lo demás se sirve como descarga con CSP
 * sandbox: un HTML o un SVG abierto en el origen de la API ejecutaría código.
 * SVG solo existe en keys legacy (la política de subida ya no lo acepta).
 */
const INLINE_SAFE_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'])

const LEGACY_MIME_BY_EXTENSION: Record<string, string> = { jpeg: 'image/jpeg', svg: 'image/svg+xml' }

function mimeForKey(key: string): string {
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase()
  return MIME_BY_EXTENSION[ext] ?? LEGACY_MIME_BY_EXTENSION[ext] ?? 'application/octet-stream'
}

/**
 * Sesión de equipo o de cliente, SOLO por header `Authorization`.
 *
 * Antes también aceptaba `?token=` porque las descargas nacían de un
 * `<a href>`/`<img src>`: el token de Clerk quedaba en historial, logs y
 * Referer. Ahora el browser pide una URL de acceso de corta vida con el header
 * y usa ESA URL en el <img>/<a>.
 */
async function authenticateAny(request: FastifyRequest): Promise<FileActor> {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) throw Errors.unauthorized('Falta el token de acceso')

  let clerkUserId: string
  try {
    clerkUserId = await verifyClerkToken(header.slice('Bearer '.length))
  } catch {
    throw Errors.unauthorized('Token de acceso inválido o expirado')
  }

  try {
    const hubUser = await resolveHubUser(clerkUserId)
    return { kind: 'hub', userId: hubUser.sub, portalId: hubUser.portalId, role: hubUser.role }
  } catch {
    /* no es del equipo, probamos como cliente */
  }
  try {
    const clientAccount = await resolveClientAccount(clerkUserId)
    return { kind: 'client', clientId: clientAccount.sub, portalId: clientAccount.portalId }
  } catch {
    throw Errors.unauthorized('Usuario no autorizado')
  }
}

const FileAccessSchema = z.object({ storageKey: z.string().min(1).max(500) })
const RawFileQuerySchema = z.object({ exp: z.string().max(20).optional(), sig: z.string().max(128).optional() })

function logContext(op: string, storageKey: string, actor?: FileActor): StorageLogContext {
  if (!actor) return { op, storageKey }
  return {
    op,
    storageKey,
    portalId: actor.portalId,
    actor: actor.kind === 'hub' ? { kind: 'hub', id: actor.userId } : { kind: 'client', id: actor.clientId },
  }
}

/** 302 a una URL de lectura de corta vida. Para logos públicos (render antes del login). */
export async function redirectToPublicFile(reply: FastifyReply, storageKey: string, portalId: string): Promise<FastifyReply> {
  const { url } = await createReadUrl(storageKey, { op: 'public-logo', storageKey, portalId })
  return reply.header('Cache-Control', 'public, max-age=60').redirect(url, 302)
}

export async function filesRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.post(
    '/access',
    {
      schema: {
        tags: [TAG],
        summary: 'URL de acceso de corta vida a un archivo (equipo o cliente)',
        description: 'Autoriza por recurso y devuelve una URL válida 5 minutos (presignada en Vercel Blob o firmada en modo server).',
        security: [{ bearerAuth: [] }],
        body: FileAccessSchema,
      },
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (request) => {
      const actor = await authenticateAny(request)
      const { storageKey } = request.body
      await assertCanReadFile(actor, storageKey)
      return ok(await createReadUrl(storageKey, logContext('access', storageKey, actor)))
    },
  )

  // Sin sesión: la firma HMAC con vencimiento ES la credencial (la emite /access).
  r.get(
    '/raw/*',
    {
      schema: {
        tags: [TAG],
        summary: 'Contenido de un archivo por URL firmada (modo server, solo desarrollo)',
        querystring: RawFileQuerySchema,
      },
    },
    async (request, reply) => {
      const storageKey = (request.params as { '*': string })['*']
      if (!isReadableStorageKey(storageKey) || !verifyRawSignature(storageKey, request.query.exp, request.query.sig)) {
        throw Errors.forbidden('Enlace inválido o vencido')
      }
      // Solo en modo server: en blob o en producción sin credenciales nunca se lee disco.
      if (currentStorageMode() !== 'server') throw Errors.notFound('Archivo no encontrado')

      const stream = await openLocalObject(storageKey)
      if (!stream) throw Errors.notFound('Archivo no encontrado')

      const mime = mimeForKey(storageKey)
      reply.header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, max-age=300')
      if (INLINE_SAFE_MIME.has(mime)) return reply.type(mime).send(stream)
      const filename = storageKey.slice(storageKey.lastIndexOf('/') + 1).replace(/[^a-zA-Z0-9._-]/g, '_')
      return reply
        .type(mime)
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .header('Content-Security-Policy', "default-src 'none'; sandbox")
        .send(stream)
    },
  )
}

/** Logos de marca: públicos, tienen que renderizar en el login del portal. */
export async function publicFilesRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/brand-logo/*',
    {
      schema: { tags: [TAG], summary: 'Logo de marca (público, redirige a una URL de corta vida)' },
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const storageKey = (request.params as { '*': string })['*']
      const portalId = isReadableStorageKey(storageKey) ? await findBrandLogoPortal(storageKey) : null
      if (!portalId || !(await isServablePublicLogo(storageKey, portalId, 'brand_logo'))) {
        throw Errors.notFound('Logo no encontrado')
      }
      return redirectToPublicFile(reply, storageKey, portalId)
    },
  )
}
