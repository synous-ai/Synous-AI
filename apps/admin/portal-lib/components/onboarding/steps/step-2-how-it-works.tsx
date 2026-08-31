'use client'

import { ArrowRight, Workflow } from 'lucide-react'
import { Button } from '@portal/components/ui/button'
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
      <StepHeader icon={Workflow} eyebrow="Paso 2 de 8" title="Cómo funciona Synous AI" />

      {/* Copy textual exacto, tal como lo pidió el negocio — no parafrasear. */}
      <p className="mx-auto max-w-md text-center text-[15px] leading-relaxed text-foreground/80">
        Synous AI convierte tu metodología y tu operación en una plataforma propia — un Sistema
        Operativo Digital. No empezamos por código: primero te entendemos, después diseñamos la
        arquitectura, y recién ahí construimos. Vas a ver avances reales en cada etapa — nunca vas a
        tener que preguntarnos &ldquo;¿cómo vamos?&rdquo;, lo vas a poder ver vos mismo, acá.
      </p>

      <WizardNav onBack={onBack}>
        <Button type="button" onClick={onContinue} disabled={loading} className="min-w-32 gap-2 rounded-full">
          Continuar
          <ArrowRight className="h-4 w-4" />
        </Button>
      </WizardNav>
    </div>
  )
}
