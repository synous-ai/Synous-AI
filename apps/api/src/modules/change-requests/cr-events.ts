import { eq, inArray } from 'drizzle-orm'
import type { CRActorRole, CREventType } from '@synous/shared'
import { db, type DB } from '../../db'
import { changeRequestHistory, clientAccount, contact, hubUser } from '../../db/schema'
import type { Tx } from '../../lib/audit'

type Executor = DB | Tx

export type CRHistoryRow = typeof changeRequestHistory.$inferSelect

export interface RecordCREventInput {
  changeRequestId: string
  eventType: CREventType
  actorRole: CRActorRole
  /** Solo en eventos de cambio de estado. */
  fromStatus?: string | null
  toStatus?: string | null
  comment?: string | null
  /** Dato duro del evento (versión y monto de la propuesta, motivo, área). */
  metadata?: Record<string, unknown>
  userId?: string | null
  clientId?: string | null
}

/**
 * Escribe UNA fila del event log de la CR.
 *
 * Siempre dentro de la misma transacción que el cambio que describe: un evento
 * que se escribe aparte puede quedar registrando algo que después hizo
 * rollback, y el historial es lo que se usa para reconstruir sobre qué números
 * decidió el cliente.
 */
export async function recordCREvent(executor: Executor, input: RecordCREventInput): Promise<void> {
  await executor.insert(changeRequestHistory).values({
    changeRequestId: input.changeRequestId,
    eventType: input.eventType,
    actorRole: input.actorRole,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    comment: input.comment ?? null,
    metadata: input.metadata ?? {},
    changedByUser: input.userId ?? null,
    changedByClient: input.clientId ?? null,
  })
}

// ─── Nombres de actores ──────────────────────────────────────────────────────

export interface ActorNames {
  users: Map<string, string | null>
  clients: Map<string, string | null>
}

function joinName(first: string | null, last: string | null): string | null {
  const name = [first, last].filter(Boolean).join(' ').trim()
  return name || null
}

/**
 * Resuelve los nombres de todos los actores de un detalle en DOS queries, no
 * una por fila. Devuelve `null` cuando no hay nombre cargado: NUNCA el email —
 * el detalle lo lee también el cliente desde el portal, y el mail del equipo no
 * es dato que tenga que ver ahí.
 */
export async function resolveActorNames(
  userIds: readonly (string | null)[],
  clientIds: readonly (string | null)[],
  executor: Executor = db,
): Promise<ActorNames> {
  const uniqueUsers = [...new Set(userIds.filter((id): id is string => Boolean(id)))]
  const uniqueClients = [...new Set(clientIds.filter((id): id is string => Boolean(id)))]

  const [userRows, clientRows] = await Promise.all([
    uniqueUsers.length === 0
      ? Promise.resolve([])
      : executor
          .select({ id: hubUser.id, firstName: hubUser.firstName, lastName: hubUser.lastName })
          .from(hubUser)
          .where(inArray(hubUser.id, uniqueUsers)),
    uniqueClients.length === 0
      ? Promise.resolve([])
      : executor
          .select({ id: clientAccount.id, firstName: contact.firstName, lastName: contact.lastName })
          .from(clientAccount)
          .innerJoin(contact, eq(contact.id, clientAccount.contactId))
          .where(inArray(clientAccount.id, uniqueClients)),
  ])

  return {
    users: new Map(userRows.map((r) => [r.id, joinName(r.firstName, r.lastName)])),
    clients: new Map(clientRows.map((r) => [r.id, joinName(r.firstName, r.lastName)])),
  }
}

/** Nombre + rol de un par (hubUser, clientAccount) mutuamente excluyente. */
export function actorOf(
  names: ActorNames,
  userId: string | null,
  clientId: string | null,
): { name: string | null; role: CRActorRole } {
  if (clientId) return { name: names.clients.get(clientId) ?? null, role: 'client' }
  if (userId) return { name: names.users.get(userId) ?? null, role: 'admin' }
  return { name: null, role: 'system' }
}
