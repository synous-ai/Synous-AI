import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db'
import { invoice, invoiceItem, retainer, company } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { cursorWhere, decodeTextCursor, ISO_DATE_CURSOR, paginateRows, type Paginated } from '../../lib/pagination'
import type { CreateRetainerDTO, UpdateRetainerDTO, ListRetainersQuery } from './finance.schema'
import {
  num,
  calcAmountBase,
  requireRetainer,
  nextInvoiceNumber,
  type InvoiceRow,
  type RetainerRow,
} from './finance-shared'

// ── Retainers ─────────────────────────────────────────────────────────────────

/**
 * Lista retainers con JOIN a company para enriquecer con companyName.
 * Filtra por status y/o companyId si vienen en el query.
 */
export async function listRetainers(
  portalId: string,
  query: ListRetainersQuery,
): Promise<Paginated<RetainerRow & { companyName: string | null }>> {
  const conditions = [eq(retainer.portalId, portalId), eq(retainer.archived, false)]
  if (query.status) conditions.push(eq(retainer.status, query.status))
  if (query.companyId) conditions.push(eq(retainer.companyId, query.companyId))

  const cursor = decodeTextCursor(query.cursor, ISO_DATE_CURSOR)
  const rows = await db
    .select()
    .from(retainer)
    .where(and(...conditions, cursor ? cursorWhere(retainer.startDate, retainer.id, cursor, 'asc') : undefined))
    .orderBy(asc(retainer.startDate), asc(retainer.id))
    .limit(query.limit + 1)
  const { items: retainers, nextCursor } = paginateRows(rows, query.limit, (r) => ({ createdAt: r.startDate, id: r.id }))

  if (retainers.length === 0) return { items: [], nextCursor }

  const companyIds = [...new Set(retainers.map((r) => r.companyId))]
  const companies = await db
    .select({ id: company.id, name: company.name })
    .from(company)
    .where(and(eq(company.portalId, portalId), inArray(company.id, companyIds)))
  const companyMap = new Map(companies.map((c) => [c.id, c.name]))

  return { items: retainers.map((r) => ({ ...r, companyName: companyMap.get(r.companyId) ?? null })), nextCursor }
}

/**
 * Detalle de un retainer: datos del retainer + facturas vinculadas.
 */
export async function getRetainerDetail(
  portalId: string,
  id: string,
): Promise<RetainerRow & { companyName: string | null; invoices: InvoiceRow[] }> {
  const ret = await requireRetainer(portalId, id)

  const [companyRow] = await db
    .select({ name: company.name })
    .from(company)
    .where(and(eq(company.id, ret.companyId), eq(company.portalId, portalId)))
    .limit(1)

  const invoices_ = await db
    .select()
    .from(invoice)
    .where(and(eq(invoice.retainerId, id), eq(invoice.archived, false)))
    .orderBy(desc(invoice.createdAt))

  return {
    ...ret,
    companyName: companyRow?.name ?? null,
    invoices: invoices_,
  }
}

/**
 * Crea un retainer. Calcula amountBase en el service si no viene pre-calculado.
 */
export async function createRetainer(
  portalId: string,
  userId: string,
  input: CreateRetainerDTO,
): Promise<RetainerRow & { companyName: string | null }> {
  // Verificar que la empresa exista y pertenezca al portal
  const [companyRow] = await db
    .select()
    .from(company)
    .where(and(eq(company.id, input.companyId), eq(company.portalId, portalId)))
    .limit(1)
  if (!companyRow) throw Errors.notFound('Empresa no encontrada')

  const currency = input.currency
  const exchangeRate = currency === 'ARS' ? (input.exchangeRate ?? 1) : 1
  const amountBase = input.amountBase != null
    ? input.amountBase
    : calcAmountBase(input.amount, currency, exchangeRate)

  const [row] = await db
    .insert(retainer)
    .values({
      portalId,
      companyId: input.companyId,
      amount: num(input.amount),
      currency,
      exchangeRate: num(exchangeRate),
      amountBase: num(amountBase),
      billingDay: input.billingDay,
      status: 'active',
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      notes: input.notes ?? null,
      createdBy: userId,
    })
    .returning()
  if (!row) throw Errors.internal('No se pudo crear el retainer')

  return { ...row, companyName: companyRow.name }
}

/**
 * Actualiza un retainer. Recalcula amountBase si cambia monto/moneda/TC.
 * Un retainer cancelado no puede reactivarse.
 */
