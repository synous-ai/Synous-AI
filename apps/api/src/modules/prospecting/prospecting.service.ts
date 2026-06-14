import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../../db'
import { prospect, prospectSearch, contact, company } from '../../db/schema'
import { AppError, Errors } from '../../lib/errors'
import { decodeCursor, cursorWhere, paginateRows } from '../../lib/pagination'
import { searchBusinesses, isPlacesConfigured } from './places.client'
import { scrapeEmail } from './email-scraper'
import { analyzeBusiness, suggestServices, isVertexConfigured, type BusinessAnalysis } from './vertex.client'
import type { RunSearchDTO, ListSearchesQueryDTO, ListProspectsQueryDTO } from './prospecting.schema'
import { notifyAdmins, actorName } from '../notifications/notifications.service'

type ProspectRow = typeof prospect.$inferSelect
type SearchRow = typeof prospectSearch.$inferSelect

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface ProspectDTO {
  id: string
  searchId: string
  name: string
  address: string | null
  phone: string | null
  website: string | null
  email: string | null
  rating: number | null
  userRatingsTotal: number | null
  types: string[]
  aiAnalysis: string | null
  aiProposal: BusinessAnalysis | null
  status: string
  importedContactId: string | null
  createdAt: string
}

export interface SearchDTO {
  id: string
  query: string
  ourServices: string | null
  requestedLimit: number
  resultCount: number
  status: string
  error: string | null
  createdAt: string
}

function toProspectDTO(row: ProspectRow): ProspectDTO {
  return {
    id: row.id,
    searchId: row.searchId,
    name: row.name,
    address: row.address,
    phone: row.phone,
    website: row.website,
    email: row.email,
    rating: row.rating != null ? Number(row.rating) : null,
    userRatingsTotal: row.userRatingsTotal,
    types: row.types ?? [],
    aiAnalysis: row.aiAnalysis,
    aiProposal: (row.aiProposal as BusinessAnalysis | null) ?? null,
    status: row.status,
    importedContactId: row.importedContactId,
    createdAt: row.createdAt.toISOString(),
  }
}

function toSearchDTO(row: SearchRow): SearchDTO {
  return {
    id: row.id,
    query: row.query,
    ourServices: row.ourServices,
    requestedLimit: row.requestedLimit,
    resultCount: row.resultCount,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  }
}

// ─── Capabilities (para que el front sepa qué está configurado) ────────────────

export function getProspectingCapabilities(): { places: boolean; ai: boolean } {
  return { places: isPlacesConfigured(), ai: isVertexConfigured() }
}

export async function suggestProspectingServices(hint: string): Promise<string> {
  if (!isVertexConfigured()) {
    throw new AppError('AI_NOT_CONFIGURED', 'La sugerencia con IA requiere Vertex configurado.', 503)
  }
  const text = await suggestServices(hint)
  if (!text) throw Errors.internal('La IA no devolvió una sugerencia')
  return text
}

// ─── Pipeline: search → Places → (scrape email + IA) → store ───────────────────

