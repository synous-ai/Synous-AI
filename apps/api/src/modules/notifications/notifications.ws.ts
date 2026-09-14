import type { FastifyPluginAsync } from 'fastify'
import type { RawData } from 'ws'
import { z } from 'zod'
import { verifyClerkToken, resolveHubUser, type HubUserContext } from '../../middleware/clerk-auth'
import { subscribeNotifications } from '../../lib/notification-bus'

/** Plazo para recibir el mensaje de auth después de abrir el socket. */
export const WS_AUTH_TIMEOUT_MS = 5_000
/** Cada cuánto se manda un ping; un socket que no contestó el anterior se descarta. */
export const WS_HEARTBEAT_INTERVAL_MS = 25_000

/** RFC 6455: policy violation. */
const CLOSE_POLICY_VIOLATION = 1008

const AuthMessageSchema = z.object({
  type: z.literal('auth'),
  token: z.string().min(1),
})

export interface NotificationsWsOptions {
  authTimeoutMs?: number
  heartbeatIntervalMs?: number
}

function parseJson(raw: RawData): unknown {
  try {
    return JSON.parse(raw.toString())
  } catch {
    return null
  }
}

/**
 * WebSocket de notificaciones en tiempo real (hub users).
 *
 * Conexión: ws(s)://<api>/ws/notifications, y como PRIMER mensaje
 * `{ "type": "auth", "token": "<Clerk session token>" }` dentro de 5 s.
 * El token ya no viaja por query string: la URL termina en logs de proxies y
 * del firewall de Vercel, y el WebSocket del browser no permite headers.
 *
 * Empuja un JSON por cada notificación del portal dirigida al usuario (userId
 * coincide o es null = broadcast del portal). En Vercel la conexión se corta
 * al llegar a la duración máxima de la Function: el cliente reconecta.
 */
export const notificationsWsRoutes: FastifyPluginAsync<NotificationsWsOptions> = async (app, opts) => {
  const authTimeoutMs = opts.authTimeoutMs ?? WS_AUTH_TIMEOUT_MS
  const heartbeatIntervalMs = opts.heartbeatIntervalMs ?? WS_HEARTBEAT_INTERVAL_MS

  app.get('/ws/notifications', { websocket: true }, (socket, request) => {
    let finished = false
    let unsubscribe: (() => void) | null = null
    let heartbeat: ReturnType<typeof setInterval> | null = null

    const cleanup = (): void => {
      if (finished) return
      finished = true
      clearTimeout(authTimer)
      if (heartbeat) clearInterval(heartbeat)
      unsubscribe?.()
      unsubscribe = null
    }

    const reject = (): void => {
      cleanup()
      socket.close(CLOSE_POLICY_VIOLATION, 'unauthorized')
    }

    const authTimer = setTimeout(reject, authTimeoutMs)

    socket.on('close', cleanup)
    socket.on('error', (err) => {
      request.log.warn({ err }, 'error en el WebSocket de notificaciones')
      cleanup()
      socket.terminate()
    })

    const authenticate = async (raw: RawData): Promise<void> => {
      const message = AuthMessageSchema.safeParse(parseJson(raw))
      if (!message.success) return reject()

      let user: HubUserContext
      try {
        user = await resolveHubUser(await verifyClerkToken(message.data.token))
      } catch {
        return reject()
      }
      // El socket pudo cerrarse (o vencer el plazo) mientras se verificaba el token.
      if (finished) return
      clearTimeout(authTimer)

      unsubscribe = subscribeNotifications({ portalId: user.portalId, userId: user.sub }, (event) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event))
      })

      let alive = true
      socket.on('pong', () => {
        alive = true
      })
      heartbeat = setInterval(() => {
        // Sin pong desde el ping anterior: conexión muerta (red caída, laptop
        // dormida). terminate() dispara 'close' y con eso la limpieza.
        if (!alive) return socket.terminate()
        alive = false
        socket.ping()
      }, heartbeatIntervalMs)

      socket.send(JSON.stringify({ type: 'connected' }))
    }

    // Se registra sincrónicamente: un mensaje que llegue antes no se pierde.
    socket.once('message', (raw: RawData) => {
      void authenticate(raw)
    })
  })
}
