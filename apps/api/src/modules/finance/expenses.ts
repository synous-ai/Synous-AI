import { and, between, desc, eq, gte, lte, sql, sum } from 'drizzle-orm'
import { db } from '../../db'
import { expense } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { cursorWhere, decodeTextCursor, ISO_DATE_CURSOR, paginateRows, type Paginated } from '../../lib/pagination'
import { recordFieldChanges } from '../../lib/audit'
import { assertCompanyInPortal, assertDealInPortal } from '../../lib/portal-access'
import { claimUpload, isNewStorageKey, prepareUploadClaim } from '../uploads/uploads.service'
import type { CreateExpenseDTO, UpdateExpenseDTO, ListExpensesQuery } from './finance.schema'
import { num, calcAmountBase, requireExpense, type ExpenseRow } from './finance-shared'

// ── Gastos ────────────────────────────────────────────────────────────────────

/**
 * Lista gastos del portal con filtros opcionales por categoría, deal, período y recurrencia.
 */
export async function listExpenses(portalId: string, query: ListExpensesQuery): Promise<Paginated<ExpenseRow>> {
  const conditions = [eq(expense.portalId, portalId), eq(expense.archived, false)]

  if (query.category) conditions.push(eq(expense.category, query.category))
  if (query.dealId) conditions.push(eq(expense.dealId, query.dealId))
  if (query.isRecurring != null) conditions.push(eq(expense.isRecurring, query.isRecurring))
  if (query.from && query.to) {
    conditions.push(between(expense.expenseDate, query.from, query.to))
  } else if (query.from) {
    conditions.push(gte(expense.expenseDate, query.from))
  } else if (query.to) {
    conditions.push(lte(expense.expenseDate, query.to))
  }

  const cursor = decodeTextCursor(query.cursor, ISO_DATE_CURSOR)
  const rows = await db
    .select()
    .from(expense)
    .where(and(...conditions, cursor ? cursorWhere(expense.expenseDate, expense.id, cursor) : undefined))
    .orderBy(desc(expense.expenseDate), desc(expense.id))
    .limit(query.limit + 1)
  return paginateRows(rows, query.limit, (e) => ({ createdAt: e.expenseDate, id: e.id }))
}

/**
 * Crea un gasto con validación de moneda y cálculo de amountBase.
 * Registra en record_history para auditoría.
 */
export async function createExpense(
  portalId: string,
  userId: string,
  input: CreateExpenseDTO,
): Promise<ExpenseRow> {
  const preparedClaim = input.storageKey
    ? await prepareUploadClaim({ storageKey: input.storageKey, portalId, actor: { kind: 'hub', userId, portalId }, purpose: 'expense_receipt' })
    : null

  return db.transaction(async (tx) => {
    await assertCompanyInPortal(portalId, input.companyId, tx)
    if (input.dealId) await assertDealInPortal(portalId, input.dealId, tx)
    if (input.storageKey) await claimUpload(tx, preparedClaim)
    const currency = input.currency
    const exchangeRate = currency === 'ARS' ? (input.exchangeRate ?? 1) : 1
    // Si el front envió amountBase pre-calculado, lo usamos; si no, lo calculamos.
    const amountBase = input.amountBase != null
      ? input.amountBase
      : calcAmountBase(input.amount, currency, exchangeRate)

    const [row] = await tx
      .insert(expense)
      .values({
        portalId,
        description: input.description,
        amount: num(input.amount),
        currency,
        exchangeRate: num(exchangeRate),
        amountBase: num(amountBase),
        category: input.category,
        expenseDate: input.expenseDate,
        vendor: input.vendor ?? null,
        dealId: input.dealId ?? null,
        companyId: input.companyId ?? null,
        paymentMethod: input.paymentMethod ?? null,
        isRecurring: input.isRecurring ?? false,
        notes: input.notes ?? null,
        storageKey: input.storageKey ?? null,
        createdBy: userId,
      })
      .returning()
    if (!row) throw Errors.internal('No se pudo crear el gasto')

    // Registrar creación en record_history
    await recordFieldChanges({
      tx,
      portalId,
      entityType: 'expense',
      entityId: row.id,
      before: {},
      after: {
        description: input.description,
        amount: input.amount,
        currency,
        category: input.category,
        expenseDate: input.expenseDate,
      },
      changedBy: userId,
      sourceType: 'API',
    })

    return row
  })
}

