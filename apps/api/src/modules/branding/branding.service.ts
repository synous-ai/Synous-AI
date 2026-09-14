import { createHash } from 'node:crypto'
import type { ListQuery } from '../../lib/crm-schemas'
import { cursorWhere, decodeTextCursor, paginateRows, type Paginated } from '../../lib/pagination'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { clientAccount, contact, company } from '../../db/schema'
import { env } from '../../config/env'
import { AppError, Errors } from '../../lib/errors'
import { claimUpload, isNewStorageKey, prepareUploadClaim, releaseReplacedUpload } from '../uploads/uploads.service'
import type { UpdateBrandingDTO, ClientUpdateBrandingDTO } from './branding.schema'

export interface PublicBranding {
  brandName: string | null
  logoUrl: string | null
  primaryColor: string | null
  secondaryColor: string | null
}

/**
 * El logo se sirve por la ruta PÚBLICA (redirige a una URL de lectura de corta
 * vida): tiene que renderizar en el login del portal, antes de cualquier
 * sesión. `v` cambia con la key para que el browser no reuse un logo reemplazado.
 */
function logoUrl(key: string | null): string | null {
  if (!key) return null
  const version = createHash('sha256').update(key).digest('hex').slice(0, 12)
  return `${env.PUBLIC_API_URL}/api/public/files/brand-logo/${key}?v=${version}`
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

/**
 * PATCH real: solo se escriben los campos presentes. `null` explícito borra el
 * valor; un campo ausente no se toca. Antes cada campo omitido se pisaba con
 * null, así que cambiar un color desde el portal borraba el logo y el nombre.
 */
function definedFields<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as Partial<T>
}

export async function listClientBranding(portalId: string, query: ListQuery): Promise<Paginated<ClientBrandingRow>> {
  const cursor = decodeTextCursor(query.cursor)
  const rows = await db
    .select(brandingCols)
    .from(clientAccount)
    .where(
      and(
        eq(clientAccount.portalId, portalId),
        cursor ? cursorWhere(clientAccount.email, clientAccount.id, cursor, 'asc') : undefined,
      ),
    )
    .orderBy(asc(clientAccount.email), asc(clientAccount.id))
    .limit(query.limit + 1)

  const { items, nextCursor } = paginateRows(rows, query.limit, (r) => ({ createdAt: r.email, id: r.id }))
  return { items: items.map((r) => toClientBrandingRow(r, r)), nextCursor }
}

