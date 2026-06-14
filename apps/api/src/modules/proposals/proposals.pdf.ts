import PDFDocument from 'pdfkit'
import type { ProposalContent } from './proposals.types'

/**
 * Genera el PDF de una propuesta (server-side, con pdfkit — sin Chromium).
 *
 * A diferencia del deck de slides (web), el PDF es un DOCUMENTO continuo y
 * profesional: portada + secciones. Monocromo, tipografía Helvetica (built-in de
 * pdfkit, no requiere fuentes externas). Devuelve un Buffer listo para servir.
 */

// Paleta monocroma.
const INK = '#111111'
const MUTED = '#666666'
const HAIR = '#dddddd'

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString('es')}`
  }
}

export function buildProposalPdf(content: ProposalContent): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 56 })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  const left = doc.page.margins.left
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right

  // Helpers de layout ─────────────────────────────────────────────────────────
  const eyebrow = (t: string) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text(t.toUpperCase(), left, doc.y, {
      characterSpacing: 1.5,
    })
    doc.moveDown(0.3)
  }
  const heading = (t: string) => {
    if (doc.y > doc.page.height - 160) doc.addPage()
    doc.moveDown(1)
    doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text(t, left, doc.y)
    doc.moveDown(0.5)
  }
  const paragraph = (t: string) => {
    doc.font('Helvetica').fontSize(11).fillColor(INK).text(t, { width, lineGap: 3 })
  }
  const bullets = (items: string[]) => {
    doc.font('Helvetica').fontSize(11).fillColor(INK)
    for (const it of items) {
      doc.text(`•  ${it}`, { width, lineGap: 2, indent: 2 })
      doc.moveDown(0.35)
    }
  }

  // ── Portada ───────────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(10).fillColor(MUTED).text('NOUS', { characterSpacing: 2 })
  doc.moveDown(2)
  doc.font('Helvetica-Bold').fontSize(28).fillColor(INK).text(content.title, { width })
  if (content.tagline) {
    doc.moveDown(0.6)
    doc.font('Helvetica').fontSize(13).fillColor(MUTED).text(content.tagline, { width })
  }
  doc.moveDown(1.2)
  doc
    .font('Helvetica')
    .fontSize(11)
    .fillColor(MUTED)
    .text(`Preparada para ${content.companyName || content.clientName}`, { width })

  // Línea divisoria
  doc.moveDown(1)
  doc.strokeColor(HAIR).lineWidth(1).moveTo(left, doc.y).lineTo(left + width, doc.y).stroke()

  // ── Secciones ───────────────────────────────────────────────────────────────
  if (content.summary) {
    heading('Resumen')
    paragraph(content.summary)
  }
  if (content.understanding) {
    heading('Lo que entendimos')
    paragraph(content.understanding)
  }
  if (content.objectives.length) {
    heading('Objetivos')
    bullets(content.objectives)
  }
  if (content.solution) {
    heading('La solución')
    paragraph(content.solution)
  }
  if (content.scope.length) {
    heading('Alcance')
    for (const s of content.scope) {
      doc.font('Helvetica-Bold').fontSize(11.5).fillColor(INK).text(s.title, { width })
      doc.font('Helvetica').fontSize(10.5).fillColor(MUTED).text(s.description, { width, lineGap: 2 })
      doc.moveDown(0.5)
    }
  }
  if (content.timeline.length) {
    heading('Plan de trabajo')
    for (const t of content.timeline) {
      doc
        .font('Helvetica-Bold')
        .fontSize(11.5)
        .fillColor(INK)
        .text(`${t.phase}  `, { continued: true })
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(MUTED)
        .text(t.duration.toUpperCase())
      doc.font('Helvetica').fontSize(10.5).fillColor(MUTED).text(t.detail, { width, lineGap: 2 })
      doc.moveDown(0.5)
    }
  }

  // ── Inversión ───────────────────────────────────────────────────────────────
  heading('Inversión')
  for (const it of content.pricing.items) {
    const y = doc.y
    doc.font('Helvetica').fontSize(11).fillColor(INK).text(it.label, left, y, { width: width - 120 })
    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor(INK)
      .text(formatMoney(it.amount, content.pricing.currency), left + width - 120, y, {
        width: 120,
        align: 'right',
      })
    doc.moveDown(0.4)
  }
  doc.moveDown(0.2)
  doc.strokeColor(HAIR).lineWidth(1).moveTo(left, doc.y).lineTo(left + width, doc.y).stroke()
  doc.moveDown(0.4)
  const ty = doc.y
  doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text('Total', left, ty, { width: width - 160 })
  doc
    .font('Helvetica-Bold')
    .fontSize(15)
    .fillColor(INK)
    .text(formatMoney(content.pricing.total, content.pricing.currency), left + width - 160, ty, {
      width: 160,
      align: 'right',
    })
  if (content.pricing.note) {
    doc.moveDown(0.6)
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(content.pricing.note, { width })
  }

  if (content.whyUs.length) {
    heading('Por qué NOUS')
    bullets(content.whyUs)
  }
  if (content.nextSteps) {
    heading('Próximos pasos')
    paragraph(content.nextSteps)
  }
  if (content.terms) {
    heading('Términos')
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(content.terms, { width, lineGap: 2 })
  }

  doc.end()
  return done
}
