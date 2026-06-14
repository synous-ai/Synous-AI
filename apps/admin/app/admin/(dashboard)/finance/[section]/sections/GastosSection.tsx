'use client'

import { useState, useMemo } from 'react'
import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus,
  Receipt,
  TrendingDown,
  RefreshCw,
} from 'lucide-react'
import {
  useExpenses,
  useExpensesSummary,
  useCreateExpense,
  useFx,
} from '@/lib/hooks'
import { useDeals, useCompanies } from '@/lib/hooks'
import type { Expense, ExpenseCategory } from '@/lib/types'
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
import { formatCurrency, formatDate } from '@/lib/utils'

// ─── Constantes ───────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<ExpenseCategory | string, string> = {
  software: 'Software',
  infraestructura: 'Infraestructura',
  equipo: 'Equipo',
  impuestos: 'Impuestos',
  oficina: 'Oficina',
  marketing: 'Marketing',
  otros: 'Otros',
}

const METHOD_LABELS: Record<string, string> = {
  transfer: 'Transferencia',
  card: 'Tarjeta',
  cash: 'Efectivo',
  other: 'Otro',
}

// ─── Schema del formulario de gasto ──────────────────────────────────────────

const ExpenseFormSchema = z.object({
  description: z.string().min(1, 'Requerido'),
  amount: z.coerce.number().positive('El monto debe ser mayor a 0'),
  currency: z.enum(['USD', 'ARS']).default('USD'),
  exchangeRate: z.coerce.number().positive().optional(),
  category: z.enum([
    'software', 'infraestructura', 'equipo', 'impuestos', 'oficina', 'marketing', 'otros',
  ]),
  expenseDate: z.string().min(1, 'Requerido'),
  vendor: z.string().optional(),
  dealId: z.string().optional().or(z.literal('')),
  companyId: z.string().optional().or(z.literal('')),
  paymentMethod: z.enum(['transfer', 'card', 'cash', 'other']).default('transfer'),
  isRecurring: z.boolean().default(false),
  notes: z.string().optional(),
})
type ExpenseFormValues = z.infer<typeof ExpenseFormSchema>

// ─── Dialog para crear gasto ──────────────────────────────────────────────────

function CreateExpenseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateExpense()
  const { data: deals } = useDeals()
  const { data: companies } = useCompanies()
  const { data: fx } = useFx()
  const [error, setError] = useState<string | null>(null)

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(ExpenseFormSchema),
    defaultValues: {
      currency: 'USD',
      paymentMethod: 'transfer',
      isRecurring: false,
      expenseDate: new Date().toISOString().split('T')[0],
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

  // Prefill del TC cuando cambia a ARS: usar el valor venta del blue
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
        paymentMethod: 'transfer',
        isRecurring: false,
        expenseDate: new Date().toISOString().split('T')[0],
      })
      setError(null)
    }
  }, [open, reset])

  // Calcula el monto base en USD para mostrar al usuario
  const amountBase = useMemo(() => {
    if (!watchedAmount) return null
    if (watchedCurrency === 'USD') return watchedAmount
    if (watchedCurrency === 'ARS' && watchedRate) return watchedAmount / watchedRate
    return null
  }, [watchedAmount, watchedCurrency, watchedRate])

  async function onSubmit(values: ExpenseFormValues): Promise<void> {
    setError(null)
    try {
      // Calcular amountBase antes de enviar
      const amountBase =
        values.currency === 'USD'
          ? values.amount
          : values.exchangeRate
            ? values.amount / values.exchangeRate
            : values.amount

      await create.mutateAsync({
        description: values.description,
        amount: values.amount,
        currency: values.currency,
        exchangeRate: values.currency === 'ARS' ? values.exchangeRate : undefined,
        amountBase,
        category: values.category,
        expenseDate: values.expenseDate,
        vendor: values.vendor || undefined,
        dealId: values.dealId || undefined,
        companyId: values.companyId || undefined,
        paymentMethod: values.paymentMethod,
        isRecurring: values.isRecurring,
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
          <DialogTitle>Nuevo Gasto</DialogTitle>
          <DialogDescription className="sr-only">
            Formulario para registrar un nuevo gasto operativo.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            {/* Descripción */}
            <div className="space-y-1.5">
              <Label htmlFor="exp-desc">Descripción</Label>
              <Input id="exp-desc" {...register('description')} placeholder="Ej: Suscripción Vercel" />
              {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
            </div>

            {/* Deal / Proyecto — prominente, casi obligatorio */}
            <div className="space-y-1.5">
              <Label>
                Proyecto / Deal <span className="text-xs text-muted-foreground">(recomendado)</span>
              </Label>
              <Controller
                control={control}
                name="dealId"
                render={({ field }) => (
                  <Select
                    value={field.value ? String(field.value) : 'none'}
                    onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Imputar a un proyecto…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin proyecto</SelectItem>
                      {deals?.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Monto + moneda */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="exp-amount">Monto</Label>
                <Input
                  id="exp-amount"
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
                  <Label htmlFor="exp-rate">Tipo de cambio (ARS por USD)</Label>
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
                  id="exp-rate"
                  {...register('exchangeRate')}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Ej: 1200"
                />
                {amountBase != null && (
                  <p className="text-xs text-muted-foreground">
                    ≈ {formatCurrency(amountBase, 'USD')} USD
                  </p>
                )}
                {errors.exchangeRate && <p className="text-xs text-destructive">{errors.exchangeRate.message}</p>}
              </div>
            )}

            {/* Categoría + Fecha */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Controller
                  control={control}
                  name="category"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Elegí una categoría" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.category && <p className="text-xs text-destructive">{errors.category.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exp-date">Fecha</Label>
                <Input id="exp-date" {...register('expenseDate')} type="date" />
                {errors.expenseDate && <p className="text-xs text-destructive">{errors.expenseDate.message}</p>}
              </div>
            </div>

            {/* Proveedor + Empresa */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="exp-vendor">Proveedor (Opcional)</Label>
                <Input id="exp-vendor" {...register('vendor')} placeholder="Nombre del proveedor" />
              </div>
              <div className="space-y-1.5">
                <Label>Empresa (Opcional)</Label>
                <Controller
                  control={control}
                  name="companyId"
                  render={({ field }) => (
                    <Select
                      value={field.value ? String(field.value) : 'none'}
                      onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sin empresa" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin empresa</SelectItem>
                        {companies?.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            {/* Método de pago + Recurrente */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Método de Pago</Label>
                <Controller
                  control={control}
                  name="paymentMethod"
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
              <div className="space-y-1.5">
                <Label>&nbsp;</Label>
                <label className="flex cursor-pointer items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted">
                  <input
                    type="checkbox"
                    {...register('isRecurring')}
                    className="h-4 w-4 rounded"
                  />
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                    Gasto recurrente
                  </span>
                </label>
              </div>
            </div>

            {/* Notas */}
            <div className="space-y-1.5">
              <Label htmlFor="exp-notes">Notas (Opcional)</Label>
              <Input id="exp-notes" {...register('notes')} placeholder="Observaciones adicionales" />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando…' : 'Registrar Gasto'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ─── GastosSection ────────────────────────────────────────────────────────────

export function GastosSection() {
  const [createOpen, setCreateOpen] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterDeal, setFilterDeal] = useState<string>('all')
  const [filterFrom, setFilterFrom] = useState<string>('')
  const [filterTo, setFilterTo] = useState<string>('')
  const [filterRecurring, setFilterRecurring] = useState(false)

  const { data: deals } = useDeals()

  // Construir filtros para el hook
  const filters = useMemo(() => ({
    ...(filterCategory !== 'all' ? { category: filterCategory } : {}),
    ...(filterDeal !== 'all' ? { dealId: filterDeal } : {}),
    ...(filterFrom ? { from: filterFrom } : {}),
    ...(filterTo ? { to: filterTo } : {}),
    ...(filterRecurring ? { isRecurring: true } : {}),
  }), [filterCategory, filterDeal, filterFrom, filterTo, filterRecurring])

  const { data: expenses, isLoading } = useExpenses(filters)
  const { data: summary } = useExpensesSummary()
  const { page, setPage, pageCount, pageItems } = usePagination(expenses ?? [])

  return (
    <div>
      {/* Cabecera */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="eyebrow">Finanzas</p>
          <h1 className="text-3xl font-semibold tracking-tight">Gastos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gastos operativos: software, infraestructura, equipo y más.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" /> Nuevo Gasto
        </Button>
      </div>

      {/* KPI total */}
      {summary && (
        <div className="mb-6">
          <KpiCard
            label="Total gastado (USD base)"
            value={formatCurrency(summary.totalExpenses, 'USD')}
            icon={TrendingDown}
            accent="text-red-600 dark:text-red-400"
            bg="bg-red-50 dark:bg-red-500/15"
          />
        </div>
      )}

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterDeal} onValueChange={setFilterDeal}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Proyecto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los proyectos</SelectItem>
            {deals?.map((d) => (
              <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
            ))}
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

        <label className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border bg-card px-3 text-xs transition-colors hover:bg-muted">
          <input
            type="checkbox"
            checked={filterRecurring}
            onChange={(e) => setFilterRecurring(e.target.checked)}
            className="h-3.5 w-3.5 rounded"
          />
          <RefreshCw className="h-3 w-3 text-muted-foreground" />
          Solo recurrentes
        </label>
      </div>

      {/* Tabla */}
      {isLoading ? (
        // TableSkeleton con thead: Descripción / Categoría / Proveedor / Fecha / Monto / TC / Proyecto / Rec. (8 col, CLS ≈ 0)
        <TableSkeleton columns={8} rows={5} label="Cargando gastos…" />
      ) : !expenses || expenses.length === 0 ? (
        <EmptyState
          icon={Receipt}
          message="No hay gastos registrados"
          hint='Registrá el primer gasto con el botón "Nuevo Gasto".'
        />
      ) : (
        <>
          <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Descripción</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Categoría</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Proveedor</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Fecha</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Monto</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">TC</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Proyecto</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Rec.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((exp: Expense) => {
                  const deal = deals?.find((d) => d.id === exp.dealId)
                  return (
                    <TableRow key={exp.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="px-4 py-3 font-medium">{exp.description}</TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">
                        {CATEGORY_LABELS[exp.category] ?? exp.category}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">{exp.vendor ?? '—'}</TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">{formatDate(exp.expenseDate)}</TableCell>
                      <TableCell className="px-4 py-3 font-semibold tabular-nums">
                        {formatCurrency(exp.amount, exp.currency)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                        {exp.currency === 'ARS' && exp.exchangeRate
                          ? `$${Number(exp.exchangeRate).toLocaleString('es-AR')}`
                          : '—'}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">
                        {deal ? (
                          <span className="max-w-[140px] truncate block">{deal.name}</span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-center">
                        {exp.isRecurring ? (
                          <RefreshCw className="h-3.5 w-3.5 text-blue-500 mx-auto" aria-label="Recurrente" />
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <DataPagination page={page} pageCount={pageCount} onPageChange={setPage} />
        </>
      )}

      <CreateExpenseDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
