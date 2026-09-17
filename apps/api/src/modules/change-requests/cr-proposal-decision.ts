import { and, eq } from 'drizzle-orm'
import { changeRequestProposal } from '../../db/schema'
import type { Tx } from '../../lib/audit'

/**
 * Sella la decisión sobre la propuesta VIGENTE y devuelve el snapshot de los
 * números sobre los que se decidió, para guardarlo en el evento del historial.
 *
 * Vive en su propio módulo porque lo necesitan las DOS puertas de decisión —la
 * del cliente (`clientApprove`/`clientReject`) y la del equipo
 * (`transitionCR` cuando el acuerdo se cerró fuera del portal)— y cada una
 * está en un service distinto. Duplicarlo era garantizar que tarde o temprano
 * una de las dos dejara de escribir `decidedAt` o la metadata.
 *
 * `decidedByClient` es `null` cuando decide el equipo: la columna es FK a
 * `client_account` y no hay cliente que haya firmado nada en el portal.
 *
 * El UPDATE va condicionado a `status = 'sent'`: una propuesta ya decidida o
 * jubilada no se re-decide. Si no matchea, igual se devuelve el `proposalId`
 * para que el evento deje constancia de a qué apuntaba la CR.
 */
export async function decideProposal(
  tx: Tx,
  proposalId: string | null,
  decision: 'accepted' | 'rejected',
  decidedByClient: string | null,
): Promise<Record<string, unknown>> {
  if (!proposalId) return {}
  const [proposal] = await tx
    .update(changeRequestProposal)
    .set({ status: decision, decidedAt: new Date(), decidedByClient })
    .where(and(eq(changeRequestProposal.id, proposalId), eq(changeRequestProposal.status, 'sent')))
    .returning()
  if (!proposal) return { proposalId }
  return {
    proposalId: proposal.id,
    version: proposal.version,
    amount: proposal.amount,
    currency: proposal.currency,
    timelineImpactDays: proposal.timelineImpactDays,
    newDeliveryDate: proposal.newDeliveryDate,
  }
}
