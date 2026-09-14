import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { IdParamSchema, ListQuerySchema } from '../../lib/crm-schemas'
import { ADMIN_SECURITY } from '../../lib/http'
import {
  GenerateProposalSchema,
  UpdateProposalSchema,
  ProposalTokenParamSchema,
} from './proposals.schema'
import {
  generateProposal,
  listProposals,
  getProposal,
  updateProposal,
  acceptProposal,
  markProposalSent,
  markProposalCompleted,
  getPublicProposal,
  getPublicProposalPdf,
  getPublicProposalLogoUrl,
} from './proposals.service'

const TAG = 'Proposals'

/**
 * Rutas PÚBLICAS — sin auth. Sirven la propuesta al cliente por su token.
 */
export async function proposalPublicRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()

  // Vista pública de la propuesta (link `/p/<token>`). El token es la credencial;
  // no expone borradores y marca la primera visualización del cliente.
  r.get(
    '/:token',
    {
      schema: {
        tags: [TAG],
        summary: 'Ver una propuesta por su token (público)',
        params: ProposalTokenParamSchema,
      },
      // Público y direccionado por token: sin límite es un blanco barato para
      // enumerar tokens o forzar renders de PDF en loop.
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request) => ok(await getPublicProposal(request.params.token)),
  )

  // Descarga del PDF de la propuesta. Devuelve el binario directo (no JSON) para
  // que el link `<a href>` lo baje sin pasos extra.
  r.get(
    '/:token/pdf',
    {
      schema: {
        tags: [TAG],
        summary: 'Descargar el PDF de una propuesta (público)',
        params: ProposalTokenParamSchema,
      },
      // Público y direccionado por token: sin límite es un blanco barato para
      // enumerar tokens o forzar renders de PDF en loop.
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { filename, buffer } = await getPublicProposalPdf(request.params.token)
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(buffer)
    },
  )

  // Logo de la propuesta: el deck público lo usa en un <img>, sin sesión.
  r.get(
    '/:token/logo',
    {
      schema: {
        tags: [TAG],
        summary: 'Logo de una propuesta (público, redirige a una URL de corta vida)',
        params: ProposalTokenParamSchema,
      },
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { url } = await getPublicProposalLogoUrl(request.params.token)
      return reply.header('Cache-Control', 'public, max-age=60').redirect(url, 302)
    },
  )

  // El cliente llegó al ÚLTIMO paso de la presentación (lo dispara el deck).
  r.post(
    '/:token/completed',
    {
      schema: {
        tags: [TAG],
        summary: 'Marcar que el cliente terminó la presentación (público)',
        params: ProposalTokenParamSchema,
      },
      // Público y direccionado por token: sin límite es un blanco barato para
      // enumerar tokens o forzar renders de PDF en loop.
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request) => {
      await markProposalCompleted(request.params.token)
      return ok({ ok: true })
    },
  )
}

/**
 * Rutas de ADMIN — generar, revisar, editar y aprobar propuestas.
 */
export async function proposalAdminRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  // Generar una propuesta con IA a partir de un deal (status draft).
  r.post(
    '/generate',
    {
      schema: {
        tags: [TAG],
        summary: 'Generar una propuesta con IA desde un deal',
        security: ADMIN_SECURITY,
        body: GenerateProposalSchema,
      },
      preHandler: [authorize('owner', 'member', 'collaborator')],
    },
    async (request, reply) => {
      const result = await generateProposal(
        request.hubUser!.portalId,
        request.body.dealId,
        request.hubUser!.sub,
      )
      return reply.status(201).send(ok(result))
    },
  )

  r.get(
    '/',
    { schema: { tags: [TAG], summary: 'Listar propuestas', description: 'Listado paginado por cursor.', security: ADMIN_SECURITY, querystring: ListQuerySchema } },
    async (request) => {
      const { items, nextCursor } = await listProposals(request.hubUser!.portalId, request.query)
      return ok(items, { nextCursor })
    },
  )

  r.get(
    '/:id',
    { schema: { tags: [TAG], summary: 'Detalle de una propuesta', security: ADMIN_SECURITY, params: IdParamSchema } },
    async (request) => ok(await getProposal(request.hubUser!.portalId, request.params.id)),
  )

  // Editar título/contenido (el admin ajusta lo que generó la IA).
  r.patch(
    '/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Editar una propuesta',
        security: ADMIN_SECURITY,
        params: IdParamSchema,
        body: UpdateProposalSchema,
      },
      preHandler: [authorize('owner', 'member', 'collaborator')],
    },
    async (request) => ok(await updateProposal(request.hubUser!.portalId, request.hubUser!.sub, request.params.id, request.body)),
  )

  // Aprobar la propuesta (queda lista para enviar; el link público se vuelve visible).
  r.post(
    '/:id/accept',
    {
      schema: {
        tags: [TAG],
        summary: 'Aprobar una propuesta',
        security: ADMIN_SECURITY,
        params: IdParamSchema,
      },
      preHandler: [authorize('owner')],
    },
    async (request) => ok(await acceptProposal(request.hubUser!.portalId, request.params.id, request.hubUser!.sub)),
  )

  // Marcar como ENVIADA (lo dispara el admin al copiar el link / abrir la presentación).
  r.post(
    '/:id/sent',
    {
      schema: {
        tags: [TAG],
        summary: 'Marcar una propuesta como enviada',
        security: ADMIN_SECURITY,
        params: IdParamSchema,
      },
      preHandler: [authorize('owner', 'member', 'collaborator')],
    },
    async (request) => ok(await markProposalSent(request.hubUser!.portalId, request.params.id)),
  )
}