/**
 * Actualiza un gasto. Recalcula amountBase si cambian amount/currency/exchangeRate.
 * Registra los campos modificados en record_history.
 */
export async function updateExpense(
  portalId: string,
  id: string,
  userId: string,
  input: UpdateExpenseDTO,
): Promise<ExpenseRow> {
  const preparedClaim = input.storageKey
    ? await prepareUploadClaim({ storageKey: input.storageKey, portalId, actor: { kind: 'hub', userId, portalId }, purpose: 'expense_receipt' })
    : null

  // El comprobante reemplazado NO se borra del store: record_history conserva
  // la key vieja y forma parte del rastro contable (nunca se borran datos del CRM).
  return db.transaction(async (tx) => {
    const current = await requireExpense(portalId, id, tx, { forUpdate: true })
    await assertCompanyInPortal(portalId, input.companyId, tx)
    if (input.dealId) await assertDealInPortal(portalId, input.dealId, tx)
    if (isNewStorageKey(input.storageKey, current.storageKey)) await claimUpload(tx, preparedClaim)

    const currency = input.currency ?? current.currency
    const amount = input.amount ?? Number(current.amount)
    const exchangeRate =
      input.exchangeRate != null
        ? (currency === 'ARS' ? input.exchangeRate : 1)
        : Number(current.exchangeRate)
    const needsRecalc = input.amount != null || input.currency != null || input.exchangeRate != null
    const amountBase = needsRecalc ? calcAmountBase(amount, currency, exchangeRate) : Number(current.amountBase)

    const patch: Partial<typeof expense.$inferInsert> = {
      updatedAt: new Date(),
    }
    if (input.description != null) patch.description = input.description
    if (input.amount != null) patch.amount = num(input.amount)
    if (input.currency != null) patch.currency = input.currency
    if (needsRecalc) {
      patch.exchangeRate = num(exchangeRate)
      patch.amountBase = num(amountBase)
    }
    if (input.category != null) patch.category = input.category
    if (input.expenseDate != null) patch.expenseDate = input.expenseDate
    if (input.vendor !== undefined) patch.vendor = input.vendor ?? null
    if (input.dealId !== undefined) patch.dealId = input.dealId ?? null
    if (input.companyId !== undefined) patch.companyId = input.companyId ?? null
    if (input.paymentMethod !== undefined) patch.paymentMethod = input.paymentMethod ?? null
    if (input.isRecurring != null) patch.isRecurring = input.isRecurring
    if (input.notes !== undefined) patch.notes = input.notes ?? null
    if (input.storageKey !== undefined) patch.storageKey = input.storageKey ?? null

    const [updated] = await tx.update(expense).set(patch).where(eq(expense.id, id)).returning()
    if (!updated) throw Errors.internal('No se pudo actualizar el gasto')

    // Registrar solo los campos que realmente cambiaron
    await recordFieldChanges({
      tx,
      portalId,
      entityType: 'expense',
      entityId: id,
      before: current as unknown as Record<string, unknown>,
      after: patch as Record<string, unknown>,
      changedBy: userId,
      sourceType: 'API',
    })

    return updated
  })
}

/** Archiva un gasto (soft-delete). */
export async function archiveExpense(portalId: string, id: string): Promise<void> {
  await requireExpense(portalId, id)
  await db
    .update(expense)
    .set({ archived: true, archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(expense.id, id))
}

/**
 * Resumen de gastos: total en USD y ARS (para mostrar en ambas monedas),
 * y desglose por categoría (en amountBase/USD).
 */
export async function expenseSummary(
  portalId: string,
): Promise<{ totalExpenses: string; totalExpensesArs: string; byCategory: Record<string, string> }> {
  const scope = and(eq(expense.portalId, portalId), eq(expense.archived, false))
  const [[totals], categories] = await Promise.all([
    db
      .select({
        totalUsd: sum(expense.amountBase),
        // El total ARS usa el monto original de los gastos cargados en ARS.
        totalArs: sql<string | null>`sum(${expense.amount}) filter (where ${expense.currency} = 'ARS')`,
      })
      .from(expense)
      .where(scope),
    db.select({ category: expense.category, total: sum(expense.amountBase) }).from(expense).where(scope).groupBy(expense.category),
  ])

  return {
    totalExpenses: num(Number(totals?.totalUsd ?? 0)),
    totalExpensesArs: num(Number(totals?.totalArs ?? 0)),
    byCategory: Object.fromEntries(categories.map((c) => [c.category, num(Number(c.total ?? 0))])),
  }
}
