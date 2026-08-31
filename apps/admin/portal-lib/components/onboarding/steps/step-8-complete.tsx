'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, CheckCircle2, Circle, Loader2, PartyPopper, Rocket } from 'lucide-react'
import { Button } from '@portal/components/ui/button'
import { StepHeader, WizardNav } from '@portal/components/onboarding/wizard-shell'
import { useCompleteOnboarding } from '@portal/lib/hooks'
import type { ClientOnboarding, CompleteOnboardingResultDTO } from '@portal/lib/types'
import { cn } from '@portal/lib/utils'

interface GateItem {
  step: 5 | 6 | 7
  label: string
}

const GATE_ITEMS: GateItem[] = [
  { step: 5, label: 'Firma' },
  { step: 6, label: 'Brief del proyecto' },
  { step: 7, label: 'Materiales' },
]

export function Step8Complete({
  onboarding,
  onGoToStep,
  onBack,
  onFinish,
}: {
  onboarding: ClientOnboarding
  onGoToStep: (step: number) => void
  onBack: () => void
  onFinish: () => void
}) {
  const complete = useCompleteOnboarding()
  const [result, setResult] = useState<CompleteOnboardingResultDTO | null>(null)

  const doneMap = GATE_ITEMS.map((item) => ({ ...item, done: !!onboarding.stepsCompleted[String(item.step) as '5' | '6' | '7'] }))
  const allDone = doneMap.every((i) => i.done)

  async function handleComplete() {
    try {
      const r = await complete.mutateAsync()
      setResult(r)
    } catch {
      /* el error se muestra abajo vía complete.isError */
    }
  }

  if (result) {
    return (
      <div className="flex flex-col items-center text-center">
        <motion.span
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
          className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-card"
        >
          <PartyPopper className="h-8 w-8" />
        </motion.span>
        <h2 className="font-editorial text-4xl leading-[1.15] tracking-tight text-foreground">¡Onboarding completo!</h2>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Tu proyecto <strong className="text-foreground">{result.dealName}</strong> ya está en fase de{' '}
          <strong className="text-foreground">{result.stageLabel}</strong>. A partir de acá vas a ver los avances de
          tu plataforma directamente en este mismo Portal — sin tener que preguntarnos &ldquo;¿cómo vamos?&rdquo;.
        </p>
        <div className="editorial-sheen mt-6 w-full max-w-sm rounded-2xl border border-border bg-card p-4 text-left text-sm text-muted-foreground">
          <p className="mb-1.5 flex items-center gap-2 font-medium text-foreground">
            <Rocket className="h-4 w-4 text-foreground" />
            Próximos pasos
          </p>
          Nuestro equipo ya arrancó con el Diagnóstico de tu proyecto. Te vamos a ir mostrando avances acá mismo, y
          te contactamos para coordinar la llamada de la primera versión (MVP) cuando esté lista.
        </div>
        <Button type="button" onClick={onFinish} className="mt-8 min-w-40 gap-2 rounded-full">
          Ir a mi Portal
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <div>
      <StepHeader icon={CheckCircle2} eyebrow="Paso 8 de 8" title="Todo listo para arrancar" />

      <div className="space-y-2">
        {doneMap.map((item) => (
          <div
            key={item.step}
            className={cn(
              'flex items-center justify-between gap-3 rounded-xl border p-3.5',
              item.done ? 'border-foreground/25 bg-white/[0.03]' : 'border-border bg-card',
            )}
          >
            <span className="flex items-center gap-2.5 text-sm font-medium text-foreground">
              {item.done ? (
                <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-foreground" />
              ) : (
                <Circle className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
              )}
              {item.label}
            </span>
            {!item.done && (
              <Button type="button" size="sm" variant="outline" onClick={() => onGoToStep(item.step)} className="rounded-full">
                Completar
              </Button>
            )}
          </div>
        ))}
      </div>

      {complete.isError && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {complete.error instanceof Error ? complete.error.message : 'No se pudo completar el onboarding.'}
        </p>
      )}

      <WizardNav onBack={onBack}>
        <Button type="button" onClick={handleComplete} disabled={!allDone || complete.isPending} className="min-w-44 gap-2 rounded-full">
          {complete.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Completar onboarding
          {!complete.isPending && <ArrowRight className="h-4 w-4" />}
        </Button>
      </WizardNav>
    </div>
  )
}
