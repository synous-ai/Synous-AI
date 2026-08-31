'use client'

import { useState } from 'react'
import { ArrowRight, PenLine, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@portal/components/ui/button'
import { Input } from '@portal/components/ui/input'
import { Label } from '@portal/components/ui/label'
import { StepHeader, WizardNav } from '@portal/components/onboarding/wizard-shell'
import { useSubmitOnboardingSignature } from '@portal/lib/hooks'
import type { ClientOnboarding } from '@portal/lib/types'
import { cn } from '@portal/lib/utils'

export function Step5Signature({
  onboarding,
  onContinue,
  onBack,
}: {
  onboarding: ClientOnboarding
  onContinue: () => void
  onBack: () => void
}) {
  const alreadySigned = !!onboarding.signatureAcceptedAt
  const [fullName, setFullName] = useState('')
  const [accepted, setAccepted] = useState(false)
  const signature = useSubmitOnboardingSignature()

  const nameValid = fullName.trim().length >= 3
  const canSign = nameValid && accepted && !signature.isPending

  async function handleSign() {
    if (!canSign) return
    try {
      await signature.mutateAsync({ fullName: fullName.trim(), accepted: true })
      onContinue()
    } catch {
      /* el error se muestra abajo vía signature.isError */
    }
  }

  if (alreadySigned) {
    return (
      <div>
        <StepHeader icon={CheckCircle2} eyebrow="Paso 5 de 8" title="Ya firmaste" />
        <div className="editorial-sheen flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-foreground" />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-foreground">{onboarding.signatureName}</p>
            <p className="text-muted-foreground">
              Firmado el{' '}
              {new Date(onboarding.signatureAcceptedAt!).toLocaleDateString('es', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
        </div>
        <WizardNav onBack={onBack}>
          <Button type="button" onClick={onContinue} className="min-w-32 gap-2 rounded-full">
            Continuar
            <ArrowRight className="h-4 w-4" />
          </Button>
        </WizardNav>
      </div>
    )
  }

  return (
    <div>
      <StepHeader icon={PenLine} eyebrow="Paso 5 de 8" title="Firmá para arrancar" />

      {/*
        TODO(legal): el texto del contrato/acuerdo está pendiente de redacción
        legal. Este resumen es un placeholder — reemplazar por el texto real
        (o embeber el documento) cuando esté listo.
      */}
      <div className="max-h-40 overflow-y-auto rounded-2xl border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
        El texto del contrato estará disponible aquí.
      </div>

      <div className="mt-5 space-y-4">
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="text-foreground/90">He leído y acepto los términos del servicio</span>
        </label>

        <div className="space-y-1.5">
          <Label htmlFor="ob-signature-name">Nombre y apellido</Label>
          <Input
            id="ob-signature-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Tu nombre completo"
            autoComplete="name"
            className={cn(fullName.length > 0 && !nameValid && 'border-destructive')}
          />
          {fullName.length > 0 && !nameValid && (
            <p className="text-xs text-destructive">Ingresá al menos 3 caracteres.</p>
          )}
        </div>

        {signature.isError && (
          <p role="alert" className="text-sm text-destructive">
            {signature.error instanceof Error ? signature.error.message : 'No se pudo guardar la firma.'}
          </p>
        )}
      </div>

      <WizardNav onBack={onBack}>
        <Button type="button" onClick={handleSign} disabled={!canSign} className="min-w-32 gap-2 rounded-full">
          {signature.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Firmar
          {!signature.isPending && <ArrowRight className="h-4 w-4" />}
        </Button>
      </WizardNav>
    </div>
  )
}
