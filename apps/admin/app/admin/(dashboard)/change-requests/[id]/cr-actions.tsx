'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  ADMIN_TRANSITIONS,
  CHANGE_REQUEST_STATUS_META,
  CHANGE_REQUEST_TERMINAL_STATUSES,
  type ChangeRequestStatus,
} from '@synous/shared'
import { useCRTransition } from '@/lib/hooks'
import type { ChangeRequest } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

/**
 * Copy del botón por transición — es solo redacción de UI, la matriz de
 * transiciones VÁLIDAS sigue siendo `ADMIN_TRANSITIONS` (el backend la valida
 * de nuevo igual). 'sent' queda afuera a propósito: enviar una propuesta se
 * hace desde el composer de propuesta, no acá.
 */
const ACTION_LABEL: Partial<Record<ChangeRequestStatus, string>> = {
  under_review: 'Poner en revisión',
  negotiating: 'Marcar en negociación',
  approved: 'Marcar aprobada',
  approved_verbally: 'Marcar aprobada verbalmente',
  rejected: 'Rechazar',
  cancelled: 'Cancelar CR',
  completed: 'Marcar completada',
}

/** Estados terminales del catálogo compartido — requieren confirmación explícita. */
function isDestructive(target: ChangeRequestStatus): boolean {
  return target === 'rejected' || target === 'cancelled'
}

/**
 * Acciones disponibles según `ADMIN_TRANSITIONS[status]` — nada hardcodeado
 * más allá del copy del botón. Las que llevan a un estado terminal
 * (`CHANGE_REQUEST_TERMINAL_STATUSES`: rechazada/cancelada/completada) piden
 * confirmación explícita antes de aplicarse; el resto se aplica directo.
 */
export function CRActions({ id, cr }: { id: string; cr: ChangeRequest }) {
  const transition = useCRTransition()
  const [comment, setComment] = useState('')
  const [confirmTarget, setConfirmTarget] = useState<ChangeRequestStatus | null>(null)

  const targets = (ADMIN_TRANSITIONS[cr.status] ?? []).filter((t) => t !== 'sent')

  async function apply(target: ChangeRequestStatus): Promise<void> {
    try {
      await transition.mutateAsync({ id, status: target, comment: comment.trim() || undefined })
      toast.success(`CR actualizada a "${CHANGE_REQUEST_STATUS_META[target].adminLabel}"`)
      setComment('')
      setConfirmTarget(null)
    } catch {
      toast.error('No se pudo aplicar el cambio')
    }
  }

  function handleClick(target: ChangeRequestStatus): void {
    if (CHANGE_REQUEST_TERMINAL_STATUSES.includes(target)) {
      setConfirmTarget(target)
    } else {
      void apply(target)
    }
  }

  if (targets.length === 0) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-6">
          <p className="eyebrow mb-2">Acciones</p>
          <p className="text-sm text-muted-foreground">Esta CR no admite más cambios de estado.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-6">
        <p className="eyebrow mb-3">Acciones</p>
        <div className="space-y-2">
          <Label htmlFor="cr-action-comment" className="text-xs text-muted-foreground">
            Comentario (opcional, queda en el historial y lo ve el cliente)
          </Label>
          <Textarea
            id="cr-action-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Contexto para el historial…"
          />
          <div className="flex flex-col gap-2 pt-1">
            {targets.map((t) => (
              <Button
                key={t}
                size="sm"
                variant={isDestructive(t) ? 'destructive' : t === 'completed' ? 'default' : 'outline'}
                onClick={() => handleClick(t)}
                disabled={transition.isPending}
                className="w-full justify-start"
              >
                {ACTION_LABEL[t] ?? CHANGE_REQUEST_STATUS_META[t].adminLabel}
              </Button>
            ))}
          </div>
        </div>

        <ConfirmDialog
          open={confirmTarget !== null}
          onOpenChange={(open) => !open && setConfirmTarget(null)}
          title={confirmTarget ? `¿${ACTION_LABEL[confirmTarget] ?? CHANGE_REQUEST_STATUS_META[confirmTarget].adminLabel}?` : ''}
          description="Esta acción no se puede deshacer."
          confirmLabel={confirmTarget ? (ACTION_LABEL[confirmTarget] ?? 'Confirmar') : 'Confirmar'}
          destructive={confirmTarget ? isDestructive(confirmTarget) : false}
          pending={transition.isPending}
          onConfirm={() => confirmTarget && void apply(confirmTarget)}
        />
      </CardContent>
    </Card>
  )
}
