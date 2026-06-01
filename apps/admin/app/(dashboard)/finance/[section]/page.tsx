'use client'

import { useParams } from 'next/navigation'
import { Repeat } from 'lucide-react'
import { FacturasSection } from './sections/FacturasSection'
import { PagosSection } from './sections/PagosSection'
import { CobrarSection } from './sections/CobrarSection'
import { IngresosSection } from './sections/IngresosSection'
import { ResumenSection } from './sections/ResumenSection'
import { EmptyState } from './sections/shared'

// ─────────────────────────────────────────────────────────────────────────────
// Retainers section (empty state placeholder — feature not yet implemented)
// ─────────────────────────────────────────────────────────────────────────────

function RetainersSection() {
  return (
    <div>
      <div className="mb-6">
        <p className="eyebrow">Finanzas</p>
        <h1 className="text-3xl font-semibold tracking-tight">Retainers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Contratos de honorarios recurrentes con clientes.
        </p>
      </div>
      <EmptyState
        icon={Repeat}
        message="Aún no hay retainers configurados"
        hint="Los retainers de clientes aparecerán aquí una vez que se implementen."
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section map
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_MAP: Record<string, () => React.JSX.Element> = {
  invoices: FacturasSection,
  payments: PagosSection,
  receivables: CobrarSection,
  income: IngresosSection,
  summary: ResumenSection,
  retainers: RetainersSection,
}

// ─────────────────────────────────────────────────────────────────────────────
// Page dispatcher
// ─────────────────────────────────────────────────────────────────────────────

export default function FinanceSectionPage() {
  const params = useParams()
  const section = typeof params.section === 'string' ? params.section : ''
  const View = SECTION_MAP[section]

  if (!View) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Sección no encontrada.</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <View />
    </div>
  )
}
