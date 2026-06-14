import { pgTable, text, integer, numeric, jsonb, timestamp, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { hubUser } from './users'
import { contact } from './contacts'
import { createId } from '../../lib/id'

/**
 * Una "búsqueda de prospección": un run del pipeline (query → Places → IA).
 * Agrupa los prospectos encontrados como una campaña.
 */
export const prospectSearch = pgTable('prospect_search', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id, { onDelete: 'cascade' }),
  query: text('query').notNull(),
  ourServices: text('our_services'),
  requestedLimit: integer('requested_limit').notNull().default(5),
  resultCount: integer('result_count').notNull().default(0),
  status: text('status').notNull().default('running'),
  error: text('error'),
  createdBy: text('created_by').references(() => hubUser.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('prospect_search_status_check', sql`${table.status} IN ('running','completed','failed')`),
  index('idx_prospect_search_portal').on(table.portalId),
])

/**
 * Un prospecto: un negocio encontrado por Places + enriquecido (email scraping)
 * + analizado por la IA. Vive aparte del CRM hasta que el usuario lo importa.
 */
export const prospect = pgTable('prospect', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id, { onDelete: 'cascade' }),
  searchId: text('search_id').notNull().references(() => prospectSearch.id, { onDelete: 'cascade' }),

  // ── Datos del negocio (Google Places + scraping) ──
  name: text('name').notNull(),
  address: text('address'),
  phone: text('phone'),
  website: text('website'),
  email: text('email'),
  rating: numeric('rating', { precision: 2, scale: 1 }),
  userRatingsTotal: integer('user_ratings_total'),
  googlePlaceId: text('google_place_id'),
  types: jsonb('types').$type<string[]>().notNull().default([]),

  // ── Análisis IA (Vertex / Gemini) ──
  aiAnalysis: text('ai_analysis'),
  aiProposal: jsonb('ai_proposal').$type<Record<string, unknown>>(),

  // ── Estado en el flujo de prospección ──
  status: text('status').notNull().default('new'),
  importedContactId: text('imported_contact_id').references(() => contact.id, { onDelete: 'set null' }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('prospect_status_check', sql`${table.status} IN ('new','imported','discarded')`),
  index('idx_prospect_portal').on(table.portalId),
  index('idx_prospect_search').on(table.searchId),
])
