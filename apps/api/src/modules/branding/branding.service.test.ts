/**
 * branding.service.test.ts
 *
 * Fase A del multi-tenant: `getBrandingBySlug()` ahora resuelve primero por
 * `company.slug` y solo cae al viejo `clientAccount.brandSlug` si no hay
 * empresa con ese slug (compatibilidad con links ya repartidos).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { db, closeDb } from '../../db'
import { company, contact, clientAccount } from '../../db/schema'
import { ensurePortalAndUser } from '../../test/helpers'
import { getBrandingBySlug } from './branding.service'

let portalId: string

beforeAll(async () => {
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
})

afterAll(async () => {
  await closeDb()
})

describe('getBrandingBySlug', () => {
  it('resuelve el branding por company.slug', async () => {
    const slug = `uirtus-${randomUUID().slice(0, 8)}`
    await db.insert(company).values({
      portalId,
      name: 'Uirtus',
      slug,
      brandName: 'Uirtus Studio',
      brandLogoKey: 'logos/uirtus.png',
      brandPrimary: '#111111',
      brandSecondary: '#222222',
    })

    const branding = await getBrandingBySlug(slug)
    expect(branding).not.toBeNull()
    expect(branding?.brandName).toBe('Uirtus Studio')
    expect(branding?.primaryColor).toBe('#111111')
    expect(branding?.secondaryColor).toBe('#222222')
    expect(branding?.logoUrl).toContain('logos/uirtus.png')
  })

  it('no resuelve una empresa archivada por su slug', async () => {
    const slug = `archivada-${randomUUID().slice(0, 8)}`
    await db.insert(company).values({
      portalId,
      name: 'Empresa Archivada',
      slug,
      brandName: 'No debería verse',
      archived: true,
    })

    expect(await getBrandingBySlug(slug)).toBeNull()
  })

  it('cae al branding legacy de client_account cuando no hay empresa con ese slug', async () => {
    const legacySlug = `legacy-${randomUUID().slice(0, 8)}`
    const [c] = await db
      .insert(contact)
      .values({ portalId, email: `legacy-${randomUUID()}@test.com`, firstName: 'Cliente', lastName: 'Legacy' })
      .returning()
    await db.insert(clientAccount).values({
      portalId,
      contactId: c!.id,
      email: c!.email!,
      brandSlug: legacySlug,
      brandName: 'Marca Legacy',
      brandPrimary: '#abcdef',
    })

    const branding = await getBrandingBySlug(legacySlug)
    expect(branding).not.toBeNull()
    expect(branding?.brandName).toBe('Marca Legacy')
    expect(branding?.primaryColor).toBe('#abcdef')
  })

  it('devuelve null cuando el slug no matchea ni empresa ni client_account', async () => {
    expect(await getBrandingBySlug(`no-existe-${randomUUID().slice(0, 8)}`)).toBeNull()
  })
})
