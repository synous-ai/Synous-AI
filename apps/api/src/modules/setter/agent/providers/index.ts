import type { GenerateFn } from './types'
import { geminiGenerate } from './gemini.provider'
import { claudeGenerate } from './claude.provider'

export * from './types'

/** Resuelve el provider de LLM según la config del tenant (Model Switcher). */
export function getProvider(provider: string): GenerateFn {
  return provider === 'claude' ? claudeGenerate : geminiGenerate
}
