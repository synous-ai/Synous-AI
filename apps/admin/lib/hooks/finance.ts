import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiDelete } from '../api'
import type { Invoice, InvoiceDetail, InvoiceStatus, Payment, FinanceSummary } from '../types'

export function useInvoices(status?: InvoiceStatus) {
  const qs = status ? `?status=${status}` : ''
  return useQuery({
    queryKey: ['invoices', status ?? 'all'],
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

export function usePayments() {
  return useQuery({
    queryKey: ['payments'],
    queryFn: () => apiGet<Payment[]>('/api/finance/payments'),
  })
}

export interface RegisterPaymentInput {
  invoiceId: string
  amount: number
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

export function useFinanceSummary() {
  return useQuery({
    queryKey: ['finance', 'summary'],
    queryFn: () => apiGet<FinanceSummary>('/api/finance/summary'),
  })
}
