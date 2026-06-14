/**
 * finance.router.ts — Rutas REST del módulo de Finanzas.
 *
 * Seguridad: todos los endpoints de finanzas requieren rol 'owner' o 'member'.
 * Los roles 'viewer' y 'collaborator' no tienen acceso a datos financieros.
 * Justificación: los datos de facturación, cobros y gastos son información
 * sensible del negocio — no deben quedar expuestos a roles externos o parciales.
 *
 * Todas las rutas están prefijadas con /api/finance (ver src/app.ts).
 */

import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { IdParamSchema } from '../../lib/crm-schemas'
import { ADMIN_SECURITY } from '../../lib/http'
import {
  CreateInvoiceSchema,
  UpdateInvoiceSchema,
  TransitionInvoiceSchema,
  CreatePaymentSchema,
  ListInvoicesQuerySchema,
  ListPaymentsQuerySchema,
  CreateExpenseSchema,
  UpdateExpenseSchema,
  ListExpensesQuerySchema,
  CreateRetainerSchema,
  UpdateRetainerSchema,
  ListRetainersQuerySchema,
  SummaryQuerySchema,
  MonthlySummaryQuerySchema,
  DebtorsQuerySchema,
} from './finance.schema'
import {
  listInvoices,
  getInvoiceDetail,
  createInvoice,
  updateInvoice,
  transitionInvoice,
  archiveInvoice,
  generateInvoicePdf,
  listPayments,
  registerPayment,
  listExpenses,
  createExpense,
  updateExpense,
  archiveExpense,
  expenseSummary,
  listRetainers,
  getRetainerDetail,
  createRetainer,
  updateRetainer,
  archiveRetainer,
  generateRetainerInvoice,
  financeSummary,
  monthlySummary,
  topDebtors,
  getDolarRates,
} from './finance.service'

const TAG = 'Finanzas'
const security = ADMIN_SECURITY

// Middleware de autorización financiero — solo owner y member.
// Reutilizable en todos los handlers de este router.
const financeAuth = [authorize('owner', 'member')]

