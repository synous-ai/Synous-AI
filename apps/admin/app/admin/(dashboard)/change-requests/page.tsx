'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { GitPullRequestArrow, ArrowRight } from 'lucide-react'
import { useAllCRs } from '@/lib/hooks'
import type { ChangeRequestListItem } from '@/lib/types'
import { crStatus } from '@/lib/status'
import { formatCurrency, cn } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'
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
// Esta pantalla es una COLA DE TRABAJO, no un catálogo: el filtro por defecto
// muestra lo que todavía requiere una acción de alguien, no el histórico entero.

type FilterKey = 'abiertas' | 'esperando' | 'borradores' | 'cerradas' | 'todas'

const CLOSED = ['completed', 'rejected']
const WAITING_CLIENT = ['sent', 'negotiating']

const FILTERS: { key: FilterKey; label: string; match: (s: string) => boolean }[] = [
  { key: 'abiertas', label: 'Abiertas', match: (s) => !CLOSED.includes(s) },
  { key: 'esperando', label: 'Esperando al cliente', match: (s) => WAITING_CLIENT.includes(s) },
  { key: 'borradores', label: 'Borradores', match: (s) => s === 'draft' },
  { key: 'cerradas', label: 'Cerradas', match: (s) => CLOSED.includes(s) },
  { key: 'todas', label: 'Todas', match: () => true },
]

function impact(days: number): string {
  if (!days) return '—'
  return days > 0 ? `+${days} d` : `${days} d`
}

function CRRow({ cr }: { cr: ChangeRequestListItem }) {
  const { kind, label } = crStatus(cr.status)
  return (
    <TableRow>
      <TableCell className="font-mono text-xs text-muted-foreground">#{cr.number}</TableCell>
      <TableCell>
        <Link
          href={`/admin/change-requests/${cr.id}`}
          className="font-medium text-signal hover:underline"
        >
          {cr.title}
        </Link>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {cr.dealName ? (
          <Link href={`/admin/deals/${cr.dealId}`} className="hover:text-foreground hover:underline">
            {cr.dealName}
          </Link>
        ) : (
          '—'
        )}
      </TableCell>
      <TableCell>
        <StatusBadge kind={kind}>{label}</StatusBadge>
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatCurrency(cr.totalAmount)}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {impact(cr.timelineImpactDays)}
      </TableCell>
      <TableCell className="text-right text-xs text-muted-foreground">
        {new Date(cr.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
      </TableCell>
    </TableRow>
  )
}

export default function ChangeRequestsPage() {
  const { data, isLoading } = useAllCRs()
  const [filter, setFilter] = useState<FilterKey>('abiertas')

  const all = useMemo(() => data ?? [], [data])
  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0]!
  const rows = useMemo(() => all.filter((cr) => active.match(cr.status)), [all, active])
  const waitingCount = useMemo(
    () => all.filter((cr) => WAITING_CLIENT.includes(cr.status)).length,
    [all],
  )

  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="eyebrow">Proyectos</p>
        <h1 className="text-3xl font-semibold tracking-tight">Change Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Todos los pedidos fuera de alcance, de todos los proyectos.
          {waitingCount > 0 && (
            <>
              {' '}
              <span className="font-medium text-foreground">
                {waitingCount} esperando respuesta del cliente.
              </span>
            </>
          )}
        </p>
      </div>

      {isLoading ? (
        <TableSkeleton columns={7} rows={6} label="Cargando change requests…" />
      ) : all.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyIllustration icon={GitPullRequestArrow} />
            <EmptyTitle>Sin change requests</EmptyTitle>
            <EmptyDescription>
              Las CRs se crean desde el detalle de un deal, en la pestaña CRs.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => {
              const count = all.filter((cr) => f.match(cr.status)).length
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm transition-colors',
                    f.key === filter
                      ? 'border-transparent bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {f.label}
                  <span className="ml-1.5 text-xs text-muted-foreground">{count}</span>
                </button>
              )
            })}
          </div>

          {rows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyIllustration icon={GitPullRequestArrow} />
                <EmptyTitle>Nada en «{active.label}»</EmptyTitle>
                <EmptyDescription>Probá con otro filtro.</EmptyDescription>
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
                    <TableHead className="w-32 text-right">Monto</TableHead>
                    <TableHead className="w-24 text-right">Impacto</TableHead>
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
            Las CRs se crean desde el detalle de un deal →{' '}
            <Link href="/admin/deals" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
              ir a Deals <ArrowRight className="h-3 w-3" />
            </Link>
          </p>
        </>
      )}
    </div>
  )
}
