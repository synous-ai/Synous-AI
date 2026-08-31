'use client'

import { useState } from 'react'
import { useClientIntakes, useRespondIntake } from '@portal/lib/hooks'
import type { ClientIntake } from '@portal/lib/types'
import { Card, CardHeader, CardTitle, CardContent } from '@portal/components/ui/card'
import { Button } from '@portal/components/ui/button'
import { Badge } from '@portal/components/ui/badge'
import { Input } from '@portal/components/ui/input'
import { Textarea } from '@portal/components/ui/textarea'
import { Label } from '@portal/components/ui/label'
import { CheckCircle2, ClipboardList, Loader2 } from 'lucide-react'
import { CardListSkeleton } from '@portal/components/ui/skeletons'
import { EmptyIllustration } from '@portal/components/ui/empty-illustration'

// ─── Status helpers ───────────────────────────────────────────────────────────

const INTAKE_STATUS_LABEL: Record<ClientIntake['status'], string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  completed: 'Completado',
}

const INTAKE_STATUS_VARIANT: Record<ClientIntake['status'], 'signal' | 'default' | 'accent'> = {
  pending: 'signal',
  in_progress: 'default',
  completed: 'accent',
}

// ─── Intake Form Card ─────────────────────────────────────────────────────────

export function IntakeFormCard({ intake }: { intake: ClientIntake }) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const field of intake.fields) {
      init[field.name] =
        (intake.answers?.[field.name] as string | undefined) ?? ''
    }
    return init
  })

  const respond = useRespondIntake()
  const isActionable = intake.status === 'pending' || intake.status === 'in_progress'

  function handleChange(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await respond.mutateAsync({ id: intake.id, answers: values })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">{intake.title}</CardTitle>
            {intake.dueDate && (
              <p className="text-xs text-muted-foreground">
                Vence el{' '}
                {new Intl.DateTimeFormat('es', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                }).format(new Date(intake.dueDate))}
              </p>
            )}
          </div>
          <Badge variant={INTAKE_STATUS_VARIANT[intake.status]}>
            {INTAKE_STATUS_LABEL[intake.status]}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        {!isActionable ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-accent-foreground" />
            Formulario completado. Gracias.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {intake.fields.map((field) => (
              <div key={field.name} className="space-y-1.5">
                <Label htmlFor={`${intake.id}-${field.name}`}>{field.label}</Label>

                {field.type === 'textarea' ? (
                  <Textarea
                    id={`${intake.id}-${field.name}`}
                    value={values[field.name] ?? ''}
                    onChange={(e) => handleChange(field.name, e.target.value)}
                    rows={3}
                    placeholder={field.label}
                  />
                ) : field.type === 'file' ? (
                  <Input
                    id={`${intake.id}-${field.name}`}
                    type="text"
                    value={values[field.name] ?? ''}
                    onChange={(e) => handleChange(field.name, e.target.value)}
                    placeholder="URL o nombre del archivo"
                  />
                ) : (
                  <Input
                    id={`${intake.id}-${field.name}`}
                    type={field.type}
                    value={values[field.name] ?? ''}
                    onChange={(e) => handleChange(field.name, e.target.value)}
                    placeholder={field.label}
                  />
                )}
              </div>
            ))}

            <Button
              type="submit"
              size="sm"
              disabled={respond.isPending}
              className="mt-2"
            >
              {respond.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Enviar
            </Button>

            {respond.isError && (
              <p className="text-xs text-destructive">
                Error al enviar. Intentá de nuevo.
              </p>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function FormsPanel() {
  const query = useClientIntakes()
  const intakes = query.data ?? []

  if (query.isLoading) {
    return <CardListSkeleton count={3} cardClassName="h-36" label="Cargando formularios…" />
  }

  if (query.isError) {
    return (
      <p className="py-8 text-sm text-destructive">
        No se pudieron cargar los formularios.
      </p>
    )
  }

  if (intakes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <EmptyIllustration icon={ClipboardList} />
        <div>
          <p className="font-medium text-muted-foreground">Sin Formularios</p>
          <p className="mt-0.5 text-sm text-muted-foreground/70">
            No hay formularios de onboarding asignados a tus proyectos.
          </p>
        </div>
      </div>
    )
  }

  const pending = intakes.filter((i) => i.status === 'pending' || i.status === 'in_progress')
  const completed = intakes.filter((i) => i.status === 'completed')

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <section>
          <h3 className="eyebrow mb-3">
            Pendientes
          </h3>
          <div className="space-y-3">
            {pending.map((intake) => (
              <IntakeFormCard key={intake.id} intake={intake} />
            ))}
          </div>
        </section>
      )}
      {completed.length > 0 && (
        <section>
          <h3 className="eyebrow mb-3">
            Completados
          </h3>
          <div className="space-y-3">
            {completed.map((intake) => (
              <IntakeFormCard key={intake.id} intake={intake} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
