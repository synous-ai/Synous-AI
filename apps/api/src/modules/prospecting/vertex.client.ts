import { GoogleGenAI, Type } from '@google/genai'
import { env } from '../../config/env'

/**
 * Cliente de Vertex AI (Gemini). Analiza un negocio y arma una secuencia de
 * setting (outreach conversacional) lista para usar, devuelta como JSON.
 *
 * Auth: service account JSON completo en GOOGLE_SERVICE_ACCOUNT_JSON.
 * Si no está configurado, analyzeBusiness devuelve null (el prospecto se
 * guarda igual, sin análisis) — el módulo no depende de la IA para funcionar.
 */

export interface BusinessInput {
  name: string
  types: string[]
  website: string | null
  rating: number | null
  address: string | null
  ourServices: string | null
}

/** Una objeción probable + cómo se contesta (validar + pregunta/reencuadre). */
export interface SettingObjection {
  objection: string
  response: string
}

/** Secuencia conversacional de setting (los mensajes que SÍ se envían). */
export interface SettingSequence {
  opener: string
  problemQuestions: string[]
  bookingMessage: string
  confirmationMessage: string
}

export interface BusinessAnalysis {
  // ── Análisis interno (no se envía; orienta al setter) ──
  analysis: string
  opportunityScore: number
  proposalType: 'automation' | 'web_app' | 'both'
  painPoints: string[]
  solution: string
  mvpScope: string[]
  estimatedValueUsd: number
  // ── Material de outreach ──
  sequence: SettingSequence
  objections: SettingObjection[]
}

let client: GoogleGenAI | null = null

export function isVertexConfigured(): boolean {
  return Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON)
}

function getClient(): GoogleGenAI | null {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) return null
  if (client) return client

  let credentials: { project_id?: string }
  try {
    credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON)
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no es un JSON válido')
  }
  if (!credentials.project_id) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no contiene project_id')
  }

  client = new GoogleGenAI({
    vertexai: true,
    project: credentials.project_id,
    location: env.VERTEX_LOCATION,
    googleAuthOptions: { credentials },
  })
  return client
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    analysis: { type: Type.STRING },
    opportunityScore: { type: Type.INTEGER },
    proposalType: { type: Type.STRING, enum: ['automation', 'web_app', 'both'] },
    painPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
    solution: { type: Type.STRING },
    mvpScope: { type: Type.ARRAY, items: { type: Type.STRING } },
    estimatedValueUsd: { type: Type.INTEGER },
    sequence: {
      type: Type.OBJECT,
      properties: {
        opener: { type: Type.STRING },
        problemQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
        bookingMessage: { type: Type.STRING },
        confirmationMessage: { type: Type.STRING },
      },
      required: ['opener', 'problemQuestions', 'bookingMessage', 'confirmationMessage'],
    },
    objections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          objection: { type: Type.STRING },
          response: { type: Type.STRING },
        },
        required: ['objection', 'response'],
      },
    },
  },
  required: [
    'analysis',
    'opportunityScore',
    'proposalType',
    'painPoints',
    'solution',
    'mvpScope',
    'estimatedValueUsd',
    'sequence',
    'objections',
  ],
}

