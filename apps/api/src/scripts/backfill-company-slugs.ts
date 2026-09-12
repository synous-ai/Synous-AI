/**
 * backfill-company-slugs.ts — Fase A del multi-tenant por empresa.
 *
 * El tenant del Client Portal pasó de ser por-contacto (`client_account.brand_slug`)
 * a ser por-empresa (`company.slug` + `company.brand*`). Este script pone al día
 * las empresas creadas ANTES de ese cambio, que quedaron con `slug = NULL`:
 *
 *   1. Genera un slug único por portal (`uniqueCompanySlug`) a partir del nombre.
 *   2. Si la empresa NO tiene branding propio, le copia el branding del
 *      client_account de esa empresa (vía `contact.company_id`) que tenga
 *      branding no-nulo más reciente. `client_account` no tiene `updated_at`
 *      —el spec pedía usarlo si existe, si no `created_at`— así que acá
 *      "más reciente" es directamente `created_at`.
 *
 * IDEMPOTENTE: solo toca compañías con `slug IS NULL`. Correrlo de nuevo no
 * reasigna slugs ya puestos ni pisa branding ya copiado.
 *
 * SOLO CONTRA DB LOCAL. No correr contra producción sin revisar antes: no hay
 * dry-run, escribe directo.
 *
 * Uso:
 *   pnpm --filter api exec tsx src/scripts/backfill-company-slugs.ts
 */
import { eq, isNull } from 'drizzle-orm'
import { db, closeDb } from '../db'
import { company, contact, clientAccount } from '../db/schema'
import { uniqueCompanySlug, slugify } from '../lib/slug'

interface BrandingSource {
  brandName: string | null
  brandLogoKey: string | null
  brandPrimary: string | null
  brandSecondary: string | null
  createdAt: Date
}

interface Summary {
  updated: number
  slugCollisions: number
  withoutBranding: number
}

/** true si el registro trae al menos un campo de branding seteado. */
function hasBranding(row: { brandName: string | null; brandLogoKey: string | null; brandPrimary: string | null; brandSecondary: string | null }): boolean {
  return row.brandName !== null || row.brandLogoKey !== null || row.brandPrimary !== null || row.brandSecondary !== null
}

/** Busca, entre los client_accounts de la empresa, el de branding no-nulo más reciente. */
async function findBrandingSource(companyId: string): Promise<BrandingSource | null> {
  const accounts = await db
    .select({
      brandName: clientAccount.brandName,
      brandLogoKey: clientAccount.brandLogoKey,
      brandPrimary: clientAccount.brandPrimary,
      brandSecondary: clientAccount.brandSecondary,
      createdAt: clientAccount.createdAt,
    })
    .from(clientAccount)
    .innerJoin(contact, eq(contact.id, clientAccount.contactId))
    .where(eq(contact.companyId, companyId))

  const withBranding = accounts.filter(hasBranding)
  if (withBranding.length === 0) return null

  withBranding.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  return withBranding[0]!
}

async function main(): Promise<void> {
  const pending = await db.select().from(company).where(isNull(company.slug))

  if (pending.length === 0) {
    console.log('No hay empresas sin slug — nada que hacer.')
    return
  }

  const summary: Summary = { updated: 0, slugCollisions: 0, withoutBranding: 0 }

  for (const row of pending) {
    // eslint-disable-next-line no-await-in-loop -- backfill secuencial, no hay apuro por paralelizar un one-off.
    await db.transaction(async (tx) => {
      const slug = await uniqueCompanySlug(tx, row.portalId, row.name)
      const baseSlug = slugify(row.name) || 'empresa'
      if (slug !== baseSlug) summary.slugCollisions++

      const alreadyBranded = hasBranding(row)
      const source = alreadyBranded ? null : await findBrandingSource(row.id)
      if (!alreadyBranded && !source) summary.withoutBranding++

      await tx
        .update(company)
        .set({
          slug,
          updatedAt: new Date(),
          ...(source
            ? {
                brandName: source.brandName,
                brandLogoKey: source.brandLogoKey,
                brandPrimary: source.brandPrimary,
                brandSecondary: source.brandSecondary,
              }
            : {}),
        })
        .where(eq(company.id, row.id))

      summary.updated++
      console.log(`✓ ${row.name} → slug "${slug}"${source ? ' (branding copiado de client_account)' : ''}`)
    })
  }

  console.log('')
  console.log('── Resumen ──────────────────────────────')
  console.log(`Empresas actualizadas:                 ${summary.updated}`)
  console.log(`Slugs con colisión (sufijo aplicado):   ${summary.slugCollisions}`)
  console.log(`Empresas sin branding para copiar:      ${summary.withoutBranding}`)
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('Falló el backfill de slugs de empresa:', err)
    await closeDb()
    process.exit(1)
  })
