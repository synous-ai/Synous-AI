import { createHash } from 'node:crypto'
import type { ListQuery } from '../../lib/crm-schemas'
import { cursorWhere, decodeTextCursor, paginateRows, type Paginated } from '../../lib/pagination'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db'
import { clientAccount, contact, company, clientAsset, clientOnboarding, deal } from '../../db/schema'
import { env } from '../../config/env'
import { AppError, Errors } from '../../lib/errors'
import { recordFieldChanges, writeAudit, type Tx } from '../../lib/audit'
import { clientDealIds, resolveActiveClientDeal } from '../../lib/portal-access'
import { notifyUser, notifyAdmins } from '../notifications/notify'
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
export function logoUrl(key: string | null): string | null {
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

// ─── Auditoría + notificación de cambios de marca ────────────────────────────

export interface BrandChange {
  field: string
  oldValue: unknown
  newValue: unknown
}

/** Nombre en español de cada campo de marca, para el payload de la notificación. */
const BRAND_FIELD_LABELS: Record<string, string> = {
  brandName: 'Nombre de marca',
  brandLogoKey: 'Logo',
  brandPrimary: 'Color principal',
  brandSecondary: 'Color secundario',
}

export function brandFieldLabel(field: string): string {
  return BRAND_FIELD_LABELS[field] ?? field
}

/**
 * Compara `before` (fila actual) contra `patch` (lo que llegó) campo por
 * campo, solo para las claves presentes en el patch. Se usa tanto para el
 * payload de `writeAudit` (`{ section: 'marca', changes }`) como para decidir
 * si hay algo que auditar/notificar — un PATCH sin cambios reales (mismos
 * valores, o vacío) no debe dejar rastro.
 */
function computeBrandChanges<T extends Record<string, unknown>>(before: T, patch: Partial<T>): BrandChange[] {
  const changes: BrandChange[] = []
  for (const key of Object.keys(patch)) {
    const newValue = patch[key]
    if (newValue === undefined) continue
    const oldValue = before[key] ?? null
    if (oldValue !== (newValue ?? null)) changes.push({ field: key, oldValue, newValue: newValue ?? null })
  }
  return changes
}

/**
 * Notifica al responsable del deal (o a todo el equipo, si no tiene) que el
 * cliente cambió algo de su marca. ÚNICA puerta de entrada para esta
 * notificación — la reusan branding.service.ts (colores/logo, archivos) y
 * onboarding.service.ts (identidad de marca en el brief), para no repetir la
 * resolución de owner/nombre del cliente en cada call site.
 *
 * Solo para cambios ORIGINADOS POR EL CLIENTE: el admin nunca dispara esta
 * notificación (regla de negocio explícita — se entera por estar mirando el
 * panel, no hace falta una campanita para su propio cambio).
 *
 * BEST-EFFORT — igual que `notifyUser`/`notifyAdmins` (notify.ts): siempre se
 * llama DESPUÉS del commit de la escritura real (color guardado, archivo
 * subido/archivado, brief actualizado). Un blip de red/DB acá NUNCA puede
 * devolver 500 por algo que ya se guardó correctamente, ni hacer que un
 * retry del cliente duplique la escritura (un segundo POST de archivo, por
 * ejemplo). Por eso todo el cuerpo va en try/catch — nunca propaga.
 */
export async function notifyBrandChange(input: {
  portalId: string
  dealId: string
  clientId: string
  fields: string[]
  action: 'update' | 'add' | 'delete'
}): Promise<void> {
  try {
    const [[dealRow], [clientRow]] = await Promise.all([
      db.select({ name: deal.name, ownerId: deal.ownerId }).from(deal).where(eq(deal.id, input.dealId)).limit(1),
      db
        .select({ email: contact.email, firstName: contact.firstName, lastName: contact.lastName })
        .from(clientAccount)
        .innerJoin(contact, eq(contact.id, clientAccount.contactId))
        .where(eq(clientAccount.id, input.clientId))
        .limit(1),
    ])
    const clientName = clientRow ? ([clientRow.firstName, clientRow.lastName].filter(Boolean).join(' ').trim() || clientRow.email) ?? 'Cliente' : 'Cliente'
    const payload = {
      dealId: input.dealId,
      dealName: dealRow?.name ?? null,
      clientName,
      section: 'Marca' as const,
      fields: input.fields,
      action: input.action,
      changedAt: new Date().toISOString(),
    }
    const opts = { entity: { type: 'deal', id: input.dealId } }
    if (dealRow?.ownerId) await notifyUser(input.portalId, dealRow.ownerId, 'client_brand_updated', payload, opts)
    else await notifyAdmins(input.portalId, 'client_brand_updated', payload, opts)
  } catch (err) {
    // Ningún dato sensible en el contexto (ids + acción) — seguro de loguear.
    console.error('[branding] no se pudo notificar el cambio de marca', {
      portalId: input.portalId,
      dealId: input.dealId,
      clientId: input.clientId,
      action: input.action,
      error: (err as Error)?.message ?? err,
    })
  }
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
  let resultRow: ClientBrandingRow
  let changes: BrandChange[]

  if (companyId && Object.keys(patch).length === 0) {
    // Empresa asociada, PATCH vacío: nada que leer con lock ni escribir.
    const [current] = await db.select(companyBrandCols).from(company).where(eq(company.id, companyId)).limit(1)
    if (!current) throw Errors.notFound('Empresa no encontrada')
    return toClientBrandingRow(identity, current)
  }

  if (companyId) {
    // Empresa asociada → la fuente de verdad del branding es `company`. El
    // slug lo sigue controlando la agencia (no se toca acá, ni antes ni ahora).
    const { companyRow, previousKey, entityChanges } = await db.transaction(async (tx) => {
      const [current] = await tx
        .select(companyBrandCols)
        .from(company)
        .where(eq(company.id, companyId))
        .limit(1)
        .for('update')
      if (!current) throw Errors.notFound('Empresa no encontrada')
      const entityChanges = computeBrandChanges(current, patch)
      // Sin cambios reales (mismos valores que ya tenía): ni claim, ni UPDATE
      // (no pisa `updated_at` de un PATCH que no cambió nada), ni auditoría.
      if (entityChanges.length === 0) return { companyRow: current, previousKey: current.brandLogoKey, entityChanges }

      const previous = current.brandLogoKey
      if (isNewStorageKey(patch.brandLogoKey, previous)) await claimUpload(tx, preparedClaim)
      const [updated] = await tx
        .update(company)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(company.id, companyId))
        .returning(companyBrandCols)
      if (!updated) throw Errors.internal('No se pudo actualizar el branding de la empresa')
      await recordFieldChanges({ tx, portalId, entityType: 'company', entityId: companyId, before: current, after: patch, changedBy: null })
      await writeAudit({
        tx,
        portalId,
        clientId,
        entityType: 'company',
        entityId: companyId,
        action: 'BRAND_UPDATE',
        payload: { section: 'marca', changes: entityChanges },
      })
      return { companyRow: updated, previousKey: previous, entityChanges }
    })
    if (patch.brandLogoKey !== undefined) await releaseReplacedUpload(portalId, previousKey, companyRow.brandLogoKey)
    resultRow = toClientBrandingRow(identity, companyRow)
    changes = entityChanges
  } else if (Object.keys(patch).length === 0) {
    // Sin empresa asociada, PATCH vacío: comportamiento legacy, nada que hacer.
    const [current] = await db.select(brandingCols).from(clientAccount).where(eq(clientAccount.id, clientId)).limit(1)
    if (!current) throw Errors.notFound('Cuenta no encontrada')
    return toClientBrandingRow(current, current)
  } else {
    // Sin empresa asociada: comportamiento legacy — el branding vive en el propio client_account.
    const { row, previousKey, entityChanges } = await db.transaction(async (tx) => {
      const [current] = await tx
        .select(brandingCols)
        .from(clientAccount)
        .where(eq(clientAccount.id, clientId))
        .limit(1)
        .for('update')
      if (!current) throw Errors.notFound('Cuenta no encontrada')
      const entityChanges = computeBrandChanges(current, patch)
      if (entityChanges.length === 0) return { row: current, previousKey: current.brandLogoKey, entityChanges }

      const previous = current.brandLogoKey
      if (isNewStorageKey(patch.brandLogoKey, previous)) await claimUpload(tx, preparedClaim)
      const [updated] = await tx
        .update(clientAccount)
        .set(patch)
        .where(eq(clientAccount.id, clientId))
        .returning(brandingCols)
      if (!updated) throw Errors.internal('No se pudo actualizar el branding')
      await recordFieldChanges({ tx, portalId, entityType: 'client_account', entityId: clientId, before: current, after: patch, changedBy: null })
      await writeAudit({
        tx,
        portalId,
        clientId,
        entityType: 'client_account',
        entityId: clientId,
        action: 'BRAND_UPDATE',
        payload: { section: 'marca', changes: entityChanges },
      })
      return { row: updated, previousKey: previous, entityChanges }
    })
    if (patch.brandLogoKey !== undefined) await releaseReplacedUpload(portalId, previousKey, row.brandLogoKey)
    resultRow = toClientBrandingRow(row, row)
    changes = entityChanges
  }

  if (changes.length > 0) {
    const activeDeal = await resolveActiveClientDeal(clientId)
    if (activeDeal) {
      await notifyBrandChange({
        portalId,
        dealId: activeDeal.id,
        clientId,
        fields: changes.map((c) => brandFieldLabel(c.field)),
        action: 'update',
      })
    }
  }

  return resultRow
}

