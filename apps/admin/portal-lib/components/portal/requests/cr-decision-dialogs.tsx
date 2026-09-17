'use client'

import { useEffect, useId, useState, type ElementType } from 'react'
import { Ban, CheckCircle2, Loader2, MessageSquareWarning, XCircle } from 'lucide-react'
import {
  clientActionsFor,
  CR_ADJUSTMENT_AREAS,
  CR_ADJUSTMENT_AREA_LABEL,
  CR_REJECTION_REASONS,
  CR_REJECTION_REASON_LABEL,
  formatCurrency,
  formatDate,
  type ChangeRequestClientAction,
  type CRAdjustmentArea,
  type CRRejectionReason,
} from '@synous/shared'
import { useApproveCR, useCancelCR, useRejectCR, useRequestAdjustment } from '@portal/lib/hooks'
import { ApiError } from '@portal/lib/api'
import type { ChangeRequest } from '@portal/lib/types'
import { Button, type ButtonProps } from '@portal/components/ui/button'
import { Textarea } from '@portal/components/ui/textarea'
import { Label } from '@portal/components/ui/label'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@portal/components/ui/dialog'
import { useCanWriteChangeRequests } from '@portal/components/portal/requests/cr-status'

/**
 * Un 403/409 es el backend diciendo "esto no se va a resolver reintentando"
 * (sin permiso, o la CR ya cambió de estado) — mostramos su mensaje real. El
 * resto (caída de red, 500) sí puede ser transitorio: ahí mantenemos un texto
 * genérico de "probá de nuevo".
 */
function mutationErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && (error.status === 403 || error.status === 409)) return error.message
  return fallback
}

/** "Este cambio agrega: USD 350 / +3 días" — mismo texto en la card y en el diálogo de aprobación. */
function impactSummary(cr: ChangeRequest): string {
  const parts: string[] = [cr.totalAmount ? formatCurrency(cr.totalAmount, cr.currency) : 'sin costo adicional']
  if (cr.timelineImpactDays > 0) parts.push(`+${cr.timelineImpactDays} día${cr.timelineImpactDays !== 1 ? 's' : ''}`)
  return parts.join(' / ')
}

// ─── Aprobar ──────────────────────────────────────────────────────────────────

