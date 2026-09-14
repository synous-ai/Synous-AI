import { pgTable, text, integer, timestamp, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { hubUser } from './users'
import { clientAccount } from './client-portal'
import { createId } from '../../lib/id'
import { FILE_PURPOSES, FILE_UPLOAD_STATUSES } from '../../lib/storage/purposes'

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(','))

/**
 * Ledger de propiedad y ciclo de vida de cada archivo subido.
 *
 * NO es la fuente de verdad de las referencias: esas siguen en las columnas de
 * cada entidad (`document.storage_key`, `company.brand_logo_key`...). Esta
 * tabla responde otra pregunta: quién subió la key, para qué portal y con qué
 * propósito. Sin ella, cualquier usuario que conociera una key ajena podía
 * colgarla de un registro propio y heredar el acceso de lectura.
 *
 * `pending` → la key se reservó (intent) pero ningún registro la reclamó.
 * `attached` → un registro la reclamó con `claimUpload`; ya no se puede
 * reclamar desde otro.
 */
export const fileUpload = pgTable('file_upload', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id),
  storageKey: text('storage_key').notNull().unique(),
  purpose: text('purpose').notNull(),
  status: text('status').notNull().default('pending'),
  /** Nombre para mostrar, ya saneado. Nunca se usa para armar la key. */
  originalName: text('original_name').notNull(),
  contentType: text('content_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  uploadedByUserId: text('uploaded_by_user_id').references(() => hubUser.id),
  uploadedByClientId: text('uploaded_by_client_id').references(() => clientAccount.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  attachedAt: timestamp('attached_at', { withTimezone: true }),
}, (table) => [
  check('file_upload_purpose_check', sql`${table.purpose} IN (${inList(FILE_PURPOSES)})`),
  check('file_upload_status_check', sql`${table.status} IN (${inList(FILE_UPLOAD_STATUSES)})`),
  check(
    'file_upload_single_uploader_check',
    sql`(${table.uploadedByUserId} IS NULL) <> (${table.uploadedByClientId} IS NULL)`,
  ),
  index('idx_file_upload_portal_status_created').on(table.portalId, table.status, table.createdAt),
])
