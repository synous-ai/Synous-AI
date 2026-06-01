'use client'

import Link from 'next/link'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
} from 'recharts'
import { AlertTriangle, ArrowDown, ArrowUp, TrendingUp, Users, Zap, BarChart2, CheckCircle2 } from 'lucide-react'
import { useReports } from '@/lib/hooks'
import { formatCurrency, cn } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { ReportFunnelStage, ReportConversionBySource, ReportUserActivity } from '@/lib/types'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'

// ─────────────────────────── chart configs ──────────────────────────────────

const funnelChartConfig = {
  deals: {
    label: 'Deals',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig

const conversionChartConfig = {
  leads: {
    label: 'Leads',
    color: 'hsl(var(--chart-2))',
  },
  clientes: {
    label: 'Clientes',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig

// ─────────────────────────── helpers ────────────────────────────────────────

function fmtMoney(value: string | undefined | null): string {
  if (!value) return '$0'
  return formatCurrency(Number(value))
}

function variationPct(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

// ─────────────────────────── KPI pill ───────────────────────────────────────

interface KpiPillProps {
  label: string
  value: string | number
  sub?: string
  danger?: boolean
  accent?: boolean
}

function KpiPill({ label, value, sub, danger, accent }: KpiPillProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-xl border bg-card px-5 py-4',
        danger && 'border-destructive/40 bg-destructive/5',
        accent && 'border-signal/50 bg-signal/10',
      )}
    >
      <span className="eyebrow truncate">{label}</span>
      <span
        className={cn(
          'truncate text-2xl font-medium tracking-tight',
          danger && 'text-destructive',
          accent && 'text-primary',
        )}
      >
        {value}
      </span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  )
}

// ─────────────────────────── Section header ─────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-medium text-muted-foreground">
      {children}
    </h2>
  )
}

// ─────────────────────────── Pipeline Funnel ────────────────────────────────

interface FunnelChartProps {
  stages: ReportFunnelStage[]
  winRate: number | null
}

