'use client'

import { Loader2, FileText, TrendingUp, ArrowDownCircle, BarChart3 } from 'lucide-react'
import { useFinanceSummary, useInvoices } from '@/lib/hooks'
import type { InvoiceStatus } from '@/lib/types'
import { KpiCard, EmptyState } from './shared'
import { StatusChip } from './InvoiceRow'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'

export function ResumenSection() {
  const { data: summary, isLoading } = useFinanceSummary()
  const { data: invoices } = useInvoices()

  const statusOrder: InvoiceStatus[] = ['draft', 'sent', 'paid', 'overdue', 'void']

  return (
    <div>
      <div className="mb-6">
        <p className="eyebrow">Finanzas</p>
        <h1 className="text-3xl font-semibold tracking-tight">Resumen financiero</h1>
        <p className="mt-1 text-sm text-muted-foreground">Métricas generales del portal.</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
            <KpiCard
              label="Total facturado"
              value={formatCurrency(summary?.totalInvoiced ?? '0')}
              icon={FileText}
              accent="text-blue-600 dark:text-blue-400"
              bg="bg-blue-50 dark:bg-blue-500/15"
            />
            <KpiCard
              label="Total cobrado"
              value={formatCurrency(summary?.totalPaid ?? '0')}
              icon={TrendingUp}
              accent="text-signal-foreground"
              bg="bg-signal/10"
            />
            <KpiCard
              label="Por cobrar (CxC)"
              value={formatCurrency(summary?.outstanding ?? '0')}
              icon={ArrowDownCircle}
              accent="text-amber-600 dark:text-amber-400"
              bg="bg-amber-50 dark:bg-amber-500/15"
            />
          </div>

          {/* Por status */}
          {summary?.invoicesByStatus && (
            <div className="rounded-2xl border bg-card p-5 shadow-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Facturas por estado
              </p>
              <div className="flex flex-wrap gap-3">
                {statusOrder.map((s) => {
                  const count = summary.invoicesByStatus[s] ?? 0
                  if (count === 0) return null
                  return (
                    <div key={s} className="flex items-center gap-2 rounded-xl border px-3 py-2 bg-muted/30">
                      <StatusChip status={s} />
                      <span className="tabular-nums font-semibold">{count}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Recent invoices */}
          {invoices && invoices.length > 0 && (
            <div className="mt-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Facturas recientes
              </p>
              <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">#</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Total</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Estado</TableHead>
                      <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Vencimiento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.slice(0, 5).map((inv) => (
                      <TableRow key={inv.id} className="hover:bg-muted/50 transition-colors">
                        <TableCell className="px-4 py-3 font-mono text-xs text-muted-foreground">#{inv.number}</TableCell>
                        <TableCell className="px-4 py-3 font-semibold tabular-nums">{formatCurrency(inv.total, inv.currency)}</TableCell>
                        <TableCell className="px-4 py-3"><StatusChip status={inv.status as InvoiceStatus} /></TableCell>
                        <TableCell className="px-4 py-3 text-muted-foreground">{formatDate(inv.dueDate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
