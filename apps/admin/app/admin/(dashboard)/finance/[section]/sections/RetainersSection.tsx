'use client'

/**
 * RetainersSection — Contratos de honorarios recurrentes con clientes.
 *
 * Muestra la lista de retainers activos/pausados/cancelados, el KPI de MRR,
 * y permite crear nuevos retainers, pausar/reactivar/cancelar los existentes
 * y generar la factura del período actual con un solo clic.
 *
 * El backend valida que un retainer cancelado no pueda reactivarse; si ese
 * caso ocurre, mostramos el mensaje de error del backend directamente.
 */

import { useState, useEffect, useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus,
  Repeat,
  FileText,
  PauseCircle,
  PlayCircle,
  XCircle,
  TrendingUp,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import {
  useRetainers,
  useRetainerDetail,
  useCreateRetainer,
  useUpdateRetainer,
  useGenerateRetainerInvoice,
  useFinanceSummaryExtended,
  useFx,
  useCompanies,
} from '@/lib/hooks'
import type { Retainer, RetainerStatus } from '@/lib/types'
import { ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { DataPagination } from '@/components/ui/data-pagination'
import { usePagination } from '@/lib/use-pagination'
import { EmptyState, KpiCard } from './shared'
import { StatusChip } from './InvoiceRow'
import { formatCurrency, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

// ─── Etiquetas de estado ───────────────────────────────────────────────────────

const STATUS_LABELS: Record<RetainerStatus, string> = {
  active: 'Activo',
  paused: 'Pausado',
  cancelled: 'Cancelado',
}

const STATUS_COLORS: Record<RetainerStatus, string> = {
  active: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30',
  paused: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30',
  cancelled: 'text-muted-foreground bg-muted/30 border-border',
}

function StatusBadge({ status }: { status: RetainerStatus }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', STATUS_COLORS[status])}>
      {STATUS_LABELS[status]}
    </span>
  )
}

// ─── Schema del formulario de retainer ────────────────────────────────────────

const RetainerFormSchema = z.object({
  companyId: z.string().min(1, 'Seleccioná una empresa'),
  amount: z.coerce.number().positive('El monto debe ser mayor a 0'),
  currency: z.enum(['USD', 'ARS']).default('USD'),
  exchangeRate: z.coerce.number().positive().optional(),
  billingDay: z.coerce.number().int().min(1).max(28, 'Debe estar entre 1 y 28'),
  startDate: z.string().min(1, 'Requerido'),
  endDate: z.string().optional(),
  notes: z.string().optional(),
})
type RetainerFormValues = z.infer<typeof RetainerFormSchema>

// ─── Dialog para crear retainer ───────────────────────────────────────────────

function CreateRetainerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateRetainer()
  const { data: companies } = useCompanies()
  const { data: fx } = useFx()
  const [error, setError] = useState<string | null>(null)

  const form = useForm<RetainerFormValues>({
    resolver: zodResolver(RetainerFormSchema),
    defaultValues: {
      currency: 'USD',
      billingDay: 1,
      startDate: new Date().toISOString().split('T')[0],
    },
  })

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = form

  const watchedCurrency = watch('currency')
  const watchedAmount = watch('amount')
  const watchedRate = watch('exchangeRate')

  // Prefill del TC cuando cambia a ARS: usar el valor blue (igual que GastosSection)
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
      reset({
        currency: 'USD',
        billingDay: 1,
        startDate: new Date().toISOString().split('T')[0],
      })
      setError(null)
    }
  }, [open, reset])

  // Muestra el equivalente en USD si el monto está en ARS
  const amountBase = useMemo(() => {
    if (!watchedAmount) return null
    if (watchedCurrency === 'USD') return watchedAmount
    if (watchedCurrency === 'ARS' && watchedRate) return watchedAmount / watchedRate
    return null
  }, [watchedAmount, watchedCurrency, watchedRate])

  async function onSubmit(values: RetainerFormValues): Promise<void> {
    setError(null)
    try {
      const computedBase =
        values.currency === 'USD'
          ? values.amount
          : values.exchangeRate
            ? values.amount / values.exchangeRate
            : values.amount

      await create.mutateAsync({
        companyId: values.companyId,
        amount: values.amount,
        currency: values.currency,
        exchangeRate: values.currency === 'ARS' ? values.exchangeRate : undefined,
        amountBase: computedBase,
        billingDay: values.billingDay,
        startDate: values.startDate,
        endDate: values.endDate || undefined,
        notes: values.notes || undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo Retainer</DialogTitle>
          <DialogDescription className="sr-only">
            Formulario para crear un nuevo contrato de honorarios recurrente.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            {/* Empresa */}
            <div className="space-y-1.5">
              <Label>Empresa</Label>
              <Controller
                control={control}
                name="companyId"
                render={({ field }) => (
                  <Select
                    value={field.value ? String(field.value) : ''}
                    onValueChange={(v) => field.onChange(v === '' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccioná una empresa…" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies?.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.companyId && <p className="text-xs text-destructive">{errors.companyId.message}</p>}
            </div>

            {/* Monto + moneda */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ret-amount">Monto mensual</Label>
                <Input
                  id="ret-amount"
                  {...register('amount')}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                />
                {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Moneda</Label>
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

            {/* Tipo de cambio — solo si ARS */}
            {watchedCurrency === 'ARS' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ret-rate">Tipo de cambio (ARS por USD)</Label>
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
                  id="ret-rate"
                  {...register('exchangeRate')}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Ej: 1200"
                />
                {amountBase != null && (
                  <p className="text-xs text-muted-foreground">
                    ≈ {formatCurrency(amountBase, 'USD')} USD / mes
                  </p>
                )}
                {errors.exchangeRate && <p className="text-xs text-destructive">{errors.exchangeRate.message}</p>}
              </div>
            )}

            {/* Día de facturación */}
            <div className="space-y-1.5">
              <Label htmlFor="ret-billing-day">Día de facturación (1-28)</Label>
              <Input
                id="ret-billing-day"
                {...register('billingDay')}
                type="number"
                min="1"
                max="28"
                placeholder="1"
              />
              {errors.billingDay && <p className="text-xs text-destructive">{errors.billingDay.message}</p>}
            </div>

            {/* Fechas */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ret-start">Fecha de inicio</Label>
                <Input id="ret-start" {...register('startDate')} type="date" />
                {errors.startDate && <p className="text-xs text-destructive">{errors.startDate.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ret-end">Fecha de fin (Opcional)</Label>
                <Input id="ret-end" {...register('endDate')} type="date" />
              </div>
            </div>

            {/* Notas */}
            <div className="space-y-1.5">
              <Label htmlFor="ret-notes">Notas (Opcional)</Label>
              <Input id="ret-notes" {...register('notes')} placeholder="Condiciones especiales, aclaraciones…" />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando…' : 'Crear Retainer'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Fila expandible con facturas del retainer ────────────────────────────────

function RetainerRow({
  retainer,
  onStatusChange,
  onGenerate,
}: {
  retainer: Retainer
  onStatusChange: (id: string, status: RetainerStatus) => void
  onGenerate: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { data: detail } = useRetainerDetail(expanded ? retainer.id : null)

  return (
    <>
      <TableRow className="hover:bg-muted/50 transition-colors">
        <TableCell className="px-4 py-3 font-medium">
          {retainer.companyName ?? '—'}
        </TableCell>
        <TableCell className="px-4 py-3 font-semibold tabular-nums">
          {formatCurrency(retainer.amount, retainer.currency)}
        </TableCell>
        <TableCell className="px-4 py-3 text-xs text-muted-foreground">
          {retainer.currency}
          {retainer.currency === 'ARS' && retainer.exchangeRate && (
            <span className="ml-1 text-muted-foreground/60">
              TC ${Number(retainer.exchangeRate).toLocaleString('es-AR')}
            </span>
          )}
        </TableCell>
        <TableCell className="px-4 py-3 text-muted-foreground text-center">
          día {retainer.billingDay}
        </TableCell>
        <TableCell className="px-4 py-3">
          <StatusBadge status={retainer.status} />
        </TableCell>
        <TableCell className="px-4 py-3 text-muted-foreground">
          {formatDate(retainer.startDate)}
        </TableCell>
        <TableCell className="px-4 py-3 text-muted-foreground">
          {retainer.endDate ? formatDate(retainer.endDate) : '—'}
        </TableCell>
        <TableCell className="px-4 py-3">
          {/* Acciones */}
          <div className="flex items-center gap-1.5">
            {/* Pausar / Reactivar */}
            {retainer.status === 'active' && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-500/10"
                onClick={() => onStatusChange(retainer.id, 'paused')}
                title="Pausar retainer"
              >
                <PauseCircle className="h-3.5 w-3.5 mr-1" />
                Pausar
              </Button>
            )}
            {retainer.status === 'paused' && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                onClick={() => onStatusChange(retainer.id, 'active')}
                title="Reactivar retainer"
              >
                <PlayCircle className="h-3.5 w-3.5 mr-1" />
                Reactivar
              </Button>
            )}
            {/* Cancelar — solo si no está ya cancelado */}
            {retainer.status !== 'cancelled' && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => onStatusChange(retainer.id, 'cancelled')}
                title="Cancelar retainer"
              >
                <XCircle className="h-3.5 w-3.5 mr-1" />
                Cancelar
              </Button>
            )}
            {/* Generar factura del período */}
            {retainer.status === 'active' && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-500/10"
                onClick={() => onGenerate(retainer.id)}
                title="Generar factura del período actual"
              >
                <FileText className="h-3.5 w-3.5 mr-1" />
                Generar factura
              </Button>
            )}
            {/* Expandir para ver facturas generadas */}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? 'Ocultar facturas' : 'Ver facturas generadas'}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {/* Sub-fila con facturas generadas */}
      {expanded && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={8} className="px-6 py-3">
            {!detail ? (
              <Skeleton className="h-8 w-full rounded-lg" />
            ) : !detail.invoices || detail.invoices.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin facturas generadas para este retainer.</p>
            ) : (
              <div className="space-y-1">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Facturas generadas ({detail.invoices.length})
                </p>
                {detail.invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="font-mono">#{inv.number}</span>
                    <span>{formatCurrency(inv.total, inv.currency)}</span>
                    <StatusChip status={inv.status as 'draft' | 'sent' | 'paid' | 'overdue' | 'void'} />
                    {inv.dueDate && <span>{formatDate(inv.dueDate)}</span>}
                  </div>
                ))}
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

// ─── RetainersSection ─────────────────────────────────────────────────────────

export function RetainersSection() {
  const [createOpen, setCreateOpen] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Filtros para el hook
  const filters = useMemo(() => ({
    ...(filterStatus !== 'all' ? { status: filterStatus as RetainerStatus } : {}),
  }), [filterStatus])

  const { data: retainers, isLoading } = useRetainers(Object.keys(filters).length > 0 ? filters : undefined)
  const { data: summary } = useFinanceSummaryExtended()
  const updateRetainer = useUpdateRetainer()
  const generateInvoice = useGenerateRetainerInvoice()

  const { page, setPage, pageCount, pageItems } = usePagination(retainers ?? [])

  // Limpia mensajes de estado después de 4 segundos
  useEffect(() => {
    if (!actionError && !actionSuccess) return
    const t = setTimeout(() => {
      setActionError(null)
      setActionSuccess(null)
    }, 4000)
    return () => clearTimeout(t)
  }, [actionError, actionSuccess])

  async function handleStatusChange(id: string, status: RetainerStatus) {
    setActionError(null)
    setActionSuccess(null)
    try {
      await updateRetainer.mutateAsync({ id, status })
      setActionSuccess(`Retainer ${STATUS_LABELS[status].toLowerCase()} correctamente.`)
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'No se pudo actualizar')
    }
  }

  async function handleGenerate(id: string) {
    setActionError(null)
    setActionSuccess(null)
    try {
      const result = await generateInvoice.mutateAsync(id)
      if (result.created) {
        setActionSuccess(`Factura #${result.invoice.number} creada correctamente.`)
      } else {
        setActionSuccess(`Factura #${result.invoice.number} ya existía para este período.`)
      }
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'No se pudo generar la factura')
    }
  }

  return (
    <div>
      {/* Cabecera */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="eyebrow">Finanzas</p>
          <h1 className="text-3xl font-semibold tracking-tight">Retainers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Contratos de honorarios recurrentes con clientes.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" /> Nuevo Retainer
        </Button>
      </div>

      {/* KPI MRR */}
      {summary && (
        <div className="mb-6">
          <KpiCard
            label="MRR (Monthly Recurring Revenue)"
            value={formatCurrency(summary.mrr, 'USD')}
            icon={TrendingUp}
            accent="text-blue-600 dark:text-blue-400"
            bg="bg-blue-50 dark:bg-blue-500/15"
          />
        </div>
      )}

      {/* Mensajes de acción */}
      {actionSuccess && (
        <div className="mb-4 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
          {actionSuccess}
        </div>
      )}
      {actionError && (
        <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="paused">Pausados</SelectItem>
            <SelectItem value="cancelled">Cancelados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
        </div>
      ) : !retainers || retainers.length === 0 ? (
        <EmptyState
          icon={Repeat}
          message="No hay retainers configurados"
          hint='Creá el primer retainer con el botón "Nuevo Retainer".'
        />
      ) : (
        <>
          <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Cliente</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Monto mensual</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Moneda</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground text-center">Día facturación</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Estado</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Inicio</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Fin</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((r: Retainer) => (
                  <RetainerRow
                    key={r.id}
                    retainer={r}
                    onStatusChange={handleStatusChange}
                    onGenerate={handleGenerate}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
          <DataPagination page={page} pageCount={pageCount} onPageChange={setPage} />
        </>
      )}

      <CreateRetainerDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
