/**
 * client-account-linking.test.ts
 *
 * Tests unitarios de `linkClerkUserToClientAccount` — pura DB, sin Clerk de por medio.
 * Cubre los outcomes de la unión discriminada `LinkOutcome` (ver design D1 / §2.4).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db, closeDb } from '../db'
import { contact, clientAccount, portal } from '../db/schema'
import { ensurePortalAndUser } from '../test/helpers'
import { linkClerkUserToClientAccount } from './client-account-linking'

let portalId: string

beforeAll(async () => {
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
})

afterAll(async () => {
  await closeDb()
})

/** Crea un contacto + client_account de test, listos para vincular. */
async function makeClientAccount(opts: {
  portalId: string
  email?: string
  isActive?: boolean
  clerkUserId?: string | null
}): Promise<{ id: string; email: string }> {
  const email = opts.email ?? `cliente-${randomUUID()}@test.com`
  const [c] = await db
    .insert(contact)
    .values({ portalId: opts.portalId, email, firstName: 'Cliente', lastName: 'Test' })
    .returning()
  const [acc] = await db
    .insert(clientAccount)
    .values({
      portalId: opts.portalId,
      contactId: c!.id,
      email,
      isActive: opts.isActive ?? true,
      clerkUserId: opts.clerkUserId ?? null,
    })
    .returning()
  return { id: acc!.id, email }
}

describe('linkClerkUserToClientAccount — ID-first (clientAccountId en metadata)', () => {
  it('cuenta activa, sin clerk_user_id, email verificado coincide → linked', async () => {
    const { id, email } = await makeClientAccount({ portalId })
    const clerkUserId = `clerk_${randomUUID()}`

    const outcome = await linkClerkUserToClientAccount({
      clerkUserId,
      verifiedPrimaryEmail: email,
      clientAccountId: id,
      portalId,
    })

    expect(outcome).toEqual({ kind: 'linked', clientAccountId: id })
    const [row] = await db.select().from(clientAccount).where(eq(clientAccount.id, id)).limit(1)
    expect(row?.clerkUserId).toBe(clerkUserId)
    expect(row?.inviteAccepted).toBe(true)
  })

  it('clientAccountId inexistente → not_found', async () => {
    const outcome = await linkClerkUserToClientAccount({
      clerkUserId: `clerk_${randomUUID()}`,
      verifiedPrimaryEmail: 'nadie@test.com',
      clientAccountId: 'nonexistent-id-xyz',
      portalId,
    })
    expect(outcome).toEqual({ kind: 'not_found' })
  })

  it('redelivery del mismo evento (mismo clerk_user_id) → already_linked, sin re-escribir', async () => {
    const { id, email } = await makeClientAccount({ portalId })
    const clerkUserId = `clerk_${randomUUID()}`
    await linkClerkUserToClientAccount({ clerkUserId, verifiedPrimaryEmail: email, clientAccountId: id, portalId })

    const outcome = await linkClerkUserToClientAccount({
      clerkUserId,
      verifiedPrimaryEmail: email,
      clientAccountId: id,
      portalId,
    })
    expect(outcome).toEqual({ kind: 'already_linked', clientAccountId: id })
  })

  it('clerk_user_id distinto ya vinculado → conflict, nunca sobreescribe', async () => {
    const originalClerkId = `clerk_${randomUUID()}`
    const { id, email } = await makeClientAccount({ portalId, clerkUserId: originalClerkId })

    const outcome = await linkClerkUserToClientAccount({
      clerkUserId: `clerk_${randomUUID()}`,
      verifiedPrimaryEmail: email,
      clientAccountId: id,
      portalId,
    })
    expect(outcome).toEqual({ kind: 'conflict', clientAccountId: id })

    const [row] = await db.select().from(clientAccount).where(eq(clientAccount.id, id)).limit(1)
    expect(row?.clerkUserId).toBe(originalClerkId)
  })

  it('cuenta inactiva → inactive, no vincula', async () => {
    const { id, email } = await makeClientAccount({ portalId, isActive: false })
    const outcome = await linkClerkUserToClientAccount({
      clerkUserId: `clerk_${randomUUID()}`,
      verifiedPrimaryEmail: email,
      clientAccountId: id,
      portalId,
    })
    expect(outcome).toEqual({ kind: 'inactive', clientAccountId: id })
  })

  it('email no verificado (null) → email_mismatch, señal de tampering', async () => {
    const { id } = await makeClientAccount({ portalId })
    const outcome = await linkClerkUserToClientAccount({
      clerkUserId: `clerk_${randomUUID()}`,
      verifiedPrimaryEmail: null,
      clientAccountId: id,
      portalId,
    })
    expect(outcome).toEqual({ kind: 'email_mismatch', clientAccountId: id })
  })

  it('email verificado no coincide con el de la fila → email_mismatch', async () => {
    const { id } = await makeClientAccount({ portalId })
    const outcome = await linkClerkUserToClientAccount({
      clerkUserId: `clerk_${randomUUID()}`,
      verifiedPrimaryEmail: 'otro-email@test.com',
      clientAccountId: id,
      portalId,
    })
    expect(outcome).toEqual({ kind: 'email_mismatch', clientAccountId: id })
  })

  it('portalId de la metadata no coincide con el de la fila → email_mismatch', async () => {
    const [otherPortal] = await db.insert(portal).values({ name: `Otro Portal ${randomUUID()}` }).returning()
    const { id, email } = await makeClientAccount({ portalId })
    const outcome = await linkClerkUserToClientAccount({
      clerkUserId: `clerk_${randomUUID()}`,
      verifiedPrimaryEmail: email,
      clientAccountId: id,
      portalId: otherPortal!.id,
    })
    expect(outcome).toEqual({ kind: 'email_mismatch', clientAccountId: id })
  })
})

