import { EventEmitter } from 'node:events'

/** Evento de notificación que se empuja por WebSocket. */
export interface NotificationEvent {
  portalId: string
  userId: string | null
  type: string
  title: string
  entityType: string | null
  entityId: string | null
  createdAt: string
}

/** Bus en memoria: los productores emiten, el WS reenvía a los sockets conectados. */
class NotificationBus extends EventEmitter {}
export const notificationBus = new NotificationBus()
notificationBus.setMaxListeners(0) // sin límite de listeners (un socket = un listener)

export function emitNotification(event: NotificationEvent): void {
  notificationBus.emit('notification', event)
}
