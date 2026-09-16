'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Send, Save } from 'lucide-react'
import { toast } from 'sonner'
import { ADMIN_TRANSITIONS } from '@synous/shared'
import { useCreateCRProposal, useSendCRProposal, useUpdateCRProposal } from '@/lib/hooks'
import type { ChangeRequest, CRProposal } from '@/lib/types'
import type { CRProposalItemInput } from '@/lib/hooks/operations'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DateField } from '@/components/ui/date-field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface DraftItem {
  description: string
  unitPrice: string
  quantity: string
}

const EMPTY_STATE = {
  scope: '',
  amount: '',
  currency: 'USD',
  timelineImpactDays: '0',
  newDeliveryDate: undefined as string | undefined,
  note: '',
  items: [] as DraftItem[],
}

function stateFromProposal(p: CRProposal) {
  return {
    scope: p.scope ?? '',
    amount: p.amount ?? '',
    currency: p.currency,
    timelineImpactDays: p.timelineImpactDays != null ? String(p.timelineImpactDays) : '0',
    newDeliveryDate: p.newDeliveryDate ?? undefined,
    note: p.note ?? '',
    items: p.items.map((it) => ({ description: it.description, unitPrice: it.unitPrice, quantity: it.quantity })),
  }
}

/**
 * Composer de propuesta. Dos acciones posibles según haya o no un borrador
 * vigente editable (`draftProposal` del detalle — NUNCA `currentProposal`,
 * que solo puede ser una propuesta ya enviada):
 * - Sin borrador: el formulario arranca vacío. "Guardar borrador" (POST,
 *   send:false, crea versión N+1) + "Enviar al cliente" (POST, send:true,
 *   crea versión N+1 y la envía).
 * - Con un borrador en curso: el formulario lo precarga. "Guardar cambios"
 *   edita ESA MISMA versión en el lugar (PATCH, no incrementa versión) +
 *   "Enviar al cliente" ahora usa el endpoint dedicado
 *   `POST /:id/proposals/:proposalId/send` (no crea otra versión).
 *
 * Enviar SIEMPRE se deshabilita (con motivo visible) cuando
 * `ADMIN_TRANSITIONS[cr.status]` no incluye `'sent'` — el backend responde 409
 * en esos estados (aprobada, aprobada verbalmente, o terminal).
 */
