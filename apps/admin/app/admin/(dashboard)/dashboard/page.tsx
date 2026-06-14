'use client'

import {
  TrendingUp,
  TrendingDown,
  Briefcase,
  ListTodo,
  BarChart2,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
} from 'recharts'
import { useDashboard } from '@/lib/hooks'
import { formatCurrency, cn, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { TableSkeleton, ListSkeleton } from '@/components/ui/skeletons'
import { SkeletonGroup } from '@/components/ui/loading-region'
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table'
import { BADGE_CLASS } from '@/lib/status'
import type { DashboardDeal, Task, DashboardData } from '@/lib/types'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'

// ─────────────────────────── helpers ────────────────────────────

const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function firstDayOfMonth(year: number, month: number): number {
  const d = new Date(year, month, 1).getDay()
  return d === 0 ? 7 : d
}

function activeDays(items: { dueDate?: string | null; createdAt?: string }[], year: number, month: number): Set<number> {
  const set = new Set<number>()
  for (const item of items) {
    const raw = 'dueDate' in item ? item.dueDate : item.createdAt
    if (!raw) continue
    const d = new Date(raw)
    if (d.getFullYear() === year && d.getMonth() === month) {
      set.add(d.getDate())
    }
  }
  return set
}

// ─────────────────────────── SectionCards ────────────────────────────
// Dashboard-01 pattern: big number, trend badge, description

interface KpiCardProps {
  title: string
  value: string | number
  description: string
  trend: 'up' | 'down' | 'neutral'
  trendLabel: string
  footer?: string
}

function KpiCard({ title, value, description, trend, trendLabel, footer }: KpiCardProps): React.ReactElement {
  return (
    <Card className="@container">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardDescription className="min-w-0 text-xs font-medium uppercase tracking-wide">{title}</CardDescription>
          <Badge
            variant="outline"
            className={cn(
              'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium [&>svg]:size-3 [&>svg]:shrink-0',
              trend === 'up' && BADGE_CLASS.success,
              trend === 'down' && BADGE_CLASS.danger,
              trend === 'neutral' && 'border-border bg-muted text-muted-foreground',
            )}
          >
            {trend === 'up' && <TrendingUp />}
            {trend === 'down' && <TrendingDown />}
            {trendLabel}
          </Badge>
        </div>
        <CardTitle className="mt-1 truncate text-3xl font-semibold tabular-nums leading-none tracking-tight">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{description}</p>
        {footer && (
          <p className="mt-1 text-xs font-medium text-foreground">{footer}</p>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────── Pipeline chart (Area) ────────────────────────────

const stageChartConfig = {
  value: {
    label: 'Valor (USD)',
    color: 'hsl(var(--chart-1))',
  },
  deals: {
    label: 'Deals',
    color: 'hsl(var(--chart-2))',
  },
} satisfies ChartConfig

interface PipelineChartProps {
  data: DashboardData['dealsByStage']
}

function PipelineChart({ data }: PipelineChartProps): React.ReactElement {
  if (data.length === 0) {
    return (
      <Empty className="h-[200px] border-dashed">
        <EmptyHeader>
          <EmptyIllustration icon={BarChart2} />
          <EmptyTitle>Sin Etapas de Pipeline</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }

  const chartData = data.map((s) => ({
    label: s.label.length > 12 ? s.label.slice(0, 11) + '…' : s.label,
    fullLabel: s.label,
    value: Number(s.value),
    deals: s.deals,
    stageId: s.stageId,
  }))

  const values = chartData.map((d) => d.value)
  const topIdx = values.indexOf(Math.max(...values))

  return (
    <ChartContainer config={stageChartConfig} className="h-[200px] w-full">
      <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis hide />
        <ChartTooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0]?.payload as (typeof chartData)[number]
            return (
              <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-md">
                <p className="font-semibold">{d.fullLabel}</p>
                <p className="text-muted-foreground">{d.deals} deals · {formatCurrency(d.value)}</p>
              </div>
            )
          }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={44}>
          {chartData.map((entry, index) => (
            <Cell
              key={entry.stageId}
              fill={index === topIdx ? 'hsl(var(--chart-1))' : 'hsl(var(--chart-4))'}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

// ─────────────────────────── Calendar widget ────────────────────────────

interface CalendarWidgetProps {
  deals: DashboardDeal[]
  tasks: Task[]
}

function CalendarWidget({ deals, tasks }: CalendarWidgetProps): React.ReactElement {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const todayDay = today.getDate()
  const total = daysInMonth(year, month)
  const startOffset = firstDayOfMonth(year, month) - 1

  const dealDays = activeDays(deals, year, month)
  const taskDays = activeDays(tasks, year, month)
  const hasDot = (day: number): boolean => dealDays.has(day) || taskDays.has(day)

  const blanks: null[] = Array.from({ length: startOffset }, () => null)
  const dayNumbers: number[] = Array.from({ length: total }, (_, i) => i + 1)
  const cells: (number | null)[] = [...blanks, ...dayNumbers]

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-baseline justify-between">
          <CardTitle className="text-sm">Calendario</CardTitle>
          <span className="text-xs font-semibold text-primary">
            {MONTH_NAMES_ES[month]}
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="mb-1 grid grid-cols-7 text-center">
          {DAY_LABELS.map((d, i) => (
            <span key={i} className="py-1 text-[11px] font-semibold text-muted-foreground">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((cell, i) => {
            if (cell === null) return <div key={`blank-${i}`} />
            const isToday = cell === todayDay
            const dot = hasDot(cell)
            return (
              <div
                key={cell}
                className={cn(
                  'relative flex flex-col items-center justify-center rounded-lg py-1 text-xs font-medium transition-colors',
                  isToday
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-foreground',
                )}
              >
                {cell}
                {dot && !isToday && <span className="mt-0.5 h-1 w-1 rounded-full bg-primary" />}
                {dot && isToday && <span className="mt-0.5 h-1 w-1 rounded-full bg-primary-foreground/60" />}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────── skeleton ────────────────────────────

/**
 * DashboardSkeleton — imita el layout REAL del dashboard para CLS ≈ 0.
 *
 * Estructura:
 *  - Título (eyebrow + h1)
 *  - 4 KPI cards: grid-cols-2 lg:grid-cols-4 (igual que el real)
 *  - Chart 2/3 + calendario 1/3: grid-cols-1 lg:grid-cols-3
 *  - 2 tablas (deals + tareas): grid-cols-1 lg:grid-cols-2 con <TableSkeleton>
 *    que imitan thead + filas (evita el bloque plano h-52).
 */
function DashboardSkeleton(): React.ReactElement {
  return (
    <div className="space-y-6 p-6">
      {/* Título */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-40" />
      </div>

      {/* 4 KPI cards — mismo grid que el real */}
      <SkeletonGroup label="Cargando métricas…" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
            {/* Eyebrow + badge de tendencia */}
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            {/* Valor grande */}
            <Skeleton className="h-8 w-28" />
            {/* Descripción */}
            <Skeleton className="h-3 w-36" />
          </div>
        ))}
      </SkeletonGroup>

      {/* Chart (2/3) + Calendario (1/3) */}
      <SkeletonGroup label="Cargando gráfico y calendario…" className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Simulación del card de barras: encabezado + área de barras */}
        <div className="rounded-xl border bg-card p-5 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-52" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          {/* Barras del chart — alturas escalonadas para parecer reales */}
          <div className="flex items-end gap-2 h-[200px] px-2">
            {[65, 90, 40, 75, 55, 80, 45, 95].map((h, i) => (
              <Skeleton
                key={i}
                className="flex-1 rounded-t-sm"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
        {/* Simulación del widget de calendario */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-16" />
          </div>
          {/* Encabezados de días */}
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-4 rounded" />
            ))}
          </div>
          {/* Celdas del calendario: 5 filas × 7 días */}
          {Array.from({ length: 5 }).map((_, row) => (
            <div key={row} className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: 7 }).map((_, col) => (
                <Skeleton key={col} className="h-7 rounded-lg" />
              ))}
            </div>
          ))}
        </div>
      </SkeletonGroup>

      {/* Tablas deals + tareas — <TableSkeleton> imita thead + filas */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card overflow-hidden space-y-0">
          {/* Header del card */}
          <div className="p-5 border-b space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          {/* Tabla con thead */}
          <TableSkeleton columns={3} rows={4} label="Cargando deals recientes…" className="border-0 rounded-none" />
        </div>
        <div className="rounded-xl border bg-card overflow-hidden space-y-0">
          {/* Header del card */}
          <div className="p-5 border-b space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-44" />
          </div>
          {/* Tabla con thead */}
          <TableSkeleton columns={3} rows={4} label="Cargando tareas…" className="border-0 rounded-none" />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────── page ────────────────────────────

export default function DashboardPage(): React.ReactElement {
  const { data, isLoading } = useDashboard()

  if (isLoading || !data) {
    return <DashboardSkeleton />
  }

  const stageMap = new Map(data.dealsByStage.map((s) => [s.stageId, s.label]))
  const totalDeals = data.dealsByStage.reduce((a, s) => a + s.deals, 0)

  return (
    <div className="space-y-6 p-6">

      {/* ── Page title ───────────────────────────────── */}
      <div>
        <p className="eyebrow">Resumen del negocio</p>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      </div>

      {/* ── SectionCards — 4 KPI cards ───────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="Valor en pipeline"
          value={formatCurrency(data.pipeline.openValue)}
          description="Valor total de deals abiertos"
          trend="up"
          trendLabel="Activo"
        />
        <KpiCard
          title="Deals abiertos"
          value={data.pipeline.openDeals}
          description={`${totalDeals} deal${totalDeals !== 1 ? 's' : ''} en el pipeline`}
          trend={data.pipeline.openDeals > 0 ? 'up' : 'neutral'}
          trendLabel={`${data.pipeline.openDeals} Total`}
        />
        <KpiCard
          title="Forecast ponderado"
          value={formatCurrency(data.pipeline.weightedForecast)}
          description="Probabilidad × valor por etapa"
          trend="up"
          trendLabel="Estimado"
        />
        <KpiCard
          title="Leads / Tareas"
          value={`${data.counts.leads} / ${data.counts.openTasks}`}
          description={`${data.counts.companies} empresas · ${data.counts.clients} clientes`}
          trend={data.counts.openTasks > 5 ? 'down' : 'neutral'}
          trendLabel={data.counts.openTasks > 5 ? 'Atención' : 'Al día'}
        />
      </div>

      {/* ── Main: chart + calendar ────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Bar chart — pipeline por etapa */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Pipeline por Etapa</CardTitle>
                <CardDescription className="mt-0.5">Valor acumulado por cada etapa del pipeline</CardDescription>
              </div>
              <Badge variant="outline" className="rounded-full text-xs">
                {totalDeals} deals
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pb-4 pt-0">
            <PipelineChart data={data.dealsByStage} />
          </CardContent>
        </Card>

        {/* Calendar widget */}
        <CalendarWidget deals={data.recentDeals} tasks={data.recentTasks} />
      </div>

      {/* ── Bottom: deals table + tasks list ─────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Recent deals — shadcn Table */}
        <Card>
          <CardHeader>
            <CardTitle>Deals Recientes</CardTitle>
            <CardDescription>Últimos deals registrados en el pipeline</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {data.recentDeals.length === 0 ? (
              <Empty className="border-0">
                <EmptyHeader>
                  <EmptyIllustration icon={Briefcase} />
                  <EmptyTitle>Sin Deals Registrados Aún</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="px-4 py-3 text-xs font-medium">Deal</TableHead>
                    <TableHead className="px-4 py-3 text-xs font-medium">Etapa</TableHead>
                    <TableHead className="px-4 py-3 text-right text-xs font-medium">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentDeals.map((deal) => (
                    <TableRow key={deal.id}>
                      <TableCell className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium leading-snug">{deal.name}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(deal.createdAt)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <span className="inline-block rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                          {stageMap.get(deal.stageId) ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right text-sm font-semibold">
                        {formatCurrency(deal.amount, deal.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent tasks */}
        <Card>
          <CardHeader>
            <CardTitle>Próximas Tareas</CardTitle>
            <CardDescription>Tareas pendientes o en progreso</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {data.recentTasks.length === 0 ? (
              <Empty className="border-0">
                <EmptyHeader>
                  <EmptyIllustration icon={ListTodo} />
                  <EmptyTitle>Sin Tareas Pendientes</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="px-4 py-3 text-xs font-medium">Tarea</TableHead>
                    <TableHead className="px-4 py-3 text-xs font-medium">Prioridad</TableHead>
                    <TableHead className="px-4 py-3 text-xs font-medium">Vencimiento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentTasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="px-4 py-3">
                        <p className="text-sm font-medium leading-snug line-clamp-2">{task.title}</p>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-block rounded-full px-2 py-0.5 text-[11px] font-medium',
                            task.priority === 'high' && BADGE_CLASS.danger,
                            task.priority === 'medium' && BADGE_CLASS.warning,
                            task.priority === 'low' && BADGE_CLASS.neutral,
                          )}
                        >
                          {task.priority === 'high' ? 'Alta' : task.priority === 'medium' ? 'Media' : 'Baja'}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                        {task.dueDate ? formatDate(task.dueDate) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
