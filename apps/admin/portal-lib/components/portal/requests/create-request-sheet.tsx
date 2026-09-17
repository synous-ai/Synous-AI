'use client'

import { useEffect, useId, useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { CHANGE_REQUEST_PRIORITIES, CHANGE_REQUEST_PRIORITY_LABEL, type ChangeRequestPriority } from '@synous/shared'
import { useClientDeals, useCreateCR } from '@portal/lib/hooks'
import type { CRUploadRef } from '@portal/lib/types'
import { Button } from '@portal/components/ui/button'
import { Input } from '@portal/components/ui/input'
import { Label } from '@portal/components/ui/label'
import { Textarea } from '@portal/components/ui/textarea'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@portal/components/ui/sheet'
import { AttachmentsField } from '@portal/components/portal/requests/attachments-field'

const DEFAULT_PRIORITY: ChangeRequestPriority = 'normal'

/** Grupo de radios nativos, estilados como pills — teclado (flechas) y foco vienen gratis del `<input type="radio">`. */
function PriorityField({
  value,
  onChange,
  disabled,
}: {
  value: ChangeRequestPriority
  onChange: (value: ChangeRequestPriority) => void
  disabled?: boolean
}) {
  const name = useId()
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium text-foreground">Prioridad</legend>
      <div className="flex flex-wrap gap-2">
        {CHANGE_REQUEST_PRIORITIES.map((priority) => {
          const inputId = `${name}-${priority}`
          const checked = value === priority
          return (
            <div key={priority}>
              <input
                type="radio"
                id={inputId}
                name={name}
                value={priority}
                checked={checked}
                onChange={() => onChange(priority)}
                className="peer sr-only"
              />
              <label
                htmlFor={inputId}
                className="inline-flex cursor-pointer items-center rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground/80 transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background hover:bg-accent/60 peer-checked:hover:bg-primary/90"
              >
                {CHANGE_REQUEST_PRIORITY_LABEL[priority]}
              </label>
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}

export function CreateRequestSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const dealsQuery = useClientDeals()
  const createCR = useCreateCR()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [context, setContext] = useState('')
  const [priority, setPriority] = useState<ChangeRequestPriority>(DEFAULT_PRIORITY)
  const [dealId, setDealId] = useState<string>('')
  const [uploads, setUploads] = useState<CRUploadRef[]>([])
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID())
  const [touched, setTouched] = useState(false)

  const deals = dealsQuery.data ?? []
  const needsDealPicker = deals.length > 1

  function resetForm() {
    setTitle('')
    setDescription('')
    setContext('')
    setPriority(DEFAULT_PRIORITY)
    setDealId('')
    setUploads([])
    setTouched(false)
    createCR.reset()
  }

  // Un `clientRequestId` nuevo por CADA apertura del formulario: si el
  // cliente cierra sin enviar y vuelve a abrir, no debe reusar el id de un
  // intento anterior (podría chocar con una CR que sí llegó a crearse).
  useEffect(() => {
    if (open) {
      setClientRequestId(crypto.randomUUID())
    } else {
      resetForm()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const titleError = touched && title.trim().length === 0 ? 'Ingresá un título.' : null
  const descriptionError = touched && description.trim().length === 0 ? 'Contanos qué necesitás cambiar.' : null
  const isValid = title.trim().length > 0 && description.trim().length > 0

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!isValid || createCR.isPending) return

    try {
      await createCR.mutateAsync({
        dealId: dealId || undefined,
        title: title.trim(),
        description: description.trim(),
        context: context.trim() || undefined,
        priority,
        clientRequestId,
        uploads: uploads.length > 0 ? uploads : undefined,
      })
      onOpenChange(false)
    } catch {
      /* el error se muestra vía createCR.error, abajo del formulario */
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Nueva solicitud</SheetTitle>
          <SheetDescription>Contanos qué cambio necesitás sobre el alcance acordado.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-1 flex-col gap-4">
          {needsDealPicker && (
            <div className="space-y-1.5">
              <Label htmlFor="cr-deal">Proyecto</Label>
              <select
                id="cr-deal"
                value={dealId}
                onChange={(e) => setDealId(e.target.value)}
                disabled={createCR.isPending}
                className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Seleccioná un proyecto…</option>
                {deals.map((deal) => (
                  <option key={deal.id} value={deal.id}>
                    {deal.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cr-title">Título *</Label>
            <Input
              id="cr-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={createCR.isPending}
              aria-invalid={titleError ? true : undefined}
              aria-describedby={titleError ? 'cr-title-error' : undefined}
              placeholder="Ej: Agregar integración con WhatsApp"
              maxLength={200}
            />
            {titleError && (
              <p id="cr-title-error" role="alert" className="text-xs text-destructive">
                {titleError}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cr-description">Descripción del cambio *</Label>
            <Textarea
              id="cr-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={createCR.isPending}
              aria-invalid={descriptionError ? true : undefined}
              aria-describedby={descriptionError ? 'cr-description-error' : undefined}
              placeholder="Describí con el mayor detalle posible qué necesitás."
              rows={4}
            />
            {descriptionError && (
              <p id="cr-description-error" role="alert" className="text-xs text-destructive">
                {descriptionError}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cr-context">Motivo o contexto</Label>
            <Textarea
              id="cr-context"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              disabled={createCR.isPending}
              placeholder="Opcional — ayudanos a entender por qué hace falta este cambio."
              rows={3}
            />
          </div>

          <PriorityField value={priority} onChange={setPriority} disabled={createCR.isPending} />

          <AttachmentsField value={uploads} onChange={setUploads} disabled={createCR.isPending} label="Archivos o referencias" />

          {createCR.isError && (
            <p role="alert" className="text-sm text-destructive">
              No pudimos enviar tu solicitud. Revisá los datos e intentá de nuevo.
            </p>
          )}

          <SheetFooter className="mt-auto pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={createCR.isPending}>
              Cancelar
            </Button>
            <Button type="submit" variant="signal" disabled={createCR.isPending}>
              {createCR.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Enviar solicitud
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
