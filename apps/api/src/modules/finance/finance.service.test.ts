import { describe, it, expect } from 'vitest'

/**
 * Unit tests para la lógica de estados derivados de factura (F3 — Finanzas).
 * No tocan la DB; prueban la función pura computeDerived aislada.
 *
 * Nota: inlineamos la lógica para evitar acoplar el test al módulo de DB.
 * La función exportada `computeDerived` en finance.service.ts opera sobre
 * filas Drizzle completas (InvoiceRow), pero la lógica pura es equivalente.
 */

// ── Lógica pura inlineada ─────────────────────────────────────────────────────

type DerivedStatus = 'borrador' | 'enviada' | 'parcial' | 'vencida' | 'pagada' | 'anulada'

/**
 * Versión pura (sin dependencias de DB) de la lógica de computeDerived.
 * Acepta campos primitivos en lugar de InvoiceRow para facilitar el testing.
 */
function computeDerived(
  status: string,
  amountBase: number,
  dueDate: string | null,
  totalPaidBase: number,
  today: string,
): { balance: string; derivedStatus: DerivedStatus } {
  const rawBalance = amountBase - totalPaidBase
  const balance = String(Math.max(0, rawBalance).toFixed(2))

  let derivedStatus: DerivedStatus
  if (status === 'void') {
    derivedStatus = 'anulada'
  } else if (status === 'draft') {
    derivedStatus = 'borrador'
  } else if (rawBalance <= 0) {
    derivedStatus = 'pagada'
  } else if (totalPaidBase > 0 && rawBalance > 0) {
    derivedStatus = 'parcial'
  } else if (rawBalance > 0 && dueDate !== null && dueDate < today && status === 'sent') {
    derivedStatus = 'vencida'
  } else {
    derivedStatus = 'enviada'
  }

  return { balance, derivedStatus }
}

// ── Filtrado por tab (espejo de listInvoices post-compute) ────────────────────

