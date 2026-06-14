/**
 * Contrato del canal de mensajería del setter.
 *
 * Todo el agente (brain, tools, cola de aprobación) habla SIEMPRE contra esta
 * interfaz, nunca contra un canal concreto. Eso permite swapear Evolution
 * (Baileys, MVP) por la Cloud API oficial más adelante sin tocar el cerebro.
 *
 * Sprint 0: la única implementación es `EvolutionProvider`. Los métodos de envío
 * (`sendText`, `sendSplitMessages`) se completan en Fase 2; acá solo se define
 * el contrato para que el resto del sistema se construya contra él.
 */

/** Estado de la ventana de servicio (24h desde el último mensaje del lead). */
export interface WindowState {
  /** ¿Hay ventana abierta? → se puede mandar free-form gratis. */
  open: boolean
  /** Cuándo cierra la ventana (último msg del lead + 24h), si se conoce. */
  expiresAt: Date | null
}

/** Resultado de un envío por el canal. */
export interface SendResult {
  /** id del mensaje en el canal (para idempotencia / tracking). */
  channelMessageId: string | null
  /** ¿El canal aceptó el envío? */
  ok: boolean
}

export interface MessagingProvider {
  /** Envía un único mensaje de texto a un destinatario (E.164 / jid). */
  sendText(to: string, text: string): Promise<SendResult>

  /**
   * Envía una respuesta larga partida en 2-3 burbujas, con "escribiendo…" y
   * delays variables entre cada una (~1.5-4s). Autenticidad + anti-ban.
   * (Implementación real en Fase 2.)
   */
  sendSplitMessages(to: string, parts: string[]): Promise<SendResult[]>

  /** Estado de la ventana de servicio para un destinatario. */
  getWindowState(to: string): Promise<WindowState>

  /** Marca como leído el último mensaje entrante del destinatario. */
  markRead(to: string, channelMessageId: string): Promise<void>

  /**
   * Detección simple de opt-out por keywords ("no me escribas más", "bajame",
   * "stop", …). El chequeo del LLM es complementario y vive en el brain.
   */
  detectOptOut(text: string): boolean
}
