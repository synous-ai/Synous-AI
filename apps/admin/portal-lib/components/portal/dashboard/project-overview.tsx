'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { formatDate } from '@synous/shared'
import { cn } from '@portal/lib/utils'
import type { ClientProject, ClientProjectStatus } from '@portal/lib/types'
import { ProjectPhaseStepper } from '@portal/components/project/project-phase-stepper'
import { PhasesRoadmap, type RoadmapPhase } from '@portal/components/project/phases-roadmap'
import { Button } from '@portal/components/ui/button'
import { portalBase } from '@portal/components/portal/portal-nav'

/**
 * "Tu proyecto" — la pieza con más peso visual del Inicio.
 *
 * Se adapta al estado REAL que devuelve `GET /api/client/project`
 * (`preparation` / `in_progress` / `completed`, derivado del pipeline y de los
 * flags de la etapa en el backend). Ningún dato se inventa: cada bloque de
 * metadata se renderiza solo si su valor existe, y si no existe simplemente no
 * ocupa lugar. Un proyecto sin fecha de entrega cargada muestra tres celdas en
 * vez de cuatro, no una celda con "—".
 */

interface StatusPresentation {
  label: string
  /** Clases del pill. Monocromo salvo el estado terminal, que sí es una buena noticia. */
  className: string
  dotClassName: string
}

const STATUS: Record<ClientProjectStatus, StatusPresentation> = {
  preparation: {
    label: 'En preparación',
    className: 'border-border bg-muted/60 text-muted-foreground',
    dotClassName: 'bg-muted-foreground/60',
  },
  in_progress: {
    label: 'En curso',
    className: 'border-primary/30 bg-primary/10 text-primary',
    dotClassName: 'bg-primary',
  },
  completed: {
    label: 'Completado',
    className: 'border-primary/30 bg-primary/10 text-primary',
    dotClassName: 'bg-primary',
  },
}

function StatusPill({ status }: { status: ClientProjectStatus }) {
  const s = STATUS[status]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        s.className,
      )}
    >
      {/* El punto acompaña; el estado lo dice el texto, siempre presente. */}
      <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', s.dotClassName)} />
      {s.label}
    </span>
  )
}

/** Celda de metadata. No se renderiza si no hay valor — ver nota de arriba. */
function Meta({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 truncate text-sm text-foreground" title={value}>
        {value}
      </dd>
    </div>
  )
}

/**
 * Plan completo, colapsado. El stepper de arriba ya responde "en qué fase
 * estamos"; esto es para quien quiere leer qué pasa en cada una. Arranca
 * cerrado porque es consulta, no información de primer vistazo.
 */
function FullPlanDisclosure({ phases }: { phases: RoadmapPhase[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-sm text-xs font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {open ? 'Ocultar el plan completo' : 'Ver el plan completo'}
        <ChevronDown
          aria-hidden
          className={cn('h-3.5 w-3.5 transition-transform duration-200', open && 'rotate-180')}
          strokeWidth={2}
        />
      </button>
      {open && <PhasesRoadmap phases={phases} collapseAll showStatusLabel className="mt-3" />}
    </div>
  )
}

export function ProjectOverview({ project }: { project: ClientProject }) {
  const pathname = usePathname()
  const { status, phases, currentPhase, nextPhase } = project
  const isCompleted = status === 'completed'

  const phaseNumber = phases ? phases.findIndex((p) => p.isCurrent) + 1 : 0
  const totalPhases = phases?.length ?? 0

  const roadmapPhases: RoadmapPhase[] | null =
    phases?.map((p) => ({
      id: p.id,
      label: p.label,
      description: p.description,
      isCurrent: p.isCurrent,
      isDone: p.isDone,
    })) ?? null

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      {/* ─── Identidad y estado ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h3 className="font-editorial min-w-0 text-xl leading-tight text-foreground sm:text-2xl">
          {project.deal.name}
        </h3>
        <StatusPill status={status} />
      </div>

      {status === 'preparation' && (
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Estamos preparando todo para arrancar. Apenas comience la primera fase vas a ver acá el avance
          del proyecto.
        </p>
      )}

      {isCompleted && (
        <>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
            {project.completedAt
              ? `Proyecto finalizado el ${formatDate(project.completedAt)}.`
              : 'El proyecto está finalizado.'}
          </p>
          {/* Terminado el proyecto, lo que queda es consultar lo entregado. */}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`${portalBase(pathname)}/deliverables`}>Ver entregables</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`${portalBase(pathname)}/documents`}>Ver documentos</Link>
            </Button>
          </div>
        </>
      )}

      {/* ─── Progreso por fases ─────────────────────────────────────────── */}
      {phases && phases.length > 0 && (
        <div className="mt-5 space-y-3">
          {phaseNumber > 0 && (
            <p className="eyebrow">
              Fase {phaseNumber} de {totalPhases}
            </p>
          )}
          <ProjectPhaseStepper phases={phases} />
        </div>
      )}

      {/* ─── Qué está pasando ahora ─────────────────────────────────────── */}
      {currentPhase?.description && status === 'in_progress' && (
        <p className="mt-5 max-w-prose text-sm leading-relaxed text-muted-foreground">
          {currentPhase.description}
        </p>
      )}

      {/* ─── Metadata ───────────────────────────────────────────────────────
          Grilla de 2 columnas en mobile y 4 desde `sm`. Las celdas sin dato no
          se renderizan, así que la grilla se acomoda sola. */}
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-border pt-4 sm:grid-cols-4">
        <Meta label="Fase actual" value={currentPhase?.label ?? null} />
        <Meta
          label={status === 'preparation' ? 'Próximo paso' : 'Próximo hito'}
          value={nextPhase?.label ?? null}
        />
        <Meta label="Inicio" value={project.startedAt ? formatDate(project.startedAt) : null} />
        {/* Con el proyecto terminado, una fecha ESTIMADA de entrega ya no dice
            nada: la fecha real la da el mensaje de arriba. */}
        <Meta
          label="Entrega estimada"
          value={!isCompleted && project.estimatedDelivery ? formatDate(project.estimatedDelivery) : null}
        />
      </dl>

      {roadmapPhases && roadmapPhases.length > 0 && (
        <div className="mt-4">
          <FullPlanDisclosure phases={roadmapPhases} />
        </div>
      )}
    </div>
  )
}
