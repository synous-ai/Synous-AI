import { pgTable, text, boolean, timestamp, unique, primaryKey } from 'drizzle-orm/pg-core'
import { portal } from './portal'
import { contact } from './contacts'
import { deal } from './deals'
import { citext } from './_custom'
import { createId } from '../../lib/id'

export const clientAccount = pgTable('client_account', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id, { onDelete: 'cascade' }),
  contactId: text('contact_id').notNull().references(() => contact.id),
  email: citext('email').notNull(),
  inviteToken: text('invite_token').unique(),
  inviteSentAt: timestamp('invite_sent_at', { withTimezone: true }),
  inviteAccepted: boolean('invite_accepted').notNull().default(false),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  /** ID del usuario en Clerk (auth externo). Null si aún no se vinculó con Clerk. */
  clerkUserId: text('clerk_user_id').unique(),
  /**
   * LEGACY (Fase A multi-tenant por empresa): la fuente de verdad del
   * branding/tenant pasó a `company.slug` + `company.brand*`. Estas columnas
   * quedan por compatibilidad — links de portal ya repartidos con el slug
   * viejo siguen resolviendo vía fallback en `getBrandingBySlug()` — hasta
   * que se confirme el backfill (`scripts/backfill-company-slugs.ts`) y se
   * decida si se pueden dropear. NO borrar datos: convención del proyecto.
   */
  brandSlug: text('brand_slug').unique(),
  /** LEGACY — ver comentario de `brandSlug` arriba. */
  brandName: text('brand_name'),
  /** LEGACY — ver comentario de `brandSlug` arriba. */
  brandLogoKey: text('brand_logo_key'),
  /** LEGACY — ver comentario de `brandSlug` arriba. */
  brandPrimary: text('brand_primary'),
  /** LEGACY — ver comentario de `brandSlug` arriba. */
  brandSecondary: text('brand_secondary'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('client_account_portal_id_email_unique').on(table.portalId, table.email),
])

export const clientDealAccess = pgTable('client_deal_access', {
  clientId: text('client_id').notNull().references(() => clientAccount.id, { onDelete: 'cascade' }),
  dealId: text('deal_id').notNull().references(() => deal.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.clientId, table.dealId] }),
])
