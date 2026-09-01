import Anthropic from '@anthropic-ai/sdk'
import { env } from '../../config/env'
import type { GenerateTextFn } from './types'

/** Provider Claude (Anthropic). */

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) throw new Error('Claude no configurado (ANTHROPIC_API_KEY)')
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  return client
}

export const claudeGenerate: GenerateTextFn = async (req) => {
  const ai = getClient()
  const res = await ai.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: req.maxOutputTokens,
    temperature: req.temperature,
    system: req.systemInstruction,
    messages: [{ role: 'user', content: req.prompt }],
  })

  // Solo nos interesan los bloques de texto: sin tools no hay tool_use.
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  return { text }
}
