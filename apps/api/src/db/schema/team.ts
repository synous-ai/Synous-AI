import { pgTable, text, timestamp, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { hubUser } from './users'

/**
 * Perfil de equipo (1:1 con hub_user): quién hace qué. La gestión de cuentas
 * (invitar, rol, desactivar) vive en Settings > Usuarios; esto es solo el
 * contexto de trabajo de cada persona.
 */
export const teamMemberProfile = pgTable('team_member_profile', {
  hubUserId: text('hub_user_id').primaryKey().references(() => hubUser.id, { onDelete: 'cascade' }),
  portalId: text('portal_id').notNull().references(() => portal.id, { onDelete: 'cascade' }),
  jobTitle: text('job_title'),
  responsibilities: text('responsibilities'),
  /** "Decide solo". */
  autonomousDecisions: text('autonomous_decisions'),
  /** "Necesita aprobación". */
  approvalRequired: text('approval_required'),
  workStatus: text('work_status'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check(
    'team_member_profile_work_status_check',
    sql`${table.workStatus} IS NULL OR ${table.workStatus} IN ('available','working','blocked','waiting_approval')`,
  ),
])