export function CRProposalComposer({
  id,
  cr,
  draftProposal,
}: {
  id: string
  cr: ChangeRequest
  draftProposal: CRProposal | null
}) {
  const createProposal = useCreateCRProposal()
  const updateProposal = useUpdateCRProposal()
  const sendProposal = useSendCRProposal()

  const [form, setForm] = useState(draftProposal ? stateFromProposal(draftProposal) : EMPTY_STATE)
  const { scope, amount, currency, timelineImpactDays, newDeliveryDate, note, items } = form
  const setScope = (v: string) => setForm((f) => ({ ...f, scope: v }))
  const setAmount = (v: string) => setForm((f) => ({ ...f, amount: v }))
  const setCurrency = (v: string) => setForm((f) => ({ ...f, currency: v }))
  const setTimelineImpactDays = (v: string) => setForm((f) => ({ ...f, timelineImpactDays: v }))
  const setNewDeliveryDate = (v: string | undefined) => setForm((f) => ({ ...f, newDeliveryDate: v }))
  const setNote = (v: string) => setForm((f) => ({ ...f, note: v }))
  const setItems = (updater: (items: DraftItem[]) => DraftItem[]) =>
    setForm((f) => ({ ...f, items: updater(f.items) }))

  // Al cambiar de borrador (o dejar de haber uno) refrescamos el formulario —
  // evita arrastrar valores de la versión anterior si el admin recarga datos.
  useEffect(() => {
    setForm(draftProposal ? stateFromProposal(draftProposal) : EMPTY_STATE)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftProposal?.id])

  const canSend = (ADMIN_TRANSITIONS[cr.status] ?? []).includes('sent')

  function buildInput(): CRProposalInputShape {
    const parsedItems: CRProposalItemInput[] = items
      .filter((it) => it.description.trim())
      .map((it) => ({
        description: it.description.trim(),
        unitPrice: Number(it.unitPrice) || 0,
        quantity: Number(it.quantity) || 1,
      }))
    return {
      scope: scope.trim() || undefined,
      amount: amount.trim() ? Number(amount) : undefined,
      currency,
      timelineImpactDays: timelineImpactDays.trim() ? Number(timelineImpactDays) : undefined,
      newDeliveryDate: newDeliveryDate || undefined,
      note: note.trim() || undefined,
      items: parsedItems.length > 0 ? parsedItems : undefined,
    }
  }

  async function handleSaveDraftChanges(): Promise<void> {
    if (!draftProposal) return
    try {
      await updateProposal.mutateAsync({ id, proposalId: draftProposal.id, input: buildInput() })
      toast.success('Borrador actualizado')
    } catch {
      toast.error('No se pudo guardar el borrador')
    }
  }

  async function handleSaveNewDraft(): Promise<void> {
    try {
      await createProposal.mutateAsync({ id, input: { ...buildInput(), send: false } })
      toast.success('Borrador guardado')
    } catch {
      toast.error('No se pudo guardar el borrador')
    }
  }

  /**
   * Con borrador existente: endpoint dedicado (no crea versión nueva). Sin
   * borrador: crea la versión N+1 ya enviada — mismo POST que "Guardar
   * borrador" pero con `send: true`.
   */
  async function handleSend(): Promise<void> {
    try {
      if (draftProposal) {
        await sendProposal.mutateAsync({ id, proposalId: draftProposal.id })
      } else {
        await createProposal.mutateAsync({ id, input: { ...buildInput(), send: true } })
      }
      toast.success('Propuesta enviada al cliente')
    } catch {
      toast.error('No se pudo enviar la propuesta')
    }
  }

  const pending = createProposal.isPending || updateProposal.isPending || sendProposal.isPending
  const hasDraftToEdit = draftProposal != null

  return (
    <div className="space-y-3 rounded-xl border bg-background/60 p-4">
      <div>
        <Label htmlFor="cr-proposal-scope">Alcance propuesto</Label>
        <Textarea
          id="cr-proposal-scope"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          placeholder="Qué incluye esta propuesta…"
          rows={3}
          className="mt-1.5"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <Label htmlFor="cr-proposal-amount">Monto</Label>
          <Input
            id="cr-proposal-amount"
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="cr-proposal-currency">Moneda</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="cr-proposal-currency" className="mt-1.5 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="ARS">ARS</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="cr-proposal-days">Días de impacto</Label>
          <Input
            id="cr-proposal-days"
            type="number"
            value={timelineImpactDays}
            onChange={(e) => setTimelineImpactDays(e.target.value)}
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="cr-proposal-date">Nueva fecha de entrega</Label>
          <DateField value={newDeliveryDate} onChange={setNewDeliveryDate} className="mt-1.5 w-full" />
        </div>
      </div>

      <div>
        <Label htmlFor="cr-proposal-note">Nota para el cliente</Label>
        <Textarea
          id="cr-proposal-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Notas opcionales que acompañan la propuesta…"
          rows={2}
          className="mt-1.5"
        />
      </div>

      {/* Ítems opcionales de la propuesta */}
      <div className="space-y-2">
        <Label>Ítems (opcional)</Label>
        {items.map((it, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={it.description}
              onChange={(e) => setItems((xs) => xs.map((x, idx) => (idx === i ? { ...x, description: e.target.value } : x)))}
              placeholder="Ítem"
              className="h-8 flex-1 text-sm"
              aria-label={`Descripción del ítem ${i + 1}`}
            />
            <Input
              value={it.unitPrice}
              onChange={(e) => setItems((xs) => xs.map((x, idx) => (idx === i ? { ...x, unitPrice: e.target.value } : x)))}
              placeholder="$"
              type="number"
              className="h-8 w-24 text-sm"
              aria-label={`Precio unitario del ítem ${i + 1}`}
            />
            <Input
              value={it.quantity}
              onChange={(e) => setItems((xs) => xs.map((x, idx) => (idx === i ? { ...x, quantity: e.target.value } : x)))}
              placeholder="cant"
              type="number"
              className="h-8 w-16 text-sm"
              aria-label={`Cantidad del ítem ${i + 1}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => setItems((xs) => xs.filter((_, idx) => idx !== i))}
              aria-label={`Quitar ítem ${i + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setItems((xs) => [...xs, { description: '', unitPrice: '', quantity: '1' }])}
          className="h-auto gap-1 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar ítem
        </Button>
      </div>

      {!canSend && (
        <p className="text-right text-xs text-muted-foreground">
          No se puede enviar una propuesta con la CR en este estado.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {hasDraftToEdit ? (
          <Button variant="outline" size="sm" onClick={() => void handleSaveDraftChanges()} disabled={pending}>
            <Save className="h-4 w-4" /> Guardar cambios
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => void handleSaveNewDraft()} disabled={pending}>
            <Save className="h-4 w-4" /> Guardar borrador
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => void handleSend()}
          disabled={pending || !canSend}
          title={canSend ? undefined : 'La CR no admite enviar una propuesta en este estado'}
        >
          <Send className="h-4 w-4" /> Enviar al cliente
        </Button>
      </div>
    </div>
  )
}

interface CRProposalInputShape {
  scope?: string
  amount?: number
  currency: string
  timelineImpactDays?: number
  newDeliveryDate?: string
  note?: string
  items?: CRProposalItemInput[]
}
