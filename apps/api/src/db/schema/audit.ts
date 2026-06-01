import { pgTable, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { portal } from './portal'
import { hubUser } from './users'
import { clientAccount } from './client-portal'
import { inet } from './_custom'
import { createId } from '../../lib/id'

export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id),
  userId: text('user_id').references(() => hubUser.id),
  clientId: text('client_id').references(() => clientAccount.id),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  action: text('action').notNull(),
  payload: jsonb('payload'),
  ipAddress: inet('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_audit_entity').on(table.entityType, table.entityId, table.createdAt),
])