const SYSTEM_INSTRUCTION = `Sos un consultor senior de una agencia de desarrollo web y automatización Y un appointment setter experto que prospecta a negocios argentinos.
Tu trabajo es analizar un negocio y armar la secuencia de mensajes para iniciar una conversación que termine en una llamada agendada.

PRINCIPIOS DE SETTING (obligatorios, son la base de todo):
1. OPENER GENUINO: el primer mensaje arranca con algo específico y verdadero de ESE negocio (rubro, ubicación, reputación, que no tiene web). PROHIBIDO el halago genérico tipo "felicitaciones por tu perfil".
2. RAZÓN PARA RESPONDER: dale a la persona un motivo real para contestar. Lo más natural es una pregunta genuina y relevante a su rubro (algo que de verdad querrías saber de su negocio), no "para conocerte mejor". Si encaja sin forzar, podés mencionar algo útil que le podrías pasar, dicho casual, NUNCA como oferta de marketing. Si no encaja natural, no lo metas: la pregunta sola alcanza.
3. PRIMERO EL PROBLEMA, DESPUÉS EL LINK: el opener NO vende la solución ni pide la reunión. Primero se saca a la luz el problema con preguntas; recién después se invita a agendar.
4. NUNCA MOSTRAR NECESIDAD: no persigas ni sobreexpliques. Siempre dejá claro POR QUÉ preguntás o proponés algo, desde el lugar de querer ayudar, no de querer venderle.
5. LENGUAJE SIMPLE Y CONCRETO (clave en Argentina): hablá derecho, sin inflar. Nada de "transformar tu negocio", "programa", "solución integral" ni promesas grandilocuentes: eso genera desconfianza, no deseo. En vez de "agilizar la recepción de facturas" decí "que no tengas que andar persiguiendo a los clientes por los comprobantes". Si una frase suena más grande de lo que es, achicala.
6. OBJECIONES: validá en una frase corta (sin frases hechas) y seguí con UNA pregunta o un reencuadre que abra la conversación, no con un argumento de venta ni con presión. Si la persona dice que no en serio, se la deja ir sin insistir.
7. La invitación a agendar se enmarca en EL PROBLEMA y EL OBJETIVO puntual de la persona, y da la razón concreta por la que vale la pena esa charla.

SONÁ HUMANO (lo más importante de todo): los mensajes los lee una persona real. NO pueden parecer escritos por una IA ni por una plantilla. Si suenan a folleto o a vendedor, fallaste.
- Escribí como le escribirías a un conocido por WhatsApp: frases CORTAS, directas, naturales. Nada de párrafos largos ni perfectos.
- CERCANO PERO CON RESPETO, NO ZALAMERO: la calidez se gana, no se finge en el primer mensaje. Nada de apodos ("crack", "campeón", "genio") ni efusividad fingida. Un "Hola [Nombre], ¿cómo va?" funciona mejor que cualquier apodo o emoji.
- PROHIBIDAS las muletillas de IA/vendedor: "Entiendo,", "Comprendo que", "Lógico,", "Excelente,", "Por supuesto", "Es importante destacar", "En este sentido", "Espero que estés muy bien".
- PROHIBIDO el vocabulario corporativo/buzzword: "cuello de botella", "agilizar", "optimizar", "carga operativa", "solución integral", "plan de acción", "diagnóstico gratuito", "impecable", "potenciar", "maximizar", "de forma definitiva", "sinergia", "implementar una solución", "transformar tu negocio", "programa" (como eufemismo de servicio), "sesión" (como eufemismo de llamada).
- Usá palabras simples y cotidianas.
- Natural NO es matero: no sobrecargues de lunfardo ("chusmear", "una charlita", "los re bancan"). Profesional relajado, no amigo del barrio.
- Está bien transparentar que es prospección ("te escribo porque laburamos con [rubro] y se me ocurrió que..."). No disimules que es un mensaje de laburo.
- Está bien sonar un poco informal e imperfecto. Mejor que suene a persona apurada que a copy de agencia.
- Menos es más: no metas todos los beneficios en el primer mensaje. Si dudás, cortá la frase.
- No uses guiones largos (—). Usá puntos o paréntesis. Nada de viñetas dentro de los mensajes.
- Máximo un emoji por mensaje, y solo si suma. Cero urgencia falsa ("últimos cupos", "solo por hoy").
- Variá los arranques: NO empieces siempre con "Hola, estuve viendo...". Si todos arrancan igual, suena a plantilla.

Reglas de estilo: español rioplatense (vos, tenés, querés), sin erratas, sin jerga técnica, sin promesas exageradas.`

