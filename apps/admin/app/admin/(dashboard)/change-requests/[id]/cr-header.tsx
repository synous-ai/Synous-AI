import { User, Users } from 'lucide-react'
import { CHANGE_REQUEST_STATUS_META } from '@synous/shared'
import type { ChangeRequest } from '@/lib/types'
import { crStatus, crPriority } from '@/lib/status'
import { StatusBadge } from '@/components/ui/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'

const WAITING_COPY: Record<'agency' | 'client' | 'none', { text: string; tone: 'warning' | 'info' | 'neutral' }> = {
  agency: { text: 'Esperando al equipo', tone: 'info' },
  client: { text: 'Esperando al cliente', tone: 'warning' },
  none: { text: 'Sin pendientes', tone: 'neutral' },
}

/**
 * Encabezado del detalle: de un vistazo hay que ver CR#, estado, prioridad,
 * origen y quién tiene la pelota ahora mismo (`waitingOn`). Es el primer
 * bloque que lee el equipo — nada de esto se deduce, todo sale del catálogo
 * compartido (`CHANGE_REQUEST_STATUS_META`).
 */
export function CRHeader({ cr }: { cr: ChangeRequest }) {
  const { kind: statusKind, label: statusLabel } = crStatus(cr.status)
  const { kind: prKind, label: prLabel } = crPriority(cr.priority)
  const waitingOn = CHANGE_REQUEST_STATUS_META[cr.status]?.waitingOn ?? 'none'
  const waiting = WAITING_COPY[waitingOn]
  const OriginIcon = cr.origin === 'client' ? User : Users

  return (
    <Card className="mb-6 rounded-2xl">
      <CardContent className="p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">CR#{cr.number}</span>
              <StatusBadge kind={statusKind}>{statusLabel}</StatusBadge>
              <StatusBadge kind={prKind}>Prioridad {prLabel}</StatusBadge>
            </div>
            <h1 className="mt-1 text-2xl font-bold leading-tight text-foreground">{cr.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <OriginIcon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {cr.origin === 'client' ? 'Pedido por el cliente' : 'Pedido por el equipo'}
                {cr.requestedByName ? ` — ${cr.requestedByName}` : ''}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-xs">{formatDate(cr.submittedAt ?? cr.createdAt)}</span>
            </div>
          </div>

          {/* Bloque "quién tiene la pelota" — explícito, no un tono de color solo */}
          <div
            className={
              waiting.tone === 'warning'
                ? 'flex shrink-0 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-[rgba(250,204,21,0.25)] dark:bg-[rgba(250,204,21,0.1)]'
                : waiting.tone === 'info'
                  ? 'flex shrink-0 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 dark:border-[rgba(96,165,250,0.25)] dark:bg-[rgba(96,165,250,0.1)]'
                  : 'flex shrink-0 items-center gap-2 rounded-xl border bg-muted/40 px-4 py-2.5'
            }
          >
            <span
              className={
                waiting.tone === 'warning'
                  ? 'h-2 w-2 shrink-0 rounded-full bg-amber-500'
                  : waiting.tone === 'info'
                    ? 'h-2 w-2 shrink-0 rounded-full bg-blue-500'
                    : 'h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40'
              }
              aria-hidden="true"
            />
            <p
              className={
                waiting.tone === 'warning'
                  ? 'text-sm font-semibold text-amber-800 dark:text-[rgba(253,224,71,0.9)]'
                  : waiting.tone === 'info'
                    ? 'text-sm font-semibold text-blue-800 dark:text-[rgba(147,197,253,0.9)]'
                    : 'text-sm font-semibold text-muted-foreground'
              }
            >
              {waiting.text}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
