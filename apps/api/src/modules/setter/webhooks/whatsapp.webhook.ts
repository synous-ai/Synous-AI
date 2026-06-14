import { timingSafeEqual } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { env } from '../../../config/env'
import { handleInboundMessage, type NormalizedInbound } from '../setter.service'

/**
 * Webhook de WhatsApp (Evolution API, evento `messages.upsert`).
 *
 * Guardrails: responde 200 en <5s y delega; NUNCA llama al LLM acá. La
 * idempotencia real vive en `handleInboundMessage` (dedup por message_id).
 *
 * Autenticación: Evolution/Baileys no firma HMAC por defecto, así que usamos un
 * SECRETO COMPARTIDO. Si `EVOLUTION_WEBHOOK_SECRET` está configurado, el webhook
 * exige `?token=<secret>` (o header `apikey`/`x-webhook-secret`) y responde 401
 * vacío si no coincide. Sin el secreto seteado, el webhook acepta (dev).
 */

/** Comparación en tiempo constante (evita timing attacks sobre el secreto). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

interface EvolutionWebhookBody {
  event?: string
  instance?: string
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string }
    pushName?: string
    message?: Record<string, unknown>
  }
}

/** Extrae el texto del objeto `message` de Evolution (cubre los casos comunes). */
function extractText(message: Record<string, unknown> | undefined): string | null {
  if (!message) return null
  const conv = message['conversation']
  if (typeof conv === 'string' && conv.trim()) return conv
  const ext = message['extendedTextMessage'] as { text?: string } | undefined
  if (ext?.text && ext.text.trim()) return ext.text
  const ephemeral = message['ephemeralMessage'] as
    | { message?: { extendedTextMessage?: { text?: string }; conversation?: string } }
    | undefined
  const ephText = ephemeral?.message?.extendedTextMessage?.text ?? ephemeral?.message?.conversation
  if (typeof ephText === 'string' && ephText.trim()) return ephText
  return null
}

/** Normaliza el payload de Evolution a un entrante procesable, o null si se ignora. */
export function parseEvolutionInbound(body: EvolutionWebhookBody): NormalizedInbound | null {
  const key = body.data?.key
  if (!key?.remoteJid || !key.id) return null
  // Ignorar mensajes propios (echo) y grupos.
  if (key.fromMe) return null
  if (key.remoteJid.endsWith('@g.us')) return null

  const text = extractText(body.data?.message)
  if (!text) return null // Sprint 0: solo texto (media se deriva en una fase futura)

  const digits = key.remoteJid.split('@')[0]?.replace(/\D/g, '')
  if (!digits) return null

  return {
    from: `+${digits}`,
    name: body.data?.pushName ?? null,
    messageId: key.id,
    text,
    channel: 'whatsapp',
  }
}

export async function setterWhatsappWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/whatsapp',
    {
      schema: {
        tags: ['Setter'],
        summary: 'Webhook de WhatsApp (Evolution)',
        description:
          'Recibe eventos de Evolution API. Responde 200 siempre y procesa de forma asíncrona (dedup por message_id, ventana de 24h, opt-out, encola el turno del agente).',
      },
    },
    async (request, reply) => {
      // 0. Autenticación del webhook (secreto compartido). Si está configurado y
      //    no coincide, 401 vacío (no revelamos nada).
      const secret = env.EVOLUTION_WEBHOOK_SECRET
      if (secret) {
        const headers = request.headers
        const provided =
          (request.query as { token?: string } | undefined)?.token ??
          (headers['apikey'] as string | undefined) ??
          (headers['x-webhook-secret'] as string | undefined)
        if (!provided || !safeEqual(provided, secret)) {
          return reply.code(401).send()
        }
      }

      // 1. Responder rápido — Evolution reintrega si no ve 200.
      reply.code(200).send({ ok: true })

      // 2. Procesar fuera del request (fire-and-forget, idempotente).
      const inbound = parseEvolutionInbound(request.body as EvolutionWebhookBody)
      if (!inbound) return

      handleInboundMessage(inbound)
        .then((outcome) => {
          request.log.info(
            { personPhone: inbound.from, messageId: inbound.messageId, outcome: outcome.status },
            '[setter] mensaje entrante procesado',
          )
        })
        .catch((err) => {
          request.log.error(
            { err, messageId: inbound.messageId },
            '[setter] error procesando mensaje entrante',
          )
        })
    },
  )
}