export async function runProspectSearch(
  portalId: string,
  userId: string,
  input: RunSearchDTO,
): Promise<{ search: SearchDTO; prospects: ProspectDTO[] }> {
  if (!isPlacesConfigured()) {
    throw new AppError(
      'PLACES_NOT_CONFIGURED',
      'La prospección requiere GOOGLE_MAPS_API_KEY configurada en la API.',
      503,
    )
  }

  const [search] = await db
    .insert(prospectSearch)
    .values({
      portalId,
      query: input.query,
      ourServices: input.ourServices ?? null,
      requestedLimit: input.limit,
      status: 'running',
      createdBy: userId,
    })
    .returning()

  if (!search) throw Errors.internal('No se pudo crear la búsqueda')

  try {
    const places = await searchBusinesses(input.query, input.limit)

    // Dedup: descartar negocios ya prospectados antes (por google_place_id),
    // a nivel del portal entero — así no duplicamos ni gastamos IA de nuevo.
    const placeIds = places
      .map((p) => p.googlePlaceId)
      .filter((id): id is string => Boolean(id))
    const alreadySeen = placeIds.length
      ? await db
          .select({ googlePlaceId: prospect.googlePlaceId })
          .from(prospect)
          .where(and(eq(prospect.portalId, portalId), inArray(prospect.googlePlaceId, placeIds)))
      : []
    const seen = new Set(alreadySeen.map((r) => r.googlePlaceId))
    const batchSeen = new Set<string>()
    const fresh = places.filter((p) => {
      if (!p.googlePlaceId) return true // sin id no se puede deduplicar
      if (seen.has(p.googlePlaceId) || batchSeen.has(p.googlePlaceId)) return false
      batchSeen.add(p.googlePlaceId)
      return true
    })

    // Enriquecimiento concurrente: email scraping + análisis IA por negocio.
    // La IA es best-effort: si falla, el prospecto se guarda sin análisis.
    const enriched = await Promise.all(
      fresh.map(async (place) => {
        const [email, ai] = await Promise.all([
          place.website ? scrapeEmail(place.website) : Promise.resolve(null),
          analyzeBusiness({
            name: place.name,
            types: place.types,
            website: place.website,
            rating: place.rating,
            address: place.address,
            ourServices: input.ourServices ?? null,
          }).catch(() => null),
        ])
        return { place, email, ai }
      }),
    )

    let prospects: ProspectDTO[] = []
    if (enriched.length > 0) {
      const rows = await db
        .insert(prospect)
        .values(
          enriched.map(({ place, email, ai }) => ({
            portalId,
            searchId: search.id,
            name: place.name,
            address: place.address,
            phone: place.phone,
            website: place.website,
            email,
            rating: place.rating != null ? String(place.rating) : null,
            userRatingsTotal: place.userRatingsTotal,
            googlePlaceId: place.googlePlaceId || null,
            types: place.types,
            aiAnalysis: ai?.analysis ?? null,
            aiProposal: ai ? (ai as unknown as Record<string, unknown>) : null,
          })),
        )
        .returning()
      prospects = rows.map(toProspectDTO)
    }

    const [updated] = await db
      .update(prospectSearch)
      .set({ status: 'completed', resultCount: prospects.length })
      .where(eq(prospectSearch.id, search.id))
      .returning()

    return { search: toSearchDTO(updated ?? search), prospects }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    await db
      .update(prospectSearch)
      .set({ status: 'failed', error: message })
      .where(eq(prospectSearch.id, search.id))
    if (err instanceof AppError) throw err
    throw new AppError('PROSPECTING_FAILED', `La prospección falló: ${message}`, 502)
  }
}

// ─── Listados ──────────────────────────────────────────────────────────────────

export async function listSearches(
  portalId: string,
  query: ListSearchesQueryDTO,
): Promise<{ items: SearchDTO[]; nextCursor: string | null }> {
  const cursor = decodeCursor(query.cursor)
  const rows = await db
    .select()
    .from(prospectSearch)
    .where(
      and(
        eq(prospectSearch.portalId, portalId),
        cursor ? cursorWhere(prospectSearch.createdAt, prospectSearch.id, cursor) : undefined,
      ),
    )
    .orderBy(desc(prospectSearch.createdAt), desc(prospectSearch.id))
    .limit(query.limit + 1)

  const page = paginateRows(rows, query.limit)
  return { items: page.items.map(toSearchDTO), nextCursor: page.nextCursor }
}

