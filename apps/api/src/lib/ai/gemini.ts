import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { env } from '../../config/env'
import type { GenerateTextFn } from './types'

/**
 * Provider Gemini (Vertex AI).
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

export const geminiGenerate: GenerateTextFn = async (req) => {
  const ai = getClient()
  const res = await ai.models.generateContent({
    model: env.VERTEX_MODEL,
    contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
    config: {
      systemInstruction: req.systemInstruction,
      temperature: req.temperature,
      maxOutputTokens: req.maxOutputTokens,
      // Generar una propuesta o una próxima acción es redacción con formato
      // fijo, no razonamiento profundo: thinking bajo = más rápido y barato.
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  })
  return { text: res.text ?? '' }
}
