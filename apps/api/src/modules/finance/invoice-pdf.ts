import PDFDocument from 'pdfkit'

export interface InvoicePdfData {
  number: number
  issueDate: string | null
  dueDate: string | null
  currency: string
  issuerName: string
  clientName: string
  items: { description: string; quantity: string; unitPrice: string }[]
  subtotal: string
  tax: string
  total: string
  notes: string | null
}

const INK = '#111111'
const MUTED = '#666666'
const HAIR = '#dddddd'

function formatMoney(amount: string | number, currency: string): string {
  const value = Number(amount)
  try {
    return new Intl.NumberFormat('es', { style: 'currency', currency }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

/**
 * Renderiza el PDF de una factura en el propio proceso, con pdfkit.
 *
 * Reemplaza a easyinvoice, que NO renderizaba localmente: hacía POST de la
 * factura completa (cliente, ítems, importes) a api.easyinvoice.cloud con la
 * key pública "free" y sin timeout. Los datos de facturación de los clientes
 * salían a un tercero sin contrato, y cada descarga dependía de su uptime.
 */
export function buildInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 56 })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  const left = doc.page.margins.left
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 60
  const rule = () => {
    doc.strokeColor(HAIR).lineWidth(1).moveTo(left, doc.y).lineTo(left + width, doc.y).stroke()
  }

  // Encabezado
  doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text(data.issuerName, left, doc.y, { width })
  doc.moveDown(0.4)
  doc.font('Helvetica').fontSize(11).fillColor(MUTED).text(`Factura N° ${data.number}`, { width })
  if (data.issueDate) doc.text(`Fecha de emisión: ${data.issueDate}`, { width })
  if (data.dueDate) doc.text(`Vencimiento: ${data.dueDate}`, { width })
  doc.moveDown(1)
  doc.font('Helvetica-Bold').fontSize(10).fillColor(MUTED).text('FACTURAR A', { characterSpacing: 1 })
  doc.font('Helvetica').fontSize(12).fillColor(INK).text(data.clientName, { width })
  doc.moveDown(1.2)

  // Tabla de ítems: descripción | cantidad | precio | importe
  const cols = { desc: left, qty: left + width * 0.55, price: left + width * 0.68, amount: left + width * 0.84 }
  const colWidth = { desc: width * 0.53, qty: width * 0.12, price: width * 0.15, amount: width * 0.16 }
  const header = () => {
    const y = doc.y
    doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED)
    doc.text('DESCRIPCIÓN', cols.desc, y, { width: colWidth.desc })
    doc.text('CANT.', cols.qty, y, { width: colWidth.qty, align: 'right' })
    doc.text('PRECIO', cols.price, y, { width: colWidth.price, align: 'right' })
    doc.text('IMPORTE', cols.amount, y, { width: colWidth.amount, align: 'right' })
    doc.moveDown(0.5)
    rule()
    doc.moveDown(0.5)
  }
  header()

  for (const item of data.items) {
    doc.font('Helvetica').fontSize(10).fillColor(INK)
    // La altura se mide antes de dibujar: si la descripción no entra, la fila
    // entera pasa a la página siguiente. Si no, pdfkit cortaba la descripción en
    // una página nueva y los importes quedaban dibujados en la anterior.
    const rowHeight = doc.heightOfString(item.description, { width: colWidth.desc })
    if (doc.y + rowHeight > bottomLimit()) {
      doc.addPage()
      header()
    }
    const y = doc.y
    const lineTotal = Number(item.quantity) * Number(item.unitPrice)
    doc.text(item.description, cols.desc, y, { width: colWidth.desc })
    doc.text(String(Number(item.quantity)), cols.qty, y, { width: colWidth.qty, align: 'right' })
    doc.text(formatMoney(item.unitPrice, data.currency), cols.price, y, { width: colWidth.price, align: 'right' })
    doc.text(formatMoney(lineTotal, data.currency), cols.amount, y, { width: colWidth.amount, align: 'right' })
    doc.y = y + rowHeight
    doc.moveDown(0.4)
  }

  // Totales
  if (doc.y > bottomLimit()) doc.addPage()
  doc.moveDown(0.3)
  rule()
  doc.moveDown(0.6)
  const totalLine = (label: string, value: string, bold = false) => {
    const y = doc.y
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10).fillColor(INK)
    doc.text(label, cols.price - width * 0.1, y, { width: colWidth.price + width * 0.1, align: 'right' })
    doc.text(formatMoney(value, data.currency), cols.amount, y, { width: colWidth.amount, align: 'right' })
    doc.moveDown(0.4)
  }
  totalLine('Subtotal', data.subtotal)
  if (Number(data.tax) > 0) totalLine('Impuestos', data.tax)
  totalLine('Total', data.total, true)

  if (data.notes) {
    doc.moveDown(1.5)
    doc.font('Helvetica-Bold').fontSize(10).fillColor(MUTED).text('NOTAS', left, doc.y, { characterSpacing: 1 })
    doc.font('Helvetica').fontSize(10).fillColor(INK).text(data.notes, { width })
  }

  doc.end()
  return done
}
