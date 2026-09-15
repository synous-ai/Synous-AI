import { getProvider, type ModelProvider } from '../../lib/ai'
import type { ProposalContent } from './proposals.types'

/**
 * Generación de propuestas con IA.
 *
 * Usa el abstractor de providers de LLM (lib/ai, Gemini/Claude): arma un prompt
 * con la data del onboarding + deal y pide al LLM el contenido de la propuesta
 * en JSON, que parseamos a `ProposalContent`. Si el LLM falla o devuelve algo no
 * parseable, se cae a una propuesta base (fallback) para que el admin nunca
 * quede sin nada que editar.
 *
 * El modelo genera SOLO la parte variable: a quién va dirigida, qué se
 * construye, cuánto sale y la letra chica del proyecto. El método, las
 * garantías, el portfolio y el equipo son fijos y viven en la landing — si la
 * IA los reescribiera por cliente, dejarían de leerse como un proceso.
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

/** Sello de fecha de la portada: "SEPTIEMBRE 2026". */
function currentDateLabel(): string {
  const now = new Date()
  const month = now.toLocaleDateString('es-AR', { month: 'long' }).toUpperCase()
  return `${month} ${now.getFullYear()}`
}

// Instrucción de sistema: la voz de Synous (agencia rioplatense de software a
// medida, 2 personas). Directa, profesional, sin buzzwords vacíos.
const SYSTEM_INSTRUCTION = `Sos el redactor comercial de Synous, una agencia rioplatense de desarrollo de software a medida (web apps, CRMs, automatizaciones, portales). Escribís propuestas claras, concretas y profesionales, en español rioplatense (voseo), sin relleno ni buzzwords vacíos. Hablás de valor de negocio, no de tecnología por la tecnología. Sos honesto y específico: nada de promesas genéricas.

Escribís SOLO la parte de la propuesta que cambia entre clientes. El método de trabajo, las garantías, los casos de éxito y el equipo ya están escritos en la plantilla: NO los generes ni los menciones como si fueran nuevos.

Devolvés SIEMPRE y ÚNICAMENTE un objeto JSON válido (sin markdown, sin texto fuera del JSON) con esta forma exacta:
{
  "clientName": string,        // empresa a la que va dirigida, como se muestra en portada
  "heroLede": string,          // 1-2 frases: qué se construye. Sin saludo ni "esta propuesta"

  "scopeHeading": string,      // titular corto del alcance, ej "Dos proyectos."
  "scopeLede": string,         // 1-2 frases que enmarcan el alcance
  "scopePhases": [             // 1-3 bloques de lo que se construye
    { "label": string,         // "FASE 01"
      "title": string,         // nombre corto del entregable
      "body": string }         // qué incluye, 2-4 frases concretas
  ],

  "investmentHeading": string, // titular del bloque de precios
  "investmentPhases": [        // una entrada por fase cotizada
    { "name": string,
      "price": string,         // "USD 2.000". Omitir si usás "options"
      "includes": string[],    // 5-10 items concretos de lo que entra
      "payment": string,       // condiciones, ej "50% al inicio · 50% antes del lanzamiento"
      "options": [             // SOLO si la fase admite varias formas de pago
        { "label": string, "price": string, "terms": string }
      ]
    }
  ],
  "investmentNote": string,    // aclaración de cierre del bloque de precios

  "termsNote": string,         // qué condiciona las fechas acordadas
  "exclusions": string[],      // 4-8 cosas que NO entran en esta cotización

  "extraFaq": [                // 0-3 preguntas propias de ESTE proyecto
    { "question": string, "answer": string }
  ]
}

El total de la inversión DEBE caer dentro del rango de presupuesto del cliente.`

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

  return `Generá el contenido variable de la propuesta para este lead. Sé específico para SU caso (no genérico).

DATOS DEL LEAD:
${lines.join('\n')}`
}

/**
 * Parseo tolerante: el modelo a veces envuelve el JSON en \`\`\`json … \`\`\` o agrega
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
    prompt: buildPrompt(input),
    temperature: 0.8,
    maxOutputTokens: 8192,
  })
  const parsed = safeJsonParse(result.text) as Partial<ProposalContent>

  // Normalización: el modelo puede omitir campos o devolver null. La fecha nunca
  // la genera — sale del reloj, no del prompt.
  return {
    clientName: parsed.clientName || input.companyName || input.contactName,
    dateLabel: currentDateLabel(),
    heroLede: parsed.heroLede ?? '',

    // Los campos que el modelo omita quedan vacíos, no con un placeholder: el
    // vacío cae a la plantilla al renderizar, el placeholder la pisa.
    scopeHeading: parsed.scopeHeading ?? '',
    scopeLede: parsed.scopeLede ?? '',
    scopePhases: parsed.scopePhases ?? [],
    ...(parsed.scopePaths?.length ? { scopePaths: parsed.scopePaths } : {}),

    investmentHeading: parsed.investmentHeading ?? '',
    investmentPhases: parsed.investmentPhases ?? [],
    ...(parsed.investmentNote ? { investmentNote: parsed.investmentNote } : {}),

    termsNote: parsed.termsNote ?? '',
    exclusions: parsed.exclusions ?? [],

    ...(parsed.extraFaq?.length ? { extraFaq: parsed.extraFaq } : {}),
  }
}

/**
 * Propuesta base (fallback) cuando no hay IA disponible o falla la generación.
 * Deja la estructura armada para que el admin la complete a mano: es un punto
 * de partida editable, no un borrador presentable.
 */
export function fallbackProposalContent(input: ProposalGenerationInput): ProposalContent {
  return {
    // Lo único que el fallback sabe de verdad: a quién va dirigida y cuándo.
    clientName: input.companyName || input.contactName,
    dateLabel: currentDateLabel(),

    // Todo lo demás va vacío A PROPÓSITO. Un campo vacío cae a la plantilla al
    // renderizarse; un placeholder como "Alcance del proyecto." la PISA, y la
    // propuesta sale con relleno en vez del texto real. El fallback significa
    // "no tengo nada que decir acá", no "invento algo".
    heroLede: '',
    scopeHeading: '',
    scopeLede: '',
    scopePhases: [],
    investmentHeading: '',
    investmentPhases: [],
    termsNote: '',
    exclusions: [],
  }
}
