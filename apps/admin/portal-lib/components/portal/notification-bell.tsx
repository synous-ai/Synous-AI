'use client'

/**
 * Campana de notificaciones del Client Portal.
 *
 * No existía: la columna `client_id` de `notification` estaba en el schema
 * desde el principio, pero no había endpoint ni UI, así que el cliente no veía
 * NINGUNA notificación. Esto cierra ese lado.
 *
 * Se arma con estado local + un backdrop en vez de un DropdownMenu de Radix
 * porque el portal no tiene ese primitivo (no hay `dropdown-menu.tsx` en
 * portal-lib/components/ui) y sumarlo solo para esto traería la dependencia
 * entera.
 *
 * El botón es la campana animada de RareUI (ui/notification-bell.tsx): se
 * balancea cuando llega una notificación y el número rueda al nuevo valor.
 */

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { CheckCheck, Inbox } from 'lucide-react'
import {
  useClientNotifications,
  useClientUnreadCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '@portal/lib/hooks'
import type { ClientNotification } from '@portal/lib/types'
import { cn } from '@portal/lib/utils'
import { NotificationBell } from '@portal/components/ui/notification-bell'
import { timeAgo } from '@portal/lib/time-ago'
import { portalBase } from '@portal/components/portal/portal-nav'

/**
 * Barra de color por prioridad. Es la única señal visual del peso del evento:
 * una factura vencida no puede verse igual que una novedad del proyecto.
 */
const PRIORITY_BAR: Record<string, string> = {
  urgent: 'bg-destructive',
  high: 'bg-primary',
  normal: 'bg-transparent',
  low: 'bg-transparent',
}

function NotificationRow({
  n,
  onSelect,
}: {
  n: ClientNotification
  onSelect: (n: ClientNotification) => void
}) {
  const unread = !n.readAt
  return (
    <button
      type="button"
      onClick={() => onSelect(n)}
      className={cn(
        'relative flex w-full gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-b-0',
        'hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        unread && 'bg-muted/40',
      )}
    >
      <span className={cn('absolute inset-y-0 left-0 w-[3px]', PRIORITY_BAR[n.priority] ?? 'bg-transparent')} />
      <span
        className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', unread ? 'bg-primary' : 'bg-transparent')}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        {/* line-clamp en vez de truncate: los títulos llevan nombres de
            entregables y de facturas, que en una sola línea se cortan siempre. */}
        <span className={cn('block text-sm leading-snug', unread ? 'font-medium text-foreground' : 'text-foreground/80')}>
          {n.title}
        </span>
        {n.body && <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{n.body}</span>}
        <span className="mt-1 block text-[11px] text-muted-foreground/70">{timeAgo(n.createdAt)}</span>
      </span>
      {unread && <span className="sr-only">Sin leer</span>}
    </button>
  )
}

export function ClientNotificationBell() {
  const [open, setOpen] = useState(false)
  const { data: notifications, isLoading, isError } = useClientNotifications()
  const { data: unread } = useClientUnreadCount()
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()
  const router = useRouter()
  const pathname = usePathname()
  const panelRef = useRef<HTMLDivElement>(null)

  const count = unread?.count ?? 0
  const items = notifications ?? []
  const hasUnread = items.some((n) => !n.readAt)

  // Escape cierra el panel — sin esto, con el foco adentro no hay forma de
  // salir sin mouse.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function handleSelect(n: ClientNotification) {
    if (!n.readAt) markRead.mutate(n.id)
    setOpen(false)
    // `actionUrl` viene del catálogo del backend con la URL LIMPIA de la
    // sección (`/invoices`), que es la forma canónica en el host de tenant.
    // Si el portal se está sirviendo bajo el prefijo físico `/portal`, hay que
    // anteponerlo o la navegación cae en una ruta que no existe.
    //
    // Se valida que sea relativa antes de navegar: si alguna vez llegara algo
    // absoluto, un router.push lo trataría como navegación externa.
    if (n.actionUrl?.startsWith('/')) router.push(`${portalBase(pathname)}${n.actionUrl}`)
  }

  return (
    <div className="relative">
      {/* El nombre accesible (con la cuenta) lo da el propio componente, que
          además lo anuncia cuando cambia. `null` mientras carga: así no suena
          en cada carga del portal, solo cuando llega algo nuevo. */}
      <NotificationBell
        count={unread ? unread.count : null}
        size={40}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
      />

      {open && (
        <>
          {/* Backdrop: cierra al click afuera. Va detrás del panel en z-index. */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Notificaciones"
            className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-card"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground">Notificaciones</h3>
              {hasUnread && (
                <button
                  type="button"
                  onClick={() => markAll.mutate()}
                  disabled={markAll.isPending}
                  className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80 disabled:opacity-60"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Marcar todas
                </button>
              )}
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {isLoading && (
                <div className="space-y-3 p-4">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex gap-3">
                      <div className="h-2 w-2 shrink-0 rounded-full bg-muted" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 w-3/4 rounded bg-muted" />
                        <div className="h-2.5 w-1/3 rounded bg-muted/60" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isError && !isLoading && (
                <p role="alert" className="px-4 py-6 text-center text-sm text-destructive">
                  No pudimos cargar tus notificaciones.
                </p>
              )}

              {!isLoading && !isError && items.length === 0 && (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <Inbox className="h-6 w-6 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">No tenés notificaciones todavía.</p>
                </div>
              )}

              {!isLoading &&
                !isError &&
                items.map((n) => <NotificationRow key={n.id} n={n} onSelect={handleSelect} />)}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
