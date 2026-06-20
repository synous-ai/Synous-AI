import { pgTable, text, boolean, timestamp, unique, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { citext } from './_custom'
import { createId } from '../../lib/id'

export const hubUser = pgTable('hub_user', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id, { onDelete: 'cascade' }),
  email: citext('email').notNull(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  role: text('role').notNull().default('member'),
  isActive: boolean('is_active').notNull().default(true),
  // Federación con Clerk — ID del usuario en Clerk. Nullable hasta migrar los
  // usuarios existentes con el script migrate-users-to-clerk.ts. El índice único
  // garantiza lookups O(log n) por este campo en authenticate.ts y los WS.
  clerkUserId: text('clerk_user_id').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('hub_user_portal_id_email_unique').on(table.portalId, table.email),
  // Roles del sistema:
  //   owner       → acceso total
  //   member      → opera CRM + finanzas, no puede borrar ni gestionar usuarios
  //   viewer      → solo lectura en todo (excepto finanzas)
  //   collaborator → opera el CRM (crear/editar registros) pero NO accede a
  //                 finanzas, usuarios, configuración, prospectos ni calendario
  check('hub_user_role_check', sql`${table.role} IN ('owner','member','viewer','collaborator')`),
])