export async function updateClientBranding(
  portalId: string,
  userId: string,
  accountId: string,
  input: UpdateBrandingDTO,
): Promise<ClientBrandingRow> {
  const patch = definedFields(input)
  if (Object.keys(patch).length === 0) {
    const [current] = await db
      .select(brandingCols)
      .from(clientAccount)
      .where(and(eq(clientAccount.id, accountId), eq(clientAccount.portalId, portalId)))
      .limit(1)
    if (!current) throw Errors.notFound('Cuenta de cliente no encontrada')
    return toClientBrandingRow(current, current)
  }

  const preparedClaim = patch.brandLogoKey
    ? await prepareUploadClaim({ storageKey: patch.brandLogoKey, portalId, actor: { kind: 'hub', userId, portalId }, purpose: 'brand_logo' })
    : null

  let result
  try {
    result = await db.transaction(async (tx) => {
      // FOR UPDATE: sin el lock, dos ediciones concurrentes leían el mismo logo
      // "anterior" y una liberaba el archivo que la otra acababa de guardar.
      const [current] = await tx
        .select({ brandLogoKey: clientAccount.brandLogoKey })
        .from(clientAccount)
        .where(and(eq(clientAccount.id, accountId), eq(clientAccount.portalId, portalId)))
        .limit(1)
        .for('update')
      if (!current) throw Errors.notFound('Cuenta de cliente no encontrada')

      if (isNewStorageKey(patch.brandLogoKey, current.brandLogoKey)) await claimUpload(tx, preparedClaim)
      const [row] = await tx
        .update(clientAccount)
        .set(patch)
        .where(eq(clientAccount.id, accountId))
        .returning(brandingCols)
      if (!row) throw Errors.internal('No se pudo actualizar el branding')
      return { row, previousKey: current.brandLogoKey }
    })
  } catch (err) {
    // El patch solo toca columnas de marca, y de ellas solo brand_slug es UNIQUE:
    // un 23505 acá es choque de slug. Cualquier otro error (conexión, timeout)
    // tiene que llegar como 500, no disfrazarse de "slug en uso".
    if ((err as { code?: string }).code === '23505') {
      throw new AppError('SLUG_TAKEN', 'Ese slug ya está en uso por otro cliente', 409)
    }
    throw err
  }

  if (patch.brandLogoKey !== undefined) await releaseReplacedUpload(portalId, result.previousKey, result.row.brandLogoKey)
  return toClientBrandingRow(result.row, result.row)
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
    .select({
      id: clientAccount.id,
      email: clientAccount.email,
      brandSlug: clientAccount.brandSlug,
      portalId: clientAccount.portalId,
    })
    .from(clientAccount)
    .where(eq(clientAccount.id, clientId))
    .limit(1)
  if (!identity) throw Errors.notFound('Cuenta no encontrada')

  const patch = definedFields(input)
  const portalId = identity.portalId
  const preparedClaim = patch.brandLogoKey
    ? await prepareUploadClaim({ storageKey: patch.brandLogoKey, portalId, actor: { kind: 'client', clientId, portalId }, purpose: 'brand_logo' })
    : null

  const companyId = await resolveClientCompanyId(clientId)
  if (companyId) {
    // Empresa asociada → la fuente de verdad del branding es `company`. El
    // slug lo sigue controlando la agencia (no se toca acá, ni antes ni ahora).
    const { companyRow, previousKey } = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ brandLogoKey: company.brandLogoKey })
        .from(company)
        .where(eq(company.id, companyId))
        .limit(1)
        .for('update')
      const previous = current?.brandLogoKey ?? null
      if (isNewStorageKey(patch.brandLogoKey, previous)) await claimUpload(tx, preparedClaim)
      const [updated] = await tx
        .update(company)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(company.id, companyId))
        .returning(companyBrandCols)
      return { companyRow: updated, previousKey: previous }
    })
    if (!companyRow) throw Errors.internal('No se pudo actualizar el branding de la empresa')
    if (patch.brandLogoKey !== undefined) await releaseReplacedUpload(portalId, previousKey, companyRow.brandLogoKey)
    return toClientBrandingRow(identity, companyRow)
  }

  // Sin empresa asociada: comportamiento legacy — el branding vive en el propio client_account.
  if (Object.keys(patch).length === 0) {
    const [current] = await db.select(brandingCols).from(clientAccount).where(eq(clientAccount.id, clientId)).limit(1)
    if (!current) throw Errors.notFound('Cuenta no encontrada')
    return toClientBrandingRow(current, current)
  }
  const { row, previousKey } = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ brandLogoKey: clientAccount.brandLogoKey })
      .from(clientAccount)
      .where(eq(clientAccount.id, clientId))
      .limit(1)
      .for('update')
    const previous = current?.brandLogoKey ?? null
    if (isNewStorageKey(patch.brandLogoKey, previous)) await claimUpload(tx, preparedClaim)
    const [updated] = await tx
      .update(clientAccount)
      .set(patch)
      .where(eq(clientAccount.id, clientId))
      .returning(brandingCols)
    return { row: updated, previousKey: previous }
  })
  if (!row) throw Errors.internal('No se pudo actualizar el branding')
  if (patch.brandLogoKey !== undefined) await releaseReplacedUpload(portalId, previousKey, row.brandLogoKey)
  return toClientBrandingRow(row, row)
}