export async function financeRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  // ── Facturas ──────────────────────────────────────────────────────────────

  r.get(
    '/invoices',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar facturas',
        description: 'Lista facturas con derivedStatus y balance. Soporta tabs: all|por_cobrar|vencidas|pagadas|borradores.',
        security,
        querystring: ListInvoicesQuerySchema,
      },
      preHandler: financeAuth,
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
        description: 'Crea una factura con multimoneda. Calcula amountBase automáticamente.',
        security,
        body: CreateInvoiceSchema,
      },
      preHandler: financeAuth,
    },
    async (request, reply) => {
      const created = await createInvoice(request.hubUser!.portalId, request.hubUser!.sub, request.body)
      return reply.status(201).send(ok(created))
    },
  )

  r.get(
    '/invoices/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Detalle de factura',
        description: 'Devuelve la factura con ítems, cobros y balance pendiente en USD.',
        security,
        params: IdParamSchema,
      },
      preHandler: financeAuth,
    },
    async (request) => {
      return ok(await getInvoiceDetail(request.hubUser!.portalId, request.params.id))
    },
  )

  r.get(
    '/invoices/:id/pdf',
    {
      schema: {
        tags: [TAG],
        summary: 'PDF de factura',
        description: 'Genera el PDF en el servidor y devuelve el base64 para descarga en el cliente.',
        security,
        params: IdParamSchema,
      },
      preHandler: financeAuth,
    },
    async (request) => {
      return ok(await generateInvoicePdf(request.hubUser!.portalId, request.params.id))
    },
  )

  r.patch(
    '/invoices/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Actualizar factura',
        description: 'Actualiza campos de una factura en borrador. Recalcula amountBase si cambia moneda/TC.',
        security,
        params: IdParamSchema,
        body: UpdateInvoiceSchema,
      },
      preHandler: financeAuth,
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
        description: 'Transiciona el estado manual (draft→sent, sent→overdue, etc.).',
        security,
        params: IdParamSchema,
        body: TransitionInvoiceSchema,
      },
      preHandler: financeAuth,
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
        description: 'Archiva la factura (soft-delete). No elimina datos de cobros asociados.',
        security,
        params: IdParamSchema,
      },
      preHandler: financeAuth,
    },
    async (request) => {
      await archiveInvoice(request.hubUser!.portalId, request.params.id)
      return ok({ success: true })
    },
  )

  // ── Cobros ────────────────────────────────────────────────────────────────

  r.get(
    '/payments',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar cobros',
        description: 'Lista cobros enriquecidos (número de factura, moneda, empresa). Soporta filtros method/from/to/companyId/invoiceId.',
        security,
        querystring: ListPaymentsQuerySchema,
      },
      preHandler: financeAuth,
    },
    async (request) => {
      const result = await listPayments(request.hubUser!.portalId, request.query)
      return ok(result.payments, { totalPeriod: result.meta.totalPeriod })
    },
  )

  r.post(
    '/payments',
    {
      schema: {
        tags: [TAG],
        summary: 'Registrar cobro',
        description: 'Registra un cobro. El TC se congela al momento del pago. Si cubre el amountBase, marca la factura como pagada.',
        security,
        body: CreatePaymentSchema,
      },
      preHandler: financeAuth,
    },
    async (request, reply) => {
      const created = await registerPayment(request.hubUser!.portalId, request.hubUser!.sub, request.body)
      return reply.status(201).send(ok(created))
    },
  )

  // ── Gastos ────────────────────────────────────────────────────────────────

  r.get(
    '/expenses',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar gastos',
        description: 'Lista gastos con filtros por categoría, deal, período y recurrencia.',
        security,
        querystring: ListExpensesQuerySchema,
      },
      preHandler: financeAuth,
    },
    async (request) => {
      return ok(await listExpenses(request.hubUser!.portalId, request.query))
    },
  )

  /**
   * El endpoint de summary de gastos va ANTES de /:id para que Fastify no
   * confunda 'summary' con un ID de gasto.
   */
  r.get(
    '/expenses/summary',
    {
      schema: {
        tags: [TAG],
        summary: 'Resumen de gastos',
        description: 'Total de gastos en USD y ARS, más desglose por categoría.',
        security,
      },
      preHandler: financeAuth,
    },
    async (request) => {
      return ok(await expenseSummary(request.hubUser!.portalId))
    },
  )

  r.post(
    '/expenses',
    {
      schema: {
        tags: [TAG],
        summary: 'Crear gasto',
        description: 'Crea un gasto con multimoneda. Calcula amountBase automáticamente. Registra en record_history.',
        security,
        body: CreateExpenseSchema,
      },
      preHandler: financeAuth,
    },
    async (request, reply) => {
      const created = await createExpense(request.hubUser!.portalId, request.hubUser!.sub, request.body)
      return reply.status(201).send(ok(created))
    },
  )

  r.patch(
    '/expenses/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Actualizar gasto',
        description: 'Actualiza campos del gasto. Recalcula amountBase si cambia monto/moneda/TC.',
        security,
        params: IdParamSchema,
        body: UpdateExpenseSchema,
      },
      preHandler: financeAuth,
    },
    async (request) => {
      return ok(await updateExpense(request.hubUser!.portalId, request.params.id, request.hubUser!.sub, request.body))
    },
  )

  r.delete(
    '/expenses/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Archivar gasto',
        description: 'Archiva el gasto (soft-delete).',
        security,
        params: IdParamSchema,
      },
      preHandler: financeAuth,
    },
    async (request) => {
      await archiveExpense(request.hubUser!.portalId, request.params.id)
      return ok({ success: true })
    },
  )

  // ── Retainers ─────────────────────────────────────────────────────────────

  r.get(
    '/retainers',
    {
      schema: {
        tags: [TAG],
        summary: 'Listar retainers',
        description: 'Lista retainers con companyName. Filtrá por status o companyId.',
        security,
        querystring: ListRetainersQuerySchema,
      },
      preHandler: financeAuth,
    },
    async (request) => {
      return ok(await listRetainers(request.hubUser!.portalId, request.query))
    },
  )

  r.post(
    '/retainers',
    {
      schema: {
        tags: [TAG],
        summary: 'Crear retainer',
        description: 'Crea un contrato de honorarios mensuales. billingDay controla cuándo se genera la factura (1–28).',
        security,
        body: CreateRetainerSchema,
      },
      preHandler: financeAuth,
    },
    async (request, reply) => {
      const created = await createRetainer(request.hubUser!.portalId, request.hubUser!.sub, request.body)
      return reply.status(201).send(ok(created))
    },
  )

  r.get(
    '/retainers/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Detalle de retainer',
        description: 'Devuelve el retainer con sus facturas vinculadas.',
        security,
        params: IdParamSchema,
      },
      preHandler: financeAuth,
    },
    async (request) => {
      return ok(await getRetainerDetail(request.hubUser!.portalId, request.params.id))
    },
  )

  r.patch(
    '/retainers/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Actualizar retainer',
        description: 'Actualiza estado, monto o configuración. Un retainer cancelado no puede reactivarse.',
        security,
        params: IdParamSchema,
        body: UpdateRetainerSchema,
      },
      preHandler: financeAuth,
    },
    async (request) => {
      return ok(await updateRetainer(request.hubUser!.portalId, request.params.id, request.body))
    },
  )

  r.delete(
    '/retainers/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Archivar retainer',
        description: 'Archiva el retainer (soft-delete). Las facturas ya generadas se mantienen.',
        security,
        params: IdParamSchema,
      },
      preHandler: financeAuth,
    },
    async (request) => {
      await archiveRetainer(request.hubUser!.portalId, request.params.id)
      return ok({ success: true })
    },
  )

  /**
   * Genera la factura mensual de un retainer activo (idempotente por mes).
   * Si ya existe factura para el mes actual, devuelve created=false.
   */
  r.post(
    '/retainers/:id/generate-invoice',
    {
      schema: {
        tags: [TAG],
        summary: 'Generar factura de retainer',
        description: 'Genera la factura del período actual (idempotente: no duplica si ya existe en el mes).',
        security,
        params: IdParamSchema,
        body: z.object({}),
      },
      preHandler: financeAuth,
    },
    async (request, reply) => {
      const result = await generateRetainerInvoice(
        request.hubUser!.portalId,
        request.params.id,
        request.hubUser!.sub,
      )
      const status = result.created ? 201 : 200
      return reply.status(status).send(ok(result))
    },
  )

  // ── Resúmenes ─────────────────────────────────────────────────────────────

  /**
   * Los endpoints de resumen van ANTES de cualquier ruta con parámetro
   * para evitar colisiones de Fastify (ej: /summary vs /:id).
   */
  r.get(
    '/summary',
    {
      schema: {
        tags: [TAG],
        summary: 'Resumen financiero',
        description: 'KPIs: totalInvoiced/totalPaid/outstanding/totalExpenses/netProfit/mrr/invoicesByStatus. Filtrable por período from/to.',
        security,
        querystring: SummaryQuerySchema,
      },
      preHandler: financeAuth,
    },
    async (request) => {
      return ok(await financeSummary(request.hubUser!.portalId, request.query))
    },
  )

  r.get(
    '/summary/monthly',
    {
      schema: {
        tags: [TAG],
        summary: 'Resumen mensual',
        description: 'Ingresos vs gastos por mes para el gráfico de barras. months=6 por default (máx 24).',
        security,
        querystring: MonthlySummaryQuerySchema,
      },
      preHandler: financeAuth,
    },
    async (request) => {
      const months = (request.query as { months?: number }).months ?? 6
      return ok(await monthlySummary(request.hubUser!.portalId, months))
    },
  )

  r.get(
    '/summary/debtors',
    {
      schema: {
        tags: [TAG],
        summary: 'Top deudores',
        description: 'Empresas con mayor saldo pendiente de CxC. limit=5 por default.',
        security,
        querystring: DebtorsQuerySchema,
      },
      preHandler: financeAuth,
    },
    async (request) => {
      const limit = (request.query as { limit?: number }).limit ?? 5
      return ok(await topDebtors(request.hubUser!.portalId, limit))
    },
  )

  // ── Tipo de cambio ────────────────────────────────────────────────────────

  r.get(
    '/fx',
    {
      schema: {
        tags: [TAG],
        summary: 'Tipo de cambio ARS/USD',
        description: 'Cotizaciones blue y tarjeta de dolarapi.com (caché 10 min). El front usa blue.venta como TC por defecto.',
        security,
      },
      preHandler: financeAuth,
    },
    async () => {
      const rates = await getDolarRates()
      return ok(rates)
    },
  )
}
