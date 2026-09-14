/**
 * types.ts — Contrato de generación de texto con LLM.
 *
 * Esta abstracción vivía dentro del módulo setter (`agent/providers`), atada a
 * su loop agéntico: hablaba en `Content[]` de Gemini y mandaba SIEMPRE las
 * TOOL_DECLARATIONS del setter, incluso cuando quien llamaba era el generador
 * de propuestas, que no usa tools. Al eliminar el setter se extrajo acá y se
 * redujo a lo que sus consumidores reales necesitan: un turno de texto y una
 * respuesta de texto.
 */

/** Modelos soportados por el switcher. */
export type ModelProvider = 'gemini' | 'claude'

export interface GenerateTextRequest {
  /** Instrucción de sistema (rol / formato de salida esperado). */
  systemInstruction: string
  /** Prompt del usuario. Un solo turno: no hay conversación multi-hop. */
  prompt: string
  temperature: number
  maxOutputTokens: number
}

export interface GenerateTextResult {
  text: string
}

export type GenerateTextFn = (req: GenerateTextRequest) => Promise<GenerateTextResult>

/**
 * Tope por llamada a un modelo. Generar una propuesta o una próxima acción corre
 * dentro de un request HTTP: sin tope, los SDKs esperan minutos y el request
 * muere por el límite de la plataforma en vez de caer al fallback que ya existe.
 */
export const AI_REQUEST_TIMEOUT_MS = 30_000