describe('linkClerkUserToClientAccount — fallback por email (sin metadata)', () => {
  it('exactamente un match activo y sin vincular → linked', async () => {
    const { id, email } = await makeClientAccount({ portalId })
    const clerkUserId = `clerk_${randomUUID()}`

    const outcome = await linkClerkUserToClientAccount({
      clerkUserId,
      verifiedPrimaryEmail: email,
      clientAccountId: null,
      portalId: null,
    })
    expect(outcome).toEqual({ kind: 'linked', clientAccountId: id })
  })

  it('sin match → not_found', async () => {
    const outcome = await linkClerkUserToClientAccount({
      clerkUserId: `clerk_${randomUUID()}`,
      verifiedPrimaryEmail: `nadie-${randomUUID()}@test.com`,
      clientAccountId: null,
      portalId: null,
    })
    expect(outcome).toEqual({ kind: 'not_found' })
  })

  it('email null (no verificado) sin metadata → not_found, nunca adivina', async () => {
    const outcome = await linkClerkUserToClientAccount({
      clerkUserId: `clerk_${randomUUID()}`,
      verifiedPrimaryEmail: null,
      clientAccountId: null,
      portalId: null,
    })
    expect(outcome).toEqual({ kind: 'not_found' })
  })

  it('2 cuentas activas sin vincular con el mismo email en portales distintos → ambiguous, no vincula ninguna', async () => {
    const sharedEmail = `compartido-${randomUUID()}@test.com`
    const [portalB] = await db.insert(portal).values({ name: `Portal B ${randomUUID()}` }).returning()

    const a = await makeClientAccount({ portalId, email: sharedEmail })
    const b = await makeClientAccount({ portalId: portalB!.id, email: sharedEmail })

    const outcome = await linkClerkUserToClientAccount({
      clerkUserId: `clerk_${randomUUID()}`,
      verifiedPrimaryEmail: sharedEmail,
      clientAccountId: null,
      portalId: null,
    })
    expect(outcome).toEqual({ kind: 'ambiguous', matches: 2 })

    const [rowA] = await db.select().from(clientAccount).where(eq(clientAccount.id, a.id)).limit(1)
    const [rowB] = await db.select().from(clientAccount).where(eq(clientAccount.id, b.id)).limit(1)
    expect(rowA?.clerkUserId).toBeNull()
    expect(rowB?.clerkUserId).toBeNull()
  })
})
