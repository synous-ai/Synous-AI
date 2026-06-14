import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { verifyClerkToken, resolveHubUser } from '../../middleware/clerk-auth'
import { db } from '../../db'
import { setterTenant } from '../../db/schema'
import { setterEventBus, type SetterLiveEvent } from './setter.event-bus'

/**
 * WebSocket de la Consola del setter — actividad en vivo (sin polling).
 * Conexión: ws://localhost:3001/ws/setter/events?token=<Clerk session token>
 * El token debe pedirse FRESCO desde el cliente antes de abrir el socket.
 * Empuja un JSON por cada evento del setter del portal del usuario.
 */
export async function setterWsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ws/setter/events', { websocket: true }, async (socket, request) => {
    const token = (request.query as { token?: string }).token
    let user: { sub: string; portalId: string; role: string }
    try {
      if (!token) throw new Error('no token')
      const clerkUserId = await verifyClerkToken(token)
      user = await resolveHubUser(clerkUserId)
    } catch {
      socket.close(1008, 'unauthorized')
      return
    }

    // Tenants del portal del usuario → filtro de eventos.
    const tenants = await db
      .select({ id: setterTenant.id })
      .from(setterTenant)
      .where(eq(setterTenant.portalId, user.portalId))
    const tenantIds = new Set(tenants.map((t) => t.id))

    const handler = (event: SetterLiveEvent): void => {
      if (!tenantIds.has(event.tenantId)) return
      try {
        socket.send(JSON.stringify(event))
      } catch {
        /* socket caído */
      }
    }

    setterEventBus.on('event', handler)
    socket.send(JSON.stringify({ type: 'connected' }))
    socket.on('close', () => setterEventBus.off('event', handler))
  })
}
