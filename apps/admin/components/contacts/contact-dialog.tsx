'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ApiError } from '@/lib/api'
import { useCreateContact, useUpdateContact, useCustomFields, type ContactInput } from '@/lib/hooks'
import type { Contact } from '@/lib/types'
import { lifecycleStage } from '@/lib/status'
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

const Schema = z.object({
  firstName: z.string().min(1, 'Requerido'),
  lastName: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
  lifecycleStage: z.enum(['lead', 'mql', 'sql', 'opportunity', 'customer', 'other']),
})
type FormValues = z.infer<typeof Schema>

const STAGES = ['lead', 'mql', 'sql', 'opportunity', 'customer', 'other'] as const

export function ContactDialog({
  open,
  onClose,
  contact,
  defaultLifecycle,
}: {
  open: boolean
  onClose: () => void
  contact?: Contact
  defaultLifecycle?: FormValues['lifecycleStage']
}) {
  const isEdit = !!contact
  const create = useCreateContact()
  const update = useUpdateContact()
  const [error, setError] = useState<string | null>(null)

  // Custom fields for contacts
  const { data: customFieldDefs } = useCustomFields('contact')
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({})

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
  })

  const { handleSubmit, reset, control, formState: { isSubmitting } } = form

  useEffect(() => {
    if (open) {
      reset({
        firstName: contact?.firstName ?? '',
        lastName: contact?.lastName ?? '',
        email: contact?.email ?? '',
        phone: contact?.phone ?? '',
        jobTitle: contact?.jobTitle ?? '',
        lifecycleStage: (contact?.lifecycleStage as FormValues['lifecycleStage']) ?? defaultLifecycle ?? 'lead',
      })
      // Initialise custom field values from contact.custom
      setCustomValues(contact?.custom ?? {})
      setError(null)
    }
  }, [open, contact, reset])

  function handleCustomChange(key: string, value: unknown) {
    setCustomValues((prev) => ({ ...prev, [key]: value }))
  }

  async function onSubmit(values: FormValues): Promise<void> {
    setError(null)

    // Build the custom object: only include fields that have a non-empty value
    const custom: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(customValues)) {
      if (v !== '' && v !== null && v !== undefined) custom[k] = v
    }

    const input: ContactInput = {
      firstName: values.firstName,
      lastName: values.lastName || undefined,
      email: values.email || undefined,
      phone: values.phone || undefined,
      jobTitle: values.jobTitle || undefined,
      lifecycleStage: values.lifecycleStage,
      ...(Object.keys(custom).length > 0 ? { custom } : {}),
    }
    try {
      if (isEdit) await update.mutateAsync({ id: contact!.id, input })
      else await create.mutateAsync(input)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar')
    }
  }

  const hasCustomFields = customFieldDefs && customFieldDefs.length > 0

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Contacto' : 'Nuevo Contacto'}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? 'Formulario para editar el contacto.' : 'Formulario para crear un nuevo contacto.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={control}
                name="firstName"
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
              <FormField
                control={control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Apellido</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="jobTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cargo</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={control}
              name="lifecycleStage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Etapa de Ciclo</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {STAGES.map((s) => (
                        <SelectItem key={s} value={s}>{lifecycleStage(s).label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── Campos personalizados ── */}
            {hasCustomFields && (
              <div className="space-y-3 border-t pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Campos personalizados
                </p>
                {customFieldDefs.map((field) => {
                  const rawValue = customValues[field.key]
                  const id = `custom_${field.key}`

                  if (field.fieldType === 'boolean') {
                    return (
                      <div key={field.key} className="flex items-center gap-3">
                        <input
                          id={id}
                          type="checkbox"
                          checked={!!rawValue}
                          onChange={(e) => handleCustomChange(field.key, e.target.checked)}
                          className="h-4 w-4 rounded border-border accent-primary"
                        />
                        <Label htmlFor={id}>{field.label}</Label>
                      </div>
                    )
                  }

                  if (field.fieldType === 'select') {
                    return (
                      <div key={field.key} className="space-y-1.5">
                        <Label htmlFor={id}>{field.label}</Label>
                        <Select
                          value={typeof rawValue === 'string' ? rawValue : ''}
                          onValueChange={(v) => handleCustomChange(field.key, v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="— Seleccioná —" />
                          </SelectTrigger>
                          <SelectContent>
                            {(field.options ?? []).map((opt) => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )
                  }

                  // text | number | date
                  const inputType =
                    field.fieldType === 'number' ? 'number'
                    : field.fieldType === 'date' ? 'date'
                    : 'text'

                  return (
                    <div key={field.key} className="space-y-1.5">
                      <Label htmlFor={id}>{field.label}</Label>
                      <Input
                        id={id}
                        type={inputType}
                        value={rawValue !== undefined && rawValue !== null ? String(rawValue) : ''}
                        onChange={(e) => {
                          const v = field.fieldType === 'number'
                            ? (e.target.value === '' ? '' : Number(e.target.value))
                            : e.target.value
                          handleCustomChange(field.key, v)
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Guardando…' : 'Guardar'}</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
