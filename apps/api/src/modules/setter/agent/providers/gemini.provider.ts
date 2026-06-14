import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { env } from '../../../../config/env'
import { TOOL_DECLARATIONS } from '../tools'
import type { GenerateFn } from './types'

/**
 * Provider Gemini (Vertex AI) del Model Switcher.
 * Auth: service account JSON en GOOGLE_SERVICE_ACCOUNT_JSON.
 */

let client: GoogleGenAI | null = null

function getClient(): GoogleGenAI {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error('Gemini no configurado (GOOGLE_SERVICE_ACCOUNT_JSON)')
  }
  if (client) return client
  const credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON) as { project_id?: string }
  if (!credentials.project_id) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON sin project_id')
  client = new GoogleGenAI({
    vertexai: true,
    project: credentials.project_id,
    location: env.VERTEX_LOCATION,
    googleAuthOptions: { credentials },
  })
  return client
}

export const geminiGenerate: GenerateFn = async (req) => {
  const ai = getClient()
  const res = await ai.models.generateContent({
    model: env.VERTEX_MODEL,
    contents: req.contents,
    config: {
      systemInstruction: req.systemInstruction,
      temperature: req.temperature,
      maxOutputTokens: req.maxOutputTokens,
      // Un setter ejecuta un framework, no razona profundo: thinking bajo =
      // más rápido, más barato y deja tokens para el mensaje.
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
    },
  })
  const functionCalls = (res.functionCalls ?? []).map((f) => ({
    id: f.id,
    name: f.name ?? '',
    args: (f.args ?? {}) as Record<string, unknown>,
  }))
  return { functionCalls, text: res.text ?? '', modelContent: res.candidates?.[0]?.content }
}
