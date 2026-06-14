import { and, desc, eq, gt } from 'drizzle-orm'
import { db } from '../../db'
import { setterEvent, setterTenant } from '../../db/schema'
import { env } from '../../config/env'
import { emitSetterEvent } from './setter.event-bus'

/**
 * Log de actividad de la máquina del setter — alimenta la Consola.
 * `logSetterEvent` es best-effort: nunca rompe el flujo que lo llama.
 */

export type EventLevel = 'info' | 'success' | 'warn' | 'error'

export interface LogEventInput {
  tenantId: string
  level?: EventLevel
  type: string
  message: string
  leadId?: string | null
  meta?: Record<string, unknown>
}

export async function logSetterEvent(input: LogEventInput): Promise<void> {
  // En test no registramos (no ensuciar la DB de test ni el output).
  if (env.NODE_ENV === 'test') return
  try {
    const [row] = await db
      .insert(setterEvent)
      .values({
        tenantId: input.tenantId,
        level: input.level ?? 'info',
        type: input.type,
        message: input.message,
        leadId: input.leadId ?? null,
        meta: input.meta,
      })
      .returning({ id: setterEvent.id, createdAt: setterEvent.createdAt })

    // Empuja el evento en vivo por el bus → WebSocket (cero polling).
    if (row) {
      emitSetterEvent({
        id: row.id,
        tenantId: input.tenantId,
        level: input.level ?? 'info',
        type: input.type,
        message: input.message,
        leadId: input.leadId ?? null,
        meta: input.meta ?? null,
        createdAt: row.createdAt.toISOString(),
      })
    }
  } catch (err) {
    console.error('[setter] no se pudo registrar el evento:', err)
  }
}

export interface SetterEventDTO {
  id: string
  level: string
  type: string
  message: string
  leadId: string | null
  meta: Record<string, unknown> | null
  createdAt: Date
}

/** Lista los eventos del portal (más nuevos primero). */
export async function listSetterEvents(
  portalId: string,
  opts?: { since?: Date; limit?: number },
): Promise<SetterEventDTO[]> {
  const conds = [eq(setterTenant.portalId, portalId)]
  if (opts?.since) conds.push(gt(setterEvent.createdAt, opts.since))

  return db
    .select({
      id: setterEvent.id,
      level: setterEvent.level,
      type: setterEvent.type,
      message: setterEvent.message,
      leadId: setterEvent.leadId,
      meta: setterEvent.meta,
      createdAt: setterEvent.createdAt,
    })
    .from(setterEvent)
    .innerJoin(setterTenant, eq(setterEvent.tenantId, setterTenant.id))
    .where(and(...conds))
    .orderBy(desc(setterEvent.createdAt))
    .limit(opts?.limit ?? 150)
}
