'use client'

import { TrendingUp } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { usePayments, useInvoices } from '@/lib/hooks'
import type { Payment } from '@/lib/types'
import { EmptyState } from './shared'
import { formatCurrency, formatDate } from '@/lib/utils'
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

const METHOD_LABELS: Record<string, string> = {
  transfer: 'Transferencia',
  card: 'Tarjeta',
  cash: 'Efectivo',
  other: 'Otro',
}

export function IngresosSection() {
  const router = useRouter()
  const { data: payments, isLoading } = usePayments()
  const { data: invoices } = useInvoices()
  const { page, setPage, pageCount, pageItems } = usePagination(payments ?? [])

  const totalPaid = (payments ?? []).reduce((acc, p) => acc + Number(p.amount), 0)

  return (
    <div>
      <div className="mb-6">
        <p className="eyebrow">Finanzas</p>
        <h1 className="text-3xl font-semibold tracking-tight">Ingresos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Total cobrado y pagos recientes.</p>
      </div>

      <div className="mb-6 rounded-2xl border bg-card p-6 shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">Total cobrado</p>
        <p className="mt-1 text-4xl font-medium tracking-tight text-foreground tabular-nums">
          {formatCurrency(totalPaid)}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
        </div>
      ) : !payments || payments.length === 0 ? (
        <EmptyState icon={TrendingUp} message="Sin Pagos Registrados" hint="Los pagos aparecerán aquí una vez registrados." />
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pagos recientes</p>
          <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Factura</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Monto</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Método</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((p: Payment) => {
                  const inv = invoices?.find((i) => i.id === p.invoiceId)
                  return (
                    <TableRow key={p.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="px-4 py-3">
                        {inv ? (
                          <button
                            type="button"
                            onClick={() => router.push(`/invoices/${inv.id}`)}
                            className="font-mono text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                          >
                            #{inv.number}
                          </button>
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground">
                            ID {p.invoiceId}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3 font-semibold tabular-nums text-signal-foreground">
                        {formatCurrency(p.amount, inv?.currency ?? 'USD')}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">{METHOD_LABELS[p.method] ?? p.method}</TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">{formatDate(p.paidAt)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <DataPagination page={page} pageCount={pageCount} onPageChange={setPage} />
        </div>
      )}

    </div>
  )
}
