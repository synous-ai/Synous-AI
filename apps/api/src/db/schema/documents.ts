import { pgTable, text, integer, boolean, timestamp, index, unique, uniqueIndex, check, foreignKey } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { deal } from './deals'
import { changeRequest } from './change-requests'
import { clientAccount } from './client-portal'
import { hubUser } from './users'
import { createId } from '../../lib/id'

/**
 * Carpeta de UN nivel dentro de los documentos de un deal (no hay carpetas
 * dentro de carpetas: es la superficie mínima que pidió el negocio).
 *
 * La creó el equipo (`created_by`) O el cliente
 * (`created_by_client_account_id`) — nunca los dos, nunca ninguno. Mismo
 * patrón que `notification`: columnas separadas por FKs reales en vez de un
 * par polimórfico, así Postgres garantiza la integridad. El check de abajo
 * asegura el "exactly one".
 */
export const documentFolder = pgTable('document_folder', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id),
  dealId: text('deal_id').notNull().references(() => deal.id),
  name: text('name').notNull(),
  createdBy: text('created_by').references(() => hubUser.id),
  createdByClientAccountId: text('created_by_client_account_id').references(() => clientAccount.id),
  archived: boolean('archived').notNull().default(false),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_document_folder_deal').on(table.dealId),

  // Target de la FK compuesta document(folder_id, deal_id) → acá abajo.
  // Postgres no deja crear esa FK compuesta aunque `id` ya sea PK: necesita un
  // unique constraint que cubra exactamente las columnas referenciadas.
  unique('uq_document_folder_id_deal').on(table.id, table.dealId),

  // Nombres únicos por deal sin distinguir mayúsculas, solo entre carpetas
  // vivas. Parcial (WHERE archived = false) para que el nombre quede libre de
  // nuevo apenas se archiva la carpeta — mismo patrón que el slug de
  // branding.service.ts: el service mapea el 23505 de este índice a un 409.
  uniqueIndex('uq_document_folder_deal_name').on(table.dealId, sql`lower(${table.name})`).where(sql`archived = false`),

  check('document_folder_name_length_check', sql`char_length(btrim(${table.name})) BETWEEN 1 AND 120`),

  // Exactamente un creador — mismo razonamiento que notification_recipient_check.
  check(
    'document_folder_creator_check',
    sql`(${table.createdBy} IS NOT NULL) <> (${table.createdByClientAccountId} IS NOT NULL)`,
  ),
])

export const document = pgTable('document', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id),
  dealId: text('deal_id').references(() => deal.id),
  crId: text('cr_id').references(() => changeRequest.id),
  // Sin `.references()` inline: la FK real es la compuesta (folder_id, deal_id)
  // de más abajo, para que la carpeta y el deal del documento nunca diverjan.
  folderId: text('folder_id'),
  name: text('name').notNull(),
  type: text('type').notNull(),
  source: text('source'),
  // docuseal IDs are external numeric IDs — kept as integer (not FKs)
  docusealSubmissionId: integer('docuseal_submission_id'),
  docusealTemplateId: integer('docuseal_template_id'),
  docusealStatus: text('docuseal_status'),
  docusealExternalId: text('docuseal_external_id').unique(),
  storageKey: text('storage_key'),
  /**
   * ¿El cliente ve este documento en su Portal?
   *
   * Default `true` para no cambiar lo que los clientes ya venían viendo
   * (contratos firmados, propuestas, facturas). Se marca `false` para los
   * documentos internos del proceso de entrega — Diagnóstico y Blueprint,
   * que hoy son `type='other'` y por eso terminaban guardándose fuera del CRM.
   *
   * Lo consume `listClientDocuments`.
   */
  visibleToClient: boolean('visible_to_client').notNull().default(true),
  signedAt: timestamp('signed_at', { withTimezone: true }),
  signedBy: text('signed_by').references(() => clientAccount.id),
  createdBy: text('created_by').references(() => hubUser.id),
  // Quién subió el archivo desde el Portal, cuando fue el cliente. Mutuamente
  // excluyente con `created_by` (ver el check de abajo) — un documento no
  // puede venir del equipo y del cliente a la vez.
  uploadedByClientAccountId: text('uploaded_by_client_account_id').references(() => clientAccount.id),
  archived: boolean('archived').notNull().default(false),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('document_type_check', sql`${table.type} IN ('contract','proposal','invoice','other')`),
  check('document_source_check', sql`${table.source} IN ('docuseal','manual','generated')`),
  check('document_docuseal_status_check', sql`${table.docusealStatus} IN ('pending','completed','declined','expired')`),
  index('idx_document_deal').on(table.dealId),
  index('idx_document_storage_key').on(table.storageKey),

  // Carpeta y deal viajan siempre juntos: no puede existir un document cuyo
  // folder_id apunte a una carpeta de OTRO deal. MATCH SIMPLE (comportamiento
  // por defecto de Postgres) no evalúa la fila si folder_id es NULL, que es
  // el caso normal de un documento en la raíz — para el caso deal_id NULL +
  // folder_id NOT NULL, que esta FK no puede cubrir, el service
  // (assertFolderInDeal) da un 400 legible antes de llegar al insert.
  foreignKey({
    name: 'document_folder_deal_fk',
    columns: [table.folderId, table.dealId],
    foreignColumns: [documentFolder.id, documentFolder.dealId],
  }),

  // Listar "qué hay en esta carpeta" sin barrer los documentos archivados.
  index('idx_document_folder').on(table.folderId).where(sql`archived = false`),

  // Autor y subidor-cliente son mutuamente excluyentes. Pueden faltar los dos
  // (documentos generados o de DocuSeal), a diferencia de document_folder que
  // exige exactamente un creador.
  check(
    'document_creator_check',
    sql`NOT (${table.createdBy} IS NOT NULL AND ${table.uploadedByClientAccountId} IS NOT NULL)`,
  ),
])
