/**
 * finance-shared.ts — Tipos y helpers internos compartidos por los archivos
 * del módulo de Finanzas (facturas, cobros, gastos, retainers, reportes).
 *
 * No se re-exporta desde el barrel `finance.service.ts`: estos símbolos no
 * eran públicos en el archivo original y siguen sin serlo.
 */

import { eq, and, sql } from 'drizzle-orm'
import { db, type DB } from '../../db'
import { invoice, invoiceItem, payment, expense, retainer } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { toDecimal } from '../../lib/money'
import type { Tx } from '../../lib/audit'

// ── Tipos internos ────────────────────────────────────────────────────────────

/** Dentro de una transacción se pasa `tx`: leer con el `db` global pide otra conexión al pool. */
export type Executor = DB | Tx

export type InvoiceRow = typeof invoice.$inferSelect
export type InvoiceItemRow = typeof invoiceItem.$inferSelect
export type PaymentRow = typeof payment.$inferSelect
export type ExpenseRow = typeof expense.$inferSelect
export type RetainerRow = typeof retainer.$inferSelect

// ── Helpers de dinero ─────────────────────────────────────────────────────────

/**
 * Convierte un número a string con 2 decimales.
 * Wraper sobre toDecimal() del lib para uso interno del service.
 */
export function num(n: number): string {
  return toDecimal(n) as string
}

/**
 * Calcula el monto en moneda base (USD) a partir del monto y el tipo de cambio.
 * Si currency === 'USD', retorna el monto tal cual (exchangeRate se ignora).
 * Si currency === 'ARS', divide por exchangeRate (ARS/USD).
 */
export function calcAmountBase(amount: number, currency: string, exchangeRate: number): number {
  if (currency === 'USD') return amount
  // ARS: amount / exchangeRate (ej: 1000 ARS / 1000 ARS per USD = 1 USD)
  return amount / exchangeRate
}

// ── Helpers de query ──────────────────────────────────────────────────────────

/** Devuelve la factura si pertenece al portal y no está archivada. */
export async function requireInvoice(portalId: string, id: string, executor: Executor = db): Promise<InvoiceRow> {
  const [row] = await executor
    .select()
    .from(invoice)
    .where(and(eq(invoice.id, id), eq(invoice.portalId, portalId), eq(invoice.archived, false)))
    .limit(1)
  if (!row) throw Errors.notFound('Factura no encontrada')
  return row
}

/** Devuelve el gasto si pertenece al portal y no está archivado. */
export async function requireExpense(
  portalId: string,
  id: string,
  executor: Executor = db,
  { forUpdate = false }: { forUpdate?: boolean } = {},
): Promise<ExpenseRow> {
  const query = executor
    .select()
    .from(expense)
    .where(and(eq(expense.id, id), eq(expense.portalId, portalId), eq(expense.archived, false)))
    .limit(1)
  const [row] = forUpdate ? await query.for('update') : await query
  if (!row) throw Errors.notFound('Gasto no encontrado')
  return row
}

/** Devuelve el retainer si pertenece al portal y no está archivado. */
export async function requireRetainer(portalId: string, id: string, executor: Executor = db): Promise<RetainerRow> {
  const [row] = await executor
    .select()
    .from(retainer)
    .where(and(eq(retainer.id, id), eq(retainer.portalId, portalId), eq(retainer.archived, false)))
    .limit(1)
  if (!row) throw Errors.notFound('Retainer no encontrado')
  return row
}

/**
 * Próximo número de factura del portal.
 *
 * `MAX(number) + 1` solo es correcto si nadie numera en paralelo: en READ
 * COMMITTED dos transacciones leen el mismo MAX y emiten dos facturas con el
 * mismo número (el retainer automático y una factura manual en el mismo
 * instante alcanzan). El advisory lock se libera solo al commit/rollback y
 * serializa la numeración por portal sin bloquear la tabla; el UNIQUE
 * (portal_id, number) queda como red de seguridad.
 */
export async function nextInvoiceNumber(tx: Tx, portalId: string): Promise<number> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`invoice-number:${portalId}`}))`)
  const [numRow] = await tx
    .select({ next: sql<number>`coalesce(max(${invoice.number}), 0) + 1` })
    .from(invoice)
    .where(eq(invoice.portalId, portalId))
  return numRow?.next ?? 1
}

// ── derivedStatus ─────────────────────────────────────────────────────────────

/**
 * Calcula el estado derivado on-read de una factura combinando el status
 * almacenado con el saldo real (invoiceTotal − totalPaid en amountBase).
 *
 * Estados derivados:
 *   - draft   → 'borrador' (manual, nunca se sobreescribe)
 *   - void    → 'anulada'
 *   - sent/paid/overdue:
 *       · balance == 0   → 'pagada'
 *       · balance > 0 && dueDate < hoy → 'vencida'
 *       · balance > 0 && balance < amountBase → 'parcial'
 *       · de lo contrario → 'enviada'
 */
export function computeDerivedStatus(
  inv: InvoiceRow,
  balance: number,
): 'borrador' | 'enviada' | 'parcial' | 'pagada' | 'vencida' | 'anulada' {
  if (inv.status === 'draft') return 'borrador'
  if (inv.status === 'void') return 'anulada'

  const amtBase = Number(inv.amountBase)
  if (balance <= 0) return 'pagada'

  const today = new Date().toISOString().slice(0, 10)
  if (inv.dueDate && inv.dueDate < today) return 'vencida'
  if (balance < amtBase) return 'parcial'

  return 'enviada'
}
