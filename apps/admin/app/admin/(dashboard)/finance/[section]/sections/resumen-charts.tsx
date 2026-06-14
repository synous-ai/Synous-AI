'use client'

// Componentes extraídos de ResumenSection.tsx para code-splitting de recharts.
// Se cargan via next/dynamic con ssr: false para sacar recharts del bundle inicial.

import { useCallback } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  PieChart,
  Pie,
  Tooltip as RechartsTooltip,
} from 'recharts'
import {
  useMonthlySummary,
  useDebtors,
  useExpensesSummary,
} from '@/lib/hooks'
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { SkeletonGroup } from '@/components/ui/loading-region'
import { formatCurrency } from '@/lib/utils'

// ─── Constantes ───────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  software: 'Software',
  infraestructura: 'Infraestructura',
  equipo: 'Equipo',
  impuestos: 'Impuestos',
  oficina: 'Oficina',
  marketing: 'Marketing',
  otros: 'Otros',
}

/** Colores del tema shadcn para gráficos */
const PIE_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
]

// ─── Configs de Recharts ───────────────────────────────────────────────────────

const monthlyChartConfig = {
  income: { label: 'Ingresos', color: 'hsl(var(--chart-1))' },
  expenses: { label: 'Gastos', color: 'hsl(var(--chart-3))' },
} satisfies ChartConfig

const debtorChartConfig = {
  outstanding: { label: 'Por cobrar', color: 'hsl(var(--chart-4))' },
} satisfies ChartConfig

// ─── Helper de formateo con soporte ARS (solo display) ───────────────────────

function useDisplayAmount(displayArs: boolean, fxRate: number | undefined) {
  return useCallback(
    (usdAmount: string | number): string => {
      const n = typeof usdAmount === 'string' ? parseFloat(usdAmount) || 0 : usdAmount
      if (displayArs && fxRate) {
        return `$${(n * fxRate).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ARS`
      }
      return formatCurrency(String(n), 'USD')
    },
    [displayArs, fxRate],
  )
}

// ─── Props compartidas de los tres gráficos ────────────────────────────────────

interface ChartDisplayProps {
  displayArs: boolean
  fxRate: number | undefined
}

// ─── MonthlyChart: Ingresos vs Gastos por mes ─────────────────────────────────

export function MonthlyChart({ displayArs, fxRate }: ChartDisplayProps) {
  const { data: monthly, isLoading } = useMonthlySummary(6)
  const fmt = useDisplayAmount(displayArs, fxRate)

  // Skeleton fiel: barras duales verticales que imitan el BarChart real
  if (isLoading) {
    return (
      <SkeletonGroup label="Cargando gráfico mensual…" className="rounded-2xl border bg-card p-5 space-y-4">
        <Skeleton className="h-3 w-52" />
        <div className="flex items-end gap-2 h-[200px] px-2">
          {[[70,40],[55,60],[80,35],[65,50],[90,45],[50,65]].map(([inc, exp], i) => (
            <div key={i} className="flex flex-1 items-end gap-0.5">
              <Skeleton className="flex-1 rounded-t-sm" style={{ height: `${inc}%` }} />
              <Skeleton className="flex-1 rounded-t-sm" style={{ height: `${exp}%` }} />
            </div>
          ))}
        </div>
        <div className="flex gap-4">
          <Skeleton className="h-3 w-16 rounded-full" />
          <Skeleton className="h-3 w-12 rounded-full" />
        </div>
      </SkeletonGroup>
    )
  }
  if (!monthly || monthly.length === 0) return null

  const chartData = monthly.map((m) => {
    const [year, month] = m.month.split('-')
    const label = new Date(Number(year), Number(month) - 1, 1)
      .toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
    return {
      name: label,
      income: parseFloat(m.income) || 0,
      expenses: parseFloat(m.expenses) || 0,
    }
  })

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Ingresos vs Gastos — últimos 6 meses
      </p>
      <ChartContainer config={monthlyChartConfig} className="h-[200px] w-full">
        <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
          <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <ChartTooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0]?.payload as (typeof chartData)[number]
              return (
                <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-md space-y-0.5">
                  <p className="font-semibold text-sm mb-1">{d.name}</p>
                  <p className="text-emerald-600 dark:text-emerald-400">
                    Ingresos: {fmt(d.income)}
                  </p>
                  <p className="text-red-600 dark:text-red-400">
                    Gastos: {fmt(d.expenses)}
                  </p>
                </div>
              )
            }}
          />
          <Bar
            dataKey="income"
            name="Ingresos"
            fill="hsl(var(--chart-1))"
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
          />
          <Bar
            dataKey="expenses"
            name="Gastos"
            fill="hsl(var(--chart-3))"
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
          />
        </BarChart>
      </ChartContainer>
      {/* Leyenda manual */}
      <div className="mt-3 flex gap-4">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--chart-1))]" />
          Ingresos
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--chart-3))]" />
          Gastos
        </span>
      </div>
    </div>
  )
}

