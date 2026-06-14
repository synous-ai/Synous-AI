'use client'

import { useParams } from 'next/navigation'
import { FacturasSection } from './sections/FacturasSection'
import { GastosSection } from './sections/GastosSection'
import { CobrosSection } from './sections/CobrosSection'
import { ResumenSection } from './sections/ResumenSection'
import { RetainersSection } from './sections/RetainersSection'

// ─────────────────────────────────────────────────────────────────────────────
// Section map
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_MAP: Record<string, () => React.JSX.Element> = {
  invoices: FacturasSection,
  cobros: CobrosSection,
  expenses: GastosSection,
  summary: ResumenSection,
  retainers: RetainersSection,
  // Redirige rutas viejas a cobros para no romper bookmarks
  payments: CobrosSection,
  income: CobrosSection,
  receivables: FacturasSection,
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
