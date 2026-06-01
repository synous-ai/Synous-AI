import { z } from 'zod'

// ── Enums ───────────────────────────────────────────────────────────────────
export const InvoiceStatusEnum = z.enum(['draft', 'sent', 'paid', 'overdue', 'void'])
export type InvoiceStatus = z.infer<typeof InvoiceStatusEnum>

export const PaymentMethodEnum = z.enum(['transfer', 'card', 'cash', 'other'])
export type PaymentMethod = z.infer<typeof PaymentMethodEnum>

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
  issueDate: z.string().optional(), // ISO date string YYYY-MM-DD
  dueDate: z.string().optional(),
  currency: z.string().length(3).optional(),
  notes: z.string().optional(),
  tax: z.number().min(0).optional(),
  items: z.array(InvoiceItemInputSchema).min(1),
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
  method: PaymentMethodEnum.optional(),
  paidAt: z.string().optional(), // ISO datetime
  reference: z.string().optional(),
})
export type CreatePaymentDTO = z.infer<typeof CreatePaymentSchema>

// ── List queries ─────────────────────────────────────────────────────────────
export const ListInvoicesQuerySchema = z.object({
  status: InvoiceStatusEnum.optional(),
})
export type ListInvoicesQuery = z.infer<typeof ListInvoicesQuerySchema>
