import { getProvider, type ModelProvider } from '../setter/agent/providers'
import type { ProposalContent } from './proposals.types'

/**
 * Generación de propuestas con IA.
 *
 * Reusa el abstraction de providers del Setter (Model Switcher Gemini/Claude):
 * arma un prompt con la data del onboarding + deal y pide al LLM una propuesta
 * estructurada en JSON, que parseamos a `ProposalContent`. Si el LLM falla o
 * devuelve algo no parseable, se cae a una propuesta base (fallback) para que el
 * admin nunca quede sin nada que editar.
 */

export interface ProposalGenerationInput {
  contactName: string
  companyName?: string
  projectType?: string
  mainGoal?: string
  currentSolution?: string
  clarity?: string
  budget?: string
  startWhen?: string
  deadline?: string
  currentCrm?: string
  toAutomate?: string
  priority?: string
}

// Etiquetas legibles para darle CONTEXTO al modelo (no son las keys del enum).
const PROJECT_TYPE_LABEL: Record<string, string> = {
  webapp: 'Web App / Plataforma a medida',
  crm: 'CRM / Sistema de gestión a medida',
  automatizacion: 'Automatización / Integraciones',
  portal: 'Portal de clientes',
  otro: 'Proyecto de software a medida',
}
const GOAL_LABEL: Record<string, string> = {
  operacion: 'ordenar y automatizar la operación',
  escalar: 'escalar el negocio',
  reemplazar: 'reemplazar planillas/herramientas actuales',
  lanzar: 'lanzar un producto',
}
const BUDGET_RANGE: Record<string, string> = {
  '<2000': 'menos de USD 2.000',
  '2000-5000': 'USD 2.000 a 5.000',
  '5000-10000': 'USD 5.000 a 10.000',
  '10000+': 'más de USD 10.000',
}
const PRIORITY_LABEL: Record<string, string> = {
  precio: 'el precio',
  velocidad: 'la velocidad de entrega',
  calidad: 'la calidad',
  escalabilidad: 'la escalabilidad',
}

// Instrucción de sistema: la voz de NOUS (agencia rioplatense de software a
// medida, 2 personas). Directa, profesional, sin buzzwords vacíos.
const SYSTEM_INSTRUCTION = `Sos el redactor comercial de NOUS, una agencia rioplatense de desarrollo de software a medida (web apps, CRMs, automatizaciones, portales). Escribís propuestas claras, concretas y profesionales, en español rioplatense (voseo), sin relleno ni buzzwords vacíos. Hablás de valor de negocio, no de tecnología por la tecnología. Sos honesto y específico: nada de promesas genéricas.

Devolvés SIEMPRE y ÚNICAMENTE un objeto JSON válido (sin markdown, sin texto fuera del JSON) con esta forma exacta:
{
  "title": string,            // ej: "Propuesta — CRM a medida para Acme"
  "clientName": string,
  "companyName": string,      // "" si no hay
  "tagline": string,          // una línea de gancho
  "summary": string,          // 1 párrafo, resumen ejecutivo
  "understanding": string,    // qué entendimos de su situación (2-4 frases)
  "objectives": string[],     // 3-5 objetivos del proyecto
  "solution": string,         // qué vamos a construir (1-2 párrafos)
  "scope": [{ "title": string, "description": string }],   // 4-6 entregables
  "timeline": [{ "phase": string, "duration": string, "detail": string }], // 3-5 fases
  "pricing": {
    "items": [{ "label": string, "amount": number }],      // desglose
    "total": number,          // total en USD, DENTRO del rango de presupuesto del cliente
    "currency": "USD",
    "note": string            // condiciones de pago, ej "50% al inicio, 50% a la entrega"
  },
  "whyUs": string[],          // 3-4 diferenciales de NOUS
  "nextSteps": string,        // cierre / próximos pasos
  "terms": string             // términos breves (validez, revisiones, etc.)
}`

