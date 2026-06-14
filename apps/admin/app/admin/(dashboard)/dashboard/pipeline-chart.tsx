'use client'

// Componente extraído de dashboard/page.tsx para code-splitting de recharts.
// Se carga via next/dynamic con ssr: false para sacar recharts del bundle inicial.

import { BarChart, Bar, XAxis, YAxis, Cell } from 'recharts'
import { BarChart2 } from 'lucide-react'
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart'
import { formatCurrency } from '@/lib/utils'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import type { DashboardData } from '@/lib/types'

// ─── Config del gráfico ───────────────────────────────────────────────────────

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

// ─── Props ────────────────────────────────────────────────────────────────────

interface PipelineChartProps {
  data: DashboardData['dealsByStage']
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function PipelineChart({ data }: PipelineChartProps): React.ReactElement {
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
