'use client'

/**
 * Equipo (/admin/team): quién hace qué y cuánta carga tiene cada persona.
 * La gestión de cuentas (invitar, rol, desactivar) sigue en Configuración → Usuarios.
 */

import { useMemo } from 'react'
import Link from 'next/link'
import { Settings, Users } from 'lucide-react'
import { useHubUser, useTeam } from '@/lib/hooks'
import { teamTotals } from '@/lib/team'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import { CardGridSkeleton } from '@/components/ui/skeletons'
import { TeamMemberCard } from '@/components/team/team-member-card'

function Metric({ label, value, warn = false }: { label: string; value: number; warn?: boolean }): React.JSX.Element {
  return (
    <Card className="p-4">
      <p className={cn('text-2xl font-semibold tabular-nums', warn && value > 0 && 'text-destructive')}>{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </Card>
  )
}

export function TeamView(): React.JSX.Element {
  const { data, isLoading, isError, refetch } = useTeam()
  const { data: me } = useHubUser()
  const totals = useMemo(() => teamTotals(data ?? []), [data])

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Proyectos</p>
          <h1 className="text-3xl font-semibold tracking-tight">Equipo</h1>
        </div>
        {me?.role === 'owner' && (
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings#usuarios">
              <Settings className="h-3.5 w-3.5" /> Gestionar accesos
            </Link>
          </Button>
        )}
      </div>

      {isLoading ? (
        <CardGridSkeleton count={6} label="Cargando equipo…" cardClassName="h-44" />
      ) : isError || !data ? (
        <Empty>
          <EmptyHeader>
            <EmptyIllustration icon={Users} />
            <EmptyTitle>No se pudo cargar el equipo</EmptyTitle>
            <EmptyDescription>Revisá tu conexión e intentá de nuevo.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => void refetch()}>
              Reintentar
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <section aria-label="Resumen del equipo" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Personas" value={totals.people} />
            <Metric label="Proyectos activos" value={totals.activeProjects} />
            <Metric label="Tareas abiertas" value={totals.openTasks} />
            <Metric label="Bloqueados / Esperando aprobación" value={totals.needAttention} warn />
          </section>
          {data.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyIllustration icon={Users} />
                <EmptyTitle>Todavía no hay personas en el equipo</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.map((m) => (
                <li key={m.id}>
                  <TeamMemberCard member={m} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
