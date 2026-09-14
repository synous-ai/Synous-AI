'use client'

import { cn } from '@portal/lib/utils'

export interface ProgressPhase {
  id?: string
  label: string
  isCurrent?: boolean
  isDone?: boolean
}

/**
 * PhaseProgressBar — barra segmentada (un segmento angosto por fase) del
 * Home del Client Portal.
 *
 * Reemplaza la combinación "card de fase actual" + acordeón TOTALMENTE
 * expandido que tenía el Home antes: ahí el cliente tenía que leer la
 * descripción de la fase actual dos veces (una en la card, otra repetida
 * arriba del acordeón) para enterarse de cuánto faltaba. Acá lo ve de un
 * vistazo — con `flex-1` en cada segmento, las 9 fases entran sin scroll
 * horizontal incluso a ~400px de ancho.
 *
 * Accesible como UN solo control (`role="progressbar"`), no como 9 elementos
 * sueltos: un lector de pantalla no puede "ver" qué segmento está pintado más
 * fuerte, así que `aria-valuenow`/`aria-valuetext` cargan el significado real
 * ("Fase 3 de 9: Primera Versión (MVP)"). Los `<span>` de cada segmento son
 * `aria-hidden` a propósito — son decoración de ese único valor, no ítems de
 * lista.
 */
export function PhaseProgressBar({ phases, className }: { phases: ProgressPhase[]; className?: string }) {
  const total = phases.length
  const currentIdx = phases.findIndex((p) => p.isCurrent)
  const currentPosition = currentIdx >= 0 ? currentIdx + 1 : 0
  const currentLabel = currentIdx >= 0 ? phases[currentIdx]!.label : null

  return (
    <div
      role="progressbar"
      aria-label="Progreso del proyecto"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={currentPosition || undefined}
      aria-valuetext={currentLabel ? `Fase ${currentPosition} de ${total}: ${currentLabel}` : undefined}
      className={cn('flex gap-1', className)}
    >
      {phases.map((phase, i) => (
        <span
          key={phase.id ?? i}
          aria-hidden
          className={cn(
            'h-1.5 min-w-0 flex-1 rounded-full transition-colors',
            phase.isDone && 'bg-foreground/60',
            phase.isCurrent && 'bg-foreground',
            !phase.isDone && !phase.isCurrent && 'bg-border',
          )}
        />
      ))}
    </div>
  )
}
