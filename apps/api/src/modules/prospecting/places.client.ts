import axios from 'axios'
import { env } from '../../config/env'
import { AppError, Errors } from '../../lib/errors'

/**
 * Cliente de Google Places API (v1 — Text Search).
 * Un solo request por búsqueda: el FieldMask trae nombre, dirección, teléfono,
 * web, rating y categorías sin necesidad de un Place Details aparte.
 *
 * Docs: https://developers.google.com/maps/documentation/places/web-service/text-search
 */

const PLACES_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'

// Solo pedimos los campos que usamos → menor costo y payload.
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.types',
].join(',')

export interface PlaceResult {
  googlePlaceId: string
  name: string
  address: string | null
  phone: string | null
  website: string | null
  rating: number | null
  userRatingsTotal: number | null
  types: string[]
}

interface RawPlace {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  nationalPhoneNumber?: string
  internationalPhoneNumber?: string
  websiteUri?: string
  rating?: number
  userRatingCount?: number
  types?: string[]
}

export function isPlacesConfigured(): boolean {
  return Boolean(env.GOOGLE_MAPS_API_KEY)
}

/**
 * Busca negocios por texto libre (ej. "abogados Barcelona").
 * `limit` se acota a [1, 20] (máximo de la API en un request).
 */
export async function searchBusinesses(query: string, limit: number): Promise<PlaceResult[]> {
  if (!env.GOOGLE_MAPS_API_KEY) {
    throw Errors.badRequest('GOOGLE_MAPS_API_KEY no está configurada en la API')
  }

  const maxResultCount = Math.min(Math.max(limit, 1), 20)

  try {
    const { data } = await axios.post<{ places?: RawPlace[] }>(
      PLACES_TEXT_SEARCH_URL,
      { textQuery: query, maxResultCount, languageCode: 'es' },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': FIELD_MASK,
        },
        timeout: 15_000,
      },
    )

    const places = data.places ?? []
    return places.slice(0, maxResultCount).map((p) => ({
      googlePlaceId: p.id ?? '',
      name: p.displayName?.text ?? 'Sin nombre',
      address: p.formattedAddress ?? null,
      phone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? null,
      website: p.websiteUri ?? null,
      rating: typeof p.rating === 'number' ? p.rating : null,
      userRatingsTotal: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
      types: Array.isArray(p.types) ? p.types : [],
    }))
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status
      const apiMsg =
        (err.response?.data as { error?: { message?: string } })?.error?.message ?? err.message
      if (status === 403 || status === 401) {
        throw Errors.badRequest(`Google Places rechazó la key (${status}): ${apiMsg}`)
      }
      throw new AppError('PLACES_ERROR', `Error consultando Google Places: ${apiMsg}`, 502)
    }
    throw err
  }
}
