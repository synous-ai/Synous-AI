import { pgTable, text, integer, boolean, timestamp, jsonb, unique, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { createId } from '../../lib/id'

export const customField = pgTable(
  'custom_field',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    portalId: text('portal_id')
      .notNull()
      .references(() => portal.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    key: text('key').notNull(),
    label: text('label').notNull(),
    fieldType: text('field_type').notNull(),
    options: jsonb('options').$type<string[] | null>().default(null),
    displayOrder: integer('display_order').notNull().default(0),
    archived: boolean('archived').notNull().default(false),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'custom_field_entity_type_check',
      sql`${table.entityType} IN ('contact','deal','company')`,
    ),
    check(
      'custom_field_field_type_check',
      sql`${table.fieldType} IN ('text','number','date','select','boolean')`,
    ),
    unique('custom_field_portal_entity_key_unique').on(table.portalId, table.entityType, table.key),
    index('idx_custom_field_portal_entity').on(table.portalId, table.entityType),
  ],
)
