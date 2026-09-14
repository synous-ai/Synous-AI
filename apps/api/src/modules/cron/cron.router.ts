import { createHash, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { env } from '../../config/env'
import { runReminderScan } from '../../jobs/reminders.service'

/**
 * Compara `Authorization` contra `Bearer <CRON_SECRET>` en tiempo constante.
 * Se comparan los sha256 de ambos lados para que los buffers tengan siempre el
 * mismo largo: timingSafeEqual exige largos iguales, y cortar antes por largo
 * filtraría el largo del secreto.
 */
function isAuthorized(header: string | undefined, secret: string): boolean {
  if (!header) return false
  const expected = createHash('sha256').update(`Bearer ${secret}`).digest()
  const received = createHash('sha256').update(header).digest()
  return timingSafeEqual(expected, received)
}

/**
 * Endpoints que dispara Vercel Cron (ver `crons` en apps/api/vercel.json).
 * Vercel manda `Authorization: Bearer <CRON_SECRET>` cuando la variable existe
 * en el proyecto.
 */
export async function cronRoutes(app: FastifyInstance): Promise<void> {
  async function remindersHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    // Sin secreto nadie puede dispararlo. 503 (y no 401) para que el log de
    // Vercel Cron muestre que falta configuración y no un rechazo de credenciales.
    if (!env.CRON_SECRET) {
      await reply.code(503).send({
        error: { code: 'CRON_NOT_CONFIGURED', message: 'Cron no configurado' },
      })
      return
    }
    if (!isAuthorized(request.headers.authorization, env.CRON_SECRET)) {
      // 401 sin body: no revelar por qué falló.
      await reply.code(401).send()
      return
    }

    // Idempotente (dedupeKey + claim-before-send): una doble ejecución del cron
    // no duplica notificaciones ni emails.
    const result = await runReminderScan()
    request.log.info({ result }, '[cron] scan de recordatorios completado')
    await reply.send({ data: result })
  }

  app.get('/reminders', remindersHandler)
}
