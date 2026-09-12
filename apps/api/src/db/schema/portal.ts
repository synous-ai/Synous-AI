import { pgTable, text, char, timestamp, unique } from 'drizzle-orm/pg-core'
import { createId } from '../../lib/id'

export const portal = pgTable('portal', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  /**
   * Identificador legible del portal, para URLs públicas.
   *
   * Existe por la página pública de reservas: la ruta es
   * `/book/:portal/:eventSlug` y necesita desambiguar el portal porque el slug
   * del meeting type solo es único DENTRO de un portal (unique portal_id+slug).
   * Antes ese segmento era el `id` — un cuid interno expuesto en un link que se
   * le manda a un lead. Con el slug queda `/book/synous/consulta-inicial`.
   *
   * Nullable: los portales viejos no lo tienen y la ruta pública sigue
   * aceptando el id como fallback.
   */
  slug: text('slug'),
  domain: text('domain'),
  // Default actualizado en migración 0017: la agencia opera en Argentina.
  timeZone: text('time_zone').notNull().default('America/Argentina/Buenos_Aires'),
  currency: char('currency', { length: 3 }).notNull().default('USD'),
  /**
   * LEGACY — pertenecía al módulo de prospecting, que se eliminó. La columna se
   * mantiene declarada a propósito: si se borra de acá, el próximo `db:generate`
   * emite un DROP COLUMN sobre datos que decidimos conservar. Nadie la lee.
   */
  prospectingServices: text('prospecting_services'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('portal_slug_unique').on(table.slug),
])
