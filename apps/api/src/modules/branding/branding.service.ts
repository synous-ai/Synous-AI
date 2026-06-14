import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { clientAccount } from '../../db/schema'
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

/** Público (pre-login): resuelve el branding por el slug de la URL. */
export async function getBrandingBySlug(slug: string): Promise<PublicBranding | null> {
  // ENDPOINT PÚBLICO — proyección mínima, sin datos sensibles del cliente.
  const [row] = await db
    .select({
      brandName: clientAccount.brandName,
      brandLogoKey: clientAccount.brandLogoKey,
      brandPrimary: clientAccount.brandPrimary,
      brandSecondary: clientAccount.brandSecondary,
    })
    .from(clientAccount)
    .where(eq(clientAccount.brandSlug, slug))
    .limit(1)
  if (!row) return null
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

export async function listClientBranding(portalId: string): Promise<ClientBrandingRow[]> {
  const rows = await db
    .select(brandingCols)
    .from(clientAccount)
    .where(eq(clientAccount.portalId, portalId))
    .orderBy(asc(clientAccount.email))

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    brandSlug: r.brandSlug,
    brandName: r.brandName,
    brandLogoKey: r.brandLogoKey,
    logoUrl: logoUrl(r.brandLogoKey),
    brandPrimary: r.brandPrimary,
    brandSecondary: r.brandSecondary,
  }))
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

  return {
    id: row.id,
    email: row.email,
    brandSlug: row.brandSlug,
    brandName: row.brandName,
    brandLogoKey: row.brandLogoKey,
    logoUrl: logoUrl(row.brandLogoKey),
    brandPrimary: row.brandPrimary,
    brandSecondary: row.brandSecondary,
  }
}

// ─── Cliente (autogestión de su propia marca desde el portal) ────────────────

export async function getOwnBranding(clientId: string): Promise<ClientBrandingRow> {
  const [row] = await db.select(brandingCols).from(clientAccount).where(eq(clientAccount.id, clientId)).limit(1)
  if (!row) throw Errors.notFound('Cuenta no encontrada')
  return {
    id: row.id,
    email: row.email,
    brandSlug: row.brandSlug,
    brandName: row.brandName,
    brandLogoKey: row.brandLogoKey,
    logoUrl: logoUrl(row.brandLogoKey),
    brandPrimary: row.brandPrimary,
    brandSecondary: row.brandSecondary,
  }
}

export async function updateOwnBranding(
  clientId: string,
  input: ClientUpdateBrandingDTO,
): Promise<ClientBrandingRow> {
  // Solo toca los campos del brand kit. El slug lo controla la agencia.
  const [row] = await db
    .update(clientAccount)
    .set({
      brandName: input.brandName ?? null,
      brandLogoKey: input.brandLogoKey ?? null,
      brandPrimary: input.brandPrimary ?? null,
      brandSecondary: input.brandSecondary ?? null,
    })
    .where(eq(clientAccount.id, clientId))
    .returning(brandingCols)
  if (!row) throw Errors.notFound('Cuenta no encontrada')
  return {
    id: row.id,
    email: row.email,
    brandSlug: row.brandSlug,
    brandName: row.brandName,
    brandLogoKey: row.brandLogoKey,
    logoUrl: logoUrl(row.brandLogoKey),
    brandPrimary: row.brandPrimary,
    brandSecondary: row.brandSecondary,
  }
}
