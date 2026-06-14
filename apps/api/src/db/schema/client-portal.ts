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
  passwordHash: text('password_hash'),
  inviteToken: text('invite_token').unique(),
  inviteSentAt: timestamp('invite_sent_at', { withTimezone: true }),
  inviteAccepted: boolean('invite_accepted').notNull().default(false),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  /** ID del usuario en Clerk (auth externo). Null si aún no se vinculó con Clerk. */
  clerkUserId: text('clerk_user_id').unique(),
  /** Slug único del portal del cliente (usado en URLs personalizadas). */
  brandSlug: text('brand_slug').unique(),
  /** Nombre de marca visible en el portal del cliente. */
  brandName: text('brand_name'),
  /** Clave del logo de marca en R2 (sin URL; se genera on-demand). */
  brandLogoKey: text('brand_logo_key'),
  /** Color primario de la marca en formato hex (#rrggbb). */
  brandPrimary: text('brand_primary'),
  /** Color secundario de la marca en formato hex (#rrggbb). */
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
