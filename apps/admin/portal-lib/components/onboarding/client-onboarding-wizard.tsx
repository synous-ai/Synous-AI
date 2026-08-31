'use client'

/**
 * Wizard de onboarding POST-VENTA (8 pasos) — reemplaza al viejo wizard
 * público pre-venta (portal-lib/components/onboarding/onboarding-wizard.tsx,
 * eliminado). Este vive DENTRO del Client Portal, autenticado, y arranca
 * automáticamente cuando el deal se gana (ver gating en app/portal/(app)/page.tsx).
 *
 * Parte 1 — Orientación (pasos 1-4, marcan PATCH /progress al avanzar):
 *   1 Bienvenida · 2 Cómo funciona · 3 Fases del proyecto · 4 Modo de trabajo
 * Parte 2 — Acción (pasos 5-8, cada uno con su propio endpoint):
 *   5 Firma · 6 Brief (16 preguntas) · 7 Materiales · 8 Confirmación (gate)
 *
 * Resume: `activeStep` arranca en `onboarding.currentStep` (server-truth) la
 * PRIMERA vez que llegan datos — así, si el cliente recarga la página, retoma
 * donde el backend dice que quedó. Después de eso la navegación es local
 * (Atrás no vuelve a pegarle al backend).
 */

import { useEffect, useRef, useState } from 'react'
import { useClientOnboarding, useMarkOnboardingProgress } from '@portal/lib/hooks'
import { WizardFrame, StepStage } from '@portal/components/onboarding/wizard-shell'
import { SkeletonGroup } from '@portal/components/ui/loading-region'
import { Skeleton } from '@portal/components/ui/skeleton'
import { Step1Welcome } from '@portal/components/onboarding/steps/step-1-welcome'
import { Step2HowItWorks } from '@portal/components/onboarding/steps/step-2-how-it-works'
import { Step3Phases } from '@portal/components/onboarding/steps/step-3-phases'
import { Step4WorkMode } from '@portal/components/onboarding/steps/step-4-work-mode'
import { Step5Signature } from '@portal/components/onboarding/steps/step-5-signature'
import { Step6Brief } from '@portal/components/onboarding/steps/step-6-brief'
import { Step7Materials } from '@portal/components/onboarding/steps/step-7-materials'
import { Step8Complete } from '@portal/components/onboarding/steps/step-8-complete'

export function ClientOnboardingWizard({ onFinish }: { onFinish: () => void }) {
  const { data, isLoading, isError } = useClientOnboarding()
  const markProgress = useMarkOnboardingProgress()

  // `initialStep`: se fija UNA sola vez en cuanto llegan los primeros datos
  // (server-truth), no se vuelve a recalcular en refetches posteriores —
  // así no le pisa al usuario un paso al que ya avanzó localmente.
  const [activeStep, setActiveStep] = useState<number | null>(null)
  const [direction, setDirection] = useState(1)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!initializedRef.current && data) {
      initializedRef.current = true
      setActiveStep(data.onboarding.currentStep)
    }
  }, [data])

  if (isLoading || activeStep === null) {
    return (
      <WizardFrame>
        <SkeletonGroup label="Cargando tu onboarding…" className="flex flex-col items-center gap-4 py-10">
          <Skeleton className="h-14 w-14 rounded-2xl" />
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="mt-4 h-40 w-full rounded-2xl" />
        </SkeletonGroup>
      </WizardFrame>
    )
  }

  if (isError || !data) {
    return (
      <WizardFrame>
        <p className="py-10 text-center text-sm text-destructive">
          No se pudo cargar tu onboarding. Intentá recargar la página.
        </p>
      </WizardFrame>
    )
  }

  const { onboarding, assets } = data

  function goTo(step: number, dir: number) {
    setDirection(dir)
    setActiveStep(step)
  }

  async function advanceOrientation(step: number) {
    try {
      await markProgress.mutateAsync(step)
    } catch {
      /* si falla el PATCH igual dejamos avanzar localmente — no es bloqueante */
    }
    goTo(step + 1, 1)
  }

  // "Saltar la introducción" (link al pie durante los pasos 1-4): marca los
  // pasos de orientación como vistos reusando el mismo PATCH /progress que
  // usa "Continuar" en cada paso, y salta directo al paso 5 (Firma).
  async function skipIntro() {
    try {
      await markProgress.mutateAsync(4)
    } catch {
      /* no bloqueante, igual que en advanceOrientation */
    }
    goTo(5, 1)
  }

  return (
    <WizardFrame step={activeStep} onSkip={skipIntro}>
      <StepStage step={activeStep} direction={direction}>
        {activeStep === 1 && <Step1Welcome onContinue={() => void advanceOrientation(1)} loading={markProgress.isPending} />}
        {activeStep === 2 && (
          <Step2HowItWorks
            onContinue={() => void advanceOrientation(2)}
            onBack={() => goTo(1, -1)}
            loading={markProgress.isPending}
          />
        )}
        {activeStep === 3 && (
          <Step3Phases
            onContinue={() => void advanceOrientation(3)}
            onBack={() => goTo(2, -1)}
            loading={markProgress.isPending}
          />
        )}
        {activeStep === 4 && (
          <Step4WorkMode
            onContinue={() => void advanceOrientation(4)}
            onBack={() => goTo(3, -1)}
            loading={markProgress.isPending}
          />
        )}
        {activeStep === 5 && (
          <Step5Signature onboarding={onboarding} onContinue={() => goTo(6, 1)} onBack={() => goTo(4, -1)} />
        )}
        {activeStep === 6 && (
          <Step6Brief briefAnswers={onboarding.briefAnswers} onContinue={() => goTo(7, 1)} onBack={() => goTo(5, -1)} />
        )}
        {activeStep === 7 && (
          <Step7Materials
            materials={onboarding.materials}
            assets={assets}
            onContinue={() => goTo(8, 1)}
            onBack={() => goTo(6, -1)}
          />
        )}
        {activeStep === 8 && (
          <Step8Complete
            onboarding={onboarding}
            onGoToStep={(step) => goTo(step, -1)}
            onBack={() => goTo(7, -1)}
            onFinish={onFinish}
          />
        )}
      </StepStage>
    </WizardFrame>
  )
}
