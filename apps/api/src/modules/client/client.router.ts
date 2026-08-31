import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ok } from '../../lib/response'
import { authenticateClient } from '../../middleware/authenticate-client'
import { IdParamSchema } from '../../lib/crm-schemas'
import { clientDeals, clientDeliverables, approveDeliverable, requestChanges, listClientInvoices, getClientProject } from './client.service'
import { listClientDocuments } from '../documents/documents.service'
import { clientDealIds } from '../../lib/portal-access'
import { CLIENT_SECURITY } from '../../lib/http'

const TAG = 'Client Portal'
const security = CLIENT_SECURITY

const RequestChangesSchema = z.object({ feedback: z.string().min(1) })

export async function clientRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticateClient)

  r.get(
    '/deals',
    { schema: { tags: [TAG], summary: 'Deals del cliente', description: 'Deals a los que el cliente tiene acceso.', security } },
    async (request) => ok(await clientDeals(request.clientAccount!.sub)),
  )

  r.get(
    '/project',
    {
      schema: {
        tags: [TAG],
        summary: 'Estado de proyecto visible al cliente',
        description:
          'Fase actual del deal activo dentro del pipeline "Producción" (si ya está ahí), roadmap completo de las 9 fases y novedades curadas por el equipo. No expone tareas internas.',
        security,
      },
    },
    async (request) => ok(await getClientProject(request.clientAccount!.sub)),
  )

  r.get(
    '/deliverables',
    { schema: { tags: [TAG], summary: 'Entregables del cliente', description: 'Entregables de los deals del cliente.', security } },
    async (request) => ok(await clientDeliverables(request.clientAccount!.sub)),
  )

  r.post(
    '/deliverables/:id/approve',
    { schema: { tags: [TAG], summary: 'Aprobar entregable', security, params: IdParamSchema } },
    async (request) => {
      await approveDeliverable(request.clientAccount!.sub, request.params.id)
      return ok({ success: true })
    },
  )

  r.post(
    '/deliverables/:id/request-changes',
    { schema: { tags: [TAG], summary: 'Pedir cambios en un entregable', security, params: IdParamSchema, body: RequestChangesSchema } },
    async (request) => {
      await requestChanges(request.clientAccount!.sub, request.params.id, request.body.feedback)
      return ok({ success: true })
    },
  )

  r.get(
    '/invoices',
    {
      schema: {
        tags: [TAG],
        summary: 'Facturas del cliente',
        description: 'Lista de facturas asociadas a los deals del cliente autenticado (read-only).',
        security,
      },
    },
    async (request) => ok(await listClientInvoices(request.clientAccount!.sub)),
  )

  r.get(
    '/documents',
    {
      schema: {
        tags: [TAG],
        summary: 'Documentos del cliente',
        description: 'Lista de documentos asociados a los deals del cliente autenticado (read-only).',
        security,
      },
    },
    async (request) => {
      const dealIds = await clientDealIds(request.clientAccount!.sub)
      const docs = await listClientDocuments(dealIds)
      return ok(docs)
    },
  )
}
