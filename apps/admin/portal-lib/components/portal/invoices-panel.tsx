'use client'

import { useClientInvoices } from '@portal/lib/hooks'
import type { ClientInvoice } from '@portal/lib/types'
import { Card, CardContent } from '@portal/components/ui/card'
import { Badge } from '@portal/components/ui/badge'
import { Receipt, Loader2 } from 'lucide-react'
import { formatCurrency } from '@portal/lib/utils'
import { EmptyIllustration } from '@portal/components/ui/empty-illustration'

// ─── Status helpers ───────────────────────────────────────────────────────────

const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  paid: 'Pagada',
  overdue: 'Vencida',
  void: 'Anulada',
}

const INVOICE_STATUS_VARIANT: Record<string, 'default' | 'signal' | 'accent' | 'destructive' | 'muted'> = {
  draft: 'muted',
  sent: 'default',
  paid: 'accent',
  overdue: 'destructive',
  void: 'muted',
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Intl.DateTimeFormat('es', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateStr))
}

// ─── Invoice Row ──────────────────────────────────────────────────────────────

function InvoiceRow({ invoice }: { invoice: ClientInvoice }) {
  const hasBalance = Number(invoice.balance) > 0
  const isOverdue = invoice.status === 'overdue'

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4">
        {/* Number + status */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-sm font-semibold">#{invoice.number}</span>
          <Badge variant={INVOICE_STATUS_VARIANT[invoice.status] ?? 'default'}>
            {INVOICE_STATUS_LABEL[invoice.status] ?? invoice.status}
          </Badge>
        </div>

        {/* Dates */}
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>Emitida: {formatDateShort(invoice.issueDate)}</span>
          {invoice.dueDate && (
            <span className={isOverdue ? 'text-destructive font-medium' : ''}>
              Vence: {formatDateShort(invoice.dueDate)}
            </span>
          )}
        </div>

        {/* Amounts */}
        <div className="ml-auto flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            Total:{' '}
            <span className="font-semibold text-foreground">
              {formatCurrency(invoice.total, invoice.currency)}
            </span>
          </span>
          {hasBalance && (
            <span
              className={
                isOverdue
                  ? 'font-semibold text-destructive'
                  : 'font-semibold text-foreground'
              }
            >
              Saldo: {formatCurrency(invoice.balance, invoice.currency)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function InvoicesPanel() {
  const query = useClientInvoices()
  const invoices = query.data ?? []

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando facturas…
      </div>
    )
  }

  if (query.isError) {
    return (
      <p className="py-8 text-sm text-destructive">
        No se pudieron cargar las facturas.
      </p>
    )
  }

  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <EmptyIllustration icon={Receipt} />
        <div>
          <p className="font-medium text-muted-foreground">Sin Facturas</p>
          <p className="mt-0.5 text-sm text-muted-foreground/70">
            Las facturas de tus proyectos aparecerán acá cuando el equipo las emita.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {invoices.map((inv) => (
        <InvoiceRow key={inv.id} invoice={inv} />
      ))}
    </div>
  )
}
