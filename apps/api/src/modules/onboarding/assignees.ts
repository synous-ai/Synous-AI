import { and, eq } from 'drizzle-orm'
import type { DB } from '../../db'
import { hubUser } from '../../db/schema'
import { env } from '../../config/env'
import type { Tx } from '../../lib/audit'

/**
 * Config de asignación de responsables del pipeline "Producción" (las 9 fases
 * post-venta). Usado por:
 *  - onboarding.service.ts → completeOnboarding → moveDealToProduction (deals/stage.service.ts)
 *  - deals/stage.service.ts → changeStage (reasignación automática al cambiar de fase)
 */
export const PRODUCTION_PIPELINE_LABEL = 'Producción'
export const PRODUCTION_DIAGNOSTICO_STAGE_LABEL = 'Diagnóstico'

/**
 * Resuelve el hub_user responsable de una fase del pipeline "Producción" por
 * email: Diagnóstico → PRODUCTION_ASSIGNEE_DIAGNOSTICO_EMAIL; cualquier otra
 * fase → PRODUCTION_ASSIGNEE_DEFAULT_EMAIL.
 *
 * Si el hub_user no existe (email no seedeado en este portal) o está inactivo,
 * devuelve `null` y NO rompe al caller — el owner actual del deal se mantiene.
 *
 * Acepta `db` o un `tx` en curso (patrón `Tx` de lib/audit.ts): los dos
 * callers (changeStage, moveDealToProduction en deals/stage.service.ts) lo
 * invocan DESDE ADENTRO de su propia transacción — pasar siempre `db` global
 * ahí tomaría una segunda conexión del pool mientras la tx retiene la suya
 * (riesgo de agotar el pool en serverless/pools chicos).
 */
export async function resolveProductionAssignee(
  dbOrTx: DB | Tx,
  portalId: string,
  stageLabel: string,
): Promise<string | null> {
  const email =
    stageLabel === PRODUCTION_DIAGNOSTICO_STAGE_LABEL
      ? env.PRODUCTION_ASSIGNEE_DIAGNOSTICO_EMAIL
      : env.PRODUCTION_ASSIGNEE_DEFAULT_EMAIL

  const [u] = await dbOrTx
    .select({ id: hubUser.id })
    .from(hubUser)
    .where(and(eq(hubUser.portalId, portalId), eq(hubUser.email, email), eq(hubUser.isActive, true)))
    .limit(1)
  return u?.id ?? null
}
