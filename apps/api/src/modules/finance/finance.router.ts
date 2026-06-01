import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { IdParamSchema } from '../../lib/crm-schemas'
import {
  CreateInvoiceSchema,
  UpdateInvoiceSchema,
  TransitionInvoiceSchema,
  CreatePaymentSchema,
  ListInvoicesQuerySchema,
} from './finance.schema'
import {
  listInvoices,
  getInvoiceDetail,
  createInvoice,
  updateInvoice,
  transitionInvoice,
  archiveInvoice,
  listPayments,
  registerPayment,
  financeSummary,
  generateInvoicePdf,
} from './finance.service'
import { ADMIN_SECURITY } from '../../lib/http'

const TAG = 'Finanzas'
const security = ADMIN_SECURITY

export async function financeRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  // ── Invoices ──────────────────────────────────────────────────────────────

  r.get(
    '/invoices',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar facturas',
        description: 'Lista todas las facturas del portal. Filtrá por status.',
        security,
        querystring: ListInvoicesQuerySchema,
      },
    },
    async (request) => {
      const invoices = await listInvoices(request.hubUser!.portalId, request.query)
      return ok(invoices)
    },
  )

  r.post(
    '/invoices',
    {
      schema: {
        tags: [TAG],
        summary: 'Crear factura',
        description: 'Crea una nueva factura con sus ítems. Calcula subtotal, tax y total automáticamente.',
        security,
        body: CreateInvoiceSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request, reply) => {
      const created = await createInvoice(
        request.hubUser!.portalId,
        request.hubUser!.sub,
        request.body,
      )
      return reply.status(201).send(ok(created))
    },
  )

  r.get(
    '/invoices/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Detalle de factura',
        description: 'Devuelve la factura con sus ítems, pagos y balance pendiente.',
        security,
        params: IdParamSchema,
      },
    },
    async (request) => {
      const detail = await getInvoiceDetail(request.hubUser!.portalId, request.params.id)
      return ok(detail)
    },
  )

  r.get(
    '/invoices/:id/pdf',
    {
      schema: {
        tags: [TAG],
        summary: 'Descargar factura en PDF',
        description: 'Genera el PDF de la factura en el servidor y devuelve el base64 para descarga en el cliente.',
        security,
        params: IdParamSchema,
      },
    },
    async (request) => {
      const result = await generateInvoicePdf(request.hubUser!.portalId, request.params.id)
      return ok(result)
    },
  )

  r.patch(
    '/invoices/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Actualizar factura',
        description: 'Actualiza campos de una factura en borrador.',
        security,
        params: IdParamSchema,
        body: UpdateInvoiceSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) => {
      return ok(await updateInvoice(request.hubUser!.portalId, request.params.id, request.body))
    },
  )

  r.post(
    '/invoices/:id/transition',
    {
      schema: {
        tags: [TAG],
        summary: 'Cambiar estado de factura',
        description: 'Transiciona el estado de una factura (draft→sent, sent→overdue, etc.).',
        security,
        params: IdParamSchema,
        body: TransitionInvoiceSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) => {
      return ok(await transitionInvoice(request.hubUser!.portalId, request.params.id, request.body.status))
    },
  )

  r.delete(
    '/invoices/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Archivar factura',
        description: 'Archiva la factura (soft delete).',
        security,
        params: IdParamSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request) => {
      await archiveInvoice(request.hubUser!.portalId, request.params.id)
      return ok({ success: true })
    },
  )

  // ── Payments ──────────────────────────────────────────────────────────────

  r.get(
    '/payments',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar pagos',
        description: 'Lista todos los pagos del portal ordenados por fecha.',
        security,
      },
    },
    async (request) => {
      const payments = await listPayments(request.hubUser!.portalId)
      return ok(payments)
    },
  )

  r.post(
    '/payments',
    {
      schema: {
        tags: [TAG],
        summary: 'Registrar pago',
        description: 'Registra un pago para una factura. Si cubre el total, la marca como pagada.',
        security,
        body: CreatePaymentSchema,
      },
      preHandler: [authorize('owner', 'member')],
    },
    async (request, reply) => {
      const created = await registerPayment(
        request.hubUser!.portalId,
        request.hubUser!.sub,
        request.body,
      )
      return reply.status(201).send(ok(created))
    },
  )

  // ── Summary ───────────────────────────────────────────────────────────────

  r.get(
    '/summary',
    {
      schema: {
        tags: [TAG],
        summary: 'Resumen financiero',
        description: 'KPIs financieros: total facturado, cobrado, cuentas por cobrar y desglose por status.',
        security,
      },
    },
    async (request) => {
      const summary = await financeSummary(request.hubUser!.portalId)
      return ok(summary)
    },
  )
}
