'use client'

import { ArrowRight, Workflow } from 'lucide-react'
import { ShinyButton } from '@portal/components/ui/shiny-button'
import { StepHeader, WizardNav } from '@portal/components/onboarding/wizard-shell'

export function Step2HowItWorks({
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
      <StepHeader icon={Workflow} eyebrow="Paso 2 de 8" title="Cómo funciona Synous" />

      <p className="mx-auto max-w-2xl text-center text-base leading-relaxed text-foreground/80">
        Synous convierte tu metodología y tu operación en una plataforma propia — un Sistema
        Operativo Digital. No empezamos por código: primero te entendemos, después diseñamos la
        arquitectura, y recién entonces construimos. Vas a ver avances reales en cada etapa — nunca
        vas a tener que preguntarnos &ldquo;¿cómo vamos?&rdquo;: lo podés ver aquí mismo.
      </p>

      <WizardNav onBack={onBack}>
        <ShinyButton onClick={onContinue} disabled={loading}>
          Continuar
          <ArrowRight className="h-4 w-4" />
        </ShinyButton>
      </WizardNav>
    </div>
  )
}
