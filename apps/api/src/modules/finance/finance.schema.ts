import { z } from 'zod'

// ── Enums ────────────────────────────────────────────────────────────────────

export const CurrencyEnum = z.enum(['USD', 'ARS'])
export type Currency = z.infer<typeof CurrencyEnum>

export const InvoiceStatusEnum = z.enum(['draft', 'sent', 'paid', 'overdue', 'void'])
export type InvoiceStatus = z.infer<typeof InvoiceStatusEnum>

export const PaymentMethodEnum = z.enum(['transfer', 'card', 'cash', 'other'])
export type PaymentMethod = z.infer<typeof PaymentMethodEnum>

/**
 * Categorías de gasto. 'equipo' corresponde a honorarios de colaboradores
 * (costo operativo), no al reparto de socios — ese es un concepto distinto.
 */
export const ExpenseCategoryEnum = z.enum([
  'software',
  'infraestructura',
  'equipo',
  'impuestos',
  'oficina',
  'marketing',
  'otros',
])
export type ExpenseCategory = z.infer<typeof ExpenseCategoryEnum>

export const RetainerStatusEnum = z.enum(['active', 'paused', 'cancelled'])
export type RetainerStatus = z.infer<typeof RetainerStatusEnum>

// ── Invoice ─────────────────────────────────────────────────────────────────

const InvoiceItemInputSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive().optional(),
  unitPrice: z.number().min(0),
})
export type InvoiceItemInputDTO = z.infer<typeof InvoiceItemInputSchema>

export const CreateInvoiceSchema = z.object({
  dealId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  issueDate: z.string().optional(), // YYYY-MM-DD
  dueDate: z.string().optional(),
  /** Moneda de la factura. Default USD. */
  currency: CurrencyEnum.optional(),
  /**
   * Tipo de cambio ARS/USD al momento de emitir (ARS por 1 USD).
   * Requerido cuando currency === 'ARS'; ignorado (se fuerza 1) cuando USD.
   */
  exchangeRate: z.number().positive().optional(),
  notes: z.string().optional(),
  tax: z.number().min(0).optional(),
  items: z.array(InvoiceItemInputSchema).min(1),
  /** Retainer que origina esta factura (null = factura puntual). */
  retainerId: z.string().min(1).optional(),
})
export type CreateInvoiceDTO = z.infer<typeof CreateInvoiceSchema>

export const UpdateInvoiceSchema = CreateInvoiceSchema.omit({ items: true }).partial()
export type UpdateInvoiceDTO = z.infer<typeof UpdateInvoiceSchema>

export const TransitionInvoiceSchema = z.object({
  status: InvoiceStatusEnum,
})
export type TransitionInvoiceDTO = z.infer<typeof TransitionInvoiceSchema>

// ── Payment ─────────────────────────────────────────────────────────────────

export const CreatePaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().positive(),
  /** Moneda en la que se realiza el pago. Puede diferir de la factura. */
  currency: CurrencyEnum.optional(),
  /**
   * Tipo de cambio ARS/USD al momento del pago.
   * Requerido cuando currency === 'ARS'.
   */
  exchangeRate: z.number().positive().optional(),
  method: PaymentMethodEnum.optional(),
  paidAt: z.string().optional(), // ISO datetime
  reference: z.string().optional(),
})
export type CreatePaymentDTO = z.infer<typeof CreatePaymentSchema>

// ── List queries ─────────────────────────────────────────────────────────────

export const ListInvoicesQuerySchema = z.object({
  /**
   * Tabs de listado:
   * - 'all': todas las facturas no archivadas
   * - 'por_cobrar': enviadas + vencidas (saldo > 0)
   * - 'vencidas': solo vencidas
   * - 'pagadas': pagadas completamente (saldo 0)
   * - 'borradores': en draft
   */
  tab: z.enum(['all', 'por_cobrar', 'vencidas', 'pagadas', 'borradores']).optional(),
  status: InvoiceStatusEnum.optional(),
})
export type ListInvoicesQuery = z.infer<typeof ListInvoicesQuerySchema>

export const ListPaymentsQuerySchema = z.object({
  method: PaymentMethodEnum.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  companyId: z.string().optional(),
  invoiceId: z.string().optional(),
})
export type ListPaymentsQuery = z.infer<typeof ListPaymentsQuerySchema>

// ── Expenses ─────────────────────────────────────────────────────────────────

export const CreateExpenseSchema = z.object({
  description: z.string().min(1),
  amount: z.number().positive(),
  currency: CurrencyEnum,
  /**
   * Tipo de cambio ARS/USD al momento del gasto.
   * Requerido cuando currency === 'ARS'; se ignora (forzado a 1) para USD.
   */
  exchangeRate: z.number().positive().optional(),
  /** amountBase pre-calculado por el front (evita recalculo); si no viene, se calcula en el service. */
  amountBase: z.number().positive().optional(),
  category: ExpenseCategoryEnum,
  expenseDate: z.string(), // YYYY-MM-DD
  vendor: z.string().optional(),
  dealId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  paymentMethod: PaymentMethodEnum.optional(),
  isRecurring: z.boolean().optional(),
  storageKey: z.string().optional(),
  notes: z.string().optional(),
})
export type CreateExpenseDTO = z.infer<typeof CreateExpenseSchema>

export const UpdateExpenseSchema = CreateExpenseSchema.partial()
export type UpdateExpenseDTO = z.infer<typeof UpdateExpenseSchema>

export const ListExpensesQuerySchema = z.object({
  category: ExpenseCategoryEnum.optional(),
  dealId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  isRecurring: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
})
export type ListExpensesQuery = z.infer<typeof ListExpensesQuerySchema>

// ── Retainers ─────────────────────────────────────────────────────────────────

export const CreateRetainerSchema = z.object({
  companyId: z.string().min(1),
  amount: z.number().positive(),
  currency: CurrencyEnum,
  /** Tipo de cambio ARS/USD al crear el retainer. Requerido para ARS. */
  exchangeRate: z.number().positive().optional(),
  /** amountBase pre-calculado; si no viene, se calcula en el service. */
  amountBase: z.number().positive().optional(),
  /** Día del mes (1–28) en que se genera la factura mensual. */
  billingDay: z.number().int().min(1).max(28),
  startDate: z.string(), // YYYY-MM-DD
  endDate: z.string().optional(),
  notes: z.string().optional(),
})
export type CreateRetainerDTO = z.infer<typeof CreateRetainerSchema>

export const UpdateRetainerSchema = z.object({
  status: RetainerStatusEnum.optional(),
  amount: z.number().positive().optional(),
  currency: CurrencyEnum.optional(),
  exchangeRate: z.number().positive().optional(),
  amountBase: z.number().positive().optional(),
  billingDay: z.number().int().min(1).max(28).optional(),
  endDate: z.string().optional(),
  notes: z.string().optional(),
})
export type UpdateRetainerDTO = z.infer<typeof UpdateRetainerSchema>

export const ListRetainersQuerySchema = z.object({
  status: RetainerStatusEnum.optional(),
  companyId: z.string().optional(),
})
export type ListRetainersQuery = z.infer<typeof ListRetainersQuerySchema>

// ── Summary ───────────────────────────────────────────────────────────────────

export const SummaryQuerySchema = z.object({
  from: z.string().optional(), // YYYY-MM-DD
  to: z.string().optional(),
})
export type SummaryQuery = z.infer<typeof SummaryQuerySchema>

export const MonthlySummaryQuerySchema = z.object({
  months: z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1).max(24))
    .optional(),
})

export const DebtorsQuerySchema = z.object({
  limit: z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1).max(50))
    .optional(),
})
