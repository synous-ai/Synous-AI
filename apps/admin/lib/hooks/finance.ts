import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiDelete } from '../api'
import type {
  Invoice,
  InvoiceDetail,
  InvoiceStatus,
  Payment,
  FinanceSummary,
  Expense,
  ExpenseSummary,
  PaymentsResponse,
  FxResponse,
  Retainer,
  RetainerDetail,
  RetainerStatus,
  FinanceSummaryExtended,
  MonthlySummary,
  DebtorSummary,
} from '../types'

// ─── Facturas ─────────────────────────────────────────────────────────────────

export function useInvoices(tab?: string) {
  const qs = tab ? `?tab=${tab}` : ''
  return useQuery({
    queryKey: ['invoices', tab ?? 'all'],
    queryFn: () => apiGet<Invoice[]>(`/api/finance/invoices${qs}`),
  })
}

export function useInvoiceDetail(id: string | null) {
  return useQuery({
    queryKey: ['invoices', 'detail', id],
    queryFn: () => apiGet<InvoiceDetail>(`/api/finance/invoices/${id}`),
    enabled: id != null,
  })
}

export interface InvoiceItemInput {
  description: string
  quantity?: number
  unitPrice: number
}

export interface CreateInvoiceInput {
  dealId?: string
  companyId?: string
  issueDate?: string
  dueDate?: string
  currency?: string
  /** Tipo de cambio ARS por USD — solo cuando currency === 'ARS' */
  exchangeRate?: number
  notes?: string
  tax?: number
  items: InvoiceItemInput[]
}

export function useCreateInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateInvoiceInput) => apiPost<Invoice>('/api/finance/invoices', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['finance'] })
    },
  })
}

export function useInvoiceTransition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: InvoiceStatus }) =>
      apiPost<Invoice>(`/api/finance/invoices/${id}/transition`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['finance'] })
    },
  })
}

export function useArchiveInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/api/finance/invoices/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['finance'] })
    },
  })
}

// ─── Cobros ───────────────────────────────────────────────────────────────────

export interface PaymentsFilters {
  method?: string
  from?: string
  to?: string
  companyId?: string
  invoiceId?: string
}

export function usePayments(filters?: PaymentsFilters) {
  const qs = filters
    ? '?' + new URLSearchParams(
        Object.fromEntries(
          Object.entries(filters).filter(([, v]) => v != null && v !== '') as [string, string][]
        )
      ).toString()
    : ''
  return useQuery({
    queryKey: ['payments', filters ?? {}],
    queryFn: () => apiGet<PaymentsResponse>(`/api/finance/payments${qs}`),
  })
}

export interface RegisterPaymentInput {
  invoiceId: string
  amount: number
  currency?: string
  exchangeRate?: number
  method?: 'transfer' | 'card' | 'cash' | 'other'
  paidAt?: string
  reference?: string
}

export function useRegisterPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RegisterPaymentInput) => apiPost<Payment>('/api/finance/payments', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['finance'] })
    },
  })
}

// ─── Resumen financiero ───────────────────────────────────────────────────────

export interface SummaryFilters {
  from?: string
  to?: string
}

/**
 * Hook legado sin filtros de período — mantiene compatibilidad con ResumenSection vieja.
 * Para el resumen revamped con período, usar useFinanceSummaryExtended.
 */
export function useFinanceSummary() {
  return useQuery({
    queryKey: ['finance', 'summary'],
    queryFn: () => apiGet<FinanceSummary>('/api/finance/summary'),
  })
}

/**
 * Resumen financiero extendido con filtro de período (from/to ISO date).
 * Devuelve totalInvoiced, totalPaid, outstanding, totalExpenses, netProfit, mrr, invoicesByStatus.
 */
export function useFinanceSummaryExtended(filters?: SummaryFilters) {
  const params = new URLSearchParams()
  if (filters?.from) params.set('from', filters.from)
  if (filters?.to) params.set('to', filters.to)
  const qs = params.toString() ? '?' + params.toString() : ''
  return useQuery({
    queryKey: ['finance', 'summary-extended', filters ?? {}],
    queryFn: () => apiGet<FinanceSummaryExtended>(`/api/finance/summary${qs}`),
  })
}

/**
 * Datos de ingresos vs gastos por mes para el gráfico de barras agrupadas.
 * months: cantidad de meses hacia atrás (default 6).
 */
export function useMonthlySummary(months = 6) {
  return useQuery({
    queryKey: ['finance', 'monthly', months],
    queryFn: () => apiGet<MonthlySummary[]>(`/api/finance/summary/monthly?months=${months}`),
  })
}

/**
 * Top deudores (empresas con mayor saldo pendiente).
 */
