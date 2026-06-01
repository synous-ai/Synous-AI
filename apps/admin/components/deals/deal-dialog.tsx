'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ApiError } from '@/lib/api'
import { useCreateDeal, useUpdateDeal, useArchiveDeal } from '@/lib/hooks'
import type { Company, Contact, Deal, Pipeline } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { DateField } from '@/components/ui/date-field'

const Schema = z.object({
  name: z.string().min(1, 'Requerido'),
  amount: z.string().optional(),
  stageId: z.string().optional(),
  companyId: z.string().optional(),
  primaryContactId: z.string().optional(),
  closeDate: z.string().optional(),
})
type FormValues = z.infer<typeof Schema>

function toNum(v?: string): number | undefined {
  if (!v) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

export function DealDialog({
  open,
  onClose,
  deal,
  pipeline,
  companies,
  contacts,
}: {
  open: boolean
  onClose: () => void
  deal?: Deal
  pipeline?: Pipeline
  companies: Company[]
  contacts: Contact[]
}) {
  const isEdit = !!deal
  const create = useCreateDeal()
  const update = useUpdateDeal()
  const archive = useArchiveDeal()
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
  })

  const { handleSubmit, reset, control, formState: { isSubmitting } } = form

  useEffect(() => {
    if (open) {
      reset({
        name: deal?.name ?? '',
        amount: deal?.amount ?? '',
        stageId: deal ? String(deal.stageId) : pipeline?.stages[0] ? String(pipeline.stages[0].id) : '',
        companyId: deal?.companyId ? String(deal.companyId) : '',
        primaryContactId: deal?.primaryContactId ? String(deal.primaryContactId) : '',
        closeDate: deal?.closeDate ?? '',
      })
      setError(null)
    }
  }, [open, deal, pipeline, reset])

  async function onSubmit(values: FormValues): Promise<void> {
    setError(null)
    try {
      if (isEdit) {
        await update.mutateAsync({
          id: deal!.id,
          input: {
            name: values.name,
            amount: toNum(values.amount),
            closeDate: values.closeDate || undefined,
            companyId: values.companyId || undefined,
            primaryContactId: values.primaryContactId || undefined,
          },
        })
      } else {
        if (!pipeline || !values.stageId) {
          setError('Falta el pipeline o la etapa')
          return
        }
        await create.mutateAsync({
          name: values.name,
          amount: toNum(values.amount),
          pipelineId: pipeline.id,
          stageId: values.stageId,
          companyId: values.companyId || undefined,
          primaryContactId: values.primaryContactId || undefined,
          closeDate: values.closeDate || undefined,
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar')
    }
  }

  async function onArchive(): Promise<void> {
    if (!deal) return
    if (!window.confirm(`¿Archivar el deal "${deal.name}"?`)) return
    try {
      await archive.mutateAsync(deal.id)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo archivar')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Deal' : 'Nuevo Deal'}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? 'Formulario para editar el deal.' : 'Formulario para crear un nuevo deal.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto (USD)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="closeDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de Cierre</FormLabel>
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

            {!isEdit && pipeline && (
              <FormField
                control={control}
                name="stageId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Etapa</FormLabel>
                    <Select value={field.value ?? ''} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {pipeline.stages.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={control}
                name="companyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Empresa</FormLabel>
                    <Select value={field.value ?? 'none'} onValueChange={(v) => field.onChange(v === 'none' ? undefined : v)}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {companies.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="primaryContactId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contacto</FormLabel>
                    <Select value={field.value ?? 'none'} onValueChange={(v) => field.onChange(v === 'none' ? undefined : v)}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {contacts.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {[c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || `#${c.id}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex items-center justify-between pt-2">
              {isEdit ? (
                <Button type="button" variant="destructive" onClick={onArchive}>Archivar</Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
                <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Guardando…' : 'Guardar'}</Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
