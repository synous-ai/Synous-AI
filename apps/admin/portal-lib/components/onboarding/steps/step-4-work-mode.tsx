'use client'

import { ArrowRight, LayoutDashboard, PhoneCall, MessageCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@portal/components/ui/button'
import { StepHeader, WizardNav } from '@portal/components/onboarding/wizard-shell'

interface Point {
  icon: LucideIcon
  title: string
  desc: string
}

const POINTS: Point[] = [
  {
    icon: LayoutDashboard,
    title: 'Todo vive en tu Portal',
    desc: 'Roadmap, avances, entregables y documentos — todo queda acá, en un solo lugar. No WhatsApp.',
  },
  {
    icon: PhoneCall,
    title: 'Dos momentos con llamada en vivo',
    desc: 'Cuando te mostramos la primera versión de tu plataforma (MVP) y cuando lanzamos. El resto lo seguís desde tu Portal.',
  },
  {
    icon: MessageCircle,
    title: 'Para algo puntual',
    desc: 'Si necesitás algo fuera de esos dos momentos, escribinos desde tu Portal.',
  },
]

export function Step4WorkMode({
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
      <StepHeader icon={LayoutDashboard} eyebrow="Paso 4 de 8" title="Cómo vamos a trabajar" />

      <div className="grid gap-3 sm:grid-cols-3">
        {POINTS.map((p, i) => (
          <div key={p.title} className="editorial-sheen flex flex-col rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <span className="font-editorial text-3xl italic leading-none text-muted-foreground/30">
                {String(i + 1).padStart(2, '0')}
              </span>
              <p.icon className="h-4 w-4 text-muted-foreground/50" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="mt-4 text-sm font-semibold text-foreground">{p.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{p.desc}</p>
          </div>
        ))}
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
