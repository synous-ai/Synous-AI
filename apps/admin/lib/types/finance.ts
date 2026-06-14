export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void'
export type PaymentMethod = 'transfer' | 'card' | 'cash' | 'other'

export interface Invoice {
  id: string
  portalId: string
  number: number
  dealId: string | null
  companyId: string | null
  status: InvoiceStatus
  issueDate: string | null
  dueDate: string | null
  subtotal: string
  tax: string
  total: string
  currency: string
  notes: string | null
  createdBy: string | null
  archived: boolean
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface InvoiceItem {
  id: string
  invoiceId: string
  description: string
  quantity: string
  unitPrice: string
}

export interface Payment {
  id: string
  portalId: string
  invoiceId: string
  amount: string
  method: PaymentMethod
  paidAt: string
  reference: string | null
  createdBy: string | null
  createdAt: string
}

export interface InvoiceDetail {
  invoice: Invoice
  items: InvoiceItem[]
  payments: Payment[]
  balance: string
}

export interface FinanceSummary {
  totalInvoiced: string
  totalPaid: string
  outstanding: string
  invoicesByStatus: Record<string, number>
}

// ─── Gastos ──────────────────────────────────────────────────────────────────
export type ExpenseCategory =
  | 'software'
  | 'infraestructura'
  | 'equipo'
  | 'impuestos'
  | 'oficina'
  | 'marketing'
  | 'otros'

export interface Expense {
  id: string
  portalId: string
  description: string
  amount: string          // numeric as string
  currency: string        // 'USD' | 'ARS'
  exchangeRate: string | null   // ARS rate at time of expense
  amountBase: string      // amount in base currency (USD)
  category: ExpenseCategory
  expenseDate: string
  vendor: string | null
  dealId: string | null
  companyId: string | null
  paymentMethod: 'transfer' | 'card' | 'cash' | 'other' | null
  isRecurring: boolean
  storageKey: string | null
  notes: string | null
  archived: boolean
  archivedAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface ExpenseSummary {
  totalExpenses: string
  totalExpensesArs: string
  byCategory: Record<string, string>
}

// ─── Cobros (enriquecidos) ────────────────────────────────────────────────────
export interface EnrichedPayment {
  id: string
  portalId: string
  invoiceId: string
  amount: string
  currency: string
  exchangeRate: string | null
  amountBase: string | null
  method: 'transfer' | 'card' | 'cash' | 'other'
  paidAt: string
  reference: string | null
  createdBy: string | null
  createdAt: string
  // enriched fields from JOIN
  invoiceNumber: number | null
  invoiceCurrency: string | null
  companyName: string | null
}

export interface PaymentsResponse {
  payments: EnrichedPayment[]
  meta: {
    totalPeriod: string
  }
}

// ─── Facturas con campos nuevos ───────────────────────────────────────────────
export interface InvoiceEnriched extends Invoice {
  balance: string           // saldo pendiente
  derivedStatus: 'borrador' | 'enviada' | 'parcial' | 'pagada' | 'vencida' | 'anulada'
  companyName: string | null
}

// ─── Tipo de cambio ───────────────────────────────────────────────────────────
export interface FxRate {
  compra: number
  venta: number
  fecha: string
}

export interface FxResponse {
  blue: FxRate
  tarjeta: FxRate
}

// ─── Retainers ────────────────────────────────────────────────────────────────
export type RetainerStatus = 'active' | 'paused' | 'cancelled'

export interface Retainer {
  id: string
  portalId: string
  companyId: string
  companyName: string | null   // JOIN desde company
  amount: string               // numeric as string
  currency: string             // 'USD' | 'ARS'
  exchangeRate: string | null
  amountBase: string           // en USD
  billingDay: number           // 1-28
  status: RetainerStatus
  startDate: string
  endDate: string | null
  notes: string | null
  archived: boolean
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface RetainerDetail extends Retainer {
  invoices: Invoice[]
}

// ─── Resumen extendido ────────────────────────────────────────────────────────

/**
 * Respuesta de GET /finance/summary?from&to.
 * Extiende la versión original con los campos nuevos del backend F6b.
 */
export interface FinanceSummaryExtended {
  totalInvoiced: string
  totalPaid: string
  outstanding: string
  totalExpenses: string
  netProfit: string
  mrr: string
  invoicesByStatus: Record<string, number>
}

/** Punto de dato para el gráfico de ingresos vs gastos por mes. */
export interface MonthlySummary {
  month: string    // 'YYYY-MM'
  income: string
  expenses: string
  net: string
}

/** Top deudor del endpoint /finance/summary/debtors. */
export interface DebtorSummary {
  companyId: string
  companyName: string
  outstanding: string
}
