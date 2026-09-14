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
import { handleDocusealWebhook } from '../documents/docuseal.service'

// Esquemas permisivos: `.nullish()` y no `.optional()` porque los proveedores
// mandan `null` en campos vacíos, y un payload válido rechazado acá se responde
// 200 y se pierde para siempre (el proveedor no reintenta).
const FathomWebhookSchema = z.object({
  title: z.string().nullish(),
  starts_at: z.string().nullish(),
  ends_at: z.string().nullish(),
  summary: z.string().nullish(),
  transcript_url: z.string().nullish(),
  action_items: z.array(z.unknown()).nullish(),
  participants: z
    .array(
      z.object({
        email: z.string().nullish(),
        name: z.string().nullish(),
      }),
    )
    .nullish(),
})

const DocusealWebhookSchema = z
  .object({
    event_type: z.string().nullish(),
    data: z
      .object({
        slug: z.string().nullish(),
        submission_id: z.number().nullish(),
        status: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough()

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

    // Se valida DESPUÉS de la firma (un 400 antes revelaría el endpoint). Un
    // payload inválido se responde 200: reintentar no lo va a arreglar.
    const payload = FathomWebhookSchema.safeParse(request.body)
    if (!payload.success) {
      request.log.warn({ issues: payload.error.issues }, 'Webhook de Fathom con payload inválido, ignorado')
      await reply.code(200).send({ ok: true })
      return
    }

    await handleFathomWebhook(payload.data)
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
    const payload = DocusealWebhookSchema.safeParse(request.body)
    if (!payload.success) {
      request.log.warn({ issues: payload.error.issues }, 'Webhook de DocuSeal con payload inválido, ignorado')
      await reply.code(200).send({ ok: true })
      return
    }

    await handleDocusealWebhook(payload.data)
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
