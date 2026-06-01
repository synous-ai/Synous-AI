'use client'

import { useEffect, useState } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, X } from 'lucide-react'
import { ApiError } from '@/lib/api'
import {
  useCreateInvoice,
  useRegisterPayment,
  useCompanies,
  useDeals,
} from '@/lib/hooks'
import type { Invoice } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { DateField } from '@/components/ui/date-field'

// ─── create invoice dialog ────────────────────────────────────────────────────

const ItemSchema = z.object({
  description: z.string().min(1, 'Requerido'),
  quantity: z.coerce.number().positive().default(1),
  unitPrice: z.coerce.number().min(0, 'Requerido'),
})

const InvoiceFormSchema = z.object({
  companyId: z.string().optional().or(z.literal('')),
  dealId: z.string().optional().or(z.literal('')),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  currency: z.string().length(3).default('USD'),
  notes: z.string().optional(),
  items: z.array(ItemSchema).min(1, 'Agregá al menos un ítem'),
})
type InvoiceFormValues = z.infer<typeof InvoiceFormSchema>

export function CreateInvoiceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateInvoice()
  const { data: companies } = useCompanies()
  const { data: deals } = useDeals()
  const [error, setError] = useState<string | null>(null)

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(InvoiceFormSchema),
    defaultValues: { currency: 'USD', items: [{ description: '', quantity: 1, unitPrice: 0 }] },
  })

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = form

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watchedItems = watch('items')

  const subtotal = watchedItems.reduce((acc, it) => acc + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0)

  useEffect(() => {
    if (open) {
      reset({ currency: 'USD', items: [{ description: '', quantity: 1, unitPrice: 0 }] })
      setError(null)
    }
  }, [open, reset])

  async function onSubmit(values: InvoiceFormValues): Promise<void> {
    setError(null)
    try {
      await create.mutateAsync({
        companyId: values.companyId || undefined,
        dealId: values.dealId || undefined,
        issueDate: values.issueDate || undefined,
        dueDate: values.dueDate || undefined,
        currency: values.currency || 'USD',
        notes: values.notes || undefined,
        items: values.items.map((it) => ({
          description: it.description,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
        })),
      })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva Factura</DialogTitle>
          <DialogDescription className="sr-only">
            Formulario para crear una nueva factura.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Empresa (Opcional)</Label>
                <Controller
                  control={control}
                  name="companyId"
                  render={({ field }) => (
                    <Select
                      value={field.value ? String(field.value) : 'none'}
                      onValueChange={(v) => field.onChange(v === 'none' ? undefined : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sin empresa" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin empresa</SelectItem>
                        {companies?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Deal (Opcional)</Label>
                <Controller
                  control={control}
                  name="dealId"
                  render={({ field }) => (
                    <Select
                      value={field.value ? String(field.value) : 'none'}
                      onValueChange={(v) => field.onChange(v === 'none' ? undefined : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sin deal" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin deal</SelectItem>
                        {deals?.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={control}
                name="issueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de Emisión</FormLabel>
                    <FormControl>
                      <DateField
                        value={field.value || undefined}
                        onChange={(iso) => field.onChange(iso ?? '')}
                        placeholder="Elegí una fecha"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de Vencimiento</FormLabel>
                    <FormControl>
                      <DateField
                        value={field.value || undefined}
                        onChange={(iso) => field.onChange(iso ?? '')}
                        placeholder="Elegí una fecha"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-currency">Moneda</Label>
              <Input id="inv-currency" {...register('currency')} placeholder="USD" className="w-24" />
            </div>

            {/* Items */}
            <div className="space-y-2">
              <Label>Ítems</Label>
              {fields.map((field, idx) => (
                <div key={field.id} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <Input
                      {...register(`items.${idx}.description`)}
                      placeholder="Descripción"
                    />
                    {errors.items?.[idx]?.description && (
                      <p className="text-xs text-destructive mt-0.5">{errors.items[idx]!.description?.message}</p>
                    )}
                  </div>
                  <div className="w-20">
                    <Input
                      {...register(`items.${idx}.quantity`)}
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Cant."
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      {...register(`items.${idx}.unitPrice`)}
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Precio"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(idx)}
                    disabled={fields.length === 1}
                    className="mt-1.5 h-8 w-8 text-muted-foreground hover:text-destructive disabled:opacity-30"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {errors.items?.message && <p className="text-xs text-destructive">{errors.items.message}</p>}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ description: '', quantity: 1, unitPrice: 0 })}
              >
                <Plus className="mr-1 h-3 w-3" /> Agregar Ítem
              </Button>
            </div>

            <div className="flex justify-end text-sm font-semibold text-foreground">
              Subtotal: {formatCurrency(subtotal)}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-notes">Notas (Opcional)</Label>
              <Input id="inv-notes" {...register('notes')} placeholder="Condiciones, referencias, etc." />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando…' : 'Crear Factura'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ─── register payment dialog ──────────────────────────────────────────────────

const PaymentFormSchema = z.object({
  invoiceId: z.string().min(1, 'Seleccioná una factura'),
  amount: z.coerce.number().positive('El monto debe ser mayor a 0'),
  method: z.enum(['transfer', 'card', 'cash', 'other']).default('transfer'),
  paidAt: z.string().optional(),
  reference: z.string().optional(),
})
type PaymentFormValues = z.infer<typeof PaymentFormSchema>

export function RegisterPaymentDialog({
  open,
  onClose,
  preselectedInvoiceId,
  invoices,
}: {
  open: boolean
  onClose: () => void
  preselectedInvoiceId?: string
  invoices: Invoice[]
}) {
  const register_ = useRegisterPayment()
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    control: payControl,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormValues>({ resolver: zodResolver(PaymentFormSchema) })

  useEffect(() => {
    if (open) {
      reset({ invoiceId: preselectedInvoiceId, method: 'transfer' })
      setError(null)
    }
  }, [open, reset, preselectedInvoiceId])

  async function onSubmit(values: PaymentFormValues): Promise<void> {
    setError(null)
    try {
      await register_.mutateAsync({
        invoiceId: values.invoiceId,
        amount: Number(values.amount),
        method: values.method,
        paidAt: values.paidAt || undefined,
        reference: values.reference || undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  const openInvoices = invoices.filter((i) => i.status === 'sent' || i.status === 'overdue' || i.status === 'draft')

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar Pago</DialogTitle>
          <DialogDescription className="sr-only">
            Formulario para registrar un pago contra una factura.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Factura</Label>
            <Controller
              control={payControl}
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
                    {openInvoices.map((i) => (
                      <SelectItem key={i.id} value={String(i.id)}>
                        #{i.number} — {formatCurrency(i.total, i.currency)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.invoiceId && <p className="text-xs text-destructive">{errors.invoiceId.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">Monto</Label>
            <Input id="pay-amount" {...register('amount')} type="number" step="0.01" min="0" placeholder="0.00" />
            {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Método</Label>
            <Controller
              control={payControl}
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

          <div className="space-y-1.5">
            <Label htmlFor="pay-date">Fecha de Pago</Label>
            <Input id="pay-date" {...register('paidAt')} type="date" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-ref">Referencia (Opcional)</Label>
            <Input id="pay-ref" {...register('reference')} placeholder="Nro. de transferencia, etc." />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Registrar Pago'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
