/**
 * webhooks.router.ts
 *
 * Rutas públicas (sin auth de hub_user) para webhooks externos.
 * La seguridad se garantiza validando la firma HMAC antes de procesar.
 *
 * IMPORTANTE: estas rutas necesitan el raw body para calcular el HMAC.
 * Registramos un content-type parser para 'application/json' que almacena
 * el string crudo en request.rawBody y lo parsea a JSON para el body normal.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { verifyFathomSignature, handleFathomWebhook } from './webhooks.service'
import { verifyDocusealToken } from './webhooks.service'
import { handleDocusealWebhook, type DocusealWebhookPayload } from '../documents/docuseal.service'

// Esquema permisivo para el payload de Fathom (estructura abierta)
const FathomWebhookSchema = z.object({
  title: z.string().optional(),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  summary: z.string().optional(),
  transcript_url: z.string().optional(),
  action_items: z.array(z.unknown()).optional(),
  participants: z
    .array(
      z.object({
        email: z.string().optional(),
        name: z.string().optional(),
      }),
    )
    .optional(),
})

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string
  }
}

export async function webhooksRoutes(app: FastifyInstance): Promise<void> {
  // Registrar un content-type parser que guarda el raw body para HMAC
  // Solo aplica dentro de este plugin (scope encapsulado de Fastify)
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req, body, done) => {
      req.rawBody = body as string
      try {
        done(null, JSON.parse(body as string))
      } catch (err) {
        done(err as Error, undefined)
      }
    },
  )

  const r = app.withTypeProvider<ZodTypeProvider>()

  // ── POST /webhooks/fathom ────────────────────────────────────────────────
  // Usamos una función handler tipada explícitamente para poder enviar 401 sin body
  // sin que TypeScript se queje del tipo de retorno del route handler tipado con Zod.
  async function fathomHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const signature = request.headers['x-fathom-signature'] as string | undefined
    const rawBody = (request as FastifyRequest & { rawBody?: string }).rawBody ?? JSON.stringify(request.body)

    if (!verifyFathomSignature(rawBody, signature)) {
      // 401 sin body informativo — no revelar que el endpoint existe ni por qué falló
      await reply.code(401).send()
      return
    }

    await handleFathomWebhook(request.body as z.infer<typeof FathomWebhookSchema>)
    await reply.code(200).send({ ok: true })
  }

  app.post(
    '/fathom',
    {
      schema: {
        tags: ['Webhooks'],
        summary: 'Webhook de Fathom',
        description:
          'Recibe eventos de Fathom (reunión grabada + AI summary). Protegido por HMAC-SHA256 en el header X-Fathom-Signature. Responde 401 sin detalle si la firma no es válida.',
      },
    },
    fathomHandler,
  )

  // ── POST /webhooks/docuseal ──────────────────────────────────────────────
  // DocuSeal no firma el payload: manda un token fijo en un header, que se
  // compara contra DOCUSEAL_WEBHOOK_SECRET en tiempo constante.
  async function docusealHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token =
      (request.headers['x-docuseal-signature'] as string | undefined) ??
      (request.headers['x-webhook-secret'] as string | undefined)

    if (!verifyDocusealToken(token)) {
      // 401 sin body: no revelar que el endpoint existe ni por qué falló.
      await reply.code(401).send()
      return
    }

    // Se responde 200 aunque el evento no nos interese o el documento no exista:
    // un 4xx haría que DocuSeal reintente para siempre algo que nunca va a andar.
    await handleDocusealWebhook(request.body as DocusealWebhookPayload)
    await reply.code(200).send({ ok: true })
  }

  app.post(
    '/docuseal',
    {
      schema: {
        tags: ['Webhooks'],
        summary: 'Webhook de DocuSeal',
        description:
          'Recibe eventos de firma (form.completed / form.declined). Protegido por token fijo en el header X-Docuseal-Signature comparado contra DOCUSEAL_WEBHOOK_SECRET. Responde 401 sin detalle si no valida. Al completarse un CONTRATO, activa el Client Portal.',
      },
    },
    docusealHandler,
  )
}
