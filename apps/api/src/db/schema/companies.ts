import { pgTable, text, boolean, jsonb, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { hubUser } from './users'
import { createId } from '../../lib/id'

export const company = pgTable('company', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id, { onDelete: 'cascade' }),
  ownerId: text('owner_id').references(() => hubUser.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  domain: text('domain'),
  industry: text('industry'),
  phone: text('phone'),
  website: text('website'),
  /**
   * Slug del tenant (Fase A multi-tenant por empresa): identifica a la
   * empresa en subdominios (`<slug>.synousai.com`) y en `/c/<slug>`. Único
   * GLOBAL, NO por portal: a diferencia de `meeting_type.slug` (que se
   * resuelve siempre junto con el portal en la ruta `/book/:portal/:slug`),
   * un subdominio como `uirtus.synousai.com` no transporta ningún dato de
   * portal. `getBrandingBySlug()` (branding.service.ts) resuelve por
   * `company.slug` solo, con `.limit(1)` — si dos portales tuvieran
   * compañías con el mismo slug, ese lookup elegiría una fila arbitraria. El
   * constraint tiene que contar la misma historia que la resolución: por eso
   * es global. Se asigna una sola vez al crear la empresa
   * (`uniqueCompanySlug`) y NO se regenera al renombrar, para no romper URLs
   * ya repartidas.
   */
  slug: text('slug'),
  /** Nombre de marca visible en el portal del cliente (blanco/white-label). */
  brandName: text('brand_name'),
  /** Clave del logo de marca en R2 (sin URL; se genera on-demand). */
  brandLogoKey: text('brand_logo_key'),
  /** Color primario de la marca en formato hex (#rrggbb). */
  brandPrimary: text('brand_primary'),
  /** Color secundario de la marca en formato hex (#rrggbb). */
  brandSecondary: text('brand_secondary'),
  custom: jsonb('custom').notNull().default({}),
  archived: boolean('archived').notNull().default(false),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_company_portal').on(table.portalId).where(sql`archived = false`),
  index('idx_company_owner').on(table.ownerId),
  // Global (no compuesto con portalId) — ver comentario en la columna `slug` arriba.
  unique('company_slug_unique').on(table.slug),
  // NOTE: idx_company_name_trgm uses gin_trgm_ops — omitted, see manual migrations
])
