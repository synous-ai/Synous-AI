import type { FastifyInstance } from 'fastify'
import { sql } from 'drizzle-orm'
import { db } from '../../db'
import { env } from '../../config/env'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { evolutionProvider } from './channels/evolution.client'
import { pingSetterQueue } from './queue/setter.queue'

/**
 * Rutas del módulo setter.
 *
 * Sprint 0 (Fase 0): solo el health/status que prueba el wiring de todas las
 * dependencias (DB, BullMQ, Vertex, Evolution). El webhook de WhatsApp, la cola
 * de aprobación y el cerebro entran en fases posteriores.
 */
export async function setterRoutes(app: FastifyInstance): Promise<void> {
  // El health expone estado de infra (DB/cola/WhatsApp/credenciales IA) → admin.
  app.addHook('preHandler', authenticate)
  app.get(
    '/health',
    {
      schema: {
        tags: ['Setter'],
        summary: 'Estado del setter',
        security: [{ bearerAuth: [] }],
        description:
          'Reporta el estado de cada dependencia del setter: base de datos, cola BullMQ, Vertex (Gemini) y el canal Evolution. En Sprint 0 solo Vertex está vivo; Evolution y el calendario quedan diferidos hasta cargar sus credenciales.',
      },
    },
    async () => {
      const [dbStatus, bullmq, evolution] = await Promise.all([
        db
          .execute(sql`select 1`)
          .then(() => 'ok' as const)
          .catch(() => 'down' as const),
        pingSetterQueue(),
        evolutionProvider.ping(),
      ])

      const vertex = env.GOOGLE_SERVICE_ACCOUNT_JSON ? 'configured' : 'not_configured'

      return ok({
        db: dbStatus,
        bullmq,
        vertex,
        evolution,
        time: new Date().toISOString(),
      })
    },
  )
}
