'use client'

import { useState } from 'react'
import { Plus, CreditCard } from 'lucide-react'
import { usePayments, useInvoices } from '@/lib/hooks'
import type { Payment } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from './shared'
import { RegisterPaymentDialog } from './dialogs'
import { formatCurrency, formatDate } from '@/lib/utils'
import { DataPagination } from '@/components/ui/data-pagination'
import { usePagination } from '@/lib/use-pagination'

const METHOD_LABELS: Record<string, string> = {
  transfer: 'Transferencia',
  card: 'Tarjeta',
  cash: 'Efectivo',
  other: 'Otro',
}

export function PagosSection() {
  const { data: payments, isLoading } = usePayments()
  const { data: invoices } = useInvoices()
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const { page, setPage, pageCount, pageItems } = usePagination(payments ?? [])

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="eyebrow">Finanzas</p>
          <h1 className="text-3xl font-semibold tracking-tight">Pagos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Historial de pagos recibidos.</p>
        </div>
        <Button onClick={() => setPayDialogOpen(true)} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" /> Registrar Pago
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
        </div>
      ) : !payments || payments.length === 0 ? (
        <EmptyState icon={CreditCard} message="No hay pagos registrados" hint="Registrá el primer pago." />
      ) : (
        <>
          <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Factura</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Monto</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Método</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Fecha</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Referencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((p: Payment) => {
                  const inv = invoices?.find((i) => i.id === p.invoiceId)
                  return (
                    <TableRow key={p.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {inv ? `#${inv.number}` : `ID ${p.invoiceId}`}
                      </TableCell>
                      <TableCell className="px-4 py-3 font-semibold tabular-nums">
                        {formatCurrency(p.amount, inv?.currency ?? 'USD')}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">{METHOD_LABELS[p.method] ?? p.method}</TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">{formatDate(p.paidAt)}</TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">{p.reference ?? '—'}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <DataPagination page={page} pageCount={pageCount} onPageChange={setPage} />
        </>
      )}

      <RegisterPaymentDialog
        open={payDialogOpen}
        onClose={() => setPayDialogOpen(false)}
        invoices={invoices ?? []}
      />
    </div>
  )
}