function buildPrompt(input: ProposalGenerationInput): string {
  const lines: string[] = []
  lines.push(`Cliente: ${input.contactName}${input.companyName ? ` (${input.companyName})` : ''}`)
  if (input.projectType) lines.push(`Tipo de proyecto: ${PROJECT_TYPE_LABEL[input.projectType] ?? input.projectType}`)
  if (input.mainGoal) lines.push(`Objetivo principal: ${GOAL_LABEL[input.mainGoal] ?? input.mainGoal}`)
  if (input.currentSolution) lines.push(`Cómo lo resuelve hoy: ${input.currentSolution}`)
  if (input.currentCrm) lines.push(`Herramientas/CRM actual: ${input.currentCrm}`)
  if (input.toAutomate) lines.push(`Qué quiere automatizar: ${input.toAutomate}`)
  if (input.priority) lines.push(`Lo que más le importa: ${PRIORITY_LABEL[input.priority] ?? input.priority}`)
  if (input.budget) lines.push(`Presupuesto: ${BUDGET_RANGE[input.budget] ?? input.budget}`)
  if (input.startWhen) lines.push(`Cuándo quiere empezar: ${input.startWhen}`)
  if (input.deadline) lines.push(`Fecha límite: ${input.deadline}`)
  if (input.clarity) lines.push(`Nivel de claridad del cliente: ${input.clarity}`)

  return `Generá una propuesta comercial para este lead. El total de la inversión DEBE caer dentro de su rango de presupuesto. Sé específico para SU caso (no genérico).

DATOS DEL LEAD:
${lines.join('\n')}`
}

/**
 * Parseo tolerante: el modelo a veces envuelve el JSON en ```json … ``` o agrega
 * texto. Sacamos las fences y, si hace falta, recortamos al primer `{` … `}`.
 */
function safeJsonParse(text: string): unknown {
  let t = text.trim()
  // Quitar fences de markdown si vinieron.
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  try {
    return JSON.parse(t)
  } catch {
    const first = t.indexOf('{')
    const last = t.lastIndexOf('}')
    if (first !== -1 && last !== -1 && last > first) {
      return JSON.parse(t.slice(first, last + 1))
    }
    throw new Error('La IA no devolvió un JSON válido')
  }
}

/**
 * Genera el contenido de la propuesta con el provider indicado (Model Switcher).
 * Si algo falla, lanza para que el caller decida (típicamente cae al fallback).
 */
export async function generateProposalContent(
  input: ProposalGenerationInput,
  provider: ModelProvider = 'gemini',
): Promise<ProposalContent> {
  const generate = getProvider(provider)
  const result = await generate({
    systemInstruction: SYSTEM_INSTRUCTION,
    contents: [{ role: 'user', parts: [{ text: buildPrompt(input) }] }],
    temperature: 0.8,
    maxOutputTokens: 8192,
  })
  const parsed = safeJsonParse(result.text) as ProposalContent
  // Normalización mínima: garantizamos arrays y currency.
  return {
    title: parsed.title ?? `Propuesta para ${input.contactName}`,
    clientName: parsed.clientName ?? input.contactName,
    companyName: parsed.companyName || input.companyName,
    tagline: parsed.tagline,
    summary: parsed.summary ?? '',
    understanding: parsed.understanding ?? '',
    objectives: parsed.objectives ?? [],
    solution: parsed.solution ?? '',
    scope: parsed.scope ?? [],
    timeline: parsed.timeline ?? [],
    pricing: {
      items: parsed.pricing?.items ?? [],
      total: parsed.pricing?.total ?? 0,
      currency: parsed.pricing?.currency ?? 'USD',
      note: parsed.pricing?.note,
    },
    whyUs: parsed.whyUs ?? [],
    nextSteps: parsed.nextSteps ?? '',
    terms: parsed.terms,
  }
}

/**
 * Propuesta base (fallback) cuando no hay IA disponible o falla la generación.
 * Deja una estructura editable para que el admin la complete a mano.
 */
export function fallbackProposalContent(input: ProposalGenerationInput): ProposalContent {
  const projectLabel = input.projectType ? PROJECT_TYPE_LABEL[input.projectType] ?? 'Proyecto a medida' : 'Proyecto a medida'
  return {
    title: `Propuesta — ${projectLabel}${input.companyName ? ` para ${input.companyName}` : ''}`,
    clientName: input.contactName,
    companyName: input.companyName,
    tagline: 'Software a medida para tu negocio',
    summary: 'Completá este resumen con el enfoque propuesto para el cliente.',
    understanding: input.currentSolution ?? '',
    objectives: [],
    solution: '',
    scope: [],
    timeline: [],
    pricing: { items: [], total: 0, currency: 'USD' },
    whyUs: [
      'Equipo chico y senior: hablás directo con quien construye.',
      'Software a medida, sin plantillas ni ataduras.',
    ],
    nextSteps: 'Coordinemos una llamada para repasar la propuesta y arrancar.',
  }
}