export async function getSearchWithProspects(
  portalId: string,
  searchId: string,
): Promise<{ search: SearchDTO; prospects: ProspectDTO[] }> {
  const [row] = await db
    .select()
    .from(prospectSearch)
    .where(and(eq(prospectSearch.id, searchId), eq(prospectSearch.portalId, portalId)))
    .limit(1)

  if (!row) throw Errors.notFound('Búsqueda no encontrada')

  const prospects = await db
    .select()
    .from(prospect)
    .where(and(eq(prospect.searchId, searchId), eq(prospect.portalId, portalId)))
    .orderBy(desc(prospect.createdAt))

  return { search: toSearchDTO(row), prospects: prospects.map(toProspectDTO) }
}

export async function listProspects(
  portalId: string,
  query: ListProspectsQueryDTO,
): Promise<ProspectDTO[]> {
  const conditions = [eq(prospect.portalId, portalId)]
  if (query.searchId) conditions.push(eq(prospect.searchId, query.searchId))
  if (query.status) conditions.push(eq(prospect.status, query.status))

  const rows = await db
    .select()
    .from(prospect)
    .where(and(...conditions))
    .orderBy(desc(prospect.createdAt))
    .limit(500)

  return rows.map(toProspectDTO)
}

// ─── Acciones sobre un prospecto ───────────────────────────────────────────────

async function findProspect(portalId: string, id: string): Promise<ProspectRow> {
  const [row] = await db
    .select()
    .from(prospect)
    .where(and(eq(prospect.id, id), eq(prospect.portalId, portalId)))
    .limit(1)
  if (!row) throw Errors.notFound('Prospecto no encontrado')
  return row
}

/**
 * Promueve un prospecto al CRM: crea una empresa + un contacto (lead) y marca
 * el prospecto como importado. Toca 3 tablas → transacción.
 */
export async function importProspect(
  portalId: string,
  userId: string,
  id: string,
): Promise<{ contactId: string; companyId: string }> {
  const row = await findProspect(portalId, id)

  if (row.status === 'imported' && row.importedContactId) {
    throw Errors.conflict('Este prospecto ya fue importado al CRM')
  }

  const result = await db.transaction(async (tx) => {
    const [newCompany] = await tx
      .insert(company)
      .values({
        portalId,
        ownerId: userId,
        name: row.name,
        website: row.website,
        phone: row.phone,
        custom: { source: 'prospecting', prospectId: row.id },
      })
      .returning({ id: company.id })

    if (!newCompany) throw Errors.internal('No se pudo crear la empresa')

    let newContact: { id: string } | undefined
    try {
      ;[newContact] = await tx
        .insert(contact)
        .values({
          portalId,
          ownerId: userId,
          companyId: newCompany.id,
          firstName: row.name,
          email: row.email,
          phone: row.phone,
          lifecycleStage: 'lead',
          custom: { source: 'prospecting', prospectId: row.id },
        })
        .returning({ id: contact.id })
    } catch {
      // Choque de email único (portal_id, email): ya existe ese contacto.
      throw Errors.conflict('Ya existe un contacto con ese email en el CRM')
    }

    if (!newContact) throw Errors.internal('No se pudo crear el contacto')

    await tx
      .update(prospect)
      .set({ status: 'imported', importedContactId: newContact.id })
      .where(eq(prospect.id, row.id))

    return { contactId: newContact.id, companyId: newCompany.id }
  })

  // Aviso a los demás admins: se convirtió un prospecto en lead.
  const who = await actorName(portalId, userId)
  await notifyAdmins(
    portalId,
    {
      entityType: 'contact',
      entityId: result.contactId,
      type: 'prospect_converted',
      title: `${who} convirtió «${row.name}» en lead`,
      actionUrl: `/admin/leads/${result.contactId}`,
    },
    { exceptUserId: userId },
  )

  return result
}

export async function discardProspect(portalId: string, id: string): Promise<ProspectDTO> {
  await findProspect(portalId, id)
  const [updated] = await db
    .update(prospect)
    .set({ status: 'discarded' })
    .where(and(eq(prospect.id, id), eq(prospect.portalId, portalId)))
    .returning()
  if (!updated) throw Errors.internal('No se pudo descartar el prospecto')
  return toProspectDTO(updated)
}
