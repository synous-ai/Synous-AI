import Anthropic from '@anthropic-ai/sdk'
import type { Content, Part } from '@google/genai'
import { env } from '../../../../config/env'
import { createId } from '../../../../lib/id'
import { TOOL_DECLARATIONS } from '../tools'
import type { GenerateFn } from './types'

/**
 * Provider Claude (Anthropic) del Model Switcher — Sonnet 4.6.
 *
 * El cerebro habla en formato Content[] de Gemini; acá traducimos a/desde el
 * formato de Anthropic. El pareo tool_use ↔ tool_result se hace por el `id` que
 * viaja en functionCall.id / functionResponse.id (el cerebro lo propaga).
 */

// ── Tools: declaraciones Gemini → tools de Anthropic ─────────────────────────

const TYPE_MAP: Record<string, string> = {
  OBJECT: 'object',
  STRING: 'string',
  INTEGER: 'integer',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  ARRAY: 'array',
}

/** Convierte un Schema de Gemini (Type.OBJECT…) a JSON Schema de Anthropic. */
function convertSchema(s: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (s['type']) out['type'] = TYPE_MAP[String(s['type'])] ?? 'string'
  if (s['description']) out['description'] = s['description']
  if (s['enum']) out['enum'] = s['enum']
  if (s['properties']) {
    const props: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(s['properties'] as Record<string, unknown>)) {
      props[k] = convertSchema(v as Record<string, unknown>)
    }
    out['properties'] = props
  }
  if (s['required']) out['required'] = s['required']
  if (s['items']) out['items'] = convertSchema(s['items'] as Record<string, unknown>)
  return out
}

export function toAnthropicTools(): Anthropic.Tool[] {
  return TOOL_DECLARATIONS.map((d) => ({
    name: d.name ?? '',
    description: d.description ?? '',
    input_schema: (d.parameters
      ? convertSchema(d.parameters as unknown as Record<string, unknown>)
      : { type: 'object', properties: {} }) as Anthropic.Tool.InputSchema,
  }))
}

// ── Conversación: Content[] (Gemini) → MessageParam[] (Anthropic) ────────────

function assistantParts(parts: Part[]): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = []
  for (const p of parts) {
    if (p.text) blocks.push({ type: 'text', text: p.text })
    else if (p.functionCall) {
      blocks.push({
        type: 'tool_use',
        id: p.functionCall.id ?? createId(),
        name: p.functionCall.name ?? '',
        input: p.functionCall.args ?? {},
      })
    }
  }
  return blocks
}

function userContent(parts: Part[]): string | Anthropic.ContentBlockParam[] {
  const toolResults = parts.filter((p) => p.functionResponse)
  if (toolResults.length > 0) {
    return toolResults.map((p) => ({
      type: 'tool_result' as const,
      tool_use_id: p.functionResponse!.id ?? '',
      content: JSON.stringify(p.functionResponse!.response ?? {}),
    }))
  }
  return parts
    .map((p) => p.text ?? '')
    .filter(Boolean)
    .join('\n')
}

export function translateToAnthropic(contents: Content[]): Anthropic.MessageParam[] {
  const msgs: Anthropic.MessageParam[] = []
  for (const c of contents) {
    if (c.role === 'model') {
      msgs.push({ role: 'assistant', content: assistantParts(c.parts ?? []) })
    } else {
      msgs.push({ role: 'user', content: userContent(c.parts ?? []) })
    }
  }
  // Une mensajes consecutivos del mismo rol con contenido de texto (Anthropic
  // prefiere alternancia; el lead puede mandar 2 mensajes seguidos).
  const merged: Anthropic.MessageParam[] = []
  for (const m of msgs) {
    const last = merged[merged.length - 1]
    if (last && last.role === m.role && typeof last.content === 'string' && typeof m.content === 'string') {
      last.content = `${last.content}\n${m.content}`
    } else {
      merged.push(m)
    }
  }
  return merged
}

// ── Provider ─────────────────────────────────────────────────────────────────

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('Claude no configurado (ANTHROPIC_API_KEY)')
  }
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  return client
}

export const claudeGenerate: GenerateFn = async (req) => {
  const ai = getClient()
  const res = await ai.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: req.maxOutputTokens,
    temperature: req.temperature,
    system: req.systemInstruction,
    messages: translateToAnthropic(req.contents),
    tools: toAnthropicTools(),
  })

  const functionCalls: { id?: string; name: string; args: Record<string, unknown> }[] = []
  const parts: Part[] = []
  let text = ''

  for (const block of res.content) {
    if (block.type === 'text') {
      text += block.text
      parts.push({ text: block.text })
    } else if (block.type === 'tool_use') {
      functionCalls.push({ id: block.id, name: block.name, args: block.input as Record<string, unknown> })
      parts.push({ functionCall: { id: block.id, name: block.name, args: block.input as Record<string, unknown> } })
    }
  }

  return { functionCalls, text, modelContent: { role: 'model', parts } }
}
