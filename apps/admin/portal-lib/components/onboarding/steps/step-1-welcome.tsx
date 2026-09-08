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
      {/* Plain 16:9 slot — no blueprint framing here, that belongs to the card
          around it; repeating it would nest one frame inside another. */}
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 rounded-xl border border-border/60 bg-black/30">
        <span className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-secondary">
          <PlayCircle className="h-8 w-8 text-foreground/80" strokeWidth={1.5} />
        </span>
        <p className="text-sm font-medium text-muted-foreground">Video de bienvenida — próximamente</p>
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
