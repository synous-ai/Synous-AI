'use client'

/**
 * CobrosSection — Historial de cobros (pagos recibidos de clientes).
 * Consolida lo que antes eran "Pagos", "Ingresos" y "Cuentas por cobrar"
 * en una sola sección. Las rutas viejas (/payments, /income, /receivables)
 * redirigen aquí desde el dispatcher.
 *
 * Incluye filtros por método y período, KPI de total cobrado,
 * y soporte para cobros en ARS con tipo de cambio.
 */

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, DollarSign } from 'lucide-react'
import {
  usePayments,
  useInvoices,
  useRegisterPayment,
  useFx,
} from '@/lib/hooks'
import type { EnrichedPayment } from '@/lib/types'
import { ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TableSkeleton } from '@/components/ui/skeletons'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DataPagination } from '@/components/ui/data-pagination'
import { usePagination } from '@/lib/use-pagination'
import { EmptyState, KpiCard } from './shared'
import { formatCurrency, formatDate } from '@/lib/utils'

// ─── Constantes ───────────────────────────────────────────────────────────────

const METHOD_LABELS: Record<string, string> = {
  transfer: 'Transferencia',
  card: 'Tarjeta',
  cash: 'Efectivo',
  other: 'Otro',
}

// ─── Schema del formulario de cobro ──────────────────────────────────────────

const CobrosFormSchema = z.object({
  invoiceId: z.string().min(1, 'Seleccioná una factura'),
  amount: z.coerce.number().positive('El monto debe ser mayor a 0'),
  currency: z.enum(['USD', 'ARS']).default('USD'),
  exchangeRate: z.coerce.number().positive().optional(),
  method: z.enum(['transfer', 'card', 'cash', 'other']).default('transfer'),
  paidAt: z.string().optional(),
  reference: z.string().optional(),
})
type CobrosFormValues = z.infer<typeof CobrosFormSchema>

// ─── Dialog para registrar cobro ──────────────────────────────────────────────

