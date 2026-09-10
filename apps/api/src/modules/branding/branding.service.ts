import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { clientAccount, contact, company } from '../../db/schema'
import { env } from '../../config/env'
import { AppError, Errors } from '../../lib/errors'
import type { UpdateBrandingDTO, ClientUpdateBrandingDTO } from './branding.schema'

export interface PublicBranding {
  brandName: string | null
  logoUrl: string | null
  primaryColor: string | null
  secondaryColor: string | null
}

function logoUrl(key: string | null): string | null {
  return key ? `${env.PUBLIC_API_URL}/api/files/${key}` : null
}

interface BrandFields {
  brandName: string | null
  brandLogoKey: string | null
  brandPrimary: string | null
  brandSecondary: string | null
}

/**
 * Columnas de branding del clientAccount.
 * NUNCA incluyen passwordHash ni inviteToken — estos selects pueden alcanzar
 * endpoints públicos (pre-login), así que la proyección es la primera línea de defensa.
 */
const brandingCols = {
  id: clientAccount.id,
  email: clientAccount.email,
  brandSlug: clientAccount.brandSlug,
  brandName: clientAccount.brandName,
  brandLogoKey: clientAccount.brandLogoKey,
  brandPrimary: clientAccount.brandPrimary,
  brandSecondary: clientAccount.brandSecondary,
}

const companyBrandCols = {
  brandName: company.brandName,
  brandLogoKey: company.brandLogoKey,
  brandPrimary: company.brandPrimary,
  brandSecondary: company.brandSecondary,
}

/**
 * Público (pre-login): resuelve el branding por el slug de la URL.
 *
 * Fase A del multi-tenant: el tenant real es la EMPRESA (`company.slug`), no
 * el contacto. Probamos primero ahí. Si no hay match, caemos al lookup viejo
 * por `clientAccount.brandSlug` (branding por-contacto, pre-Fase A) para que
 * los links de portal ya repartidos con ese slug no se rompan de un día para
 * el otro. Ese fallback se puede retirar una vez confirmado el backfill
 * (`scripts/backfill-company-slugs.ts`).
 */
export async function getBrandingBySlug(slug: string): Promise<PublicBranding | null> {
  // ENDPOINT PÚBLICO — proyección mínima, sin datos sensibles del cliente.
  const [companyRow] = await db
    .select(companyBrandCols)
    .from(company)
    .where(and(eq(company.slug, slug), eq(company.archived, false)))
    .limit(1)
  if (companyRow) return toPublicBranding(companyRow)

  const [legacyRow] = await db
    .select({
      brandName: clientAccount.brandName,
      brandLogoKey: clientAccount.brandLogoKey,
      brandPrimary: clientAccount.brandPrimary,
      brandSecondary: clientAccount.brandSecondary,
    })
    .from(clientAccount)
    .where(eq(clientAccount.brandSlug, slug))
    .limit(1)
  if (!legacyRow) return null
  return toPublicBranding(legacyRow)
}

function toPublicBranding(row: BrandFields): PublicBranding {
  return {
    brandName: row.brandName,
    logoUrl: logoUrl(row.brandLogoKey),
    primaryColor: row.brandPrimary,
    secondaryColor: row.brandSecondary,
  }
}

// ─── Admin ──────────────────────────────────────────────────────────────────

export interface ClientBrandingRow {
  id: string
  email: string
  brandSlug: string | null
  brandName: string | null
  brandLogoKey: string | null
  logoUrl: string | null
  brandPrimary: string | null
  brandSecondary: string | null
}

function toClientBrandingRow(identity: { id: string; email: string; brandSlug: string | null }, brand: BrandFields): ClientBrandingRow {
  return {
    id: identity.id,
    email: identity.email,
    brandSlug: identity.brandSlug,
    brandName: brand.brandName,
    brandLogoKey: brand.brandLogoKey,
    logoUrl: logoUrl(brand.brandLogoKey),
    brandPrimary: brand.brandPrimary,
    brandSecondary: brand.brandSecondary,
  }
}

export async function listClientBranding(portalId: string): Promise<ClientBrandingRow[]> {
  const rows = await db
    .select(brandingCols)
    .from(clientAccount)
    .where(eq(clientAccount.portalId, portalId))
    .orderBy(asc(clientAccount.email))

  return rows.map((r) => toClientBrandingRow(r, r))
}

