'use client'

/**
 * Crear / editar proceso (plantilla). El slug se elige al crear y es inmutable:
 * los proyectos lo guardan en `kind`.
 */

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { slugify } from '@synous/shared'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { useCreateProcess, useUpdateProcess } from '@/lib/hooks'
import type { Process } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const Schema = z.object({
  name: z.string().trim().min(1, 'Requerido').max(200, 'Máximo 200 caracteres'),
  slug: z
    .string()
    .trim()
    .min(1, 'Requerido')
    .max(80, 'Máximo 80 caracteres')
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Solo minúsculas, números y guiones (kebab-case)'),
  description: z.string().max(5000, 'Máximo 5000 caracteres'),
})
type FormValues = z.infer<typeof Schema>

export function ProcessDialog({
  open,
  onClose,
  process,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  /** Proceso a editar; omitido = crear. */
  process?: Process
  onSaved?: (saved: Process) => void
}): React.JSX.Element {
  const isEdit = process != null
  const create = useCreateProcess()
  const update = useUpdateProcess()
  const [error, setError] = useState<string | null>(null)
  // En alta, el slug sigue al nombre hasta que la persona lo toca a mano.
  const [slugTouched, setSlugTouched] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { name: '', slug: '', description: '' },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        name: process?.name ?? '',
        slug: process?.slug ?? '',
        description: process?.description ?? '',
      })
      setSlugTouched(false)
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, process?.id])

  async function onSubmit(v: FormValues): Promise<void> {
    setError(null)
    try {
      const saved = process
        ? await update.mutateAsync({ id: process.id, input: { name: v.name.trim(), description: v.description.trim() || null } })
        : await create.mutateAsync({ slug: v.slug, name: v.name.trim(), description: v.description.trim() || null })
      toast.success(isEdit ? 'Proceso actualizado' : 'Proceso creado')
      onSaved?.(saved)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el proceso')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar proceso' : 'Nuevo proceso'}</DialogTitle>
          <DialogDescription>
            Un proceso es una plantilla de tareas que se copia al crear un proyecto de ese tipo.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      autoFocus
                      onChange={(e) => {
                        field.onChange(e)
                        if (!isEdit && !slugTouched) form.setValue('slug', slugify(e.target.value), { shouldValidate: false })
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled={isEdit}
                      className="font-mono"
                      onChange={(e) => {
                        setSlugTouched(true)
                        field.onChange(e)
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    {isEdit
                      ? 'No se puede cambiar: los proyectos lo usan como tipo.'
                      : 'Identificador en kebab-case. No se puede cambiar después.'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Guardando…' : isEdit ? 'Guardar' : 'Crear proceso'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
