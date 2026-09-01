import type { GenerateTextFn } from './types'
import { geminiGenerate } from './gemini'
import { claudeGenerate } from './claude'

export * from './types'

/**
 * Resuelve el provider de LLM. Cualquier valor desconocido cae a Gemini, que es
 * el default histórico (antes lo decidía `setter_tenant.model_provider`).
 */
export function getProvider(provider: string): GenerateTextFn {
  return provider === 'claude' ? claudeGenerate : geminiGenerate
}