function RegisterCobrosDialog({
  open,
  onClose,
  preselectedInvoiceId,
}: {
  open: boolean
  onClose: () => void
  preselectedInvoiceId?: string
}) {
  const { data: invoices } = useInvoices()
  const { data: fx } = useFx()
  const register_ = useRegisterPayment()
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CobrosFormValues>({
    resolver: zodResolver(CobrosFormSchema),
    defaultValues: { currency: 'USD', method: 'transfer' },
  })

  const watchedCurrency = watch('currency')
  const watchedRate = watch('exchangeRate')

  // Prefill del TC cuando cambia a ARS
  useEffect(() => {
    if (watchedCurrency === 'ARS' && fx?.blue?.venta && !watchedRate) {
      setValue('exchangeRate', fx.blue.venta)
    }
    if (watchedCurrency === 'USD') {
      setValue('exchangeRate', undefined)
    }
  }, [watchedCurrency, fx, setValue, watchedRate])

  useEffect(() => {
    if (open) {
      reset({ invoiceId: preselectedInvoiceId, currency: 'USD', method: 'transfer' })
      setError(null)
    }
  }, [open, reset, preselectedInvoiceId])

  // Solo facturas que tienen saldo pendiente
  const openInvoices = invoices?.filter(
    (i) => i.status === 'sent' || i.status === 'overdue' || i.status === 'draft'
  ) ?? []

  async function onSubmit(values: CobrosFormValues): Promise<void> {
    setError(null)
    try {
      await register_.mutateAsync({
        invoiceId: values.invoiceId,
        amount: values.amount,
        currency: values.currency,
        exchangeRate: values.currency === 'ARS' ? values.exchangeRate : undefined,
        method: values.method,
        paidAt: values.paidAt || undefined,
        reference: values.reference || undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Cobro</DialogTitle>
          <DialogDescription className="sr-only">
            Formulario para registrar un cobro contra una factura. Soporta cobros parciales.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          {/* Factura */}
          <div className="space-y-1.5">
            <Label>Factura</Label>
            <Controller
              control={control}
              name="invoiceId"
              render={({ field }) => (
                <Select
                  value={field.value ? String(field.value) : ''}
                  onValueChange={(v) => field.onChange(v === '' ? undefined : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccioná una factura" />
                  </SelectTrigger>
                  <SelectContent>
                    {openInvoices.length === 0 ? (
                      // Sin facturas por cobrar: evitamos el popover vacío con una pista.
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        No hay facturas por cobrar. Creá una factura primero.
                      </div>
                    ) : (
                      openInvoices.map((i) => (
                        <SelectItem key={i.id} value={String(i.id)}>
                          #{i.number} — {formatCurrency(i.total, i.currency)}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.invoiceId && <p className="text-xs text-destructive">{errors.invoiceId.message}</p>}
          </div>

          {/* Monto + Moneda */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cobros-amount">
                Monto <span className="text-xs text-muted-foreground">(parcial ok)</span>
              </Label>
              <Input
                id="cobros-amount"
                {...register('amount')}
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
              />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Moneda del cobro</Label>
              <Controller
                control={control}
                name="currency"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="ARS">ARS</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* TC si ARS */}
          {watchedCurrency === 'ARS' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="cobros-rate">Tipo de cambio (ARS por USD)</Label>
                {fx && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-xs text-blue-500 hover:underline"
                      onClick={() => setValue('exchangeRate', fx.blue.venta)}
                    >
                      Blue ${fx.blue.venta}
                    </button>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:underline"
                      onClick={() => setValue('exchangeRate', fx.tarjeta.venta)}
                    >
                      Tarjeta ${fx.tarjeta.venta}
                    </button>
                  </div>
                )}
              </div>
              <Input
                id="cobros-rate"
                {...register('exchangeRate')}
                type="number"
                step="0.01"
                min="0"
                placeholder="Ej: 1200"
              />
              {errors.exchangeRate && <p className="text-xs text-destructive">{errors.exchangeRate.message}</p>}
            </div>
          )}

          {/* Método */}
          <div className="space-y-1.5">
            <Label>Método</Label>
            <Controller
              control={control}
              name="method"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transfer">Transferencia</SelectItem>
                    <SelectItem value="card">Tarjeta</SelectItem>
                    <SelectItem value="cash">Efectivo</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Fecha + Referencia */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cobros-date">Fecha de cobro</Label>
              <Input id="cobros-date" {...register('paidAt')} type="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cobros-ref">Referencia (Opcional)</Label>
              <Input id="cobros-ref" {...register('reference')} placeholder="Nro. transferencia" />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Registrar Cobro'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── CobrosSection ────────────────────────────────────────────────────────────

export function CobrosSection() {
  const [registerOpen, setRegisterOpen] = useState(false)
  const [filterMethod, setFilterMethod] = useState<string>('all')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  // Construir filtros dinámicos
  const filters = {
    ...(filterMethod !== 'all' ? { method: filterMethod } : {}),
    ...(filterFrom ? { from: filterFrom } : {}),
    ...(filterTo ? { to: filterTo } : {}),
  }

  const { data: paymentsData, isLoading } = usePayments(
    Object.keys(filters).length > 0 ? filters : undefined
  )

  const payments = paymentsData?.payments ?? []
  const totalPeriod = paymentsData?.meta?.totalPeriod ?? '0'
  const { page, setPage, pageCount, pageItems } = usePagination(payments)

  return (
    <div>
      {/* Cabecera */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="eyebrow">Finanzas</p>
          <h1 className="text-3xl font-semibold tracking-tight">Cobros</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Historial de cobros y pagos recibidos de clientes.
          </p>
        </div>
        <Button onClick={() => setRegisterOpen(true)} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" /> Registrar Cobro
        </Button>
      </div>

      {/* KPI total cobrado del período */}
      <div className="mb-6">
        <KpiCard
          label="Total cobrado en el período"
          value={formatCurrency(totalPeriod, 'USD')}
          icon={DollarSign}
          accent="text-signal"
          bg="bg-signal/10"
        />
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={filterMethod} onValueChange={setFilterMethod}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="Método" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los métodos</SelectItem>
            <SelectItem value="transfer">Transferencia</SelectItem>
            <SelectItem value="card">Tarjeta</SelectItem>
            <SelectItem value="cash">Efectivo</SelectItem>
            <SelectItem value="other">Otro</SelectItem>
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={filterFrom}
          onChange={(e) => setFilterFrom(e.target.value)}
          className="h-8 w-36 text-xs"
          placeholder="Desde"
        />
        <Input
          type="date"
          value={filterTo}
          onChange={(e) => setFilterTo(e.target.value)}
          className="h-8 w-36 text-xs"
          placeholder="Hasta"
        />
      </div>

      {/* Tabla de cobros */}
      {isLoading ? (
        // TableSkeleton con thead: Fecha / Factura / Cliente / Monto / Moneda / TC / Método / Referencia (8 col, CLS ≈ 0)
        <TableSkeleton columns={8} rows={5} label="Cargando cobros…" />
      ) : payments.length === 0 ? (
        <EmptyState
          icon={DollarSign}
          message="No hay cobros registrados"
          hint="Registrá el primer cobro con el botón superior."
        />
      ) : (
        <>
          <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Fecha</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Factura</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Cliente</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Monto</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Moneda</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">TC</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Método</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Referencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((p: EnrichedPayment) => (
                  <TableRow key={p.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="px-4 py-3 text-muted-foreground">{formatDate(p.paidAt)}</TableCell>
                    <TableCell className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {p.invoiceNumber != null ? `#${p.invoiceNumber}` : '—'}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">
                      {p.companyName ?? '—'}
                    </TableCell>
                    <TableCell className="px-4 py-3 font-semibold tabular-nums text-signal">
                      {formatCurrency(p.amount, p.currency)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                      {p.currency}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                      {p.currency === 'ARS' && p.exchangeRate
                        ? `$${Number(p.exchangeRate).toLocaleString('es-AR')}`
                        : '—'}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">
                      {METHOD_LABELS[p.method] ?? p.method}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">{p.reference ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DataPagination page={page} pageCount={pageCount} onPageChange={setPage} />
        </>
      )}

      <RegisterCobrosDialog open={registerOpen} onClose={() => setRegisterOpen(false)} />
    </div>
  )
}
