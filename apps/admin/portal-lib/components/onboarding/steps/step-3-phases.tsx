'use client'

import { useState } from 'react'
import { ArrowRight, ChevronDown, Map } from 'lucide-react'
import { Button } from '@portal/components/ui/button'
import { Badge } from '@portal/components/ui/badge'
import { StepHeader, WizardNav } from '@portal/components/onboarding/wizard-shell'
import { cn } from '@portal/lib/utils'

interface Phase {
  n: number
  title: string
  desc: string
  optional?: boolean
}

const PHASES: Phase[] = [
  { n: 1, title: 'Diagnóstico', desc: 'Te entendemos' },
  { n: 2, title: 'Blueprint', desc: 'Diseñamos el mapa' },
  { n: 3, title: 'Primera Versión (MVP)', desc: 'La ves y la tocás' },
  { n: 4, title: 'Ajustes', desc: 'Afinamos con tu feedback' },
  { n: 5, title: 'Construcción', desc: 'Armamos todo por detrás' },
  { n: 6, title: 'Verificación', desc: 'Probamos todo' },
  { n: 7, title: 'Lanzamiento', desc: 'Tu plataforma en vivo' },
  { n: 8, title: 'Estabilización', desc: 'Te acompañamos las primeras semanas' },
  { n: 9, title: 'Evolución', desc: 'Seguimos mejorando', optional: true },
]

// La fase actual (Diagnóstico, la primera del roadmap) arranca expandida y
// marcada con un punto — el resto del acordeón arranca cerrado.
const CURRENT_PHASE = 1

export function Step3Phases({
  onContinue,
  onBack,
  loading,
}: {
  onContinue: () => void
  onBack: () => void
  loading?: boolean
}) {
  const [openPhase, setOpenPhase] = useState<number>(CURRENT_PHASE)

  return (
    <div>
      <StepHeader
        icon={Map}
        eyebrow="Paso 3 de 8"
        title="Las fases de tu proyecto"
        hint="Este va a ser el roadmap de tu proyecto — lo vas a ver reflejado en tu Portal a medida que avancemos."
      />

      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
        {PHASES.map((phase) => {
          const isOpen = openPhase === phase.n
          const isCurrent = phase.n === CURRENT_PHASE
          return (
            <div key={phase.n} className="bg-card">
              <button
                type="button"
                onClick={() => setOpenPhase(isOpen ? -1 : phase.n)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.03]"
              >
                <span className="font-editorial w-8 shrink-0 text-2xl italic leading-none text-muted-foreground/35">
                  {String(phase.n).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-editorial text-lg leading-tight text-foreground">{phase.title}</span>
                    {isCurrent && (
                      <span
                        aria-hidden
                        title="Fase actual"
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground"
                      />
                    )}
                    {phase.optional && (
                      <Badge variant="muted" className="text-[10px]">
                        Opcional
                      </Badge>
                    )}
                  </span>
                  {!isOpen && <span className="mt-0.5 block truncate text-sm text-muted-foreground">{phase.desc}</span>}
                </span>
                <ChevronDown
                  aria-hidden
                  className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-180')}
                />
              </button>
              {isOpen && (
                <div className="px-5 pb-4 pl-[3.25rem] text-sm leading-relaxed text-muted-foreground">{phase.desc}</div>
              )}
            </div>
          )
        })}
      </div>

      <WizardNav onBack={onBack}>
        <Button type="button" onClick={onContinue} disabled={loading} className="min-w-32 gap-2 rounded-full">
          Continuar
          <ArrowRight className="h-4 w-4" />
        </Button>
      </WizardNav>
    </div>
  )
}
