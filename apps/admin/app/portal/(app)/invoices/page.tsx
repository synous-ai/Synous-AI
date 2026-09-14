'use client'

import { InvoicesPanel } from '@portal/components/portal/invoices-panel'
import { SectionHeader } from '@portal/components/portal/section-header'

export default function InvoicesPanelPage() {
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Tu proyecto" title="Facturas" description="El estado de los pagos de tu proyecto." />
      <InvoicesPanel />
    </div>
  )
}
