import { pgTable, text, timestamp, jsonb, index, uniqueIndex, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { hubUser } from './users'
import { clientAccount } from './client-portal'
import { createId } from '../../lib/id'

/**
 * Notificación persistente, para las DOS audiencias del sistema.
 *
 * El destinatario es `user_id` (hub_user, equipo interno) O `client_id`
 * (client_account, cliente del portal) — nunca los dos, nunca ninguno. Son
 * columnas separadas y no un par polimórfico `recipient_type`/`recipient_id`
 * porque ambas son FKs reales a tablas distintas: así la integridad la
 * garantiza Postgres y no la aplicación. El check de abajo asegura el "exactly
 * one".
 */
export const notification = pgTable('notification', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  portalId: text('portal_id').notNull().references(() => portal.id),
  userId: text('user_id').references(() => hubUser.id),
  clientId: text('client_id').references(() => clientAccount.id),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  actionUrl: text('action_url'),

  /**
   * Peso visual y de urgencia. No todo pesa igual: un cambio de etapa es
   * informativo, una factura vencida exige acción. El front ordena y destaca
   * por acá. Se valida con un check para que un `type` nuevo no pueda meter un
   * valor que la UI no sabe pintar.
   */
  priority: text('priority').notNull().default('normal'),

  /**
   * Datos extra del evento (montos, nombres, números de CR…) para que el front
   * pueda enriquecer sin volver a pegarle a la API. NO es para lógica de
   * negocio: lo que decide comportamiento va en columnas tipadas.
   */
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),

  /**
   * Clave de idempotencia. Identifica al EVENTO + destinatario, no a la fila:
   * dos intentos del mismo evento comparten clave y solo el primero inserta
   * (ver el índice único parcial de abajo).
   *
   * Reemplaza al `notificationExistsToday` de reminders.service.ts, que hacía
   * un SELECT previo por (portal, entity, type) — una comprobación sujeta a
   * carrera: dos jobs simultáneos leían "no existe" y ambos insertaban. Un
   * índice único no tiene esa ventana.
   *
   * Nullable a propósito: un evento genuinamente repetible (p. ej. varios
   * mensajes en el mismo hilo) no manda clave y siempre inserta.
   */
  dedupeKey: text('dedupe_key'),

  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_notification_user').on(table.userId, table.readAt),
  index('idx_notification_client').on(table.clientId, table.readAt),
  index('idx_notification_portal_user').on(table.portalId, table.userId, table.readAt),

  // Paginación por cursor: se ordena por created_at DESC y se pagina con
  // (created_at, id) para desempatar timestamps iguales.
  index('idx_notification_user_created').on(table.userId, table.createdAt, table.id),
  index('idx_notification_client_created').on(table.clientId, table.createdAt, table.id),

  /**
   * Idempotencia real. Parcial (`WHERE dedupe_key IS NOT NULL`) para no
   * obligar a inventar una clave a los eventos repetibles: en Postgres los
   * NULL no colisionan entre sí, pero el índice parcial además los deja fuera
   * del índice y lo mantiene chico.
   */
  uniqueIndex('uq_notification_dedupe').on(table.portalId, table.dedupeKey).where(sql`dedupe_key IS NOT NULL`),

  check('notification_priority_check', sql`${table.priority} IN ('low','normal','high','urgent')`),

  /**
   * Exactamente UN destinatario. Sin esto se podían insertar filas con los dos
   * campos en null: ninguna query de listado las matchea, así que la
   * notificación se perdía en silencio. Ya había un comentario en
   * onboarding.service.ts advirtiendo justamente de ese caso — ahora lo impide
   * la base en vez de la memoria de quien escribe el próximo call site.
   */
  check(
    'notification_recipient_check',
    sql`(${table.userId} IS NOT NULL AND ${table.clientId} IS NULL) OR (${table.userId} IS NULL AND ${table.clientId} IS NOT NULL)`,
  ),
])
