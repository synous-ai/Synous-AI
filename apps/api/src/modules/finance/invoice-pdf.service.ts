import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { company, portal } from '../../db/schema'
import { buildInvoicePdf } from './invoice-pdf'
import { getInvoiceDetail } from './invoices'

// ── PDF de factura ────────────────────────────────────────────────────────────

export interface InvoicePdfResult {
  filename: string
  pdf: string // base64
}

/**
 * Genera el PDF de una factura (render local con pdfkit, ver invoice-pdf.ts).
 */
export async function generateInvoicePdf(
  portalId: string,
  id: string,
): Promise<InvoicePdfResult> {
  const { invoice: inv, items } = await getInvoiceDetail(portalId, id)

  const [portalRow] = await db
    .select({ name: portal.name })
    .from(portal)
    .where(eq(portal.id, portalId))
    .limit(1)
  const portalName = portalRow?.name ?? 'Synous'

  let companyName = '—'
  if (inv.companyId) {
    const [companyRow] = await db
      .select({ name: company.name })
      .from(company)
      .where(and(eq(company.id, inv.companyId), eq(company.portalId, portalId)))
      .limit(1)
    companyName = companyRow?.name ?? '—'
  }

  const pdf = await buildInvoicePdf({
    number: inv.number,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    currency: inv.currency,
    issuerName: portalName,
    clientName: companyName,
    items: items.map((item) => ({ description: item.description, quantity: item.quantity, unitPrice: item.unitPrice })),
    subtotal: inv.subtotal,
    tax: inv.tax,
    total: inv.total,
    notes: inv.notes,
  })

  return { filename: `factura-${inv.number}.pdf`, pdf: pdf.toString('base64') }
}