// ─── Cliente: archivos de marca (client_asset, field_name = 'logoBrand') ────

/**
 * Empresa/cuenta propia del cliente + resuelve la key del logo vigente para
 * poder EXCLUIRLA de los listados de "archivos de marca" — el logo es SOLO el
 * campo de identidad (`brand_logo_key`), nunca aparece como un archivo suelto
 * del checklist aunque comparta `field_name: 'logoBrand'` por historia del
 * wizard de onboarding pre-existente.
 */
export async function resolveBrandLogoKey(clientId: string): Promise<string | null> {
  const companyBranding = await resolveClientCompanyBranding(clientId)
  if (companyBranding) return companyBranding.brandLogoKey
  const [row] = await db.select({ brandLogoKey: clientAccount.brandLogoKey }).from(clientAccount).where(eq(clientAccount.id, clientId)).limit(1)
  return row?.brandLogoKey ?? null
}

/**
 * Si el archivo que se está archivando estaba referenciado en el checklist de
 * materiales del wizard de onboarding (paso 7, categoría 'logoBrand',
 * `materials.logoBrand.assetIds`), lo saca de esa lista — si no, quedaba un id
 * colgado apuntando a un `client_asset` ya archivado (el checklist lo seguía
 * "contando" como adjunto).
 *
 * UPDATE atómico en jsonb, en la MISMA transacción que el archive: el `WHERE
 * ... @> assetId` hace que la fila ni se toque (ni `updated_at`) si el id no
 * estaba ahí — no pisa `done`/`note` de esa categoría, solo el array.
 */
