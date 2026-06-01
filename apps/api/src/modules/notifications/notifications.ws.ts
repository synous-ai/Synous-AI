import type { FastifyInstance } from 'fastify'
import { verifyAccessToken } from '../../lib/jwt'
import { notificationBus, type NotificationEvent } from '../../lib/notification-bus'

/**
 * WebSocket de notificaciones en tiempo real.
 * Conexión: ws://localhost:3001/ws/notifications?token=<accessToken de hub_user>
 * Empuja un JSON por cada notificación nueva del portal dirigida al usuario
 * (userId coincide o es null = broadcast del portal).
 */
export async function notificationsWsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ws/notifications', { websocket: true }, (socket, request) => {
    const token = (request.query as { token?: string }).token
    let user
    try {
      if (!token) throw new Error('no token')
      user = verifyAccessToken(token)
    } catch {
      socket.close(1008, 'unauthorized')
      return
    }

    const handler = (event: NotificationEvent) => {
      if (event.portalId !== user.portalId) return
      if (event.userId !== null && event.userId !== user.sub) return
      try {
        socket.send(JSON.stringify(event))
      } catch {
        /* socket caído */
      }
    }

    notificationBus.on('notification', handler)
    socket.send(JSON.stringify({ type: 'connected' }))
    socket.on('close', () => notificationBus.off('notification', handler))
  })
}