export async function updateClientBranding(
  portalId: string,
  accountId: string,
  input: UpdateBrandingDTO,
): Promise<ClientBrandingRow> {
  const [exists] = await db
    .select({ id: clientAccount.id })
    .from(clientAccount)
    .where(and(eq(clientAccount.id, accountId), eq(clientAccount.portalId, portalId)))
    .limit(1)
  if (!exists) throw Errors.notFound('Cuenta de cliente no encontrada')

  let row
  try {
    ;[row] = await db
      .update(clientAccount)
      .set({
        brandSlug: input.brandSlug ?? null,
        brandName: input.brandName ?? null,
        brandLogoKey: input.brandLogoKey ?? null,
        brandPrimary: input.brandPrimary ?? null,
        brandSecondary: input.brandSecondary ?? null,
      })
      .where(eq(clientAccount.id, accountId))
      .returning(brandingCols)
  } catch {
    // brand_slug es UNIQUE → choque de slug.
    throw new AppError('SLUG_TAKEN', 'Ese slug ya está en uso por otro cliente', 409)
  }
  if (!row) throw Errors.internal('No se pudo actualizar el branding')

  return toClientBrandingRow(row, row)
}

// ─── Cliente (autogestión de su propia marca desde el portal) ────────────────

/**
 * Empresa (si existe) del contacto dueño de este client_account.
 * Fase A: la fuente de verdad del branding pasó a la empresa. Un client_account
 * sin empresa asociada (contact.company_id NULL, o el join no resuelve) sigue
 * usando su propio branding — comportamiento de compatibilidad, no un error.
 */
async function resolveClientCompanyId(clientId: string): Promise<string | null> {
  const [row] = await db
    .select({ companyId: contact.companyId })
    .from(clientAccount)
    .innerJoin(contact, eq(contact.id, clientAccount.contactId))
    .where(eq(clientAccount.id, clientId))
    .limit(1)
  return row?.companyId ?? null
}

/** Empresa activa (no archivada) asociada a un client_account, si la hay. */
async function resolveClientCompanyBranding(clientId: string): Promise<BrandFields | null> {
  const companyId = await resolveClientCompanyId(clientId)
  if (!companyId) return null

  const [companyRow] = await db
    .select(companyBrandCols)
    .from(company)
    .where(and(eq(company.id, companyId), eq(company.archived, false)))
    .limit(1)
  return companyRow ?? null
}

export async function getOwnBranding(clientId: string): Promise<ClientBrandingRow> {
  const [row] = await db.select(brandingCols).from(clientAccount).where(eq(clientAccount.id, clientId)).limit(1)
  if (!row) throw Errors.notFound('Cuenta no encontrada')

  const companyBranding = await resolveClientCompanyBranding(clientId)
  return toClientBrandingRow(row, companyBranding ?? row)
}

export async function updateOwnBranding(
  clientId: string,
  input: ClientUpdateBrandingDTO,
): Promise<ClientBrandingRow> {
  const [identity] = await db
    .select({ id: clientAccount.id, email: clientAccount.email, brandSlug: clientAccount.brandSlug })
    .from(clientAccount)
    .where(eq(clientAccount.id, clientId))
    .limit(1)
  if (!identity) throw Errors.notFound('Cuenta no encontrada')

  const patch = {
    brandName: input.brandName ?? null,
    brandLogoKey: input.brandLogoKey ?? null,
    brandPrimary: input.brandPrimary ?? null,
    brandSecondary: input.brandSecondary ?? null,
  }

  const companyId = await resolveClientCompanyId(clientId)
  if (companyId) {
    // Empresa asociada → la fuente de verdad del branding es `company`. El
    // slug lo sigue controlando la agencia (no se toca acá, ni antes ni ahora).
    const [companyRow] = await db
      .update(company)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(company.id, companyId))
      .returning(companyBrandCols)
    if (!companyRow) throw Errors.internal('No se pudo actualizar el branding de la empresa')
    return toClientBrandingRow(identity, companyRow)
  }

  // Sin empresa asociada: comportamiento legacy — el branding vive en el propio client_account.
  const [row] = await db
    .update(clientAccount)
    .set(patch)
    .where(eq(clientAccount.id, clientId))
    .returning(brandingCols)
  if (!row) throw Errors.internal('No se pudo actualizar el branding')
  return toClientBrandingRow(row, row)
}