function filterByTab(items: Array<{ derivedStatus: DerivedStatus }>, tab: string) {
  if (tab === 'all') return items
  if (tab === 'por_cobrar') return items.filter((i) => ['enviada', 'parcial', 'vencida'].includes(i.derivedStatus))
  if (tab === 'vencidas') return items.filter((i) => i.derivedStatus === 'vencida')
  if (tab === 'pagadas') return items.filter((i) => i.derivedStatus === 'pagada')
  if (tab === 'borradores') return items.filter((i) => i.derivedStatus === 'borrador')
  return items
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('computeDerived — derivedStatus', () => {
  const TODAY = '2026-06-13'

  it('void → anulada (sin importar el saldo)', () => {
    const { derivedStatus } = computeDerived('void', 1000, null, 0, TODAY)
    expect(derivedStatus).toBe('anulada')
  })

  it('draft → borrador', () => {
    const { derivedStatus } = computeDerived('draft', 500, null, 0, TODAY)
    expect(derivedStatus).toBe('borrador')
  })

  it('pagada cuando balance <= 0 (pago exacto)', () => {
    const { derivedStatus, balance } = computeDerived('sent', 1000, null, 1000, TODAY)
    expect(derivedStatus).toBe('pagada')
    expect(balance).toBe('0.00')
  })

  it('pagada cuando totalPaid supera el total (sobrepago)', () => {
    const { derivedStatus } = computeDerived('sent', 1000, null, 1200, TODAY)
    expect(derivedStatus).toBe('pagada')
  })

  it('parcial cuando hay pago parcial (0 < pagado < total)', () => {
    const { derivedStatus, balance } = computeDerived('sent', 1000, null, 400, TODAY)
    expect(derivedStatus).toBe('parcial')
    expect(balance).toBe('600.00')
  })

  it('vencida cuando balance > 0, due_date < hoy, status = sent', () => {
    const { derivedStatus } = computeDerived('sent', 1000, '2026-01-01', 0, TODAY)
    expect(derivedStatus).toBe('vencida')
  })

  it('enviada cuando sent + balance > 0 + due_date futuro', () => {
    const { derivedStatus } = computeDerived('sent', 1000, '2026-12-31', 0, TODAY)
    expect(derivedStatus).toBe('enviada')
  })

  it('enviada cuando sent + balance > 0 + sin due_date', () => {
    const { derivedStatus } = computeDerived('sent', 1000, null, 0, TODAY)
    expect(derivedStatus).toBe('enviada')
  })

  it('NO vence si status != sent (ej: paid marcado manualmente con saldo residual)', () => {
    // Caso edge: status=paid en DB pero amount_base mayor (inconsistencia manual).
    // La regla de vencida requiere status=sent, entonces:
    // totalPaidBase=0, rawBalance>0, status!='sent' → 'enviada'
    const { derivedStatus } = computeDerived('paid', 1000, '2026-01-01', 0, TODAY)
    expect(derivedStatus).toBe('enviada')
  })

  it('pago ARS contra factura USD descuenta saldo en USD correctamente', () => {
    // Factura: USD 1000 (amountBase = 1000)
    // Pago: ARS 1000, TC=1000 → amountBase = 1.00 USD
    const paymentAmountBase = Math.round((1000 / 1000) * 100) / 100  // 1.00
    const { derivedStatus, balance } = computeDerived('sent', 1000, null, paymentAmountBase, TODAY)
    expect(derivedStatus).toBe('parcial')
    expect(balance).toBe('999.00')
  })
})

describe('filterByTab — tabs de listado', () => {
  const items: Array<{ derivedStatus: DerivedStatus }> = [
    { derivedStatus: 'borrador' },
    { derivedStatus: 'enviada' },
    { derivedStatus: 'parcial' },
    { derivedStatus: 'vencida' },
    { derivedStatus: 'pagada' },
    { derivedStatus: 'anulada' },
  ]

  it('tab=all devuelve todos', () => {
    expect(filterByTab(items, 'all')).toHaveLength(6)
  })

  it('tab=por_cobrar excluye pagadas, borradores y anuladas', () => {
    const result = filterByTab(items, 'por_cobrar')
    expect(result).toHaveLength(3)
    expect(result.map((i) => i.derivedStatus).sort()).toEqual(['enviada', 'parcial', 'vencida'])
  })

  it('tab=vencidas devuelve solo vencidas', () => {
    const result = filterByTab(items, 'vencidas')
    expect(result).toHaveLength(1)
    expect(result[0]!.derivedStatus).toBe('vencida')
  })

  it('tab=pagadas devuelve solo pagadas', () => {
    const result = filterByTab(items, 'pagadas')
    expect(result).toHaveLength(1)
    expect(result[0]!.derivedStatus).toBe('pagada')
  })

  it('tab=borradores devuelve solo borradores', () => {
    const result = filterByTab(items, 'borradores')
    expect(result).toHaveLength(1)
    expect(result[0]!.derivedStatus).toBe('borrador')
  })

  it('por_cobrar NO incluye pagadas (balance=0)', () => {
    const result = filterByTab([{ derivedStatus: 'pagada' }], 'por_cobrar')
    expect(result).toHaveLength(0)
  })
})

describe('pago parcial — no bloquea la factura', () => {
  it('pago parcial deja la factura en estado parcial (saldo pendiente)', () => {
    // Simula registrar un pago de 300 sobre una factura de 1000 USD
    const invoiceAmountBase = 1000
    const paymentAmountBase = 300
    const { derivedStatus, balance } = computeDerived('sent', invoiceAmountBase, null, paymentAmountBase, '2026-06-13')
    expect(derivedStatus).toBe('parcial')
    expect(balance).toBe('700.00')
  })

  it('dos pagos parciales que suman el total → pagada', () => {
    // 400 + 600 = 1000
    const { derivedStatus, balance } = computeDerived('sent', 1000, null, 1000, '2026-06-13')
    expect(derivedStatus).toBe('pagada')
    expect(balance).toBe('0.00')
  })
})

// ── Finance Phase 5 — lógica pura (sin DB) ───────────────────────────────────

/**
 * Tests de las nuevas funciones de Finance Phase 5 usando lógica pura.
 * No tocan la DB; prueban las reglas de negocio en aislamiento.
 */

// ── financeSummary: flujo vs snapshot ────────────────────────────────────────

/**
 * Simula la separación flujo/snapshot de financeSummary:
 * - Flujo (acotado por período): totalInvoiced, totalPaid, totalExpenses, netProfit.
 * - Snapshot (estado actual): outstanding, mrr.
 */
describe('financeSummary — separación flujo vs snapshot', () => {
  /**
   * Replica la lógica de netProfit: totalPaid (del período) − totalExpenses (del período).
   * Verifica que el neto es coherente con sus componentes.
   */
  function calcNetProfit(totalPaid: number, totalExpenses: number): number {
    return totalPaid - totalExpenses
  }

  it('netProfit = totalPaid − totalExpenses (sin período)', () => {
    expect(calcNetProfit(5000, 2000)).toBe(3000)
  })

  it('netProfit puede ser negativo si gastos > cobros', () => {
    expect(calcNetProfit(1000, 4000)).toBe(-3000)
  })

  it('netProfit = 0 cuando totalPaid === totalExpenses', () => {
    expect(calcNetProfit(2500, 2500)).toBe(0)
  })

  /**
   * Verifica que outstanding es independiente del período:
   * es la suma de balances reales de facturas abiertas.
   */
  function calcOutstanding(invoices: Array<{ amountBase: number; paid: number }>): number {
    return invoices.reduce((acc, inv) => acc + Math.max(0, inv.amountBase - inv.paid), 0)
  }

  it('outstanding suma balances reales (amount_base − pagos parciales)', () => {
    const openInvoices = [
      { amountBase: 500, paid: 200 },  // balance = 300
      { amountBase: 300, paid: 0 },    // balance = 300
    ]
    expect(calcOutstanding(openInvoices)).toBe(600)
  })

  it('outstanding ignora sobrepagos (Math.max(0, ...))', () => {
    const openInvoices = [
      { amountBase: 100, paid: 150 }, // sobrepago → balance = 0
      { amountBase: 200, paid: 0 },   // balance = 200
    ]
    expect(calcOutstanding(openInvoices)).toBe(200)
  })

  it('outstanding = 0 cuando todas las facturas están cubiertas', () => {
    const openInvoices = [
      { amountBase: 100, paid: 100 },
      { amountBase: 200, paid: 300 },
    ]
    expect(calcOutstanding(openInvoices)).toBe(0)
  })
})

// ── Serie mensual (monthlySummary) — lógica pura ─────────────────────────────

describe('monthlySummary — construcción de la serie mensual', () => {
  /**
   * Replica la lógica de construcción de la serie: datos de DB → serie completa.
   * El rango siempre incluye todos los meses aunque no haya datos.
   */
  function buildSeries(
    monthKeys: string[],
    incomeMap: Map<string, number>,
    expensesMap: Map<string, number>,
  ) {
    return monthKeys.map((month) => {
      const income = incomeMap.get(month) ?? 0
      const expenses = expensesMap.get(month) ?? 0
      return { month, income, expenses, net: income - expenses }
    })
  }

  it('devuelve el número correcto de meses solicitados', () => {
    const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']
    const series = buildSeries(months, new Map(), new Map())
    expect(series).toHaveLength(6)
  })

  it('meses sin datos tienen income=0, expenses=0, net=0', () => {
    const months = ['2026-01', '2026-02']
    const series = buildSeries(months, new Map(), new Map())
    for (const item of series) {
      expect(item.income).toBe(0)
      expect(item.expenses).toBe(0)
      expect(item.net).toBe(0)
    }
  })

  it('net = income − expenses en cada mes', () => {
    const months = ['2026-04', '2026-05', '2026-06']
    const incomeMap = new Map([['2026-04', 5000], ['2026-05', 3000]])
    const expensesMap = new Map([['2026-04', 2000], ['2026-06', 1500]])
    const series = buildSeries(months, incomeMap, expensesMap)

    expect(series[0]).toEqual({ month: '2026-04', income: 5000, expenses: 2000, net: 3000 })
    expect(series[1]).toEqual({ month: '2026-05', income: 3000, expenses: 0, net: 3000 })
    expect(series[2]).toEqual({ month: '2026-06', income: 0, expenses: 1500, net: -1500 })
  })

  it('net puede ser negativo cuando expenses > income', () => {
    const months = ['2026-06']
    const series = buildSeries(months, new Map([['2026-06', 100]]), new Map([['2026-06', 400]]))
    expect(series[0]!.net).toBe(-300)
  })
})

// ── Top deudores (topDebtors) — lógica pura ──────────────────────────────────

describe('topDebtors — agrupación y orden por saldo desc', () => {
  type InvoiceBalanceRow = { companyId: string; amountBase: number; paid: number }

  /**
   * Replica la lógica de agrupación de topDebtors:
   * 1. Calcular balance por factura.
   * 2. Agrupar por empresa.
   * 3. Ordenar desc por outstanding.
   * 4. Limitar al top N.
   */
  function groupDebtors(
    invoices: InvoiceBalanceRow[],
    limit: number,
  ): Array<{ companyId: string; outstanding: number }> {
    const balanceByCompany = new Map<string, number>()
    for (const inv of invoices) {
      const balance = Math.max(0, inv.amountBase - inv.paid)
      balanceByCompany.set(inv.companyId, (balanceByCompany.get(inv.companyId) ?? 0) + balance)
    }
    return [...balanceByCompany.entries()]
      .filter(([, b]) => b > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([companyId, outstanding]) => ({ companyId, outstanding }))
  }

  it('ordena por outstanding desc', () => {
    const invoices: InvoiceBalanceRow[] = [
      { companyId: 'co-A', amountBase: 300, paid: 0 },
      { companyId: 'co-B', amountBase: 1000, paid: 0 },
      { companyId: 'co-C', amountBase: 150, paid: 0 },
    ]
    const result = groupDebtors(invoices, 10)
    expect(result[0]!.companyId).toBe('co-B')
    expect(result[1]!.companyId).toBe('co-A')
    expect(result[2]!.companyId).toBe('co-C')
  })

  it('agrupa múltiples facturas de la misma empresa', () => {
    const invoices: InvoiceBalanceRow[] = [
      { companyId: 'co-A', amountBase: 200, paid: 0 },
      { companyId: 'co-A', amountBase: 300, paid: 100 }, // balance = 200
      { companyId: 'co-B', amountBase: 500, paid: 0 },
    ]
    const result = groupDebtors(invoices, 10)
    const coA = result.find((r) => r.companyId === 'co-A')
    // co-A: 200 + 200 = 400
    expect(coA?.outstanding).toBe(400)
  })

  it('respeta el limit (top N deudores)', () => {
    const invoices: InvoiceBalanceRow[] = [
      { companyId: 'co-1', amountBase: 100, paid: 0 },
      { companyId: 'co-2', amountBase: 200, paid: 0 },
      { companyId: 'co-3', amountBase: 300, paid: 0 },
      { companyId: 'co-4', amountBase: 400, paid: 0 },
      { companyId: 'co-5', amountBase: 500, paid: 0 },
      { companyId: 'co-6', amountBase: 600, paid: 0 },
    ]
    const result = groupDebtors(invoices, 3)
    expect(result).toHaveLength(3)
    // Top 3: co-6 (600), co-5 (500), co-4 (400)
    expect(result[0]!.companyId).toBe('co-6')
    expect(result[1]!.companyId).toBe('co-5')
    expect(result[2]!.companyId).toBe('co-4')
  })

  it('excluye empresas con balance = 0 (facturas completamente pagadas)', () => {
    const invoices: InvoiceBalanceRow[] = [
      { companyId: 'co-pagado', amountBase: 500, paid: 500 },
      { companyId: 'co-deudor', amountBase: 300, paid: 0 },
    ]
    const result = groupDebtors(invoices, 10)
    expect(result).toHaveLength(1)
    expect(result[0]!.companyId).toBe('co-deudor')
  })

  it('devuelve lista vacía si no hay facturas abiertas', () => {
    const result = groupDebtors([], 5)
    expect(result).toHaveLength(0)
  })
})

// ── Retainer — lógica pura ────────────────────────────────────────────────────

/**
 * Tests de lógica pura para retainers (sin DB).
 * Prueban: calcAmountBase, MRR (suma de activos), idempotencia de generate-invoice.
 */

// Replica local de calcAmountBase para tests sin importar el módulo con deps de DB.
function calcAmountBaseRetainer(amount: number, currency: string, exchangeRate: number): number {
  if (currency === 'USD') return amount
  return Math.round((amount / exchangeRate) * 100) / 100
}

describe('calcAmountBase — retainer', () => {
  it('USD: amount_base = amount (exchange_rate ignorado)', () => {
    expect(calcAmountBaseRetainer(1000, 'USD', 999)).toBe(1000)
  })

  it('ARS: amount_base = round(amount / exchangeRate, 2)', () => {
    // 500_000 ARS / 1250 = 400 USD
    expect(calcAmountBaseRetainer(500_000, 'ARS', 1250)).toBe(400)
  })

  it('ARS: redondea a 2 decimales', () => {
    // 100 ARS / 3 ≈ 33.33 USD
    expect(calcAmountBaseRetainer(100, 'ARS', 3)).toBe(33.33)
  })
})

describe('MRR — suma de retainers activos', () => {
  // Simula la lógica de financeSummary MRR (suma de amount_base de activos)
  function calcMrr(retainers: Array<{ status: string; archived: boolean; amountBase: number }>): number {
    return retainers
      .filter((r) => r.status === 'active' && !r.archived)
      .reduce((acc, r) => acc + r.amountBase, 0)
  }

  it('solo suma los retainers activos', () => {
    const retainers = [
      { status: 'active', archived: false, amountBase: 500 },
      { status: 'paused', archived: false, amountBase: 300 },
      { status: 'cancelled', archived: false, amountBase: 200 },
      { status: 'active', archived: true, amountBase: 100 },
    ]
    expect(calcMrr(retainers)).toBe(500)
  })

  it('retainers archivados no se suman aunque estén activos', () => {
    const retainers = [
      { status: 'active', archived: false, amountBase: 1000 },
      { status: 'active', archived: true, amountBase: 500 },
    ]
    expect(calcMrr(retainers)).toBe(1000)
  })

  it('MRR = 0 cuando no hay retainers activos', () => {
    expect(calcMrr([])).toBe(0)
    expect(calcMrr([{ status: 'paused', archived: false, amountBase: 999 }])).toBe(0)
  })
})

describe('generate-invoice — idempotencia', () => {
  /**
   * Simula la búsqueda de factura existente para el mismo retainer+período.
   * La lógica real hace: SELECT ... WHERE retainer_id = X AND to_char(issue_date, 'YYYY-MM') = period.
   * Probamos el razonamiento de idempotencia con funciones puras.
   */
  function findExisting(
    invoices: Array<{ retainerId: string; issueDate: string }>,
    retainerId: string,
    period: string,
  ): boolean {
    return invoices.some(
      (inv) =>
        inv.retainerId === retainerId &&
        inv.issueDate.slice(0, 7) === period,
    )
  }

  it('no duplica si ya existe factura para el mismo retainer+período', () => {
    const invoices = [{ retainerId: 'ret-1', issueDate: '2026-06-01' }]
    expect(findExisting(invoices, 'ret-1', '2026-06')).toBe(true)
  })

  it('permite generar factura en período diferente', () => {
    const invoices = [{ retainerId: 'ret-1', issueDate: '2026-06-01' }]
    expect(findExisting(invoices, 'ret-1', '2026-07')).toBe(false)
  })

  it('permite generar para retainer diferente en el mismo período', () => {
    const invoices = [{ retainerId: 'ret-1', issueDate: '2026-06-01' }]
    expect(findExisting(invoices, 'ret-2', '2026-06')).toBe(false)
  })
})
