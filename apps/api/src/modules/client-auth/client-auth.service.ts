import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { clientAccount } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { writeAudit } from '../../lib/audit'
import type { PortalViewer } from '../../middleware/clerk-auth'

// ─── Tipos públicos ────────────────────────────────────────────────────────────

type ClientAccountRow = typeof clientAccount.$inferSelect

export interface PublicClientAccount {
  id: string
  email: string
  portalId: string
  contactId: string
  isActive: boolean
  inviteAccepted: boolean
  lastLoginAt: Date | null
  createdAt: Date
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

function toPublicClient(row: ClientAccountRow): PublicClientAccount {
  return {
    id: row.id,
    email: row.email,
    portalId: row.portalId,
    contactId: row.contactId,
    isActive: row.isActive,
    inviteAccepted: row.inviteAccepted,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  }
}

// ─── Casos de uso ─────────────────────────────────────────────────────────────

/**
 * Devuelve los datos públicos de un clientAccount por su id. La autenticación
 * (Clerk) la resuelve el middleware `authenticateClient`; acá solo consultamos
 * la fila. No incluye passwordHash ni inviteToken.
 */
export async function getClientAccount(id: string): Promise<PublicClientAccount> {
  const [account] = await db
    .select()
    .from(clientAccount)
    .where(eq(clientAccount.id, id))
    .limit(1)

  if (!account) throw Errors.notFound('Cuenta de cliente no encontrada')
  return toPublicClient(account)
}

/**
 * Deja constancia de que un admin del equipo abrió el portal de un cliente en la
 * vista de solo lectura. Se registra por carga del portal (`GET /me`), no por
 * cada pedido.
 */
export async function recordPortalView(viewer: PortalViewer, client: PublicClientAccount): Promise<void> {
  await db.transaction((tx) =>
    writeAudit({
      tx,
      portalId: client.portalId,
      userId: viewer.hubUserId,
      entityType: 'company',
      entityId: viewer.companyId,
      action: 'PORTAL_VIEW',
      payload: { clientAccountId: client.id, companySlug: viewer.companySlug },
    }),
  )
}
