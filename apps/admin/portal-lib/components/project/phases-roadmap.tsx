'use client'

import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Badge } from '@portal/components/ui/badge'
import { cn } from '@portal/lib/utils'

/**
 * Una fase del roadmap, ya normalizada por el caller.
 *
 * `isCurrent`/`isDone` vienen resueltos DESDE AFUERA (en vez de un
 * `currentIndex` numérico acá adentro) porque los dos consumidores calculan
 * "cuál es la actual" de forma distinta: el wizard de onboarding usa una
 * constante fija (`Step3Phases` siempre arranca en la fase 1, con contenido
 * estático), mientras que el Home del Client Portal usa `isCurrent`/`isDone`
 * que YA vienen resueltos por el backend (`GET /api/client/project`, campo
 * `phases`). Pasar objetos con esos dos flags ya resueltos evita que este
 * componente compartido tenga que saber de dónde sale el índice.
 */
export interface RoadmapPhase {
  id?: string
  label: string
  description?: string | null
  optional?: boolean
  isCurrent?: boolean
  isDone?: boolean
}

/**
 * PhasesRoadmap — acordeón editorial de fases (números 01-09, tipografía
 * serif, chevron, punto de marca en la fase actual, badge "Opcional").
 *
 * Extraído 1:1 de `onboarding/steps/step-3-phases.tsx` para reusarlo también
 * en el Home del Client Portal (`portal/home-panel.tsx`) con datos reales.
 * El wizard sigue viéndose EXACTAMENTE igual: pasa las 9 fases estáticas con
 * `isCurrent: true` solo en la primera y ningún `isDone` (el wizard nunca
 * marca fases previas como completadas).
 *
 * Fases con `isDone` se muestran atenuadas (opacity) y con un check en vez
 * del número — señal de "completada" sin agregar un color nuevo a la
 * paleta editorial (monocromo + el acento cálido `signal`, reservado para
 * "requiere tu atención").
 */
export function PhasesRoadmap({ phases, className }: { phases: RoadmapPhase[]; className?: string }) {
  const currentIdx = phases.findIndex((p) => p.isCurrent)
  const [openIdx, setOpenIdx] = useState<number>(currentIdx)

  return (
    <div className={cn('divide-y divide-border overflow-hidden rounded-2xl border border-border', className)}>
      {phases.map((phase, i) => {
        const isOpen = openIdx === i
        const n = i + 1
        return (
          <div key={phase.id ?? n} className={cn('bg-card', phase.isDone && 'opacity-60')}>
            <button
              type="button"
              onClick={() => setOpenIdx(isOpen ? -1 : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.03]"
            >
              <span className="font-editorial w-8 shrink-0 text-2xl italic leading-none text-muted-foreground/35">
                {phase.isDone ? (
                  <Check aria-hidden className="h-4 w-4 text-muted-foreground/60" strokeWidth={2.5} />
                ) : (
                  String(n).padStart(2, '0')
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-editorial text-lg leading-tight text-foreground">{phase.label}</span>
                  {phase.isCurrent && (
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
                {!isOpen && <span className="mt-0.5 block truncate text-sm text-muted-foreground">{phase.description}</span>}
              </span>
              <ChevronDown
                aria-hidden
                className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-180')}
              />
            </button>
            {isOpen && (
              <div className="px-5 pb-4 pl-[3.25rem] text-sm leading-relaxed text-muted-foreground">{phase.description}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
