'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ApiError } from '@/lib/api'
import { useCreateCompany, useUpdateCompany, type CompanyInput } from '@/lib/hooks'
import type { Company } from '@/lib/types'
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

const Schema = z.object({
  name: z.string().min(1, 'Requerido'),
  domain: z.string().optional(),
  industry: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().url('URL inválida').optional().or(z.literal('')),
})
type FormValues = z.infer<typeof Schema>

export function CompanyDialog({ open, onClose, company }: { open: boolean; onClose: () => void; company?: Company }) {
  const isEdit = !!company
  const create = useCreateCompany()
  const update = useUpdateCompany()
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(Schema),
  })

  useEffect(() => {
    if (open) {
      reset({
        name: company?.name ?? '',
        domain: company?.domain ?? '',
        industry: company?.industry ?? '',
        phone: company?.phone ?? '',
        website: company?.website ?? '',
      })
      setError(null)
    }
  }, [open, company, reset])

  async function onSubmit(values: FormValues) {
    setError(null)
    const input: CompanyInput = {
      name: values.name,
      domain: values.domain || undefined,
      industry: values.industry || undefined,
      phone: values.phone || undefined,
      website: values.website || undefined,
    }
    try {
      if (isEdit) await update.mutateAsync({ id: company!.id, input })
      else await create.mutateAsync(input)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Empresa' : 'Nueva Empresa'}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? 'Formulario para editar la empresa.' : 'Formulario para crear una nueva empresa.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="domain">Dominio</Label>
              <Input id="domain" placeholder="cliente.com" {...register('domain')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="industry">Industria</Label>
              <Input id="industry" {...register('industry')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" {...register('phone')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="website">Website</Label>
              <Input id="website" placeholder="https://…" {...register('website')} />
              {errors.website && <p className="text-xs text-destructive">{errors.website.message}</p>}
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Guardando…' : 'Guardar'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