function ApproveDialog({
  cr,
  open,
  onOpenChange,
}: {
  cr: ChangeRequest
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const approveCR = useApproveCR()
  const [comment, setComment] = useState('')

  useEffect(() => {
    if (!open) {
      setComment('')
      approveCR.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleConfirm() {
    try {
      await approveCR.mutateAsync({ id: cr.id, comment: comment.trim() || undefined })
      onOpenChange(false)
    } catch {
      /* el error se muestra vía approveCR.error, abajo */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aprobar cambio</DialogTitle>
          <DialogDescription>
            CR #{cr.number} — {cr.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="text-foreground">
            Este cambio agrega: <span className="font-semibold">{impactSummary(cr)}</span>
          </p>
          {cr.newDeliveryDate && (
            <p className="text-muted-foreground">Nueva fecha estimada de entrega: {formatDate(cr.newDeliveryDate)}</p>
          )}
          <p className="text-muted-foreground">Al aprobar, este cambio será incorporado al alcance del proyecto.</p>

          <div className="space-y-1.5">
            <Label htmlFor="approve-comment">Comentario (opcional)</Label>
            <Textarea
              id="approve-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              disabled={approveCR.isPending}
            />
          </div>

          {approveCR.isError && (
            <p role="alert" className="text-xs text-destructive">
              {mutationErrorMessage(approveCR.error, 'No pudimos registrar tu aprobación. Probá de nuevo en unos segundos.')}
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={approveCR.isPending}>
              Cancelar
            </Button>
          </DialogClose>
          <Button type="button" variant="signal" onClick={() => void handleConfirm()} disabled={approveCR.isPending}>
            {approveCR.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Confirmar aprobación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Rechazar ─────────────────────────────────────────────────────────────────

function RejectDialog({
  cr,
  open,
  onOpenChange,
}: {
  cr: ChangeRequest
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const rejectCR = useRejectCR()
  const [reason, setReason] = useState<CRRejectionReason | ''>('')
  const [comment, setComment] = useState('')
  const groupName = useId()

  useEffect(() => {
    if (!open) {
      setReason('')
      setComment('')
      rejectCR.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleConfirm() {
    try {
      await rejectCR.mutateAsync({ id: cr.id, reason: reason || undefined, comment: comment.trim() || undefined })
      onOpenChange(false)
    } catch {
      /* el error se muestra vía rejectCR.error, abajo */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rechazar solicitud</DialogTitle>
          <DialogDescription>
            CR #{cr.number} — {cr.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">Motivo (opcional)</legend>
            <div className="space-y-1.5">
              {CR_REJECTION_REASONS.map((value) => {
                const inputId = `${groupName}-${value}`
                return (
                  <div key={value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      id={inputId}
                      name={groupName}
                      value={value}
                      checked={reason === value}
                      onChange={() => setReason(value)}
                      className="h-4 w-4 shrink-0 border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                    <label htmlFor={inputId} className="text-sm text-foreground/90">
                      {CR_REJECTION_REASON_LABEL[value]}
                    </label>
                  </div>
                )
              })}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="reject-comment">Comentario (opcional)</Label>
            <Textarea
              id="reject-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              disabled={rejectCR.isPending}
            />
          </div>

          {rejectCR.isError && (
            <p role="alert" className="text-xs text-destructive">
              {mutationErrorMessage(rejectCR.error, 'No pudimos registrar el rechazo. Probá de nuevo en unos segundos.')}
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={rejectCR.isPending}>
              Cancelar
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={rejectCR.isPending}
          >
            {rejectCR.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Confirmar rechazo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Solicitar ajuste ─────────────────────────────────────────────────────────

function AdjustDialog({
  cr,
  open,
  onOpenChange,
}: {
  cr: ChangeRequest
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const requestAdjustment = useRequestAdjustment()
  const [area, setArea] = useState<CRAdjustmentArea>('scope')
  const [comment, setComment] = useState('')
  const [touched, setTouched] = useState(false)
  const groupName = useId()

  useEffect(() => {
    if (!open) {
      setArea('scope')
      setComment('')
      setTouched(false)
      requestAdjustment.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const commentError = touched && comment.trim().length < 5 ? 'Contanos qué ajuste necesitás (mínimo 5 caracteres).' : null

  async function handleConfirm() {
    setTouched(true)
    if (comment.trim().length < 5) return
    try {
      await requestAdjustment.mutateAsync({ id: cr.id, area, comment: comment.trim() })
      onOpenChange(false)
    } catch {
      /* el error se muestra vía requestAdjustment.error, abajo */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar ajuste</DialogTitle>
          <DialogDescription>
            CR #{cr.number} — {cr.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">Área a ajustar</legend>
            <div className="flex flex-wrap gap-2">
              {CR_ADJUSTMENT_AREAS.map((value) => {
                const inputId = `${groupName}-${value}`
                const checked = area === value
                return (
                  <div key={value}>
                    <input
                      type="radio"
                      id={inputId}
                      name={groupName}
                      value={value}
                      checked={checked}
                      onChange={() => setArea(value)}
                      className="peer sr-only"
                    />
                    <label
                      htmlFor={inputId}
                      className="inline-flex cursor-pointer items-center rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground/80 transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 hover:bg-accent/60"
                    >
                      {CR_ADJUSTMENT_AREA_LABEL[value]}
                    </label>
                  </div>
                )
              })}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="adjust-comment">Comentario *</Label>
            <Textarea
              id="adjust-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              disabled={requestAdjustment.isPending}
              aria-invalid={commentError ? true : undefined}
              aria-describedby={commentError ? 'adjust-comment-error' : undefined}
            />
            {commentError && (
              <p id="adjust-comment-error" role="alert" className="text-xs text-destructive">
                {commentError}
              </p>
            )}
          </div>

          {requestAdjustment.isError && (
            <p role="alert" className="text-xs text-destructive">
              {mutationErrorMessage(requestAdjustment.error, 'No pudimos enviar tu pedido de ajuste. Probá de nuevo en unos segundos.')}
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={requestAdjustment.isPending}>
              Cancelar
            </Button>
          </DialogClose>
          <Button type="button" variant="outline" onClick={() => void handleConfirm()} disabled={requestAdjustment.isPending}>
            {requestAdjustment.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Enviar pedido de ajuste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Cancelar ─────────────────────────────────────────────────────────────────

function CancelDialog({
  cr,
  open,
  onOpenChange,
}: {
  cr: ChangeRequest
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const cancelCR = useCancelCR()
  const [comment, setComment] = useState('')

  useEffect(() => {
    if (!open) {
      setComment('')
      cancelCR.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleConfirm() {
    try {
      await cancelCR.mutateAsync({ id: cr.id, comment: comment.trim() || undefined })
      onOpenChange(false)
    } catch {
      /* el error se muestra vía cancelCR.error, abajo */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar solicitud</DialogTitle>
          <DialogDescription>
            CR #{cr.number} — {cr.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            ¿Seguro que querés cancelar esta solicitud? El equipo no va a seguir trabajando sobre este pedido de
            cambio.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-comment">Comentario (opcional)</Label>
            <Textarea
              id="cancel-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              disabled={cancelCR.isPending}
            />
          </div>
          {cancelCR.isError && (
            <p role="alert" className="text-xs text-destructive">
              {mutationErrorMessage(cancelCR.error, 'No pudimos cancelar la solicitud. Probá de nuevo en unos segundos.')}
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={cancelCR.isPending}>
              Volver
            </Button>
          </DialogClose>
          <Button type="button" variant="destructive" onClick={() => void handleConfirm()} disabled={cancelCR.isPending}>
            {cancelCR.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Confirmar cancelación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Botonera de acciones ─────────────────────────────────────────────────────
// Qué botón mostrar sale SIEMPRE de `clientActionsFor(cr.status)` — nunca de
// un `if (status === 'sent')` a mano. Agregar/quitar una transición en el
// catálogo compartido (@synous/shared) alcanza para que esta botonera cambie.

type DialogKind = 'approve' | 'reject' | 'adjust' | 'cancel' | null

const ACTION_TO_DIALOG: Record<ChangeRequestClientAction, DialogKind> = {
  approve: 'approve',
  reject: 'reject',
  request_adjustment: 'adjust',
  cancel: 'cancel',
}

const ACTION_CONFIG: Record<ChangeRequestClientAction, { label: string; icon: ElementType; variant: ButtonProps['variant'] }> = {
  approve: { label: 'Aprobar', icon: CheckCircle2, variant: 'signal' },
  request_adjustment: { label: 'Solicitar ajuste', icon: MessageSquareWarning, variant: 'outline' },
  reject: { label: 'Rechazar', icon: XCircle, variant: 'outline' },
  cancel: { label: 'Cancelar solicitud', icon: Ban, variant: 'outline' },
}

export function RequestActions({ cr, size = 'sm' }: { cr: ChangeRequest; size?: ButtonProps['size'] }) {
  const canWrite = useCanWriteChangeRequests()
  const [openDialog, setOpenDialog] = useState<DialogKind>(null)
  // El catálogo dice qué acciones existen para el ESTADO ('cancel' es una de
  // las que `negotiating` ofrece); `cr.canCancel` dice si a ESTA CR puntual la
  // puede cancelar ESTE cliente — el backend solo deja cancelar a quien la
  // creó. `undefined` (contrato en vuelo, el backend todavía no manda el
  // campo) se trata como "no mostrar" para no ofrecer un botón que el backend
  // rechaza con 403.
  const actions = clientActionsFor(cr.status).filter((action) => action !== 'cancel' || cr.canCancel === true)

  if (!canWrite || actions.length === 0) return null

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const config = ACTION_CONFIG[action]
          const Icon = config.icon
          return (
            <Button
              key={action}
              type="button"
              size={size}
              variant={config.variant}
              onClick={() => setOpenDialog(ACTION_TO_DIALOG[action])}
            >
              <Icon className="h-3.5 w-3.5" />
              {config.label}
            </Button>
          )
        })}
      </div>

      <ApproveDialog cr={cr} open={openDialog === 'approve'} onOpenChange={(o) => setOpenDialog(o ? 'approve' : null)} />
      <RejectDialog cr={cr} open={openDialog === 'reject'} onOpenChange={(o) => setOpenDialog(o ? 'reject' : null)} />
      <AdjustDialog cr={cr} open={openDialog === 'adjust'} onOpenChange={(o) => setOpenDialog(o ? 'adjust' : null)} />
      <CancelDialog cr={cr} open={openDialog === 'cancel'} onOpenChange={(o) => setOpenDialog(o ? 'cancel' : null)} />
    </>
  )
}
