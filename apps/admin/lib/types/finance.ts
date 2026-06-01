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
