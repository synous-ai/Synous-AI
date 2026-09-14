import { and, asc, between, count, desc, eq, gte, inArray, isNotNull, lte, ne, sql, sum } from 'drizzle-orm'
import { db } from '../../db'
import { invoice, payment, expense, retainer, company } from '../../db/schema'
import { getDolarRates } from '../../lib/fx'
import type { SummaryQuery } from './finance.schema'
import { num } from './finance-shared'

// ── Resumen financiero ────────────────────────────────────────────────────────

/**
 * Resumen financiero completo con filtro de período.
 *
 * Separa FLUJOS (scoped al período from/to) de SNAPSHOTS (estado actual):
 *   Flujos (scoped):
 *     - totalInvoiced: Σ amountBase de facturas no-void emitidas en el período
 *     - totalPaid: Σ amountBase de cobros registrados en el período
 *     - totalExpenses: Σ amountBase de gastos en el período
 *     - netProfit: totalPaid − totalExpenses (cobrado − gastado)
 *   Snapshots (siempre actuales, sin filtro de fecha):
 *     - outstanding: saldo pendiente de facturas sent/overdue
 *     - mrr: Σ amountBase de retainers activos
 *     - invoicesByStatus: conteo de facturas por status (no archivadas)
 */
export async function financeSummary(
  portalId: string,
  query: SummaryQuery,
): Promise<{
  totalInvoiced: string
  totalPaid: string
  outstanding: string
  totalExpenses: string
  netProfit: string
  mrr: string
  invoicesByStatus: Record<string, number>
}> {
  // ── Flujos scoped al período ────────────────────────────────────────────────

  // Facturas del período (issueDate en el rango)
  const invoiceConds = [eq(invoice.portalId, portalId), eq(invoice.archived, false)]
  if (query.from && query.to) {
    invoiceConds.push(between(invoice.issueDate, query.from, query.to))
  } else if (query.from) {
    invoiceConds.push(gte(invoice.issueDate, query.from))
  } else if (query.to) {
    invoiceConds.push(lte(invoice.issueDate, query.to))
  }

  const [[invoicedRow], statusRows] = await Promise.all([
    db
      .select({ total: sum(invoice.amountBase) })
      .from(invoice)
      .where(and(...invoiceConds, ne(invoice.status, 'void'))),
    db
      .select({ status: invoice.status, n: count() })
      .from(invoice)
      .where(and(...invoiceConds))
      .groupBy(invoice.status),
  ])
  const totalInvoiced = Number(invoicedRow?.total ?? 0)
  const invoicesByStatus: Record<string, number> = Object.fromEntries(statusRows.map((r) => [r.status, r.n]))

  // Cobros del período (paidAt en el rango)
  const paymentConds = [eq(payment.portalId, portalId)]
  if (query.from && query.to) {
    paymentConds.push(between(payment.paidAt, new Date(query.from), new Date(query.to + 'T23:59:59Z')))
  } else if (query.from) {
    paymentConds.push(gte(payment.paidAt, new Date(query.from)))
  } else if (query.to) {
    paymentConds.push(lte(payment.paidAt, new Date(query.to + 'T23:59:59Z')))
  }

  const [payTotals] = await db
    .select({ total: sum(payment.amountBase) })
    .from(payment)
    .where(and(...paymentConds))
  const totalPaid = Number(payTotals?.total ?? 0)

  // Gastos del período (expenseDate en el rango)
  const expenseConds = [eq(expense.portalId, portalId), eq(expense.archived, false)]
  if (query.from && query.to) {
    expenseConds.push(between(expense.expenseDate, query.from, query.to))
  } else if (query.from) {
    expenseConds.push(gte(expense.expenseDate, query.from))
  } else if (query.to) {
    expenseConds.push(lte(expense.expenseDate, query.to))
  }

  const [expTotals] = await db
    .select({ total: sum(expense.amountBase) })
    .from(expense)
    .where(and(...expenseConds))
  const totalExpenses = Number(expTotals?.total ?? 0)

  const netProfit = totalPaid - totalExpenses

  // ── Snapshots (estado actual, sin filtro de período) ────────────────────────

  // CxC: saldo pendiente de facturas sent + overdue (en amountBase)
  const open = openInvoiceBalances(portalId)
  const [outstandingRow] = await db
    .select({ total: sql<string | null>`sum(${open.balance})` })
    .from(invoice)
    .leftJoin(open.paid, eq(open.paid.invoiceId, invoice.id))
    .where(open.isOpen)
  const outstanding = Number(outstandingRow?.total ?? 0)

  // MRR: Σ amountBase de retainers activos
  const [mrrRow] = await db
    .select({ total: sum(retainer.amountBase) })
    .from(retainer)
    .where(and(eq(retainer.portalId, portalId), eq(retainer.status, 'active'), eq(retainer.archived, false)))
  const mrr = Number(mrrRow?.total ?? 0)

  return {
    totalInvoiced: num(totalInvoiced),
    totalPaid: num(totalPaid),
    outstanding: num(outstanding),
    totalExpenses: num(totalExpenses),
    netProfit: num(netProfit),
    mrr: num(mrr),
    invoicesByStatus,
  }
}

