'use client'

import { Check } from 'lucide-react'
import { cn } from '@portal/lib/utils'
import type { ClientProjectPhase } from '@portal/lib/types'

/**
 * Stepper de fases del proyecto — la representación de progreso del Inicio.
 *
 * ─── Fases, no porcentaje ───────────────────────────────────────────────────
 * No muestra "67% completado" a propósito. El dominio no tiene ninguna métrica
 * objetiva de avance: las fases son etapas de un pipeline sin peso, sin
 * duración estimada y sin tareas asociadas que el cliente pueda ver. Dividir
 * "fase 6 de 9" por 9 daría un número con pinta de exacto construido sobre
 * nada — y un cliente que lee "67%" asume que falta un tercio del tiempo, que
 * es justamente lo que no sabemos. "Fase 6 de 9, Verificación" dice lo mismo
 * que sí es cierto.
 *
 * ─── Dos formas, un solo dato ───────────────────────────────────────────────
 * En `md+` es un riel horizontal con una etiqueta debajo de cada nodo. Abajo
 * de ese ancho, nueve etiquetas no entran sin achicar la tipografía a algo
 * ilegible o sin scroll horizontal, así que pasa a lista vertical con
 * conector. Es el MISMO markup semántico (`<ol>`), no dos componentes: lo que
 * cambia es la dirección.
 *
 * ─── Estado sin depender del color ──────────────────────────────────────────
 * Cada nodo lleva forma propia (check / punto lleno / círculo vacío) y un
 * texto de estado solo para lectores de pantalla. El color acompaña, no carga
 * el significado.
 */

type PhaseState = 'done' | 'current' | 'upcoming'

const STATE_LABEL: Record<PhaseState, string> = {
  done: 'Completada',
  current: 'Fase actual',
  upcoming: 'Próxima',
}

function stateOf(phase: ClientProjectPhase): PhaseState {
  if (phase.isCurrent) return 'current'
  if (phase.isDone) return 'done'
  return 'upcoming'
}

/** El marcador del nodo. `done` lleva check, `current` punto lleno, `upcoming` aro vacío. */
function PhaseMarker({ state }: { state: PhaseState }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
        state === 'done' && 'border-primary/40 bg-primary/10 text-primary',
        state === 'current' && 'border-primary bg-primary text-primary-foreground',
        state === 'upcoming' && 'border-border bg-card',
      )}
    >
      {state === 'done' && <Check className="h-3 w-3" strokeWidth={3} />}
      {state === 'current' && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
    </span>
  )
}

export function ProjectPhaseStepper({
  phases,
  className,
}: {
  phases: ClientProjectPhase[]
  className?: string
}) {
  const currentIndex = phases.findIndex((p) => p.isCurrent)

  return (
    <ol
      aria-label="Fases del proyecto"
      className={cn(
        // Vertical por defecto (mobile); horizontal desde md.
        'flex flex-col gap-0 md:flex-row md:gap-0',
        className,
      )}
    >
      {phases.map((phase, i) => {
        const state = stateOf(phase)
        const isLast = i === phases.length - 1
        // El conector se pinta "recorrido" hasta la fase actual inclusive.
        const trackDone = currentIndex >= 0 && i < currentIndex

        return (
          <li
            key={phase.id}
            className={cn(
              'relative flex min-w-0 gap-3 md:flex-1 md:flex-col md:items-center md:gap-2 md:text-center',
              !isLast && 'pb-4 md:pb-0',
            )}
          >
            {/* Conector. En vertical baja por el costado del marcador; en
                horizontal cruza a la altura del marcador, de un nodo al otro. */}
            {!isLast && (
              <span
                aria-hidden
                className={cn(
                  'absolute bg-border',
                  // Vertical: línea de 1px desde debajo del marcador.
                  'left-[9.5px] top-6 h-[calc(100%-1.5rem)] w-px',
                  // Horizontal: desde el centro de este nodo al centro del siguiente.
                  'md:left-1/2 md:top-[9.5px] md:h-px md:w-full',
                  trackDone && 'bg-primary/40',
                )}
              />
            )}

            <PhaseMarker state={state} />

            <span className="min-w-0 md:w-full">
              {/* En horizontal cada fase dispone de ~82px en el ancho más
                  angosto que soporta este layout (tablet, o desktop con el
                  rail abierto), así que la etiqueta baja un punto y se le
                  permite cortar: preferimos dos renglones de 11px a un
                  truncado que esconda de qué fase se trata. */}
              <span
                className={cn(
                  'block break-words leading-snug',
                  'text-xs md:px-1 md:text-[11px]',
                  state === 'current' ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                {phase.label}
              </span>
              {/* El estado no puede quedar solo en el color ni en la forma. */}
              <span className="sr-only">{STATE_LABEL[state]}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
