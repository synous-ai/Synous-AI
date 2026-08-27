/**
 * client-account-linking.ts
 *
 * Implementación ÚNICA de "vincular un usuario de Clerk a un client_account".
 * Sin I/O a Clerk (pura DB) — la usan tanto el webhook (`user.created`) como el
 * lazy-linking en `middleware/clerk-auth.ts`. Vive en `lib/` (no en `modules/webhooks/`)
 * porque `middleware/clerk-auth.ts` NUNCA debe importar de un módulo de rutas
 * (regla de capas: middleware → module es la dirección incorrecta).
 *
 * Algoritmo (ver design D1):
 *  1. ID-first: si viene `clientAccountId` en la metadata, resolvemos por ahí.
 *  2. Fallback por email: solo si no hay metadata, exige EXACTAMENTE un match
 *     activo y sin vincular (2+ matches → ambiguo, se rehúsa a adivinar).
 *  3. Write condicional (`WHERE clerk_user_id IS NULL`): idempotente por
 *     construcción, sin necesidad de una tabla de dedupe por svix-id.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db'
import { clientAccount } from '../db/schema'
import type { User, UserJSON } from '@clerk/backend'

/** Identidad de Clerk normalizada, independiente de si viene del webhook o de la Backend API. */
export interface ClerkIdentity {
  clerkUserId: string
  /** Email primario VERIFICADO, lowercase. `null` si no hay ninguno verificado. */
  verifiedPrimaryEmail: string | null
  /** `public_metadata.clientAccountId`, si está presente. */
  clientAccountId: string | null
  /** `public_metadata.portalId`, si está presente. */
  portalId: string | null
}

export type LinkOutcome =
  | { kind: 'linked'; clientAccountId: string }
  | { kind: 'already_linked'; clientAccountId: string }
  | { kind: 'conflict'; clientAccountId: string }
  | { kind: 'inactive'; clientAccountId: string }
  | { kind: 'email_mismatch'; clientAccountId: string }
  | { kind: 'ambiguous'; matches: number }
  | { kind: 'not_found' }

/** Extrae el email primario y su estado de verificación desde una lista de EmailAddressJSON-like. */
function primaryVerifiedEmail(
  primaryId: string | null,
  emails: ReadonlyArray<{ id: string; email_address?: string; emailAddress?: string; verification: { status: string } | null }>,
): string | null {
  if (!primaryId) return null
  const primary = emails.find((e) => e.id === primaryId)
  if (!primary || primary.verification?.status !== 'verified') return null
  const email = primary.email_address ?? primary.emailAddress
  return email ? email.toLowerCase() : null
}

/** Adaptador: payload de webhook (`user.created`), snake_case. */
export function identityFromUserJson(u: UserJSON): ClerkIdentity {
  const metadata = (u.public_metadata ?? {}) as Record<string, unknown>
  return {
    clerkUserId: u.id,
    verifiedPrimaryEmail: primaryVerifiedEmail(u.primary_email_address_id, u.email_addresses),
    clientAccountId: typeof metadata['clientAccountId'] === 'string' ? metadata['clientAccountId'] : null,
    portalId: typeof metadata['portalId'] === 'string' ? metadata['portalId'] : null,
  }
}

/** Adaptador: objeto `User` de la Backend API (camelCase), usado por el lazy linking. */
export function identityFromUser(u: User): ClerkIdentity {
  const metadata = (u.publicMetadata ?? {}) as Record<string, unknown>
  return {
    clerkUserId: u.id,
    verifiedPrimaryEmail: primaryVerifiedEmail(u.primaryEmailAddressId, u.emailAddresses),
    clientAccountId: typeof metadata['clientAccountId'] === 'string' ? metadata['clientAccountId'] : null,
    portalId: typeof metadata['portalId'] === 'string' ? metadata['portalId'] : null,
  }
}

/** Ejecuta el UPDATE condicional y clasifica el resultado. Paso 3 del algoritmo. */
async function conditionalLink(clerkUserId: string, accountId: string): Promise<LinkOutcome> {
  const updated = await db
    .update(clientAccount)
    .set({ clerkUserId, inviteAccepted: true })
    .where(and(eq(clientAccount.id, accountId), isNull(clientAccount.clerkUserId)))
    .returning({ id: clientAccount.id })

  if (updated.length > 0) return { kind: 'linked', clientAccountId: accountId }

  // 0 filas afectadas: alguien más ya escribió clerk_user_id (o esta misma fila).
  const [row] = await db
    .select({ clerkUserId: clientAccount.clerkUserId })
    .from(clientAccount)
    .where(eq(clientAccount.id, accountId))
    .limit(1)

  if (row?.clerkUserId === clerkUserId) return { kind: 'already_linked', clientAccountId: accountId }
  return { kind: 'conflict', clientAccountId: accountId }
}

/** Vincula un usuario de Clerk a su `client_account`. Nunca lanza por casos de negocio; solo por errores de DB. */
export async function linkClerkUserToClientAccount(id: ClerkIdentity): Promise<LinkOutcome> {
  // Paso 1: ID-first.
  if (id.clientAccountId) {
    const [row] = await db
      .select({
        id: clientAccount.id,
        portalId: clientAccount.portalId,
        email: clientAccount.email,
        isActive: clientAccount.isActive,
        clerkUserId: clientAccount.clerkUserId,
      })
      .from(clientAccount)
      .where(eq(clientAccount.id, id.clientAccountId))
      .limit(1)

    if (!row) return { kind: 'not_found' }
    if (id.portalId && row.portalId !== id.portalId) return { kind: 'email_mismatch', clientAccountId: row.id }
    if (!row.isActive) return { kind: 'inactive', clientAccountId: row.id }
    if (!id.verifiedPrimaryEmail || id.verifiedPrimaryEmail !== row.email.toLowerCase()) {
      return { kind: 'email_mismatch', clientAccountId: row.id }
    }
    // El WHERE clerk_user_id IS NULL de conditionalLink decide already_linked/conflict
    // si la fila ya estaba vinculada (redelivery o colisión) — no lo adelantamos acá.
    return conditionalLink(id.clerkUserId, row.id)
  }

  // Paso 2: fallback por email (usuario creado fuera de este flujo — sin metadata).
  if (!id.verifiedPrimaryEmail) return { kind: 'not_found' }

  const matches = await db
    .select({ id: clientAccount.id })
    .from(clientAccount)
    .where(
      and(
        eq(clientAccount.email, id.verifiedPrimaryEmail),
        eq(clientAccount.isActive, true),
        isNull(clientAccount.clerkUserId),
      ),
    )
    .limit(2)

  if (matches.length === 0) return { kind: 'not_found' }
  if (matches.length > 1) return { kind: 'ambiguous', matches: matches.length }

  return conditionalLink(id.clerkUserId, matches[0]!.id)
}