/**
 * Ingresos vs. gastos por mes para el gráfico de barras agrupadas.
 * Devuelve los últimos `months` meses (default 6), en orden cronológico.
 *
 * Cada punto: { month: 'YYYY-MM', income: totalPaid, expenses: totalExpenses, net }
 */
export async function monthlySummary(
  portalId: string,
  months = 6,
): Promise<{ month: string; income: string; expenses: string; net: string }[]> {
  // Generar los N meses hacia atrás desde hoy
  const now = new Date()
  const points: { month: string; income: number; expenses: number }[] = []

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const month = d.toISOString().slice(0, 7) // 'YYYY-MM'
    points.push({ month, income: 0, expenses: 0 })
  }

  const from = points[0]!.month + '-01'
  const to = now.toISOString().slice(0, 10)

  // Cobros por mes (agrupados con DATE_TRUNC)
  const incomeRows = await db
    .select({
      month: sql<string>`to_char(${payment.paidAt}, 'YYYY-MM')`,
      total: sum(payment.amountBase),
    })
    .from(payment)
    .where(and(eq(payment.portalId, portalId), gte(payment.paidAt, new Date(from))))
    .groupBy(sql`to_char(${payment.paidAt}, 'YYYY-MM')`)

  // Gastos por mes
  const expenseRows = await db
    .select({
      month: sql<string>`to_char(${expense.expenseDate}::date, 'YYYY-MM')`,
      total: sum(expense.amountBase),
    })
    .from(expense)
    .where(
      and(
        eq(expense.portalId, portalId),
        eq(expense.archived, false),
        between(expense.expenseDate, from, to),
      ),
    )
    .groupBy(sql`to_char(${expense.expenseDate}::date, 'YYYY-MM')`)

  const incomeMap = new Map(incomeRows.map((r) => [r.month, Number(r.total ?? 0)]))
  const expenseMap = new Map(expenseRows.map((r) => [r.month, Number(r.total ?? 0)]))

  return points.map((p) => {
    const income = incomeMap.get(p.month) ?? 0
    const expenses = expenseMap.get(p.month) ?? 0
    return { month: p.month, income: num(income), expenses: num(expenses), net: num(income - expenses) }
  })
}

/**
 * Saldo pendiente por factura abierta (sent/overdue, no archivada), para agregar
 * en SQL: `balance` = amountBase − Σ cobros, nunca negativo. Traer todas las
 * facturas abiertas y sumar en JS crecía con el histórico del portal.
 */
function openInvoiceBalances(portalId: string) {
  const paid = db
    .select({ invoiceId: payment.invoiceId, total: sum(payment.amountBase).as('paid_total') })
    .from(payment)
    .where(eq(payment.portalId, portalId))
    .groupBy(payment.invoiceId)
    .as('paid')
  return {
    paid,
    balance: sql`greatest(0, ${invoice.amountBase} - coalesce(${paid.total}, 0))`,
    isOpen: and(eq(invoice.portalId, portalId), eq(invoice.archived, false), inArray(invoice.status, ['sent', 'overdue'])),
  }
}

/**
 * Top deudores: empresas con mayor saldo pendiente de CxC.
 * Útil para el widget de "Cuentas por cobrar por cliente" en el dashboard.
 */
export async function topDebtors(
  portalId: string,
  limit = 5,
): Promise<{ companyId: string; companyName: string; outstanding: string }[]> {
  const open = openInvoiceBalances(portalId)
  const outstanding = sql<string | null>`sum(${open.balance})`
  const rows = await db
    .select({ companyId: invoice.companyId, companyName: company.name, outstanding })
    .from(invoice)
    .leftJoin(open.paid, eq(open.paid.invoiceId, invoice.id))
    .leftJoin(company, and(eq(company.id, invoice.companyId), eq(company.portalId, portalId)))
    .where(and(open.isOpen, isNotNull(invoice.companyId)))
    .groupBy(invoice.companyId, company.name)
    .orderBy(desc(outstanding), asc(invoice.companyId))
    .limit(limit)

  return rows.map((r) => ({
    companyId: r.companyId!,
    companyName: r.companyName ?? r.companyId!,
    outstanding: num(Number(r.outstanding ?? 0)),
  }))
}

// ── Tipo de cambio ────────────────────────────────────────────────────────────

/**
 * Expone las cotizaciones ARS/USD (blue + tarjeta) del endpoint de la API.
 * Delegado completamente a lib/fx.ts con caché de 10 minutos.
 */
export { getDolarRates }
