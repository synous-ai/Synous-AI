import type { db } from '../db'
import { recordHistory, auditLog } from '../db/schema'

/** Tipo de la transacción Drizzle (el `tx` que recibe `db.transaction(cb)`). */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

function toStringValue(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/**
 * Registra en `record_history` cada campo que efectivamente cambió.
 * Compara `before` (fila actual) contra `after` (parche entrante).
 */
export async function recordFieldChanges(input: {
  tx: Tx
  portalId: string
  entityType: string
  entityId: string
  before: Record<string, unknown>
  after: Record<string, unknown>
  changedBy: string
  sourceType?: string
}): Promise<void> {
  const rows = []
  for (const key of Object.keys(input.after)) {
    if (input.after[key] === undefined) continue
    const oldVal = toStringValue(input.before[key])
    const newVal = toStringValue(input.after[key])
    if (oldVal !== newVal) {
      rows.push({
        portalId: input.portalId,
        entityType: input.entityType,
        entityId: input.entityId,
        fieldName: key,
        oldValue: oldVal,
        newValue: newVal,
        sourceType: input.sourceType ?? 'API',
        changedBy: input.changedBy,
      })
    }
  }
  if (rows.length > 0) {
    await input.tx.insert(recordHistory).values(rows)
  }
}

/** Inserta una entrada en `audit_log`. */
export async function writeAudit(input: {
  tx: Tx
  portalId: string
  userId: string
  entityType: string
  entityId: string
  action: string
  payload?: unknown
}): Promise<void> {
  await input.tx.insert(auditLog).values({
    portalId: input.portalId,
    userId: input.userId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    payload: (input.payload ?? null) as object | null,
  })
}
