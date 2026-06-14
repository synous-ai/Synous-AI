'use client'

import { useState } from 'react'
import { Loader2, Trash2, CreditCard } from 'lucide-react'
import { useInvoiceTransition, useArchiveInvoice } from '@/lib/hooks'
import type { Invoice, InvoiceStatus } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { invoiceStatus } from '@/lib/status'

function StatusChip({ status }: { status: InvoiceStatus }) {
  const { kind, label } = invoiceStatus(status)
  return <StatusBadge kind={kind}>{label}</StatusBadge>
}

export { StatusChip }

export function InvoiceRow({
  invoice: inv,
  companies,
  onRegisterPayment,
  onOpen,
}: {
  invoice: Invoice
  companies: { id: string; name: string }[] | undefined
  onRegisterPayment: (id: string) => void
  onOpen?: (id: string) => void
}) {
  const transition = useInvoiceTransition()
  const archive = useArchiveInvoice()
  const [deleting, setDeleting] = useState(false)

  const company = companies?.find((c) => c.id === inv.companyId)

  async function handleArchive() {
    if (!window.confirm(`¿Archivar la factura #${inv.number}?`)) return
    setDeleting(true)
    try {
      await archive.mutateAsync(inv.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center">
      <div
        className="min-w-0 flex-1"
        role={onOpen ? 'button' : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onClick={onOpen ? () => onOpen(inv.id) : undefined}
        onKeyDown={onOpen ? (e) => (e.key === 'Enter' || e.key === ' ') && onOpen(inv.id) : undefined}
        style={onOpen ? { cursor: 'pointer' } : undefined}
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground"># {inv.number}</span>
          <StatusChip status={inv.status as InvoiceStatus} />
        </div>
        <p className="mt-1 font-semibold text-foreground">{company?.name ?? 'Sin empresa'}</p>
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>Emisión: {formatDate(inv.issueDate)}</span>
          {inv.dueDate && <span>Vence: {formatDate(inv.dueDate)}</span>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="text-lg font-bold text-foreground tabular-nums">
          {formatCurrency(inv.total, inv.currency)}
        </span>
        <Select
          value={inv.status}
          onValueChange={(v) => transition.mutateAsync({ id: inv.id, status: v as InvoiceStatus })}
          disabled={transition.isPending}
        >
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="sent">Enviada</SelectItem>
            <SelectItem value="paid">Pagada</SelectItem>
            <SelectItem value="overdue">Vencida</SelectItem>
            <SelectItem value="void">Anulada</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onRegisterPayment(inv.id)}
          disabled={inv.status === 'paid' || inv.status === 'void'}
        >
          <CreditCard className="mr-1.5 h-3.5 w-3.5" /> Pagar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleArchive}
          disabled={deleting}
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          title="Archivar"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}