export async function removeBrandAssetFromMaterials(tx: Tx, dealId: string, assetId: string): Promise<void> {
  await tx
    .update(clientOnboarding)
    .set({
      materials: sql`jsonb_set(
        ${clientOnboarding.materials},
        '{logoBrand,assetIds}',
        COALESCE(
          (
            SELECT jsonb_agg(elem)
            FROM jsonb_array_elements(${clientOnboarding.materials} #> '{logoBrand,assetIds}') AS elem
            WHERE elem <> to_jsonb(${assetId}::text)
          ),
          '[]'::jsonb
        )
      )`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(clientOnboarding.dealId, dealId),
        sql`${clientOnboarding.materials} -> 'logoBrand' -> 'assetIds' @> ${JSON.stringify([assetId])}::jsonb`,
      ),
    )
}

/**
 * Vincula un archivo YA subido (intent + subida directa, propósito
 * `onboarding_material` — el logo usa `brand_logo` y nunca pasa por acá) como
 * "archivo de marca" del deal activo del cliente.
 */
export async function addOwnBrandFile(clientId: string, storageKey: string): Promise<typeof clientAsset.$inferSelect> {
  const activeDeal = await resolveActiveClientDeal(clientId)
  if (!activeDeal) throw Errors.notFound('No hay un proyecto activo asociado a esta cuenta')

  const preparedClaim = await prepareUploadClaim({
    storageKey,
    portalId: activeDeal.portalId,
    actor: { kind: 'client', clientId, portalId: activeDeal.portalId },
    purpose: 'onboarding_material',
  })

  const row = await db.transaction(async (tx) => {
    const upload = await claimUpload(tx, preparedClaim)
    const [inserted] = await tx
      .insert(clientAsset)
      .values({
        portalId: activeDeal.portalId,
        dealId: activeDeal.id,
        clientId,
        intakeId: null,
        fieldName: 'logoBrand',
        name: upload.originalName,
        type: upload.contentType.startsWith('image/') ? 'foto' : 'documento',
        mimeType: upload.contentType,
        storageKey: upload.storageKey,
        sizeBytes: upload.sizeBytes,
      })
      .returning()
    if (!inserted) throw Errors.internal('No se pudo guardar el archivo')
    await writeAudit({
      tx,
      portalId: activeDeal.portalId,
      clientId,
      entityType: 'client_asset',
      entityId: inserted.id,
      action: 'BRAND_FILE_ADD',
      payload: { section: 'marca', changes: [{ field: 'brandFiles', oldValue: null, newValue: inserted.name }] },
    })
    return inserted
  })

  await notifyBrandChange({ portalId: activeDeal.portalId, dealId: activeDeal.id, clientId, fields: ['Archivos de marca'], action: 'add' })
  return row
}

