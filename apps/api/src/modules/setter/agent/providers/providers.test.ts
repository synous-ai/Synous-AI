/**
 * providers.test.ts — Model Switcher (unitario, sin pegarle a ningún LLM)
 *
 * Testea las piezas puras del provider de Claude (traducción de formato y mapeo
 * de tools) y la selección de provider. No hace llamadas a Vertex ni a Anthropic.
 */

import { describe, it, expect } from 'vitest'
import type { Content } from '@google/genai'
import { translateToAnthropic, toAnthropicTools } from './claude.provider'
import { geminiGenerate } from './gemini.provider'
import { claudeGenerate } from './claude.provider'
import { getProvider } from './index'

describe('getProvider', () => {
  it("'claude' → claudeGenerate; default → geminiGenerate", () => {
    expect(getProvider('claude')).toBe(claudeGenerate)
    expect(getProvider('gemini')).toBe(geminiGenerate)
    expect(getProvider('lo-que-sea')).toBe(geminiGenerate)
  })
})

describe('toAnthropicTools', () => {
  it('mapea las 5 tools a JSON Schema de Anthropic', () => {
    const tools = toAnthropicTools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      'book_appointment',
      'check_availability',
      'handoff_to_human',
      'mark_not_interested',
      'save_qualification',
    ])
    const book = tools.find((t) => t.name === 'book_appointment')!
    expect(book.input_schema.type).toBe('object')
    expect((book.input_schema as { required?: string[] }).required).toContain('startsAt')
    const check = tools.find((t) => t.name === 'check_availability')!
    expect((check.input_schema as { properties?: Record<string, unknown> }).properties).toHaveProperty(
      'preferredRange',
    )
  })
})

describe('translateToAnthropic', () => {
  it('traduce user/model + tool_use/tool_result pareados por id', () => {
    const contents: Content[] = [
      { role: 'user', parts: [{ text: 'hola' }] },
      {
        role: 'model',
        parts: [{ functionCall: { id: 'call_1', name: 'save_qualification', args: { pain: 'x' } } }],
      },
      {
        role: 'user',
        parts: [{ functionResponse: { id: 'call_1', name: 'save_qualification', response: { ok: true } } }],
      },
      { role: 'model', parts: [{ text: 'buenísimo' }] },
    ]
    const msgs = translateToAnthropic(contents)

    expect(msgs[0]).toEqual({ role: 'user', content: 'hola' })

    expect(msgs[1]!.role).toBe('assistant')
    const toolUse = (msgs[1]!.content as unknown as Array<Record<string, unknown>>)[0]!
    expect(toolUse).toMatchObject({ type: 'tool_use', id: 'call_1', name: 'save_qualification', input: { pain: 'x' } })

    const toolResult = (msgs[2]!.content as unknown as Array<Record<string, unknown>>)[0]!
    expect(toolResult).toMatchObject({ type: 'tool_result', tool_use_id: 'call_1' })

    expect(msgs[3]!.role).toBe('assistant')
    expect((msgs[3]!.content as unknown as Array<Record<string, unknown>>)[0]).toMatchObject({
      type: 'text',
      text: 'buenísimo',
    })
  })

  it('une mensajes de texto consecutivos del mismo rol', () => {
    const contents: Content[] = [
      { role: 'user', parts: [{ text: 'a' }] },
      { role: 'user', parts: [{ text: 'b' }] },
    ]
    const msgs = translateToAnthropic(contents)
    expect(msgs).toEqual([{ role: 'user', content: 'a\nb' }])
  })
})
