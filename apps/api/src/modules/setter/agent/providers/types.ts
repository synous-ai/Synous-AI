import type { Content } from '@google/genai'

/**
 * Contrato común de los providers de LLM del setter (Model Switcher).
 * Tanto Gemini como Claude implementan `GenerateFn`. La conversación se
 * representa siempre en el formato `Content[]` de Gemini; el provider de Claude
 * traduce hacia/desde el formato de Anthropic internamente.
 */

export type ModelProvider = 'gemini' | 'claude'

export interface AgentFunctionCall {
  /** id de la tool call (lo usa Claude para parear tool_use ↔ tool_result). */
  id?: string
  name: string
  args: Record<string, unknown>
}

export interface GenerateRequest {
  systemInstruction: string
  contents: Content[]
  temperature: number
  maxOutputTokens: number
}

export interface GenerateResult {
  functionCalls: AgentFunctionCall[]
  text: string
  /** Turno crudo del modelo, para reenviar en el próximo hop (preserva firmas/ids). */
  modelContent?: Content
}

export type GenerateFn = (req: GenerateRequest) => Promise<GenerateResult>
