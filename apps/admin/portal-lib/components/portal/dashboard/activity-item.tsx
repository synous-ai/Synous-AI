'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarX,
  ClipboardList,
  FileText,
  FolderOpen,
  GitPullRequest,
  Megaphone,
  Receipt,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@portal/lib/utils'
import { dayAndTime } from '@portal/lib/time-ago'
import type { ClientNotification } from '@portal/lib/types'
import { portalBase } from '@portal/components/portal/portal-nav'

/**
 * Un evento del sistema en la línea de actividad.
 *
 * "Actividad" = lo que el producto registró solo (se emitió una factura, se
 * publicó un entregable, se envió una solicitud). Sale de `notification`, la
 * misma bandeja que alimenta la campana — no hay un feed paralelo ni una tabla
 * nueva: el catálogo de eventos de cliente ya existe y está tipado en
 * `notification-events.ts`. Lo que una PERSONA del equipo escribe va en
 * "Últimos avances" (`project_update`), que es otra sección.
 *
 * Nunca marca como leído: eso es una acción explícita de la campana. Abrir el
 * Inicio no debería vaciarle las notificaciones al cliente.
 */

/**
 * Ícono por tipo de evento. Las claves son los `type` del catálogo de
 * notificaciones de cliente (`CLIENT_EVENT_TYPES` en el backend). Un tipo
 * nuevo que no esté acá cae al ícono neutro en vez de romper: la lista de
 * eventos la manda el backend y esta pantalla no puede ser un bloqueo para
 * agregar uno.
 */
const TYPE_ICON: Record<string, LucideIcon> = {
  deliverable_ready: FileText,
  intake_assigned: ClipboardList,
  cr_sent: GitPullRequest,
  cr_commented: GitPullRequest,
  cr_proposal_updated: GitPullRequest,
  cr_completed: GitPullRequest,
  cr_cancelled: GitPullRequest,
  invoice_sent: Receipt,
  invoice_paid: Receipt,
  document_shared: FolderOpen,
  project_update: Megaphone,
  booking_cancelled_by_admin: CalendarX,
}

export function activityIcon(type: string): LucideIcon {
  return TYPE_ICON[type] ?? Megaphone
}

export function ActivityItem({ notification, isLast }: { notification: ClientNotification; isLast: boolean }) {
  const pathname = usePathname()
  const Icon = activityIcon(notification.type)
  // Solo rutas internas. Un `actionUrl` que no arranque con "/" no es del
  // portal y no se convierte en link.
  const href = notification.actionUrl?.startsWith('/')
    ? `${portalBase(pathname)}${notification.actionUrl}`
    : null

  const content = (
    <>
      <p className="text-sm font-medium leading-snug text-foreground">{notification.title}</p>
      {notification.body && (
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{notification.body}</p>
      )}
    </>
  )

  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {/* Conector vertical entre eventos. El último no lo lleva: una línea que
          sigue después del último punto sugiere que hay más abajo. */}
      {!isLast && <span aria-hidden className="absolute left-[11px] top-6 h-[calc(100%-1.5rem)] w-px bg-border" />}

      <span
        aria-hidden
        className="relative z-10 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
      >
        <Icon className="h-3 w-3" strokeWidth={1.75} />
      </span>

      <div className="min-w-0 flex-1">
        <time dateTime={notification.createdAt} className="block text-[11px] text-muted-foreground/80">
          {dayAndTime(notification.createdAt)}
        </time>
        {href ? (
          <Link
            href={href}
            className={cn(
              'mt-0.5 block rounded-sm transition-colors hover:text-primary',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
          >
            {content}
          </Link>
        ) : (
          <div className="mt-0.5">{content}</div>
        )}
      </div>
    </li>
  )
}