// ─── ExpensesPieChart: Gastos por categoría (torta) ───────────────────────────

export function ExpensesPieChart({ displayArs, fxRate }: ChartDisplayProps) {
  const { data: expSummary, isLoading } = useExpensesSummary()
  const fmt = useDisplayAmount(displayArs, fxRate)

  // Skeleton fiel: círculo donut + leyenda lateral que imita el PieChart real
  if (isLoading) {
    return (
      <SkeletonGroup label="Cargando gastos por categoría…" className="rounded-2xl border bg-card p-5 space-y-4">
        <Skeleton className="h-3 w-40" />
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {/* Círculo donut simulado con border grueso */}
          <div className="shrink-0 h-[160px] w-[160px] rounded-full border-[24px] border-muted bg-muted/30" />
          <div className="flex flex-col gap-2 w-full">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-2.5 w-2.5 rounded-full shrink-0" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-14 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </SkeletonGroup>
    )
  }
  if (!expSummary?.byCategory) return null

  const chartData = Object.entries(expSummary.byCategory)
    .filter(([, v]) => parseFloat(v) > 0)
    .map(([k, v]) => ({ name: CATEGORY_LABELS[k] ?? k, value: parseFloat(v) || 0 }))
    .sort((a, b) => b.value - a.value)

  if (chartData.length === 0) return null

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Gastos por categoría
      </p>
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="shrink-0">
          <ChartContainer config={{}} className="h-[160px] w-[160px]">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={72}
                innerRadius={36}
              >
                {chartData.map((_, index) => (
                  <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip
                formatter={(value: number) => [fmt(value), '']}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
            </PieChart>
          </ChartContainer>
        </div>
        <div className="flex flex-col gap-1.5 min-w-0 w-full">
          {chartData.map((item, index) => (
            <div key={item.name} className="flex items-center gap-2 text-xs">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: PIE_COLORS[index % PIE_COLORS.length] }}
              />
              <span className="text-muted-foreground truncate">{item.name}</span>
              <span className="ml-auto tabular-nums font-medium shrink-0">{fmt(item.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── TopDebtorsChart: Top deudores ────────────────────────────────────────────

export function TopDebtorsChart({ displayArs, fxRate }: ChartDisplayProps) {
  const { data: debtors, isLoading } = useDebtors(5)
  const fmt = useDisplayAmount(displayArs, fxRate)

  // Skeleton fiel: barras horizontales que imitan el BarChart layout="vertical" real
  if (isLoading) {
    return (
      <SkeletonGroup label="Cargando top deudores…" className="rounded-2xl border bg-card p-5 space-y-4">
        <Skeleton className="h-3 w-48" />
        <div className="space-y-3">
          {[85, 65, 50, 40, 30].map((w, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-3 w-28 shrink-0" />
              <Skeleton className="h-5 rounded-r-sm" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      </SkeletonGroup>
    )
  }
  if (!debtors || debtors.length === 0) return null

  const chartData = debtors.map((d) => ({
    name: d.companyName,
    outstanding: parseFloat(d.outstanding) || 0,
  }))

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Top deudores (CxC pendiente)
      </p>
      <ChartContainer config={debtorChartConfig} className="h-[160px] w-full">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 60, bottom: 4, left: 8 }}
        >
          <XAxis type="number" hide />
          <YAxis
            dataKey="name"
            type="category"
            width={120}
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <ChartTooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0]?.payload as (typeof chartData)[number]
              return (
                <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-md">
                  <p className="font-semibold">{d.name}</p>
                  <p className="text-amber-600 dark:text-amber-400">
                    Por cobrar: {fmt(d.outstanding)}
                  </p>
                </div>
              )
            }}
          />
          <Bar
            dataKey="outstanding"
            fill="hsl(var(--chart-4))"
            radius={[0, 4, 4, 0]}
            maxBarSize={20}
          />
        </BarChart>
      </ChartContainer>
    </div>
  )
}
