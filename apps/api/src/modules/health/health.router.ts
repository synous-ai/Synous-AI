import type { FastifyInstance } from 'fastify'
import { sql } from 'drizzle-orm'
import { db } from '../../db'
import { ok } from '../../lib/response'

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Liveness — la API está arriba
  app.get(
    '/health',
    { schema: { tags: ['Salud'], summary: 'Liveness', description: 'Indica que la API está en ejecución.' } },
    async () => {
      return ok({ status: 'ok', time: new Date().toISOString() })
    },
  )

  // Readiness — la API puede hablar con la base de datos
  app.get(
    '/health/ready',
    {
      schema: {
        tags: ['Salud'],
        summary: 'Readiness',
        description: 'Verifica que la API pueda conectarse a la base de datos. Responde 503 si la DB no responde.',
      },
    },
    async (_request, reply) => {
      try {
        await db.execute(sql`select 1`)
        return ok({ status: 'ready', db: 'up' })
      } catch {
        return reply.status(503).send({
          error: { code: 'NOT_READY', message: 'La base de datos no responde' },
        })
      }
    },
  )
}
