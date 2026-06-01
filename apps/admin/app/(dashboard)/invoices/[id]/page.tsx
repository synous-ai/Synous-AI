'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, CreditCard, Download, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  useInvoiceDetail,
  useInvoiceTransition,
  useArchiveInvoice,
  useCompanies,
  useInvoices,
} from '@/lib/hooks'
import type { InvoiceStatus } from '@/lib/types'
import { invoiceStatus } from '@/lib/status'
import { formatCurrency, formatDate } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'
import { generateInvoicePdf } from '@/lib/invoice-pdf'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { RegisterPaymentDialog } from '@/app/(dashboard)/finance/[section]/sections/dialogs'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import { Receipt } from 'lucide-react'

// ─── helpers ──────────────────────────────────────────────────────────────────

const METHOD_LABELS: Record<string, string> = {
  transfer: 'Transferencia',
  card: 'Tarjeta',
  cash: 'Efectivo',
  other: 'Otro',
}

// ─── sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
      {children}
    </p>
  )
}

function Divider() {
  return <div className="h-px w-full bg-border" />
}

function PageSkeleton() {
  return (
    <div className="p-6">
      <Skeleton className="mb-6 h-5 w-32 rounded-lg" />
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="w-full space-y-4 lg:w-72 lg:flex-shrink-0">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <Skeleton className="h-12 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
    </div>
  )
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params.id

  const { data, isLoading, isError } = useInvoiceDetail(id)
  const { data: companies } = useCompanies()
  const { data: allInvoices } = useInvoices()
  const transition = useInvoiceTransition()
  const archive = useArchiveInvoice()

  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [downloading, setDownloading] = useState(false)

  async function handleDownloadPdf() {
    if (!data) return
    setDownloading(true)
    try {
      await generateInvoicePdf(data.invoice.id)
      toast.success('PDF generado correctamente')
    } catch {
      toast.error('No se pudo generar el PDF')
    } finally {
      setDownloading(false)
    }
  }

  async function handleTransition(newStatus: string) {
    if (!data) return
    try {
      await transition.mutateAsync({
        id: data.invoice.id,
        status: newStatus as InvoiceStatus,
      })
      toast.success(`Estado actualizado a "${invoiceStatus(newStatus).label}"`)
    } catch {
      toast.error('No se pudo actualizar el estado')
    }
  }

  async function handleArchive() {
    if (!data) return
    if (
      !window.confirm(
        `¿Archivar la factura #${data.invoice.number}? Esta acción no se puede deshacer.`,
      )
    )
      return
    setArchiving(true)
    try {
      await archive.mutateAsync(data.invoice.id)
      toast.success(`Factura #${data.invoice.number} archivada`)
      router.push('/finance/invoices')
    } catch {
      toast.error('No se pudo archivar la factura')
    } finally {
      setArchiving(false)
    }
  }

  if (isLoading) return <PageSkeleton />

  if (isError || !data) {
    return (
      <div className="p-6">
        <Link
          href="/finance/invoices"
          className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Facturas
        </Link>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-20 text-center">
          <p className="text-sm font-medium text-muted-foreground">No se pudo cargar la factura</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Verificá que el ID sea correcto o intentá de nuevo.
          </p>
        </div>
      </div>
    )
  }

  const company =
    data.invoice.companyId
      ? (companies ?? []).find((c) => c.id === data.invoice.companyId)
      : null

  const canPay =
    data.invoice.status === 'sent' ||
    data.invoice.status === 'overdue' ||
    data.invoice.status === 'draft'

  const canVoid = data.invoice.status !== 'void' && data.invoice.status !== 'paid'
  const balance = Number(data.balance)
  const { kind: statusKind, label: statusLabel } = invoiceStatus(data.invoice.status)

  return (
    <div className="p-6">
      {/* ─── breadcrumb ──────────────────────────────────────────────────── */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/finance/invoices"
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Facturas
        </Link>
        <span>/</span>
        <span className="font-mono font-medium text-foreground">
          #{data.invoice.number}
        </span>
      </nav>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* ── Left panel: header + amounts + actions ──────────────────── */}
        <div className="w-full space-y-4 lg:w-72 lg:flex-shrink-0">

          {/* Header card */}
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <p className="font-mono text-xs text-muted-foreground">
              Factura #{data.invoice.number}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              {company?.name ?? 'Sin empresa'}
            </h1>
            <div className="mt-2">
              <StatusBadge kind={statusKind}>{statusLabel}</StatusBadge>
            </div>
          </div>

          {/* Amounts card */}
          <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
            <SectionLabel>Montos</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border bg-muted/30 px-4 py-3">
                <p className="text-xs text-muted-foreground">Subtotal</p>
                <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
                  {formatCurrency(data.invoice.subtotal, data.invoice.currency)}
                </p>
              </div>
              <div className="rounded-xl border bg-muted/30 px-4 py-3">
                <p className="text-xs text-muted-foreground">Impuesto</p>
                <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
                  {formatCurrency(data.invoice.tax, data.invoice.currency)}
                </p>
              </div>
              <div className="rounded-xl border bg-muted/30 px-4 py-3 col-span-2">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
                  {formatCurrency(data.invoice.total, data.invoice.currency)}
                </p>
              </div>
              <div
                className={
                  balance > 0
                    ? 'col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-[rgba(250,204,21,0.25)] dark:bg-[rgba(250,204,21,0.1)]'
                    : 'col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-[rgba(34,255,153,0.22)] dark:bg-[rgba(34,255,153,0.1)]'
                }
              >
                <p className={balance > 0 ? 'text-xs text-amber-700 dark:text-[rgba(253,224,71,0.85)]' : 'text-xs text-emerald-700 dark:text-[rgba(70,254,165,0.83)]'}>
                  Saldo pendiente
                </p>
                <p
                  className={
                    balance > 0
                      ? 'mt-0.5 text-lg font-bold tabular-nums text-amber-800 dark:text-[rgba(253,224,71,0.9)]'
                      : 'mt-0.5 text-lg font-bold tabular-nums text-emerald-800 dark:text-[rgba(70,254,165,0.9)]'
                  }
                >
                  {formatCurrency(data.balance, data.invoice.currency)}
                </p>
              </div>
            </div>
          </div>

          {/* Dates card */}
          <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-3">
            <SectionLabel>Fechas</SectionLabel>
            <div className="flex gap-6 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Emisión</p>
                <p className="mt-0.5 font-medium text-foreground">
                  {formatDate(data.invoice.issueDate)}
                </p>
              </div>
              {data.invoice.dueDate && (
                <div>
                  <p className="text-xs text-muted-foreground">Vencimiento</p>
                  <p className="mt-0.5 font-medium text-foreground">
                    {formatDate(data.invoice.dueDate)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Actions card */}
          <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-3">
            <SectionLabel>Acciones</SectionLabel>

            {/* status transition */}
            <div className="flex items-center gap-2">
              <p className="min-w-[70px] text-xs text-muted-foreground">Estado</p>
              <Select
                value={data.invoice.status}
                onValueChange={handleTransition}
                disabled={transition.isPending || data.invoice.status === 'void'}
              >
                <SelectTrigger className="h-8 flex-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Borrador</SelectItem>
                  <SelectItem value="sent">Enviada</SelectItem>
                  <SelectItem value="paid">Pagada</SelectItem>
                  <SelectItem value="overdue">Vencida</SelectItem>
                  {canVoid && <SelectItem value="void">Anular</SelectItem>}
                </SelectContent>
              </Select>
              {transition.isPending && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* download PDF */}
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
              disabled={downloading}
              onClick={handleDownloadPdf}
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Descargar PDF
            </Button>

            {/* register payment */}
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
              disabled={!canPay}
              onClick={() => setPayDialogOpen(true)}
            >
              <CreditCard className="h-4 w-4" />
              Registrar Pago
            </Button>

            {/* archive */}
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              disabled={archiving}
              onClick={handleArchive}
            >
              {archiving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Archivar factura
            </Button>
          </div>
        </div>

        {/* ── Right panel: items + payments + notes ───────────────────── */}
        <div className="min-w-0 flex-1 space-y-4">

          {/* Items */}
          <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-3">
            <SectionLabel>Ítems ({data.items.length})</SectionLabel>
            {data.items.length === 0 ? (
              <Empty className="border-dashed py-8">
                <EmptyHeader>
                  <EmptyIllustration icon={Receipt} />
                  <EmptyTitle>Sin Ítems Registrados</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="overflow-hidden rounded-xl border bg-background">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                        Descripción
                      </TableHead>
                      <TableHead className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">
                        Cant.
                      </TableHead>
                      <TableHead className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">
                        Precio unit.
                      </TableHead>
                      <TableHead className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">
                        Importe
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((item) => {
                      const lineTotal = Number(item.quantity) * Number(item.unitPrice)
                      return (
                        <TableRow
                          key={item.id}
                          className="transition-colors hover:bg-muted/50"
                        >
                          <TableCell className="px-3 py-2.5 text-sm">
                            {item.description}
                          </TableCell>
                          <TableCell className="px-3 py-2.5 text-right text-sm tabular-nums text-muted-foreground">
                            {Number(item.quantity)}
                          </TableCell>
                          <TableCell className="px-3 py-2.5 text-right text-sm tabular-nums text-muted-foreground">
                            {formatCurrency(item.unitPrice, data.invoice.currency)}
                          </TableCell>
                          <TableCell className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums">
                            {formatCurrency(lineTotal, data.invoice.currency)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Payments */}
          <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-3">
            <SectionLabel>Pagos ({data.payments.length})</SectionLabel>
            {data.payments.length === 0 ? (
              <Empty className="border-dashed py-8">
                <EmptyHeader>
                  <EmptyIllustration icon={CreditCard} />
                  <EmptyTitle>Sin Pagos Registrados</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="overflow-hidden rounded-xl border bg-background">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                        Monto
                      </TableHead>
                      <TableHead className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                        Método
                      </TableHead>
                      <TableHead className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                        Fecha
                      </TableHead>
                      <TableHead className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                        Referencia
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.payments.map((p) => (
                      <TableRow
                        key={p.id}
                        className="transition-colors hover:bg-muted/50"
                      >
                        <TableCell className="px-3 py-2.5 font-semibold tabular-nums text-emerald-700 dark:text-[rgba(70,254,165,0.83)]">
                          {formatCurrency(p.amount, data.invoice.currency)}
                        </TableCell>
                        <TableCell className="px-3 py-2.5 text-sm text-muted-foreground">
                          {METHOD_LABELS[p.method] ?? p.method}
                        </TableCell>
                        <TableCell className="px-3 py-2.5 text-sm text-muted-foreground">
                          {formatDate(p.paidAt)}
                        </TableCell>
                        <TableCell className="px-3 py-2.5 text-sm text-muted-foreground">
                          {p.reference ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Notes */}
          {data.invoice.notes && (
            <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-3">
              <SectionLabel>Notas</SectionLabel>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {data.invoice.notes}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* payment dialog */}
      <RegisterPaymentDialog
        open={payDialogOpen}
        onClose={() => setPayDialogOpen(false)}
        preselectedInvoiceId={data.invoice.id}
        invoices={allInvoices ?? []}
      />
    </div>
  )
}
