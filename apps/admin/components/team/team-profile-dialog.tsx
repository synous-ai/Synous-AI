'use client'

/** Edición del perfil de equipo (cargo, responsabilidades, decisiones). Solo owner. */

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { useUpdateTeamProfile } from '@/lib/hooks'
import type { TeamMember } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const Schema = z.object({
  jobTitle: z.string().trim().max(120, 'Máximo 120 caracteres'),
  responsibilities: z.string().trim().max(4000, 'Máximo 4000 caracteres'),
  autonomousDecisions: z.string().trim().max(4000, 'Máximo 4000 caracteres'),
  approvalRequired: z.string().trim().max(4000, 'Máximo 4000 caracteres'),
})
type FormValues = z.infer<typeof Schema>

function valuesFor(m: TeamMember): FormValues {
  return {
    jobTitle: m.jobTitle ?? '',
    responsibilities: m.responsibilities ?? '',
    autonomousDecisions: m.autonomousDecisions ?? '',
    approvalRequired: m.approvalRequired ?? '',
  }
}

const TEXT_FIELDS: { name: Exclude<keyof FormValues, 'jobTitle'>; label: string; placeholder: string }[] = [
  { name: 'responsibilities', label: 'Responsabilidades', placeholder: 'Qué tiene a cargo esta persona' },
  { name: 'autonomousDecisions', label: 'Decide solo', placeholder: 'Decisiones que puede tomar sin consultar' },
  { name: 'approvalRequired', label: 'Necesita aprobación', placeholder: 'Decisiones que hay que consultar antes' },
]

export function TeamProfileDialog({
  open,
  onClose,
  member,
}: {
  open: boolean
  onClose: () => void
  member: TeamMember
}): React.JSX.Element {
  const update = useUpdateTeamProfile()
  const form = useForm<FormValues>({ resolver: zodResolver(Schema), defaultValues: valuesFor(member) })

  useEffect(() => {
    if (open) form.reset(valuesFor(member))
    // Solo al abrir: un refetch mientras se edita no debe pisar lo tipeado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function onSubmit(values: FormValues): void {
    update.mutate(
      { userId: member.id, input: values },
      {
        onSuccess: () => {
          toast.success('Perfil actualizado')
          onClose()
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el perfil'),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar perfil</DialogTitle>
          <DialogDescription>Cargo y alcance de decisión de esta persona dentro del equipo.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="jobTitle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cargo</FormLabel>
                  <FormControl>
                    <Input {...field} autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {TEXT_FIELDS.map((f) => (
              <FormField
                key={f.name}
                control={form.control}
                name={f.name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{f.label}</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} placeholder={f.placeholder} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
