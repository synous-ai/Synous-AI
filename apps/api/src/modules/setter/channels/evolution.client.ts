import axios, { type AxiosInstance } from 'axios'
import { env } from '../../../config/env'
import type { MessagingProvider, SendResult, WindowState } from './messaging-provider'

/**
 * Cliente del canal WhatsApp vía Evolution API (modo Baileys) — MVP del setter.
 *
 * Sprint 0 (Fase 0): solo wiring + `ping()`. Si faltan las env de Evolution, el
 * cliente reporta `not_configured` sin romper (solo Vertex está vivo hoy). Los
 * métodos de envío se implementan en Fase 2.
 */

export type EvolutionPing =
  | { configured: false; status: 'not_configured' }
  | { configured: true; status: string; reachable: boolean }

/**
 * Keywords de opt-out (detección simple, complementada por el chequeo del LLM en
 * el brain). Se normaliza el texto sin acentos antes de comparar.
 */
const OPT_OUT_KEYWORDS = [
  'no me escribas mas',
  'no me escriban mas',
  'dejame de escribir',
  'dejenme de escribir',
  'no me contactes',
  'no quiero que me escriban',
  'bajame de la lista',
  'bajame',
  'desuscribir',
  'darme de baja',
  'stop',
  'unsubscribe',
]

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

export class EvolutionProvider implements MessagingProvider {
  private readonly http: AxiosInstance | null

  constructor() {
    this.http =
      env.EVOLUTION_API_URL && env.EVOLUTION_API_KEY
        ? axios.create({
            baseURL: env.EVOLUTION_API_URL,
            headers: { apikey: env.EVOLUTION_API_KEY },
            timeout: 8000,
          })
        : null
  }

  /** ¿Están las tres env (URL + key + instance) presentes? */
  isConfigured(): boolean {
    return Boolean(env.EVOLUTION_API_URL && env.EVOLUTION_API_KEY && env.EVOLUTION_INSTANCE)
  }

  /**
   * Estado de la instancia de Evolution. Sin config → `not_configured`.
   * Con config pero inalcanzable → `unreachable` (no tira excepción: lo reporta).
   */
  async ping(): Promise<EvolutionPing> {
    if (!this.http || !env.EVOLUTION_INSTANCE) {
      return { configured: false, status: 'not_configured' }
    }
    try {
      const res = await this.http.get(`/instance/connectionState/${env.EVOLUTION_INSTANCE}`)
      const state =
        (res.data as { instance?: { state?: string }; state?: string })?.instance?.state ??
        (res.data as { state?: string })?.state ??
        'unknown'
      return { configured: true, status: String(state), reachable: true }
    } catch {
      return { configured: true, status: 'unreachable', reachable: false }
    }
  }

  /** Opt-out por keywords. El opt-out es no negociable (guardrail Sprint 0). */
  detectOptOut(text: string): boolean {
    const normalized = normalize(text)
    return OPT_OUT_KEYWORDS.some((k) => normalized.includes(k))
  }

  // ── Envío (Fase 2) ───────────────────────────────────────────────────────

  /** Garantiza que el cliente está configurado o lanza con un mensaje claro. */
  private requireHttp(): AxiosInstance {
    if (!this.http || !env.EVOLUTION_INSTANCE) {
      throw new Error('Evolution no configurado (EVOLUTION_API_URL/KEY/INSTANCE)')
    }
    return this.http
  }

  /** Envía un único texto. `number` para Evolution = dígitos sin `+`. */
  async sendText(to: string, text: string): Promise<SendResult> {
    const http = this.requireHttp()
    const res = await http.post(`/message/sendText/${env.EVOLUTION_INSTANCE}`, {
      number: toNumber(to),
      text,
    })
    const channelMessageId =
      (res.data as { key?: { id?: string } })?.key?.id ?? null
    return { channelMessageId, ok: true }
  }

  /**
   * Envía una respuesta partida en burbujas con "escribiendo…" y delays
   * variables (~1.5–4s) entre cada una. Autenticidad humana + anti-ban.
   */
  async sendSplitMessages(to: string, parts: string[]): Promise<SendResult[]> {
    const http = this.requireHttp()
    const number = toNumber(to)
    const results: SendResult[] = []

    for (const part of parts) {
      const delayMs = randomDelayMs()
      // Mostrar "escribiendo…" mientras "tipea" (presence composing).
      try {
        await http.post(`/chat/sendPresence/${env.EVOLUTION_INSTANCE}`, {
          number,
          presence: 'composing',
          delay: delayMs,
        })
      } catch {
        // La presencia es best-effort: si falla, igual mandamos el texto.
      }
      await sleep(delayMs)
      results.push(await this.sendText(to, part))
    }

    return results
  }

  /**
   * Estado de la ventana de servicio. En Baileys no existe la ventana paga de
   * Meta (no se cobra por mensaje), así que para el canal siempre está "abierta".
   * El control económico/temporal real vive en `setter_lead.windowExpiresAt`.
   */
  async getWindowState(_to: string): Promise<WindowState> {
    return { open: true, expiresAt: null }
  }

  /** Marca como leído el último mensaje entrante (best-effort). */
  async markRead(to: string, channelMessageId: string): Promise<void> {
    const http = this.requireHttp()
    await http.post(`/chat/markMessageAsRead/${env.EVOLUTION_INSTANCE}`, {
      readMessages: [{ remoteJid: `${toNumber(to)}@s.whatsapp.net`, id: channelMessageId }],
    })
  }
}

/** Convierte "+549..." al formato que espera Evolution (solo dígitos). */
function toNumber(to: string): string {
  return to.replace(/\D/g, '')
}

/** Delay humano entre burbujas: 1.5–4s. */
function randomDelayMs(): number {
  return 1500 + Math.floor(Math.random() * 2500)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Parte un texto largo en 2-3 burbujas para que se sienta humano (un humano no
 * manda un párrafo perfecto). Corta por líneas/oraciones sin romper palabras.
 */
export function splitIntoBubbles(text: string, maxBubbles = 3): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  // Preferir cortes naturales: saltos de línea, luego fin de oración.
  const byLines = trimmed
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const units = byLines.length > 1 ? byLines : trimmed.split(/(?<=[.?!])\s+/).filter(Boolean)

  if (units.length <= 1) return [trimmed]
  if (units.length <= maxBubbles) return units

  // Agrupar en `maxBubbles` chunks balanceados manteniendo el orden.
  const perBubble = Math.ceil(units.length / maxBubbles)
  const bubbles: string[] = []
  for (let i = 0; i < units.length; i += perBubble) {
    bubbles.push(units.slice(i, i + perBubble).join(' '))
  }
  return bubbles
}

/** Instancia compartida del provider (un solo negocio en Sprint 0). */
export const evolutionProvider = new EvolutionProvider()