export function useDebtors(limit = 5) {
  return useQuery({
    queryKey: ['finance', 'debtors', limit],
    queryFn: () => apiGet<DebtorSummary[]>(`/api/finance/summary/debtors?limit=${limit}`),
  })
}

// ─── Gastos ───────────────────────────────────────────────────────────────────

export interface ExpenseFilters {
  category?: string
  dealId?: string
  from?: string
  to?: string
  isRecurring?: boolean
}

export function useExpenses(filters?: ExpenseFilters) {
  const params: Record<string, string> = {}
  if (filters?.category) params.category = filters.category
  if (filters?.dealId) params.dealId = filters.dealId
  if (filters?.from) params.from = filters.from
  if (filters?.to) params.to = filters.to
  if (filters?.isRecurring != null) params.isRecurring = String(filters.isRecurring)
  const qs = Object.keys(params).length > 0 ? '?' + new URLSearchParams(params).toString() : ''

  return useQuery({
    queryKey: ['expenses', filters ?? {}],
    queryFn: () => apiGet<Expense[]>(`/api/finance/expenses${qs}`),
  })
}

export function useExpensesSummary() {
  return useQuery({
    queryKey: ['expenses', 'summary'],
    queryFn: () => apiGet<ExpenseSummary>('/api/finance/expenses/summary'),
  })
}

export interface CreateExpenseInput {
  description: string
  amount: number
  currency: string
  exchangeRate?: number
  amountBase?: number
  category: string
  expenseDate: string
  vendor?: string
  dealId?: string
  companyId?: string
  paymentMethod?: string
  isRecurring?: boolean
  storageKey?: string
  notes?: string
}

export function useCreateExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateExpenseInput) => apiPost<Expense>('/api/finance/expenses', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['finance'] })
    },
  })
}

export interface UpdateExpenseInput extends Partial<CreateExpenseInput> {
  id: string
}

export function useUpdateExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateExpenseInput) =>
      apiPatch<Expense>(`/api/finance/expenses/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['finance'] })
    },
  })
}

export function useArchiveExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/api/finance/expenses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['finance'] })
    },
  })
}

// ─── Tipo de cambio ───────────────────────────────────────────────────────────

export function useFx() {
  return useQuery({
    queryKey: ['finance', 'fx'],
    queryFn: () => apiGet<FxResponse>('/api/finance/fx'),
    // Refrescar cada 10 minutos — el TC cambia durante el día
    staleTime: 10 * 60 * 1000,
  })
}

// ─── Retainers ────────────────────────────────────────────────────────────────

export interface RetainerFilters {
  status?: RetainerStatus
  companyId?: string
}

export function useRetainers(filters?: RetainerFilters) {
  const params = new URLSearchParams()
  if (filters?.status) params.set('status', filters.status)
  if (filters?.companyId) params.set('companyId', filters.companyId)
  const qs = params.toString() ? '?' + params.toString() : ''
  return useQuery({
    queryKey: ['retainers', filters ?? {}],
    queryFn: () => apiGet<Retainer[]>(`/api/finance/retainers${qs}`),
  })
}

export function useRetainerDetail(id: string | null) {
  return useQuery({
    queryKey: ['retainers', 'detail', id],
    queryFn: () => apiGet<RetainerDetail>(`/api/finance/retainers/${id}`),
    enabled: id != null,
  })
}

export interface CreateRetainerInput {
  companyId: string
  amount: number
  currency: string
  exchangeRate?: number
  amountBase?: number
  billingDay: number
  startDate: string
  endDate?: string
  notes?: string
}

export function useCreateRetainer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateRetainerInput) => apiPost<Retainer>('/api/finance/retainers', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['retainers'] })
      qc.invalidateQueries({ queryKey: ['finance'] })
    },
  })
}

export interface UpdateRetainerInput {
  id: string
  status?: RetainerStatus
  amount?: number
  currency?: string
  exchangeRate?: number
  amountBase?: number
  billingDay?: number
  endDate?: string
  notes?: string
}

export function useUpdateRetainer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateRetainerInput) =>
      apiPatch<Retainer>(`/api/finance/retainers/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['retainers'] })
      qc.invalidateQueries({ queryKey: ['finance'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

export function useArchiveRetainer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/api/finance/retainers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['retainers'] })
      qc.invalidateQueries({ queryKey: ['finance'] })
    },
  })
}

/** Genera la factura del período actual para un retainer. */
export function useGenerateRetainerInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<{ invoice: Invoice; created: boolean }>(`/api/finance/retainers/${id}/generate-invoice`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['retainers'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['finance'] })
    },
  })
}
