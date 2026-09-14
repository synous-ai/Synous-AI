'use client'

import { RequestsPanel } from '@portal/components/portal/requests-panel'
import { SectionHeader } from '@portal/components/portal/section-header'

export default function RequestsPanelPage() {
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Tu proyecto" title="Solicitudes" description="Pedidos de cambio sobre el alcance acordado." />
      <RequestsPanel />
    </div>
  )
}
