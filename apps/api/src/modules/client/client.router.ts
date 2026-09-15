import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ok } from '../../lib/response'
import { authenticateClient } from '../../middleware/authenticate-client'
import { IdParamSchema, ListQuerySchema } from '../../lib/crm-schemas'
import {
  clientDeals,
  clientDeliverables,
  approveDeliverable,
  requestChanges,
  listClientInvoices,
  getClientProject,
  listClientDocumentFolders,
  createClientDocumentFolder,
  renameClientDocumentFolder,
  archiveClientDocumentFolder,
  createClientDocument,
  updateClientDocument,
  archiveClientDocument,
} from './client.service'
import { listClientDocuments } from '../documents/documents.service'
import { getClientSignedDocuments } from '../documents/docuseal.service'
import {
  ClientCreateDocumentFolderSchema,
  ClientRenameDocumentFolderSchema,
  ClientListDocumentFoldersQuerySchema,
  ClientCreateDocumentSchema,
  ClientUpdateDocumentSchema,
} from '../documents/documents.schema'
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
    { schema: { tags: [TAG], summary: 'Entregables del cliente', description: 'Entregables de los deals del cliente. Paginado por cursor.', security, querystring: ListQuerySchema } },
    async (request) => {
      const { items, nextCursor } = await clientDeliverables(request.clientAccount!.sub, request.query)
      return ok(items, { nextCursor })
    },
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
        description: 'Lista de facturas asociadas a los deals del cliente autenticado (read-only). Paginado por cursor.',
        security,
        querystring: ListQuerySchema,
      },
    },
    async (request) => {
      const { items, nextCursor } = await listClientInvoices(request.clientAccount!.sub, request.query)
      return ok(items, { nextCursor })
    },
  )

  r.get(
    '/documents',
    {
      schema: {
        tags: [TAG],
        summary: 'Documentos del cliente',
        description: 'Lista de documentos asociados a los deals del cliente autenticado (read-only). Paginado por cursor.',
        security,
        querystring: ListQuerySchema,
      },
    },
    async (request) => {
      const dealIds = await clientDealIds(request.clientAccount!.sub)
      const { items, nextCursor } = await listClientDocuments(
        request.clientAccount!.portalId,
        request.clientAccount!.sub,
        dealIds,
        request.query,
      )
      return ok(items, { nextCursor })
    },
  )

  r.get(
    '/document-folders',
    {
      schema: {
        tags: [TAG],
        summary: 'Carpetas de documentos del proyecto',
        description: 'Carpetas activas de un deal propio, con la cantidad de documentos activos y si el cliente puede administrarlas (las que él creó).',
        security,
        querystring: ClientListDocumentFoldersQuerySchema,
      },
    },
    async (request) => ok(await listClientDocumentFolders(request.clientAccount!.sub, request.query.dealId)),
  )

  r.post(
    '/document-folders',
    {
      schema: {
        tags: [TAG],
        summary: 'Crear carpeta',
        description: 'Crea una carpeta dentro de un deal propio. Nunca en "Generales" (deal_id null): document.portal_id es el tenant de la agencia, no de la empresa cliente.',
        security,
        body: ClientCreateDocumentFolderSchema,
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(ok(await createClientDocumentFolder(request.clientAccount!.sub, request.clientAccount!.portalId, request.body))),
  )

  r.patch(
    '/document-folders/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Renombrar carpeta propia',
        security,
        params: IdParamSchema,
        body: ClientRenameDocumentFolderSchema,
      },
    },
    async (request) =>
      ok(
        await renameClientDocumentFolder(
          request.clientAccount!.sub,
          request.clientAccount!.portalId,
          request.params.id,
          request.body.name,
        ),
      ),
  )

  r.delete(
    '/document-folders/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Archivar carpeta propia',
        description: 'Soft delete: la carpeta deja de listarse y sus documentos vuelven a la raíz del proyecto (folder_id = null).',
        security,
        params: IdParamSchema,
      },
    },
    async (request) => {
      const { movedDocuments } = await archiveClientDocumentFolder(request.clientAccount!.sub, request.clientAccount!.portalId, request.params.id)
      return ok({ success: true, movedDocuments })
    },
  )

  r.post(
    '/documents',
    {
      schema: {
        tags: [TAG],
        summary: 'Subir documento propio',
        description: 'La key tiene que venir de una subida ya reclamable (POST /api/client/uploads, purpose deal_document) del propio cliente.',
        security,
        body: ClientCreateDocumentSchema,
      },
    },
    async (request, reply) =>
      reply.status(201).send(ok(await createClientDocument(request.clientAccount!.sub, request.clientAccount!.portalId, request.body))),
  )

  r.patch(
    '/documents/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Renombrar o mover un documento propio',
        description: 'Solo documentos que el cliente subió. Mover solo entre carpetas del MISMO proyecto.',
        security,
        params: IdParamSchema,
        body: ClientUpdateDocumentSchema,
      },
    },
    async (request) =>
      ok(await updateClientDocument(request.clientAccount!.sub, request.clientAccount!.portalId, request.params.id, request.body)),
  )

  r.delete(
    '/documents/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Archivar documento propio',
        description: 'Soft delete. Nunca sobre un documento de DocuSeal.',
        security,
        params: IdParamSchema,
      },
    },
    async (request) => {
      await archiveClientDocument(request.clientAccount!.sub, request.clientAccount!.portalId, request.params.id)
      return ok({ success: true })
    },
  )

  r.get(
    '/documents/:id/signed-documents',
    {
      schema: {
        tags: [TAG],
        summary: 'URLs del documento firmado (efímeras)',
        description:
          'Pide a DocuSeal las URLs del PDF firmado EN EL MOMENTO. Caducan a los 40 minutos, por eso no se guardan en la base: hay que pedirlas cada vez que se necesitan. Solo documentos de deals propios y visibles al cliente.',
        security,
        params: IdParamSchema,
      },
    },
    async (request) => ok(await getClientSignedDocuments(request.clientAccount!.sub, request.params.id)),
  )
}