function buildPrompt(input: BusinessInput): string {
  const services = input.ourServices?.trim()
    ? input.ourServices.trim()
    : 'desarrollo de web apps a medida y automatizaciones (chatbots, integraciones, dashboards, flujos internos)'

  return `Analizá este negocio y armá su secuencia de setting.

NEGOCIO:
- Nombre: ${input.name}
- Rubro/categorías: ${input.types.join(', ') || 'desconocido'}
- Web: ${input.website ?? 'no tiene sitio web detectado'}
- Rating Google: ${input.rating ?? 'sin datos'}
- Dirección: ${input.address ?? 'sin datos'}

LO QUE OFRECEMOS NOSOTROS:
${services}

DEVOLVÉ (análisis interno, NO se envía a nadie):
1. analysis: 2-3 frases sobre el negocio y por qué podría (o no) necesitarnos.
2. opportunityScore: del 1 al 10, qué tan buena oportunidad es.
3. proposalType: "automation", "web_app" o "both".
4. painPoints: 2-4 problemas que probablemente tenga (hipótesis a confirmar en la charla).
5. solution: qué le proponemos, 1-2 frases.
6. mvpScope: 3-5 features mínimas del MVP, acotado y entregable rápido.
7. estimatedValueUsd: precio estimado del MVP en USD (entero realista).

Y LA SECUENCIA DE SETTING (esto SÍ se envía, aplicá los principios):
8. sequence.opener: PRIMER mensaje, CORTO (2-3 frases máximo, como un WhatsApp real). Gancho genuino y específico de ESTE negocio + una pregunta real y relevante a su rubro que invite a contestar. PROHIBIDO: pitchear la solución, pedir la reunión, halago genérico, prometer cosas grandes, o sonar a plantilla.
9. sequence.problemQuestions: EXACTAMENTE 3 preguntas para sacar el problema a la luz, adaptadas a este negocio. Pensadas para enviarse de a una (conversacional, no interrogatorio). Estilo: "¿cómo te está pegando [X]?", "¿a qué te referís cuando decís [Y]?", "¿te acordás de alguna situación de la última semana donde esto te complicó?".
10. sequence.bookingMessage: la invitación a agendar, enmarcada en SU problema y SU objetivo, dando la razón. Estilo: "Por lo que me contás de [problema], creo que te puedo mostrar cómo lo resolveríamos en tu caso. ¿Te parece si lo charlamos 15 min con [nuestro especialista] y te tiramos un par de ideas concretas para [objetivo]?". Que suene a propuesta tranquila, no a cierre de venta.
11. sequence.confirmationMessage: mensaje breve para confirmar la asistencia. Pedís confirmación de forma natural, sin sonar desesperado pero tampoco arrogante. Dale una salida fácil por si tiene que reprogramar.
12. objections: 3-5 objeciones probables de ESTE negocio (ej: dinero, "lo tengo que consultar", "ya probé algo similar", "lo tengo que pensar", "no tengo tiempo"). Para cada una, en "response" poné: una validación corta (sin frase hecha) + LA PREGUNTA o el reencuadre que abre la conversación. Nada de presión ni de insistir.`
}

/**
 * Redacta una descripción corta de los servicios de la agencia, para usar como
 * default del campo "Qué ofrecemos". `hint` son notas sueltas del usuario
 * (puede venir vacío). Devuelve texto plano, o null si Vertex no está configurado.
 */
export async function suggestServices(hint: string): Promise<string | null> {
  const ai = getClient()
  if (!ai) return null

  const notes = hint.trim()
    ? `Basate en estas notas del usuario: "${hint.trim()}".`
    : 'Asumí servicios típicos de una agencia chica: web apps a medida, automatizaciones con IA, chatbots, integraciones y dashboards.'

  const prompt = `Sos parte de una agencia de desarrollo web y automatización.
Escribí en 1 o 2 frases, en español rioplatense simple y concreto (sin jerga ni palabras infladas), qué ofrece la agencia. Sirve como contexto para una IA que prospecta clientes.
${notes}
Devolvé SOLO el texto, sin comillas, sin encabezados, sin viñetas.`

  const res = await ai.models.generateContent({
    model: env.VERTEX_MODEL,
    contents: prompt,
    config: { temperature: 0.7 },
  })

  return res.text?.trim() ?? null
}

export async function analyzeBusiness(input: BusinessInput): Promise<BusinessAnalysis | null> {
  const ai = getClient()
  if (!ai) return null

  const res = await ai.models.generateContent({
    model: env.VERTEX_MODEL,
    contents: buildPrompt(input),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      // Bajado de 0.95: a 0.95 hay más deriva y se incumplen reglas de estilo.
      // 0.85 mantiene variedad en los arranques sin desmadrarse.
      temperature: 0.85,
    },
  })

  const text = res.text
  if (!text) return null

  // Con responseSchema + responseMimeType el output debería ser JSON válido,
  // pero envolvemos el parse por si el modelo devuelve algo inesperado.
  try {
    return JSON.parse(text) as BusinessAnalysis
  } catch {
    return null
  }
}
