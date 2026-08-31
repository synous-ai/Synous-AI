'use client'

import { ArrowRight, PlayCircle, Sparkles } from 'lucide-react'
import { Button } from '@portal/components/ui/button'
import { StepHeader, WizardNav } from '@portal/components/onboarding/wizard-shell'

export function Step1Welcome({ onContinue, loading }: { onContinue: () => void; loading?: boolean }) {
  return (
    <div>
      <StepHeader
        icon={Sparkles}
        eyebrow="Paso 1 de 8"
        title="¡Bienvenido a bordo!"
        hint="Arrancamos tu proyecto con Synous AI. Estos primeros pasos son cortos — te van a servir para entender cómo trabajamos y para darnos la info que necesitamos para arrancar."
      />

      {/*
        TODO(video-bienvenida): reemplazar este placeholder por el embed real
        cuando Lauri grabe el guion. Sugerido: <video> propio o iframe de
        Loom/YouTube sin listar, manteniendo el frame 16:9 y el rounded-2xl.
      */}
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="editorial-sheen group relative flex aspect-video w-full cursor-default flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-border bg-card text-center"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'radial-gradient(hsl(0 0% 100%) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
          }}
        />
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full border border-border bg-secondary shadow-card">
          <PlayCircle className="h-7 w-7 text-foreground/80" strokeWidth={1.5} />
        </span>
        <p className="relative text-sm font-medium text-muted-foreground">Video de bienvenida — próximamente</p>
      </button>

      <WizardNav>
        <Button type="button" onClick={onContinue} disabled={loading} className="min-w-32 gap-2 rounded-full">
          Empezar
          <ArrowRight className="h-4 w-4" />
        </Button>
      </WizardNav>
    </div>
  )
}
