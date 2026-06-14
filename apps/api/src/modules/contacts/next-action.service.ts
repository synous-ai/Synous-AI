import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { contact, deal, pipelineStage, onboardingSubmission, proposal, setterTenant } from '../../db/schema'
import { Errors } from '../../lib/errors'
import type { ModelProvider } from '../setter/agent/providers'
import { env } from '../../config/env'
import {
  suggestNextActionAI,
  fallbackNextAction,
  type NextActionContext,
} from './next-action.ai'

/** Provider de IA configurado para el portal (Model Switcher del setter). */
async function getModelProvider(portalId: string): Promise<ModelProvider> {
  const [t] = await db
    .select({ p: setterTenant.modelProvider })
    .from(setterTenant)
    .where(eq(setterTenant.portalId, portalId))
    .limit(1)
  return t?.p === 'claude' ? 'claude' : 'gemini'
}

function s(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined
}

export interface NextActionResult {
  action: string
  source: 'ai' | 'rules'
}

/**
 * Sugiere la PRÓXIMA ACCIÓN para un lead con todo su contexto (etapa, deals,
 * onboarding, propuestas). Intenta con IA (Model Switcher) y, si falla o no hay
 * credenciales, cae a reglas — así SIEMPRE hay una próxima acción.
 */
export async function suggestNextAction(portalId: string, contactId: string): Promise<NextActionResult> {
  const [c] = await db
    .select({
      firstName: contact.firstName,
      lifecycleStage: contact.lifecycleStage,
    })
    .from(contact)
    .where(and(eq(contact.id, contactId), eq(contact.portalId, portalId)))
    .limit(1)
  if (!c) throw Errors.notFound('Contacto no encontrado')

  // Deals activos del contacto + etiqueta de su etapa.
  const deals = await db
    .select({
      name: deal.name,
      amount: deal.amount,
      stage: pipelineStage.label,
      isWon: pipelineStage.isWon,
    })
    .from(deal)
    .leftJoin(pipelineStage, eq(pipelineStage.id, deal.stageId))
    .where(and(eq(deal.primaryContactId, contactId), eq(deal.archived, false)))

  // Última submission de onboarding del contacto.
  const [sub] = await db
    .select({ decision: onboardingSubmission.decision, answers: onboardingSubmission.answers })
    .from(onboardingSubmission)
    .where(and(eq(onboardingSubmission.portalId, portalId), eq(onboardingSubmission.contactId, contactId)))
    .orderBy(desc(onboardingSubmission.createdAt))
    .limit(1)

  // Propuestas del contacto (más reciente primero).
  const proposals = await db
    .select({ status: proposal.status })
    .from(proposal)
    .where(and(eq(proposal.portalId, portalId), eq(proposal.contactId, contactId)))
    .orderBy(desc(proposal.createdAt))

  const a = (sub?.answers ?? {}) as Record<string, unknown>
  const ctx: NextActionContext = {
    firstName: c.firstName ?? '',
    lifecycleStage: c.lifecycleStage,
    deals: deals.map((d) => ({
      name: d.name,
      stage: d.stage,
      amount: d.amount,
      isWon: d.isWon ?? false,
    })),
    onboarding: sub
      ? {
          decision: sub.decision,
          budget: s(a.budget),
          projectType: s(a.projectType),
          mainGoal: s(a.mainGoal),
          preference: s(a.preference),
          clarity: s(a.clarity),
        }
      : undefined,
    proposals: proposals.map((p) => ({ status: p.status })),
  }

  // Intentamos IA; si hay cualquier problema, reglas. Siempre devolvemos algo.
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON || env.ANTHROPIC_API_KEY) {
    try {
      const provider = await getModelProvider(portalId)
      const action = await suggestNextActionAI(ctx, provider)
      return { action, source: 'ai' }
    } catch {
      /* cae a reglas */
    }
  }
  return { action: fallbackNextAction(ctx), source: 'rules' }
}
