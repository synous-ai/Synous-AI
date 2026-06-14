'use client'

// Componentes extraídos de reports/page.tsx para code-splitting de recharts.
// Se cargan via next/dynamic con ssr: false para sacar recharts del bundle inicial.

import { BarChart, Bar, XAxis, YAxis, Cell } from 'recharts'
import { TrendingUp, Zap, BarChart2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { sourceLabel } from '@/lib/labels'
import { StatusBadge } from '@/components/ui/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ReportFunnelStage, ReportConversionBySource } from '@/lib/types'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(value: string | undefined | null): string {
  if (!value) return '$0'
  return formatCurrency(Number(value))
}

// ─── Chart configs ────────────────────────────────────────────────────────────

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

// ─── PipelineFunnelSection ────────────────────────────────────────────────────

interface FunnelChartProps {
  stages: ReportFunnelStage[]
  winRate: number | null
}

export function PipelineFunnelSection({ stages, winRate }: FunnelChartProps) {
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

// ─── ConversionBySourceSection ────────────────────────────────────────────────

interface ConversionSourceProps {
  data: ReportConversionBySource[]
}

export function ConversionBySourceSection({ data }: ConversionSourceProps) {
  // Mostramos la fuente capitalizada (Setter, Onboarding…); si viene vacía, "Sin fuente".
  const chartData = data.map((r) => ({ name: sourceLabel(r.source) ?? 'Sin fuente', leads: r.leads, clientes: r.customers }))

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
                      <TableCell className="py-2 font-medium">{sourceLabel(r.source) ?? 'Sin fuente'}</TableCell>
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
