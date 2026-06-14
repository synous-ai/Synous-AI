'use client'

/**
 * ResumenSection — Tablero financiero con métricas del período seleccionado.
 *
 * Incluye:
 * - Selector de período (este mes / trimestre / año / rango custom)
 * - 6 KPIs: Facturado, Cobrado, Gastado, Ganancia neta, Por cobrar, MRR
 * - 4 gráficos Recharts: facturas por estado, ingresos vs gastos por mes,
 *   gastos por categoría (torta), top deudores (barras horizontales)
 * - Toggle USD/ARS: convierte los montos para display multiplicando por fx.blue.venta
 * - Acciones rápidas: botones para abrir modales de Facturas/Cobros
 *
 * IMPORTANTE: los datos del backend están siempre en USD base. La conversión
 * a ARS es solo display y se hace en el cliente con el TC blue del momento.
 */

import { useState, useCallback } from 'react'
import {
  FileText,
  TrendingUp,
  TrendingDown,
  ArrowDownCircle,
  BarChart3,
  Repeat,
  PlusCircle,
  BadgeDollarSign,
} from 'lucide-react'
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
  useFinanceSummaryExtended,
  useMonthlySummary,
  useDebtors,
  useExpensesSummary,
  useFx,
  useInvoices,
} from '@/lib/hooks'
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { KpiCard } from './shared'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { CreateInvoiceDialog, RegisterPaymentDialog } from './dialogs'

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

// ─── Helpers de período ────────────────────────────────────────────────────────

type PeriodPreset = 'month' | 'quarter' | 'year' | 'custom'

function getPeriodDates(
  preset: PeriodPreset,
  customFrom: string,
  customTo: string,
): { from: string; to: string } {
  if (preset === 'custom') return { from: customFrom, to: customTo }

  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  if (preset === 'month') {
    return {
      from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    }
  }
  if (preset === 'quarter') {
    const q = Math.floor(now.getMonth() / 3)
    return {
      from: ymd(new Date(now.getFullYear(), q * 3, 1)),
      to: ymd(new Date(now.getFullYear(), q * 3 + 3, 0)),
    }
  }
  // year
  return {
    from: ymd(new Date(now.getFullYear(), 0, 1)),
    to: ymd(new Date(now.getFullYear(), 11, 31)),
  }
}

// ─── Configs de Recharts ───────────────────────────────────────────────────────

const monthlyChartConfig = {
  income: { label: 'Ingresos', color: 'hsl(var(--chart-1))' },
  expenses: { label: 'Gastos', color: 'hsl(var(--chart-3))' },
} satisfies ChartConfig

const debtorChartConfig = {
  outstanding: { label: 'Por cobrar', color: 'hsl(var(--chart-4))' },
} satisfies ChartConfig

// ─── Formateo con soporte ARS (solo display) ──────────────────────────────────

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

// ─── Skeleton de carga ────────────────────────────────────────────────────────

function ResumenSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <Skeleton className="h-52 rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-52 rounded-2xl" />
        <Skeleton className="h-52 rounded-2xl" />
      </div>
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  )
}

// ─── Panel: Facturas por estado ────────────────────────────────────────────────

function InvoicesByStatusPanel({ byStatus }: { byStatus: Record<string, number> }) {
  const STATUS_ORDER = ['draft', 'sent', 'paid', 'overdue', 'void']
  const STATUS_LABELS_ES: Record<string, string> = {
    draft: 'Borrador', sent: 'Enviada', paid: 'Pagada', overdue: 'Vencida', void: 'Anulada',
  }
  const STATUS_COLORS_MAP: Record<string, string> = {
    draft: 'text-muted-foreground bg-muted/30',
    sent: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/15',
    paid: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/15',
    overdue: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/15',
    void: 'text-muted-foreground bg-muted/20',
  }
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0)

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Facturas por estado
      </p>
      <div className="flex flex-wrap gap-2">
        {STATUS_ORDER.map((s) => {
          const count = byStatus[s] ?? 0
          return (
            <div
              key={s}
              className={cn(
                'flex items-center gap-2 rounded-xl border px-3 py-2',
                STATUS_COLORS_MAP[s] ?? 'bg-muted/30',
              )}
            >
              <span className="text-xs font-medium">{STATUS_LABELS_ES[s] ?? s}</span>
              <span className="tabular-nums font-bold">{count}</span>
            </div>
          )
        })}
        <div className="flex items-center gap-2 rounded-xl border bg-muted/10 px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">Total</span>
          <span className="tabular-nums font-bold">{total}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Gráfico: Ingresos vs Gastos por mes ──────────────────────────────────────

