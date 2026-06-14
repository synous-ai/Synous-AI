import { getProvider, type ModelProvider } from '../setter/agent/providers'

/**
 * "Próxima acción" sugerida por IA para avanzar un lead.
 *
 * Toma el contexto del lead (etapa/estado, onboarding, propuesta, deals) y pide
 * al LLM una acción concreta y accionable en UNA frase. Si la IA no está
 * disponible, cae a una sugerencia por reglas (siempre hay próxima acción).
 */

export interface NextActionContext {
  firstName: string
  lifecycleStage: string
  deals: { name: string; stage: string | null; amount: string | null; isWon: boolean }[]
  onboarding?: {
    decision: string
    budget?: string
    projectType?: string
    mainGoal?: string
    preference?: string
    clarity?: string
  }
  proposals: { status: string }[]
  lastActivityDays?: number | null
}

const LIFECYCLE_LABEL: Record<string, string> = {
  lead: 'lead',
  mql: 'lead calificado por marketing',
  sql: 'lead calificado por ventas',
  opportunity: 'oportunidad',
  customer: 'cliente',
  other: 'otro',
}

const SYSTEM_INSTRUCTION = `Sos el asistente comercial de NOUS (agencia de software a medida). Tu trabajo es sugerir la PRÓXIMA ACCIÓN concreta para avanzar un lead hacia el cierre.

Reglas:
- Respondé SOLO la acción, en UNA frase corta, imperativa y accionable (máx ~120 caracteres).
- Español rioplatense (voseo). Nada de preámbulos, comillas ni explicaciones.
- Usá el contexto (etapa, onboarding, propuesta, deals) para que sea específica, no genérica.`

function buildPrompt(ctx: NextActionContext): string {
  const lines: string[] = []
  lines.push(`Nombre: ${ctx.firstName || 'el lead'}`)
  lines.push(`Etapa: ${LIFECYCLE_LABEL[ctx.lifecycleStage] ?? ctx.lifecycleStage}`)
  if (ctx.deals.length) {
    lines.push(
      `Deals: ${ctx.deals
        .map((d) => `${d.name} (etapa: ${d.stage ?? '—'}${d.isWon ? ', ganado' : ''})`)
        .join('; ')}`,
    )
  } else {
    lines.push('Deals: ninguno')
  }
  if (ctx.onboarding) {
    const o = ctx.onboarding
    lines.push(
      `Onboarding: completado (routing sugerido: ${o.decision}; tipo: ${o.projectType ?? '—'}; objetivo: ${o.mainGoal ?? '—'}; presupuesto: ${o.budget ?? '—'}; claridad: ${o.clarity ?? '—'}; prefiere: ${o.preference ?? '—'})`,
    )
  } else {
    lines.push('Onboarding: NO completado')
  }
  if (ctx.proposals.length) {
    lines.push(`Propuestas: ${ctx.proposals.map((p) => p.status).join(', ')}`)
  } else {
    lines.push('Propuestas: ninguna generada')
  }
  if (ctx.lastActivityDays != null) {
    lines.push(`Última actividad: hace ${ctx.lastActivityDays} día(s)`)
  }
  return `Sugerí la próxima acción para este lead:\n${lines.join('\n')}`
}

/** Llama al LLM (Model Switcher) y devuelve la acción en una línea. */
export async function suggestNextActionAI(
  ctx: NextActionContext,
  provider: ModelProvider = 'gemini',
): Promise<string> {
  const generate = getProvider(provider)
  const result = await generate({
    systemInstruction: SYSTEM_INSTRUCTION,
    contents: [{ role: 'user', parts: [{ text: buildPrompt(ctx) }] }],
    temperature: 0.6,
    maxOutputTokens: 256,
  })
  // Primera línea no vacía, sin comillas ni viñetas, acotada en longitud.
  const action = result.text
    .split('\n')
    .map((l) => l.replace(/^[-*•\s"']+/, '').trim())
    .find((l) => l.length > 0)
  if (!action) throw new Error('La IA no devolvió una acción')
  return action.slice(0, 160)
}

/**
 * Sugerencia por reglas (fallback): garantiza que SIEMPRE haya próxima acción
 * coherente con el estado del lead, aunque la IA no esté disponible.
 */
export function fallbackNextAction(ctx: NextActionContext): string {
  const lastProposal = ctx.proposals[0]?.status
  if (ctx.lifecycleStage === 'customer') return 'Coordiná el kickoff y los próximos pasos del proyecto.'
  if (!ctx.onboarding) return 'Enviale el link de onboarding para entender bien su proyecto.'
  if (!ctx.proposals.length) return 'Generá y revisá la propuesta con la info del onboarding.'
  if (lastProposal === 'draft') return 'Terminá de revisar la propuesta y aprobala para enviarla.'
  if (lastProposal === 'accepted' || lastProposal === 'sent')
    return 'Enviá el link de la propuesta y confirmá que la recibió.'
  if (lastProposal === 'viewed') return 'Ya vio la propuesta: llamalo para cerrar.'
  return 'Agendá un seguimiento para mantener la conversación activa.'
}
