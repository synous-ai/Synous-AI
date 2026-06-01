import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { ReportsQuerySchema } from './reports.schema'
import { getReports } from './reports.service'
import { ADMIN_SECURITY } from '../../lib/http'

const TAG = 'Reportes'
const security = ADMIN_SECURITY

export async function reportsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Reportes de gestión — pilar de visibilidad del negocio',
        description:
          'Devuelve: embudo del pipeline (deals por etapa + win rate), ' +
          'deals en riesgo (sin actividad >14d), conversión por fuente de leads, ' +
          'actividad del equipo por usuario y resumen de deals cerrados/ganados ' +
          'para el período actual vs el anterior. ' +
          'Los parámetros `from`/`to` delimitan el período de actividad y cerrados ' +
          '(default: mes en curso). El embudo, riesgo y conversión usan el estado actual.',
        security,
        querystring: ReportsQuerySchema,
      },
    },
    async (request) => {
      const { from, to } = request.query
      return ok(await getReports(request.hubUser!.portalId, { from, to }))
    },
  )
}
