/**
 * email-tracking.router.ts
 *
 * Rutas públicas para tracking de emails (pixel de apertura + redirect de click).
 * Sin autenticación — son URLs embebidas en emails enviados a clientes externos.
 *
 * GET /track/open/:trackingId  → devuelve un GIF 1×1 + registra 'opened'
 * GET /track/click/:trackingId → redirige a ?url=... + registra 'clicked'
 */

import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  recordOpen,
  recordClick,
  TRACKING_PIXEL_GIF,
  validateRedirectUrl,
} from './email-tracking.service'

export async function emailTrackingRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()

  // ── GET /open/:trackingId — pixel de apertura ────────────────────────────
  r.get(
    '/open/:trackingId',
    {
      schema: {
        tags: ['Tracking'],
        summary: 'Pixel de apertura de email',
        description:
          'Registra la apertura del email identificado por trackingId y devuelve un GIF transparente 1×1. Nunca devuelve error visible (diseñado para ser embebido en emails).',
        params: z.object({ trackingId: z.string().uuid() }),
        response: {},
      },
    },
    async (request, reply) => {
      const { trackingId } = request.params
      const userAgent = request.headers['user-agent']
      const ip =
        (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
        request.socket.remoteAddress

      // Fire-and-forget: errores internos no deben romper el pixel
      recordOpen(trackingId, userAgent, ip).catch(() => undefined)

      return reply
        .header('Content-Type', 'image/gif')
        .header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
        .header('Pragma', 'no-cache')
        .header('Expires', '0')
        .send(TRACKING_PIXEL_GIF)
    },
  )

  // ── GET /click/:trackingId — redirect de click ───────────────────────────
  r.get(
    '/click/:trackingId',
    {
      schema: {
        tags: ['Tracking'],
        summary: 'Redirect de click en email',
        description:
          'Registra el click en un link de email y redirige al destino (?url=...). Si la URL es inválida o ausente, redirige a la base de la API.',
        params: z.object({ trackingId: z.string().uuid() }),
        querystring: z.object({ url: z.string().optional() }),
        response: {},
      },
    },
    async (request, reply) => {
      const { trackingId } = request.params
      const { url } = request.query
      const userAgent = request.headers['user-agent']
      const ip =
        (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
        request.socket.remoteAddress

      const destination = validateRedirectUrl(url)

      // Fire-and-forget: errores internos no deben bloquear el redirect
      if (url) {
        recordClick(trackingId, destination, userAgent, ip).catch(() => undefined)
      }

      return reply.redirect(destination, 302)
    },
  )
}