/**
 * Soft delete de un archivo de marca: solo si pertenece a un deal del cliente
 * autenticado, con `field_name = 'logoBrand'` y todavía no archivado — 404
 * (no 403) en cualquier otro caso, convención del resto de los endpoints
 * client-facing (no confirmarle a un cliente que el id existe pero es ajeno).
 */
export async function deleteOwnBrandFile(clientId: string, assetId: string): Promise<void> {
  const dealIds = await clientDealIds(clientId)
  if (dealIds.length === 0) throw Errors.notFound('Archivo no encontrado')

  const result = await db.transaction(async (tx) => {
    const [asset] = await tx
      .select({ id: clientAsset.id, dealId: clientAsset.dealId, portalId: clientAsset.portalId, name: clientAsset.name })
      .from(clientAsset)
      .where(
        and(
          eq(clientAsset.id, assetId),
          inArray(clientAsset.dealId, dealIds),
          eq(clientAsset.fieldName, 'logoBrand'),
          eq(clientAsset.archived, false),
        ),
      )
      .limit(1)
      .for('update')
    if (!asset) throw Errors.notFound('Archivo no encontrado')

    await tx.update(clientAsset).set({ archived: true, archivedAt: new Date() }).where(eq(clientAsset.id, assetId))
    await removeBrandAssetFromMaterials(tx, asset.dealId, assetId)
    await writeAudit({
      tx,
      portalId: asset.portalId,
      clientId,
      entityType: 'client_asset',
      entityId: assetId,
      action: 'BRAND_FILE_ARCHIVE',
      payload: { section: 'marca', changes: [{ field: 'brandFiles', oldValue: asset.name, newValue: null }] },
    })
    return asset
  })

  await notifyBrandChange({ portalId: result.portalId, dealId: result.dealId, clientId, fields: ['Archivos de marca'], action: 'delete' })
}

// ─── Admin: branding de la empresa (colores/logo/nombre) ────────────────────

export interface CompanyBrandingDTO {
  brandName: string | null
  brandLogoKey: string | null
  logoUrl: string | null
  brandPrimary: string | null
  brandSecondary: string | null
}

/**
 * El admin edita el mismo branding que el cliente (`company.brand_*`), desde
 * el panel. NO dispara `notifyBrandChange` — regla de negocio explícita: un
 * cambio que origina el propio equipo no necesita avisarle al equipo.
 */
export async function updateCompanyBranding(
  portalId: string,
  userId: string,
  companyId: string,
  input: ClientUpdateBrandingDTO,
): Promise<CompanyBrandingDTO> {
  const patch = definedFields(input)
  const preparedClaim = patch.brandLogoKey
    ? await prepareUploadClaim({ storageKey: patch.brandLogoKey, portalId, actor: { kind: 'hub', userId, portalId }, purpose: 'brand_logo' })
    : null

  const result = await db.transaction(async (tx) => {
    const [current] = await tx
      .select(companyBrandCols)
      .from(company)
      .where(and(eq(company.id, companyId), eq(company.portalId, portalId), eq(company.archived, false)))
      .limit(1)
      .for('update')
    if (!current) throw Errors.notFound('Empresa no encontrada')

    const changes = computeBrandChanges(current, patch)
    // Patch vacío o sin cambios reales: ni claim, ni UPDATE, ni auditoría.
    if (changes.length === 0) return { row: current, previousKey: current.brandLogoKey }

    if (isNewStorageKey(patch.brandLogoKey, current.brandLogoKey)) await claimUpload(tx, preparedClaim)
    const [updated] = await tx
      .update(company)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(company.id, companyId))
      .returning(companyBrandCols)
    if (!updated) throw Errors.internal('No se pudo actualizar el branding de la empresa')

    await recordFieldChanges({ tx, portalId, entityType: 'company', entityId: companyId, before: current, after: patch, changedBy: userId })
    await writeAudit({
      tx,
      portalId,
      userId,
      entityType: 'company',
      entityId: companyId,
      action: 'BRAND_UPDATE',
      payload: { section: 'marca', changes },
    })
    return { row: updated, previousKey: current.brandLogoKey }
  })

  if (patch.brandLogoKey !== undefined) await releaseReplacedUpload(portalId, result.previousKey, result.row.brandLogoKey)
  return { ...result.row, logoUrl: logoUrl(result.row.brandLogoKey) }
}
