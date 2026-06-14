import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { IdParamSchema } from '../../lib/crm-schemas'
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
    },
    async (request, reply) => {
      const { filename, buffer } = await getPublicProposalPdf(request.params.token)
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(buffer)
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
    { schema: { tags: [TAG], summary: 'Listar propuestas', security: ADMIN_SECURITY } },
    async (request) => ok(await listProposals(request.hubUser!.portalId)),
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
    },
    async (request) => ok(await updateProposal(request.hubUser!.portalId, request.params.id, request.body)),
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
