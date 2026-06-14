'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bell, Inbox, CheckCheck } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useNotifications, useUnreadCount, useMarkAllRead, useMarkRead } from '@/lib/hooks'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { API_URL } from '@/lib/config'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import type { AppNotification } from '@/lib/types/common'

/**
 * Tiempo relativo en español ("ahora", "hace 5 min", "hace 2 h", "hace 3 d").
 * A partir de 7 días cae a fecha corta. Se calcula en el cliente, por eso
 * `Date.now()` es seguro acá (no es el sandbox de los workflows).
 */
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 7) return `hace ${d} d`
  return new Date(iso).toLocaleDateString('es')
}

type Tab = 'all' | 'unread'

export function NotificationBell() {
  const { isSignedIn, getToken } = useAuth()
  const qc = useQueryClient()
  const router = useRouter()
  const { data: notifications } = useNotifications()
  const { data: unread } = useUnreadCount()
  const markAll = useMarkAllRead()
  const markRead = useMarkRead()
  const count = unread?.count ?? 0

  // Pestaña activa del popup: todas vs. solo sin leer.
  const [tab, setTab] = useState<Tab>('all')

  const all = useMemo(() => notifications ?? [], [notifications])
  const unreadList = useMemo(() => all.filter((n) => !n.readAt), [all])
  const visible = tab === 'unread' ? unreadList : all

  // WebSocket: refresca las notificaciones cuando llega un push en vivo.
  // El token de Clerk vence ~60s, por eso se pide FRESCO justo antes de abrir
  // la conexión. La sesión Clerk del browser sigue viva para reconectar.
  useEffect(() => {
    if (!isSignedIn) return
    let ws: WebSocket | null = null
    let cancelled = false

    ;(async () => {
      const token = await getToken()
      if (cancelled || !token) return
      const url = `${API_URL.replace(/^http/, 'ws')}/ws/notifications?token=${token}`
      try {
        ws = new WebSocket(url)
      } catch {
        return
      }
      ws.onmessage = () => {
        qc.invalidateQueries({ queryKey: ['notifications'] })
      }
    })()

    return () => {
      cancelled = true
      ws?.close()
    }
  }, [isSignedIn, getToken, qc])

  // Al abrir una notificación: si está sin leer la marcamos leída, y si tiene
  // actionUrl navegamos al recurso.
  function handleItemClick(n: AppNotification): void {
    if (!n.readAt) markRead.mutate(n.id)
    if (n.actionUrl) {
      router.push(n.actionUrl.startsWith('/admin') ? n.actionUrl : `/admin${n.actionUrl}`)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Notificaciones"
        >
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-signal px-1 text-[10px] font-bold text-signal-foreground">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="w-[22rem] overflow-hidden rounded-xl border bg-card p-0 shadow-lift"
      >
        {/* Header: título + atajo "marcar todas" arriba a la derecha */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
          <h3 className="text-[15px] font-semibold tracking-tight">Notificaciones</h3>
          {unreadList.length > 0 && (
            <button
              onClick={() => markAll.mutate()}
              className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
            >
              Marcar todas
            </button>
          )}
        </div>

        {/* Tabs con badge de conteo y subrayado activo */}
        <div className="flex items-center gap-5 border-b px-4">
          <TabButton label="Todas" badge={all.length} active={tab === 'all'} onClick={() => setTab('all')} />
          <TabButton label="Sin leer" badge={unreadList.length} active={tab === 'unread'} onClick={() => setTab('unread')} />
        </div>

        {/* Lista */}
        <div className="max-h-[60vh] overflow-y-auto">
          {visible.length === 0 ? (
            <Empty className="border-0 py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
                <EmptyTitle>{tab === 'unread' ? 'Todo al día' : 'Sin notificaciones'}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            visible.map((n) => {
              const isUnread = !n.readAt
              return (
                <div
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleItemClick(n)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleItemClick(n)
                    }
                  }}
                  className={cn(
                    'relative cursor-pointer border-b px-4 py-3 pl-5 transition-colors last:border-0 hover:bg-accent/60',
                    isUnread && 'bg-accent/30',
                  )}
                >
                  {/* Acento izquierdo solo para no leídas */}
                  {isUnread && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-full bg-primary" />}
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn('text-sm leading-snug', isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground/90')}>
                      {n.title}
                    </p>
                    <span className="mt-0.5 shrink-0 whitespace-nowrap font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>
                  {n.body && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{n.body}</p>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer: marcar todas como leídas */}
        {unreadList.length > 0 && (
          <button
            onClick={() => markAll.mutate()}
            className="flex w-full items-center justify-center gap-1.5 border-t px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Marcar todas como leídas
          </button>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Tab del popup: etiqueta + badge de conteo, con subrayado cuando está activa. */
function TabButton({
  label,
  badge,
  active,
  onClick,
}: {
  label: string
  badge: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative -mb-px flex items-center gap-1.5 py-2.5 text-sm font-medium transition-colors',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      {badge > 0 && (
        <span
          className={cn(
            'flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums',
            active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
          )}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {/* Subrayado activo */}
      <span
        aria-hidden
        className={cn(
          'absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary transition-opacity',
          active ? 'opacity-100' : 'opacity-0',
        )}
      />
    </button>
  )
}
