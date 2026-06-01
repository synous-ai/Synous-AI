'use client'

import { useEffect } from 'react'
import { Bell, Inbox } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useNotifications, useUnreadCount, useMarkAllRead } from '@/lib/hooks'
import { useAuthStore } from '@/lib/store/auth'
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

export function NotificationBell() {
  const token = useAuthStore((s) => s.accessToken)
  const qc = useQueryClient()
  const router = useRouter()
  const { data: notifications } = useNotifications()
  const { data: unread } = useUnreadCount()
  const markAll = useMarkAllRead()
  const count = unread?.count ?? 0

  // WebSocket: refresca las notificaciones cuando llega un push en vivo.
  useEffect(() => {
    if (!token) return
    const url = `${API_URL.replace(/^http/, 'ws')}/ws/notifications?token=${token}`
    let ws: WebSocket | null = null
    try {
      ws = new WebSocket(url)
    } catch {
      return
    }
    ws.onmessage = () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    }
    return () => ws?.close()
  }, [token, qc])

  function handleItemClick(actionUrl: string | null) {
    if (actionUrl) router.push(actionUrl)
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
        className="w-80 max-h-[70vh] overflow-y-auto rounded-xl border bg-card p-0 shadow-lift"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Notificaciones</span>
          {count > 0 && (
            <button
              onClick={() => markAll.mutate()}
              className="text-xs font-medium text-primary hover:underline"
            >
              Marcar leídas
            </button>
          )}
        </div>

        {/* Notification list */}
        {(notifications ?? []).length === 0 ? (
          <Empty className="border-0 py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
              <EmptyTitle>Sin notificaciones</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          (notifications ?? []).map((n) => (
            <div
              key={n.id}
              role={n.actionUrl ? 'button' : undefined}
              tabIndex={n.actionUrl ? 0 : undefined}
              onClick={() => handleItemClick(n.actionUrl)}
              onKeyDown={(e) => {
                if (n.actionUrl && (e.key === 'Enter' || e.key === ' ')) {
                  handleItemClick(n.actionUrl)
                }
              }}
              className={cn(
                'border-b px-4 py-3 last:border-0',
                !n.readAt && 'bg-accent/40',
                n.actionUrl && 'cursor-pointer hover:bg-accent/60 transition-colors',
              )}
            >
              <p className="text-sm">{n.title}</p>
              {n.body && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
              )}
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {new Date(n.createdAt).toLocaleString('es')}
              </p>
            </div>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