function PipelineFunnelSection({ stages, winRate }: FunnelChartProps) {
  const chartData = stages.map((s) => ({
    name: s.label,
    deals: s.currentDeals,
    value: Number(s.currentValue),
    isWon: s.isWon,
    isClosed: s.isClosed,
  }))

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Embudo de Pipeline</CardTitle>
        </div>
        {winRate !== null && (
          <div className="flex flex-col items-end">
            <span className="text-xl font-medium tracking-tight text-foreground">{winRate}%</span>
            <span className="eyebrow">win rate</span>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {stages.length === 0 ? (
          <Empty className="border-dashed py-8">
            <EmptyHeader>
              <EmptyIllustration icon={BarChart2} />
              <EmptyTitle>Sin Etapas de Pipeline</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <ChartContainer config={funnelChartConfig} className="h-[260px] w-full">
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 60, bottom: 4, left: 8 }}>
              <XAxis type="number" hide />
              <YAxis
                dataKey="name"
                type="category"
                width={130}
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0]?.payload as (typeof chartData)[number]
                  return (
                    <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-md">
                      <p className="font-semibold">{d.name}</p>
                      <p className="text-muted-foreground">{d.deals} deals · {fmtMoney(String(d.value))}</p>
                    </div>
                  )
                }}
              />
              <Bar dataKey="deals" radius={[0, 4, 4, 0]} maxBarSize={28}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={
                      entry.isWon
                        ? 'hsl(var(--chart-1))'
                        : entry.isClosed
                          ? 'hsl(var(--chart-3))'
                          : 'hsl(var(--chart-2))'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────── Deals at Risk ──────────────────────────────────

interface DealsAtRiskSectionProps {
  count: number
  deals: {
    id: string
    name: string
    amount: string | null
    stageLabel: string
    daysSinceActivity: number | null
  }[]
}

function DealsAtRiskSection({ count, deals }: DealsAtRiskSectionProps) {
  return (
    <Card className={cn(count > 0 && 'border-destructive/40')}>
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <AlertTriangle className={cn('h-4 w-4', count > 0 ? 'text-destructive' : 'text-muted-foreground')} />
        <CardTitle className="text-base">Deals en Riesgo</CardTitle>
        <StatusBadge kind={count > 0 ? 'danger' : 'neutral'} className="ml-auto">
          {count}
        </StatusBadge>
      </CardHeader>
      <CardContent>
        {deals.length === 0 ? (
          <Empty className="border-dashed py-8">
            <EmptyHeader>
              <EmptyIllustration icon={CheckCircle2} />
              <EmptyTitle>Sin Deals en Riesgo — Todo al Día</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-2">
            {deals.map((d) => (
              <Link
                key={d.id}
                href={`/deals/${d.id}`}
                className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-2.5 transition-colors hover:bg-accent/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{d.name}</p>
                  <p className="text-xs text-muted-foreground">{d.stageLabel}</p>
                </div>
                <div className="ml-4 flex flex-col items-end gap-0.5">
                  {d.amount && (
                    <span className="text-sm font-bold text-primary">{fmtMoney(d.amount)}</span>
                  )}
                  <span className="whitespace-nowrap text-xs text-destructive">
                    hace {d.daysSinceActivity ?? '?'} días
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────── Conversion by Source ───────────────────────────

interface ConversionSourceProps {
  data: ReportConversionBySource[]
}

function ConversionBySourceSection({ data }: ConversionSourceProps) {
  const chartData = data.map((r) => ({ name: r.source, leads: r.leads, clientes: r.customers }))

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <Zap className="h-4 w-4 text-primary" />
        <CardTitle className="text-base">Conversión por Fuente</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <Empty className="border-dashed py-8">
            <EmptyHeader>
              <EmptyIllustration icon={Zap} />
              <EmptyTitle>Sin Datos de Fuente</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <ChartContainer config={conversionChartConfig} className="h-[200px] w-full">
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="leads" name="Leads" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Bar dataKey="clientes" name="Clientes" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ChartContainer>

            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="py-2 font-semibold text-muted-foreground">Fuente</TableHead>
                    <TableHead className="py-2 text-right font-semibold text-muted-foreground">Leads</TableHead>
                    <TableHead className="py-2 text-right font-semibold text-muted-foreground">Clientes</TableHead>
                    <TableHead className="py-2 text-right font-semibold text-muted-foreground">Tasa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((r) => (
                    <TableRow key={r.source} className="hover:bg-muted/30">
                      <TableCell className="py-2 font-medium">{r.source}</TableCell>
                      <TableCell className="py-2 text-right text-muted-foreground">{r.leads}</TableCell>
                      <TableCell className="py-2 text-right text-muted-foreground">{r.customers}</TableCell>
                      <TableCell className="py-2 text-right">
                        <StatusBadge kind={r.rate >= 20 ? 'success' : 'neutral'}>
                          {r.rate}%
                        </StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────── Activity by User ───────────────────────────────

interface ActivityByUserProps {
  data: ReportUserActivity[]
}

function ActivityByUserSection({ data }: ActivityByUserProps) {
  const { page, setPage, pageCount, pageItems } = usePagination(data, 15)

  const totals = data.reduce(
    (acc, u) => ({
      calls: acc.calls + u.calls,
      meetings: acc.meetings + u.meetings,
      notes: acc.notes + u.notes,
      tasksCreated: acc.tasksCreated + u.tasksCreated,
      tasksCompleted: acc.tasksCompleted + u.tasksCompleted,
    }),
    { calls: 0, meetings: 0, notes: 0, tasksCreated: 0, tasksCompleted: 0 },
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <Users className="h-4 w-4 text-primary" />
        <CardTitle className="text-base">Actividad por Usuario</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <Empty className="border-dashed py-8">
            <EmptyHeader>
              <EmptyIllustration icon={Users} />
              <EmptyTitle>Sin Usuarios Activos</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="py-2 font-semibold text-muted-foreground">Usuario</TableHead>
                    <TableHead className="py-2 text-right font-semibold text-muted-foreground">Llamadas</TableHead>
                    <TableHead className="py-2 text-right font-semibold text-muted-foreground">Reuniones</TableHead>
                    <TableHead className="py-2 text-right font-semibold text-muted-foreground">Notas</TableHead>
                    <TableHead className="py-2 text-right font-semibold text-muted-foreground">Tareas Creadas</TableHead>
                    <TableHead className="py-2 text-right font-semibold text-muted-foreground">Completadas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((u) => (
                    <TableRow key={u.userId} className="hover:bg-muted/30">
                      <TableCell className="py-2 font-medium">{u.name}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums text-muted-foreground">{u.calls}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums text-muted-foreground">{u.meetings}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums text-muted-foreground">{u.notes}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums text-muted-foreground">{u.tasksCreated}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums">
                        <span
                          className={cn(
                            'font-semibold',
                            u.tasksCompleted > 0 ? 'text-primary' : 'text-muted-foreground',
                          )}
                        >
                          {u.tasksCompleted}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Totals row — always visible regardless of page */}
                  <TableRow className="border-t-2 bg-muted/20 font-bold hover:bg-muted/20">
                    <TableCell className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</TableCell>
                    <TableCell className="py-2 text-right tabular-nums">{totals.calls}</TableCell>
                    <TableCell className="py-2 text-right tabular-nums">{totals.meetings}</TableCell>
                    <TableCell className="py-2 text-right tabular-nums">{totals.notes}</TableCell>
                    <TableCell className="py-2 text-right tabular-nums">{totals.tasksCreated}</TableCell>
                    <TableCell className="py-2 text-right tabular-nums">{totals.tasksCompleted}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <DataPagination page={page} pageCount={pageCount} onPageChange={setPage} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────── Closed Won KPI ─────────────────────────────────

interface ClosedWonSectionProps {
  thisPeriod: { count: number; value: string }
  previousPeriod: { count: number; value: string }
}

function ClosedWonSection({ thisPeriod, previousPeriod }: ClosedWonSectionProps) {
  const pct = variationPct(thisPeriod.count, previousPeriod.count)
  const valuePct = variationPct(Number(thisPeriod.value), Number(previousPeriod.value))

  function Variation({ pct }: { pct: number | null }) {
    if (pct === null) return <span className="text-xs text-muted-foreground">Sin datos previos</span>
    const positive = pct >= 0
    return (
      <span className={cn('flex items-center gap-0.5 text-xs font-semibold', positive ? 'text-primary' : 'text-destructive')}>
        {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        {Math.abs(pct)}% vs período anterior
      </span>
    )
  }

  return (
    <Card className="border-signal/40">
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <CardTitle className="text-base">Cerrados Ganados</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {/* Count */}
          <div className="flex flex-col gap-1 rounded-xl bg-accent/40 px-4 py-3">
            <span className="eyebrow">Deals Ganados</span>
            <span className="text-3xl font-medium tracking-tight text-foreground">{thisPeriod.count}</span>
            <Variation pct={pct} />
          </div>
          {/* Value */}
          <div className="flex flex-col gap-1 rounded-xl bg-signal/10 px-4 py-3">
            <span className="eyebrow">Valor Total</span>
            <span className="text-3xl font-medium tracking-tight text-foreground">{fmtMoney(thisPeriod.value)}</span>
            <Variation pct={valuePct} />
          </div>
        </div>
        {(previousPeriod.count > 0 || Number(previousPeriod.value) > 0) && (
          <p className="mt-3 text-xs text-muted-foreground">
            Período anterior: {previousPeriod.count} deals · {fmtMoney(previousPeriod.value)}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────── Loading Skeleton ────────────────────────────────

import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataPagination } from '@/components/ui/data-pagination'
import { usePagination } from '@/lib/use-pagination'

function ReportsSkeleton() {
  return (
    <div className="space-y-8 p-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  )
}

// ─────────────────────────── Page ───────────────────────────────────────────

export default function ReportsPage() {
  const { data, isLoading, error } = useReports()

  if (isLoading) return <ReportsSkeleton />

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div>
        <p className="eyebrow">Visibilidad del negocio</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">Reportes</h1>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-5 py-4 text-sm text-destructive">
          No se pudieron cargar los reportes. Intentá de nuevo.
        </div>
      )}

      {data && (
        <div className="space-y-8">
          {/* KPI row */}
          <section className="space-y-3">
            <SectionHeader>Resumen del Período</SectionHeader>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KpiPill
                label="Deals Ganados"
                value={data.closedWon.thisPeriod.count}
                sub="Período actual"
                accent
              />
              <KpiPill
                label="Valor Ganado"
                value={fmtMoney(data.closedWon.thisPeriod.value)}
                sub="Período actual"
                accent
              />
              <KpiPill
                label="Win Rate"
                value={data.pipelineFunnel.winRate !== null ? `${data.pipelineFunnel.winRate}%` : '—'}
                sub="Deals cerrados"
              />
              <KpiPill
                label="Deals en Riesgo"
                value={data.dealsAtRisk.count}
                sub=">14 días sin actividad"
                danger={data.dealsAtRisk.count > 0}
              />
            </div>
          </section>

          {/* Closed Won */}
          <section className="space-y-3">
            <SectionHeader>Cerrados Ganados</SectionHeader>
            <ClosedWonSection
              thisPeriod={data.closedWon.thisPeriod}
              previousPeriod={data.closedWon.previousPeriod}
            />
          </section>

          {/* Pipeline funnel */}
          <section className="space-y-3">
            <SectionHeader>Embudo de Pipeline</SectionHeader>
            <PipelineFunnelSection
              stages={data.pipelineFunnel.stages}
              winRate={data.pipelineFunnel.winRate}
            />
          </section>

          {/* Two-column: Risk + Conversion */}
          <section className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <SectionHeader>Deals en Riesgo</SectionHeader>
              <DealsAtRiskSection
                count={data.dealsAtRisk.count}
                deals={data.dealsAtRisk.deals}
              />
            </div>
            <div className="space-y-3">
              <SectionHeader>Conversión por Fuente de Leads</SectionHeader>
              <ConversionBySourceSection data={data.conversionBySource} />
            </div>
          </section>

          {/* Activity by user */}
          <section className="space-y-3">
            <SectionHeader>Actividad del Equipo</SectionHeader>
            <ActivityByUserSection data={data.activityByUser} />
          </section>
        </div>
      )}
    </div>
  )
}