function MonthlyChart({
  displayArs,
  fxRate,
}: {
  displayArs: boolean
  fxRate: number | undefined
}) {
  const { data: monthly, isLoading } = useMonthlySummary(6)
  const fmt = useDisplayAmount(displayArs, fxRate)

  if (isLoading) return <Skeleton className="h-52 rounded-2xl" />
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

// ─── Gráfico: Gastos por categoría (torta) ────────────────────────────────────

function ExpensesPieChart({
  displayArs,
  fxRate,
}: {
  displayArs: boolean
  fxRate: number | undefined
}) {
  const { data: expSummary, isLoading } = useExpensesSummary()
  const fmt = useDisplayAmount(displayArs, fxRate)

  if (isLoading) return <Skeleton className="h-52 rounded-2xl" />
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

// ─── Gráfico: Top deudores ─────────────────────────────────────────────────────

function TopDebtorsChart({
  displayArs,
  fxRate,
}: {
  displayArs: boolean
  fxRate: number | undefined
}) {
  const { data: debtors, isLoading } = useDebtors(5)
  const fmt = useDisplayAmount(displayArs, fxRate)

  if (isLoading) return <Skeleton className="h-40 rounded-2xl" />
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

// ─── ResumenSection ────────────────────────────────────────────────────────────

export function ResumenSection() {
  // Selector de período
  const [preset, setPreset] = useState<PeriodPreset>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  // Toggle USD/ARS (display only — no afecta los datos del backend)
  const [displayArs, setDisplayArs] = useState(false)

  // Modales de acciones rápidas
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)

  const { from, to } = getPeriodDates(preset, customFrom, customTo)

  // Datos
  const { data: summary, isLoading: loadingSummary } = useFinanceSummaryExtended(
    from && to ? { from, to } : undefined,
  )
  const { data: fx } = useFx()
  const { data: invoices } = useInvoices()

  const fxRate = fx?.blue?.venta
  const fmt = useDisplayAmount(displayArs, fxRate)

  // La ganancia neta puede ser negativa — colorear diferente
  const netProfitNum = parseFloat(summary?.netProfit ?? '0')
  const netPositive = netProfitNum >= 0

  return (
    <div>
      {/* Cabecera */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="eyebrow">Finanzas</p>
          <h1 className="text-3xl font-semibold tracking-tight">Resumen financiero</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Métricas del período.
          </p>
        </div>

        {/* Acciones rápidas — mismo estilo que el botón primario de las demás secciones */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setInvoiceOpen(true)} className="shrink-0">
            <PlusCircle className="mr-2 h-4 w-4" />
            Nueva factura
          </Button>
          <Button onClick={() => setPaymentOpen(true)} className="shrink-0">
            <BadgeDollarSign className="mr-2 h-4 w-4" />
            Registrar cobro
          </Button>
        </div>
      </div>

      {/* Controles: período + toggle moneda */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {/* Selector de período */}
        <Select value={preset} onValueChange={(v) => setPreset(v as PeriodPreset)}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Este mes</SelectItem>
            <SelectItem value="quarter">Este trimestre</SelectItem>
            <SelectItem value="year">Este año</SelectItem>
            <SelectItem value="custom">Rango custom</SelectItem>
          </SelectContent>
        </Select>

        {preset === 'custom' && (
          <>
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-8 w-36 text-xs"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-8 w-36 text-xs"
            />
          </>
        )}

        {/* Toggle USD/ARS */}
        <div className="ml-auto flex items-center gap-2 rounded-xl border bg-card px-3 py-1.5">
          <span className="text-xs text-muted-foreground">Display:</span>
          <button
            onClick={() => setDisplayArs(false)}
            className={cn(
              'rounded-lg px-2 py-0.5 text-xs font-medium transition-colors',
              !displayArs
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            USD
          </button>
          <button
            onClick={() => setDisplayArs(true)}
            className={cn(
              'rounded-lg px-2 py-0.5 text-xs font-medium transition-colors',
              displayArs
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            ARS
          </button>
        </div>
      </div>

      {/* Aclarador TC cuando está en modo ARS */}
      {displayArs && fxRate && (
        <div className="mb-4 rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 px-4 py-2.5 text-xs text-blue-700 dark:text-blue-300">
          Montos convertidos a ARS al TC blue ${fxRate.toLocaleString('es-AR')} · Los datos base del sistema están en USD.
        </div>
      )}

      {loadingSummary ? (
        <ResumenSkeleton />
      ) : (
        <div className="space-y-6">
          {/* 6 KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              label="Total facturado"
              value={fmt(summary?.totalInvoiced ?? '0')}
              icon={FileText}
              accent="text-blue-600 dark:text-blue-400"
              bg="bg-blue-50 dark:bg-blue-500/15"
            />
            <KpiCard
              label="Total cobrado"
              value={fmt(summary?.totalPaid ?? '0')}
              icon={TrendingUp}
              accent="text-signal"
              bg="bg-signal/10"
            />
            <KpiCard
              label="Total gastado"
              value={fmt(summary?.totalExpenses ?? '0')}
              icon={TrendingDown}
              accent="text-red-600 dark:text-red-400"
              bg="bg-red-50 dark:bg-red-500/15"
            />
            <KpiCard
              label="Ganancia neta"
              value={fmt(summary?.netProfit ?? '0')}
              icon={BarChart3}
              accent={
                netPositive
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }
              bg={
                netPositive
                  ? 'bg-emerald-50 dark:bg-emerald-500/15'
                  : 'bg-red-50 dark:bg-red-500/15'
              }
            />
            <KpiCard
              label="Por cobrar (CxC)"
              value={fmt(summary?.outstanding ?? '0')}
              icon={ArrowDownCircle}
              accent="text-amber-600 dark:text-amber-400"
              bg="bg-amber-50 dark:bg-amber-500/15"
            />
            <KpiCard
              label="MRR"
              value={fmt(summary?.mrr ?? '0')}
              icon={Repeat}
              accent="text-purple-600 dark:text-purple-400"
              bg="bg-purple-50 dark:bg-purple-500/15"
            />
          </div>

          {/* Facturas por estado */}
          {summary?.invoicesByStatus && (
            <InvoicesByStatusPanel byStatus={summary.invoicesByStatus} />
          )}

          {/* Gráficos — dos columnas en pantallas grandes */}
          <div className="grid gap-6 lg:grid-cols-2">
            <MonthlyChart displayArs={displayArs} fxRate={fxRate} />
            <ExpensesPieChart displayArs={displayArs} fxRate={fxRate} />
          </div>

          {/* Top deudores ocupa todo el ancho */}
          <TopDebtorsChart displayArs={displayArs} fxRate={fxRate} />
        </div>
      )}

      {/* Modales de acciones rápidas */}
      <CreateInvoiceDialog open={invoiceOpen} onClose={() => setInvoiceOpen(false)} />
      {invoices && (
        <RegisterPaymentDialog
          open={paymentOpen}
          onClose={() => setPaymentOpen(false)}
          invoices={invoices}
        />
      )}
    </div>
  )
}
