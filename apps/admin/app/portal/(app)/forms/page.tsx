'use client'

import { FormsPanel } from '@portal/components/portal/forms-panel'
import { SectionHeader } from '@portal/components/portal/section-header'

export default function FormsPanelPage() {
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Tu proyecto" title="Formularios" description="Completá la información que necesitamos para avanzar con tu proyecto." />
      <FormsPanel />
    </div>
  )
}
