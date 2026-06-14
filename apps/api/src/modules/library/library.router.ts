/**
 * library.router.ts — Rutas REST del módulo de Biblioteca.
 *
 * Prefijo: /api/library (ver src/app.ts).
 *
 * La sección operativa 'sops' consolida procedimientos y checklists en un único
 * type='sop'. El kind ('procedure'|'checklist') discrimina el subtipo.
 * La ruta /library/checklists fue eliminada del frontend — todo va por /library/sops.
 */

import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { IdParamSchema } from '../../lib/crm-schemas'
import { ADMIN_SECURITY } from '../../lib/http'
import {
  CreateLibraryItemSchema,
  UpdateLibraryItemSchema,
  ListLibraryQuerySchema,
} from './library.schema'
import {
  listLibraryItems,
  getLibraryItem,
  createLibraryItem,
  updateLibraryItem,
  archiveLibraryItem,
} from './library.service'

const TAG = 'Biblioteca'
const security = ADMIN_SECURITY

export async function libraryRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar ítems de biblioteca',
        description: 'Lista ítems del portal. Filtrá por type y/o kind. kind aplica especialmente para type=sop.',
        security,
        querystring: ListLibraryQuerySchema,
      },
    },
    async (request) => {
      return ok(await listLibraryItems(request.hubUser!.portalId, request.query))
    },
  )

  r.post(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Crear ítem de biblioteca',
        description: 'Crea un ítem de biblioteca. Para type=sop incluye steps/kind/ownerId.',
        security,
        body: CreateLibraryItemSchema,
      },
      preHandler: [authorize('owner', 'member', 'collaborator')],
    },
    async (request, reply) => {
      const created = await createLibraryItem(
        request.hubUser!.portalId,
        request.hubUser!.sub,
        request.body,
      )
      return reply.status(201).send(ok(created))
    },
  )

  r.get(
    '/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Detalle de ítem de biblioteca',
        description: 'Devuelve un ítem por ID verificando pertenencia al portal.',
        security,
        params: IdParamSchema,
      },
    },
    async (request) => {
      return ok(await getLibraryItem(request.hubUser!.portalId, request.params.id))
    },
  )

  r.patch(
    '/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Actualizar ítem de biblioteca',
        description: 'Actualiza campos. Para steps: siempre enviar la lista completa (reemplazo, no merge).',
        security,
        params: IdParamSchema,
        body: UpdateLibraryItemSchema,
      },
      preHandler: [authorize('owner', 'member', 'collaborator')],
    },
    async (request) => {
      return ok(await updateLibraryItem(request.hubUser!.portalId, request.params.id, request.body))
    },
  )

  r.delete(
    '/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Archivar ítem de biblioteca',
        description: 'Archiva el ítem (soft-delete).',
        security,
        params: IdParamSchema,
      },
      preHandler: [authorize('owner', 'member', 'collaborator')],
    },
    async (request) => {
      await archiveLibraryItem(request.hubUser!.portalId, request.params.id)
      return ok({ success: true })
    },
  )
}