export async function updateRetainer(
  portalId: string,
  id: string,
  input: UpdateRetainerDTO,
): Promise<RetainerRow & { companyName: string | null }> {
  return db.transaction(async (tx) => {
    const current = await requireRetainer(portalId, id, tx)

    // Un retainer cancelado no puede volver a activarse ni pausarse
    if (current.status === 'cancelled' && input.status && input.status !== 'cancelled') {
      throw Errors.badRequest('Un retainer cancelado no puede reactivarse')
    }

    const currency = input.currency ?? current.currency
    const amount = input.amount ?? Number(current.amount)
    const exchangeRate =
      input.exchangeRate != null
        ? (currency === 'ARS' ? input.exchangeRate : 1)
        : Number(current.exchangeRate)
    const needsRecalc = input.amount != null || input.currency != null || input.exchangeRate != null
    const amountBase = needsRecalc ? calcAmountBase(amount, currency, exchangeRate) : Number(current.amountBase)

    const [updated] = await tx
      .update(retainer)
      .set({
        ...(input.status != null ? { status: input.status } : {}),
        ...(input.amount != null ? { amount: num(input.amount) } : {}),
        ...(input.currency != null ? { currency } : {}),
        ...(needsRecalc ? { exchangeRate: num(exchangeRate), amountBase: num(amountBase) } : {}),
        ...(input.billingDay != null ? { billingDay: input.billingDay } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate ?? null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(retainer.id, id))
      .returning()
    if (!updated) throw Errors.internal('No se pudo actualizar el retainer')

    const [companyRow] = await tx
      .select({ name: company.name })
      .from(company)
      .where(and(eq(company.id, updated.companyId), eq(company.portalId, portalId)))
      .limit(1)

    return { ...updated, companyName: companyRow?.name ?? null }
  })
}

/** Archiva un retainer (soft-delete). */
export async function archiveRetainer(portalId: string, id: string): Promise<void> {
  await requireRetainer(portalId, id)
  await db
    .update(retainer)
    .set({ archived: true, archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(retainer.id, id))
}

/**
 * Genera la factura mensual para un retainer (operación idempotente).
 *
 * Idempotencia: si ya existe una factura de este retainer con issueDate en el
 * mes actual (YYYY-MM), no crea otra — devuelve la existente con created=false.
 * Esto evita duplicados si el cron o el usuario llaman múltiples veces en el mismo mes.
 *
 * El importe y la moneda se copian del retainer (con amountBase congelado).
 */
export async function generateRetainerInvoice(
  portalId: string,
  retainerId: string,
  userId: string,
): Promise<{ invoice: InvoiceRow; created: boolean }> {
  return db.transaction(async (tx) => {
    const ret = await requireRetainer(portalId, retainerId, tx)

    if (ret.status !== 'active') {
      throw Errors.badRequest('Solo se puede generar factura para un retainer activo')
    }

    // El lock de numeración va ANTES del chequeo de idempotencia: si no, dos
    // generaciones simultáneas del mismo retainer pasan las dos el chequeo y
    // emiten dos facturas del mes con números distintos (el UNIQUE no salta).
    const next = await nextInvoiceNumber(tx, portalId)

    // Idempotencia: buscar factura del mes actual para este retainer
    const currentMonth = new Date().toISOString().slice(0, 7) // 'YYYY-MM'
    const [existing] = await tx
      .select()
      .from(invoice)
      .where(
        and(
          eq(invoice.retainerId, retainerId),
          eq(invoice.archived, false),
          // issueDate LIKE 'YYYY-MM-%'
          sql`${invoice.issueDate} LIKE ${currentMonth + '-%'}`,
        ),
      )
      .limit(1)

    if (existing) return { invoice: existing, created: false }

    const today = new Date().toISOString().slice(0, 10) // 'YYYY-MM-DD'
    const [row] = await tx
      .insert(invoice)
      .values({
        portalId,
        number: next,
        companyId: ret.companyId,
        status: 'draft',
        issueDate: today,
        // vencimiento = mismo día del billing day del mes actual
        dueDate: `${currentMonth}-${String(ret.billingDay).padStart(2, '0')}`,
        currency: ret.currency,
        exchangeRate: ret.exchangeRate,
        amountBase: ret.amountBase,
        subtotal: ret.amount,
        tax: '0',
        total: ret.amount,
        notes: `Factura automática — retainer ${retainerId.slice(-6)}`,
        retainerId,
        createdBy: userId,
      })
      .returning()
    if (!row) throw Errors.internal('No se pudo generar la factura del retainer')

    // Ítem único: describe el servicio mensual
    await tx.insert(invoiceItem).values({
      invoiceId: row.id,
      description: 'Honorarios mensuales (retainer)',
      quantity: '1',
      unitPrice: ret.amount,
    })

    return { invoice: row, created: true }
  })
}
