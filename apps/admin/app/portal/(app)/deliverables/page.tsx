'use client'

import { DeliverablesPanel } from '@portal/components/portal/deliverables-panel'
import { SectionHeader } from '@portal/components/portal/section-header'

export default function DeliverablesPanelPage() {
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Tu proyecto" title="Entregables" description="Revisá lo que te fuimos entregando y aprobá o pedí ajustes." />
      <DeliverablesPanel />
    </div>
  )
}
