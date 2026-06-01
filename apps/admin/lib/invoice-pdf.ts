import { apiGet } from '@/lib/api'

interface InvoicePdfResponse {
  filename: string
  pdf: string // base64
}

/**
 * Requests the PDF for the given invoice from the server and triggers a
 * browser download.  The server generates the PDF (server-side, no canvas in
 * the browser) and returns it as a base64 string.
 */
export async function generateInvoicePdf(invoiceId: string): Promise<void> {
  const { filename, pdf } = await apiGet<InvoicePdfResponse>(
    `/api/finance/invoices/${invoiceId}/pdf`,
  )

  // Decode base64 → Uint8Array → Blob
  const binary = atob(pdf)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const blob = new Blob([bytes], { type: 'application/pdf' })

  // Trigger download
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
