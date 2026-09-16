import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { IdParamSchema } from '../../lib/crm-schemas'
import { ADMIN_SECURITY } from '../../lib/http'
import {
  CreateDocumentSchema,
  ListDocumentsQuerySchema,
  UpdateDocumentSchema,
  CreateDocumentFolderSchema,
  RenameDocumentFolderSchema,
  ListDocumentFoldersQuerySchema,
} from './documents.schema'
import {
  listDocuments,
  createDocument,
  archiveDocument,
  updateDocument,
  listDocumentFolders,
  createDocumentFolder,
  renameDocumentFolder,
  archiveDocumentFolder,
} from './documents.service'
import { sendForSignature, getSignedDocuments } from './docuseal.service'
import { SendForSignatureSchema } from './documents.schema'

const TAG = 'Documentos'
const security = ADMIN_SECURITY

export async function documentsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar documentos',
        description: 'Lista los documentos del portal, opcionalmente filtrados por deal.',
        security,
        querystring: ListDocumentsQuerySchema,
      },
    },
    async (request) => {
      const { items, nextCursor } = await listDocuments(request.hubUser!.portalId, request.query)
      return ok(items, { nextCursor })
    },
  )

  r.post(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Crear documento',
        security,
        body: CreateDocumentSchema,
      },
      preHandler: [authorize('owner', 'member', 'collaborator')],
    },
    async (request, reply) => {
      const doc = await createDocument(
        request.hubUser!.portalId,
        request.hubUser!.sub,
        request.body,
      )
      return reply.status(201).send(ok(doc))
    },
  )

  r.patch(
    '/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Renombrar o mover un documento',
        description: 'Cualquier documento del deal, sin importar quién lo subió (equipo o cliente). Mover solo entre carpetas del MISMO proyecto.',
        security,
        params: IdParamSchema,
        body: UpdateDocumentSchema,
      },
      preHandler: [authorize('owner', 'member', 'collaborator')],
    },
    async (request) =>
      ok(await updateDocument(request.hubUser!.portalId, request.hubUser!.sub, request.params.id, request.body)),
  )

  r.delete(
    '/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Eliminar documento',
        description: 'Archiva el documento (soft delete): deja de listarse, pero se conserva el vínculo con DocuSeal.',
        security,
        params: IdParamSchema,
      },
      // Un documento firmado guarda el único vínculo con el contrato en DocuSeal.
      preHandler: [authorize('owner')],
    },
    async (request, reply) => {
      await archiveDocument(request.hubUser!.portalId, request.hubUser!.sub, request.params.id)
      return reply.status(204).send()
    },
  )

  // ── Carpetas ─────────────────────────────────────────────────────────────
  // El equipo administra cualquier carpeta del deal, incluidas las creadas por
  // un cliente desde el Portal. Roles: crear/renombrar/mover → owner, member,
  // collaborator; archivar → SOLO owner (misma regla que DELETE /:id).

  r.get(
    '/folders',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar carpetas de un proyecto',
        description: 'Carpetas activas de un deal, con la cantidad de documentos activos que contienen.',
        security,
        querystring: ListDocumentFoldersQuerySchema,
      },
    },
    async (request) => ok(await listDocumentFolders(request.hubUser!.portalId, request.query.dealId)),
  )

  r.post(
    '/folders',
    {
      schema: {
        tags: [TAG],
        summary: 'Crear carpeta',
        security,
        body: CreateDocumentFolderSchema,
      },
      preHandler: [authorize('owner', 'member', 'collaborator')],
    },
    async (request, reply) =>
      reply.status(201).send(ok(await createDocumentFolder(request.hubUser!.portalId, request.hubUser!.sub, request.body))),
  )

  r.patch(
    '/folders/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Renombrar carpeta',
        security,
        params: IdParamSchema,
        body: RenameDocumentFolderSchema,
      },
      preHandler: [authorize('owner', 'member', 'collaborator')],
    },
    async (request) =>
      ok(await renameDocumentFolder(request.hubUser!.portalId, request.hubUser!.sub, request.params.id, request.body.name)),
  )

  r.delete(
    '/folders/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Archivar carpeta',
        description: 'Soft delete: la carpeta deja de listarse y sus documentos vuelven a la raíz del proyecto (folder_id = null).',
        security,
        params: IdParamSchema,
      },
      preHandler: [authorize('owner')],
    },
    async (request) => {
      const { movedDocuments } = await archiveDocumentFolder(request.hubUser!.portalId, request.hubUser!.sub, request.params.id)
      return ok({ success: true, movedDocuments })
    },
  )

  // ── DocuSeal ─────────────────────────────────────────────────────────────

  r.post(
    '/deals/:id/send-for-signature',
    {
      schema: {
        tags: [TAG],
        summary: 'Enviar un documento a firmar (DocuSeal)',
        description:
          'Crea una submission en DocuSeal para el contacto principal del deal, deja el documento en estado `pending` y le manda el pedido de firma por email con la marca de la agencia. Devuelve la URL de firma.',
        security,
        params: IdParamSchema,
        body: SendForSignatureSchema,
      },
      preHandler: [authorize('owner', 'member', 'collaborator')],
    },
    async (request, reply) => {
      const result = await sendForSignature(
        request.hubUser!.portalId,
        request.params.id,
        request.hubUser!.sub,
        request.body,
      )
      return reply.status(201).send(ok(result))
    },
  )

  r.get(
    '/:id/signed-documents',
    {
      schema: {
        tags: [TAG],
        summary: 'URLs del documento firmado (efímeras)',
        description:
          'Pide a DocuSeal las URLs del PDF firmado EN EL MOMENTO. Caducan a los 40 minutos, por eso no se guardan en la base: hay que pedirlas cada vez que se necesitan.',
        security,
        params: IdParamSchema,
      },
    },
    async (request) => ok(await getSignedDocuments(request.hubUser!.portalId, request.params.id)),
  )
}
