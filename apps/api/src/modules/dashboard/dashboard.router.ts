import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { getDashboard } from './dashboard.service'

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/',
    {
      schema: {
        tags: ['Dashboard'],
        summary: 'Métricas del dashboard',
        description:
          'Resumen del portal: conteos (leads, clientes, empresas, tareas abiertas), pipeline (deals abiertos, valor, forecast ponderado por probabilidad de etapa), deals por etapa, y próximas tareas / deals recientes.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request) => ok(await getDashboard(request.hubUser!.portalId)),
  )
}
