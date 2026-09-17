'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { GitPullRequestArrow, Search } from 'lucide-react'
import { CHANGE_REQUEST_BUCKET_LABEL, CHANGE_REQUEST_STATUS_META, type ChangeRequestBucket } from '@synous/shared'
import { useAllCRs, useCRSummary } from '@/lib/hooks'
import type { ChangeRequestListItem } from '@/lib/types'
import { crStatus, crPriority } from '@/lib/status'
import { formatCurrency, cn } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'
import { Input } from '@/components/ui/input'
import { PillTabs } from '@/components/ui/pill-tabs'
import { TableSkeleton } from '@/components/ui/skeletons'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ─── Filtros ─────────────────────────────────────────────────────────────────
// Esta pantalla es una COLA DE TRABAJO, no un catálogo: el default es el
// bucket "requieren acción" (la pelota del equipo), no el histórico entero.
// Los contadores de cada tab salen de GET /summary (reales, del backend), no
// de contar en el cliente lo que llegó filtrado.

type BucketFilter = ChangeRequestBucket | 'all'

const BUCKET_TABS: { key: BucketFilter; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'needs_action', label: CHANGE_REQUEST_BUCKET_LABEL.needs_action },
  { key: 'in_review', label: CHANGE_REQUEST_BUCKET_LABEL.in_review },
  { key: 'resolved', label: CHANGE_REQUEST_BUCKET_LABEL.resolved },
]

type OriginFilter = 'all' | 'client' | 'agency'

const ORIGIN_TABS: { key: OriginFilter; label: string }[] = [
  { key: 'all', label: 'Todo origen' },
  { key: 'client', label: 'Del cliente' },
  { key: 'agency', label: 'Del equipo' },
]

const WAITING_LABEL: Record<'agency' | 'client' | 'none', string> = {
  agency: 'Equipo',
  client: 'Cliente',
  none: '—',
}

function impact(days: number): string {
  if (!days) return '—'
  return days > 0 ? `+${days} d` : `${days} d`
}

function CRRow({ cr }: { cr: ChangeRequestListItem }) {
  const { kind, label } = crStatus(cr.status)
  const { kind: prKind, label: prLabel } = crPriority(cr.priority)
  const waitingOn = CHANGE_REQUEST_STATUS_META[cr.status]?.waitingOn ?? 'none'
  // Comparación directa contra el string, no contra el catálogo: 'submitted'
  // es el único estado que significa "recién llegada, nadie del equipo la
  // vio todavía". Comparte `waitingOn: 'agency'` con 'under_review' y
  // 'approved_verbally', que NO deben resaltarse igual — no hay un campo de
  // catálogo que distinga "nueva" de "vieja pero todavía en cancha del
  // equipo", e inventar uno solo para este highlight sería peor que el string.
  const isNew = cr.status === 'submitted'

  return (
    <TableRow className={cn(isNew && 'bg-badge-info-bg/40 hover:bg-badge-info-bg/60')}>
      <TableCell className="font-mono text-xs text-muted-foreground">#{cr.number}</TableCell>
      <TableCell>
        <Link
          href={`/change-requests/${cr.id}`}
          className="font-medium text-signal hover:underline focus-visible:underline focus-visible:outline-none"
        >
          {cr.title}
        </Link>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {cr.dealName ? (
          <Link
            href={`/deals/${cr.dealId}`}
            className="hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline focus-visible:outline-none"
          >
            {cr.dealName}
          </Link>
        ) : (
          '—'
        )}
      </TableCell>
      <TableCell>
        <StatusBadge kind={kind}>{label}</StatusBadge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {cr.requestedByName ?? (cr.requestedByRole === 'client' ? 'Cliente' : 'Equipo')}
      </TableCell>
      <TableCell>
        <StatusBadge kind={prKind}>{prLabel}</StatusBadge>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatCurrency(cr.totalAmount, cr.currency)}
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {impact(cr.timelineImpactDays)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {waitingOn === 'none' ? '—' : (
          <span className={cn('font-medium', waitingOn === 'client' && 'text-amber-700 dark:text-[rgba(253,224,71,0.85)]')}>
            {WAITING_LABEL[waitingOn]}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right text-xs text-muted-foreground">
        {new Date(cr.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
      </TableCell>
    </TableRow>
  )
}

export default function ChangeRequestsPage() {
  const [bucket, setBucket] = useState<BucketFilter>('needs_action')
  const [origin, setOrigin] = useState<OriginFilter>('all')
  // `search` es lo que se tipea; `debouncedSearch` es lo que realmente dispara
  // la query — sin esto, cada tecla mandaba una request HTTP nueva.
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data: summary } = useCRSummary()
  const { data, isLoading, isError } = useAllCRs({
    bucket: bucket === 'all' ? undefined : bucket,
    origin: origin === 'all' ? undefined : origin,
    q: debouncedSearch.trim() || undefined,
  })

  const rows = useMemo(() => data ?? [], [data])

  const bucketCount = (key: BucketFilter): number | undefined => {
    if (!summary) return undefined
    return summary[key]
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="eyebrow">Proyectos</p>
        <h1 className="text-3xl font-semibold tracking-tight">Solicitudes de cambio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pedidos fuera de alcance de todos los proyectos, con lo que está esperando el equipo y lo que está esperando el cliente.
        </p>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PillTabs
          tabs={BUCKET_TABS.map((t) => ({ key: t.key, label: t.label, count: bucketCount(t.key) }))}
          active={bucket}
          onChange={setBucket}
        />
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título…"
              aria-label="Buscar change requests"
              className="h-8 w-56 pl-8 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {ORIGIN_TABS.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => setOrigin(o.key)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              o.key === origin
                ? 'border-transparent bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            aria-pressed={o.key === origin}
          >
            {o.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <TableSkeleton columns={9} rows={6} label="Cargando change requests…" />
      ) : isError ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
          <p className="text-sm font-medium text-muted-foreground">No se pudieron cargar las solicitudes</p>
          <p className="mt-1 text-xs text-muted-foreground/60">Probá de nuevo en unos segundos.</p>
        </div>
      ) : rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyIllustration icon={GitPullRequestArrow} />
            <EmptyTitle>Nada por acá</EmptyTitle>
            <EmptyDescription>
              {bucket === 'all' && origin === 'all' && !search
                ? 'Las CRs se crean desde el detalle de un deal, en la pestaña CRs.'
                : 'Probá con otro filtro o búsqueda.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">CR</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Proyecto</TableHead>
                <TableHead className="w-40">Estado</TableHead>
                <TableHead>Pedido por</TableHead>
                <TableHead className="w-24">Prioridad</TableHead>
                <TableHead className="w-32 text-right">Monto</TableHead>
                <TableHead className="w-24 text-right">Impacto</TableHead>
                <TableHead className="w-24">Esperando a</TableHead>
                <TableHead className="w-32 text-right">Creada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((cr) => (
                <CRRow key={cr.id} cr={cr} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Las CRs se crean desde el detalle de un deal, pestaña «CRs».
      </p>
    </div>
  )
}
