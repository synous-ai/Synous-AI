'use client'

import { ArrowRight, Map } from 'lucide-react'
import { Button } from '@portal/components/ui/button'
import { StepHeader, WizardNav } from '@portal/components/onboarding/wizard-shell'
import { PhasesRoadmap, type RoadmapPhase } from '@portal/components/project/phases-roadmap'

// Roadmap estático de las 9 fases — mismo contenido que siempre mostró este
// paso del wizard. La fase actual (Diagnóstico, la primera) arranca marcada
// con un punto y expandida; el resto del acordeón arranca cerrado.
// El componente visual vive en phases-roadmap.tsx (compartido con el Home del
// Client Portal, que lo alimenta con datos reales de GET /api/client/project).
const PHASES: RoadmapPhase[] = [
  { label: 'Diagnóstico', description: 'Te entendemos', isCurrent: true },
  { label: 'Blueprint', description: 'Diseñamos el mapa' },
  { label: 'Primera Versión (MVP)', description: 'La ves y la tocás' },
  { label: 'Ajustes', description: 'Afinamos con tu feedback' },
  { label: 'Construcción', description: 'Armamos todo por detrás' },
  { label: 'Verificación', description: 'Probamos todo' },
  { label: 'Lanzamiento', description: 'Tu plataforma en vivo' },
  { label: 'Estabilización', description: 'Te acompañamos las primeras semanas' },
  { label: 'Evolución', description: 'Seguimos mejorando', optional: true },
]

export function Step3Phases({
  onContinue,
  onBack,
  loading,
}: {
  onContinue: () => void
  onBack: () => void
  loading?: boolean
}) {
  return (
    <div>
      <StepHeader
        icon={Map}
        eyebrow="Paso 3 de 8"
        title="Las fases de tu proyecto"
        hint="Este va a ser el roadmap de tu proyecto — lo vas a ver reflejado en tu Portal a medida que avancemos."
      />

      <PhasesRoadmap phases={PHASES} />

      <WizardNav onBack={onBack}>
        <Button type="button" onClick={onContinue} disabled={loading} className="min-w-32 gap-2 rounded-full">
          Continuar
          <ArrowRight className="h-4 w-4" />
        </Button>
      </WizardNav>
    </div>
  )
}
