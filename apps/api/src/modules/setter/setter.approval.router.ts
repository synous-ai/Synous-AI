import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { IdParamSchema } from '../../lib/crm-schemas'
import { ADMIN_SECURITY } from '../../lib/http'
import {
  ListDraftsQuerySchema,
  EditDraftSchema,
  ModelProviderSchema,
  AutopilotSchema,
  ListEventsQuerySchema,
} from './setter.schema'
import { listSetterEvents } from './setter.events.service'
import {
  listDrafts,
  getDraftDetail,
  approveDraft,
  editAndSendDraft,
  rejectDraft,
  regenerateDraft,
} from './setter.approval.service'
import { getSetterConfig, setModelProvider, setProspectingAutopilot } from './setter.config.service'

const TAG = 'Setter'
const security = ADMIN_SECURITY

/**
 * Cola de aprobación del setter (La Bandeja). TODO detrás de auth hub_user —
 * el setter es interno del admin, nunca expuesto al client-portal.
 */
export async function setterApprovalRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/config',
    {
      schema: {
        tags: [TAG],
        summary: 'Config del setter (Model Switcher, etc.)',
        security,
      },
    },
    async (request) => ok(await getSetterConfig(request.hubUser!.portalId)),
  )

  r.patch(
    '/config/model-provider',
    {
      schema: {
        tags: [TAG],
        summary: 'Cambiar el LLM que genera los mensajes (Gemini ⇄ Claude)',
        security,
        body: ModelProviderSchema,
      },
      preHandler: [authorize('owner')],
    },
    async (request) => {
      const config = await setModelProvider(request.hubUser!.portalId, request.body.modelProvider)
      return ok(config)
    },
  )

  r.patch(
    '/config/autopilot',
    {
      schema: {
        tags: [TAG],
        summary: 'Encender/apagar el autopilot de prospección',
        security,
        body: AutopilotSchema,
      },
      preHandler: [authorize('owner')],
    },
    async (request) => {
      const config = await setProspectingAutopilot(request.hubUser!.portalId, request.body.enabled)
      return ok(config)
    },
  )

  r.get(
    '/events',
    {
      schema: {
        tags: [TAG],
        summary: 'Consola: log de actividad del setter',
        security,
        querystring: ListEventsQuerySchema,
      },
    },
    async (request) => {
      const { limit, since } = request.query
      const events = await listSetterEvents(request.hubUser!.portalId, {
        limit,
        since: since ? new Date(since) : undefined,
      })
      return ok(events)
    },
  )

  r.get(
    '/drafts',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar drafts de la cola de aprobación',
        description: 'Drafts del setter por estado (default pending), con contexto del lead.',
        security,
        querystring: ListDraftsQuerySchema,
      },
    },
    async (request) => {
      const items = await listDrafts(request.hubUser!.portalId, request.query.status)
      return ok(items)
    },
  )

  r.get(
    '/drafts/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Detalle de un draft + conversación',
        security,
        params: IdParamSchema,
      },
    },
    async (request) => {
      const detail = await getDraftDetail(request.hubUser!.portalId, request.params.id)
      return ok(detail)
    },
  )

  r.post(
    '/drafts/:id/approve',
    {
      schema: {
        tags: [TAG],
        summary: 'Aprobar y enviar el draft',
        description: 'Persiste el mensaje saliente y lo envía por WhatsApp (si Evolution está configurado).',
        security,
        params: IdParamSchema,
      },
      preHandler: [authorize('owner')],
    },
    async (request) => {
      const result = await approveDraft(request.hubUser!.portalId, request.hubUser!.sub, request.params.id)
      return ok(result)
    },
  )

  r.post(
    '/drafts/:id/edit',
    {
      schema: {
        tags: [TAG],
        summary: 'Editar y enviar el draft',
        security,
        params: IdParamSchema,
        body: EditDraftSchema,
      },
      preHandler: [authorize('owner')],
    },
    async (request) => {
      const result = await editAndSendDraft(
        request.hubUser!.portalId,
        request.hubUser!.sub,
        request.params.id,
        request.body.content,
      )
      return ok(result)
    },
  )

  r.post(
    '/drafts/:id/reject',
    {
      schema: {
        tags: [TAG],
        summary: 'Rechazar el draft',
        security,
        params: IdParamSchema,
      },
    },
    async (request) => {
      const result = await rejectDraft(request.hubUser!.portalId, request.hubUser!.sub, request.params.id)
      return ok(result)
    },
  )

  r.post(
    '/drafts/:id/regenerate',
    {
      schema: {
        tags: [TAG],
        summary: 'Regenerar el draft (re-corre el cerebro)',
        security,
        params: IdParamSchema,
      },
      preHandler: [authorize('owner')],
    },
    async (request) => {
      const detail = await regenerateDraft(request.hubUser!.portalId, request.params.id)
      return ok(detail)
    },
  )
}
