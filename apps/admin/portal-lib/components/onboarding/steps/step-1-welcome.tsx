'use client'

import { ArrowRight, PlayCircle, Sparkles } from 'lucide-react'
import { useUser } from '@clerk/nextjs'
import { ShinyButton } from '@portal/components/ui/shiny-button'
import { StepHeader, WizardNav } from '@portal/components/onboarding/wizard-shell'

export function Step1Welcome({ onContinue, loading }: { onContinue: () => void; loading?: boolean }) {
  const { user } = useUser()
  // Greet by first name when Clerk has it; otherwise fall back to a neutral
  // greeting rather than showing an email address in a headline.
  const firstName = user?.firstName?.trim()

  return (
    <div>
      <StepHeader
        icon={Sparkles}
        eyebrow="Paso 1 de 8"
        title={firstName ? `Bienvenido, ${firstName}` : 'Bienvenido a bordo'}
        hint="Vamos a poner en marcha tu proyecto con Synous. Estos primeros pasos son breves: te van a servir para entender cómo trabajamos y para darnos la información que necesitamos."
      />

      {/*
        TODO(video-bienvenida): reemplazar este placeholder por el embed real
        cuando esté grabado el guion. Sugerido: <video> propio o iframe de
        Loom/YouTube sin listar, manteniendo el frame 16:9.
      */}
      <div className="blueprint-frame relative aspect-video w-full">
        <span aria-hidden className="blueprint-corner blueprint-corner-tl" />
        <span aria-hidden className="blueprint-corner blueprint-corner-tr" />
        <span aria-hidden className="blueprint-corner blueprint-corner-bl" />
        <span aria-hidden className="blueprint-corner blueprint-corner-br" />
        <span aria-hidden className="blueprint-dot blueprint-dot-tl" />
        <span aria-hidden className="blueprint-dot blueprint-dot-tr" />
        <span aria-hidden className="blueprint-dot blueprint-dot-bl" />
        <span aria-hidden className="blueprint-dot blueprint-dot-br" />
        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-secondary">
            <PlayCircle className="h-8 w-8 text-foreground/80" strokeWidth={1.5} />
          </span>
          <p className="text-sm font-medium text-muted-foreground">Video de bienvenida — próximamente</p>
        </div>
      </div>

      <WizardNav>
        <ShinyButton onClick={onContinue} disabled={loading}>
          Empezar
          <ArrowRight className="h-4 w-4" />
        </ShinyButton>
      </WizardNav>
    </div>
  )
}
