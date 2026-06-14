import {
  pgTable,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { portal } from './portal'
import { hubUser } from './users'
import { contact } from './contacts'
import { deal } from './deals'
import { createId } from '../../lib/id'

/**
 * Schema del SETTER (agente de ventas IA por WhatsApp) — Sprint 0.
 *
 * Tablas prefijadas `setter_*` para no colisionar con los módulos del CRM
 * (`leads`, `calendar`, `webhooks`). Convenciones del monorepo: id con cuid2,
 * status como `text` + `check` (no pgEnum), snake_case explícito, timestamps
 * con timezone.
 *
 * Decisiones de dominio (Sprint 0 manda sobre el playbook):
 *  - `Person` (identidad cross-canal, con opt-out) separado de `Lead`.
 *  - La conversación cuelga de `Person`, no del canal (continuidad cross-canal).
 *  - `Draft` = cola de aprobación de shadow mode (nada se envía solo).
 *  - Sin campos de Cloud API (wabaId/phoneNumberId): el MVP es Evolution/Baileys.
 */

// ── setter_tenant — config del negocio (único en Sprint 0, seedeado) ─────────
export const setterTenant = pgTable('setter_tenant', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  // El setter es interno del CRM: su config cuelga del portal (la org admin).
  portalId: text('portal_id')
    .notNull()
    .references(() => portal.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // Lo que el agente "conoce": qué vende, ICP, qué califica, oferta, FAQs, precios.
  businessBrief: text('business_brief').notNull(),
  agentName: text('agent_name').notNull(),
  ownerName: text('owner_name').notNull(),
  timezone: text('timezone').notNull().default('America/Argentina/Buenos_Aires'),
  // shadow global en Sprint 0; el campo existe para el salto a híbrido/autopilot.
  operationMode: text('operation_mode').notNull().default('shadow'),
  // Model Switcher: qué LLM genera los mensajes ('gemini' | 'claude').
  modelProvider: text('model_provider').notNull().default('gemini'),
  // Prospección automática desde la oferta: qué ofrecemos (contexto para la IA)
  // y los nichos/ICP sugeridos para buscar leads sin tipear nada.
  prospectingServices: text('prospecting_services'),
  prospectingNiches: jsonb('prospecting_niches').$type<string[]>().notNull().default([]),
  // Autopilot de prospección (loop nicho×ciudad cada 1h).
  prospectingCities: jsonb('prospecting_cities').$type<string[]>().notNull().default([]),
  prospectingAutopilot: boolean('prospecting_autopilot').notNull().default(false),
  prospectingAutopilotCursor: integer('prospecting_autopilot_cursor').notNull().default(0),
  // Nombre de la instancia de Evolution para este tenant (puede venir de env).
  evolutionInstance: text('evolution_instance'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  check(
    'setter_tenant_operation_mode_check',
    sql`${table.operationMode} IN ('shadow','hybrid','autopilot')`,
  ),
  check('setter_tenant_model_provider_check', sql`${table.modelProvider} IN ('gemini','claude')`),
])

// ── setter_person — identidad cross-canal, con opt-out ───────────────────────
export const setterPerson = pgTable('setter_person', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => setterTenant.id, { onDelete: 'cascade' }),
  name: text('name'),
  // E.164 (+549...). En Sprint 0 (solo WhatsApp) es la clave de identidad.
  phone: text('phone'),
  // Guardrail no negociable: si opta por salir, nunca más se le genera ni envía.
  optedOut: boolean('opted_out').notNull().default(false),
  optedOutAt: timestamp('opted_out_at', { withTimezone: true }),
  // Sync con el CRM: este Person es también un contact del CRM (lead/cliente).
  crmContactId: text('crm_contact_id').references(() => contact.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uq_setter_person_tenant_phone').on(table.tenantId, table.phone),
])

// ── setter_lead — Person dentro del pipeline ─────────────────────────────────
export const setterLead = pgTable('setter_lead', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => setterTenant.id, { onDelete: 'cascade' }),
  personId: text('person_id')
    .notNull()
    .references(() => setterPerson.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('NEW'),
  // { pain, fit, authority, timing, score, notes } — lo llena save_qualification.
  qualification: jsonb('qualification').$type<Record<string, unknown>>(),
  source: text('source'),
  // Cuándo cierra la ventana de servicio (último msg del lead + 24h).
  windowExpiresAt: timestamp('window_expires_at', { withTimezone: true }),
  // Sync con el CRM: el deal generado para este lead (al calificar).
  crmDealId: text('crm_deal_id').references(() => deal.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  check(
    'setter_lead_status_check',
    sql`${table.status} IN ('NEW','CONTACTED','ENGAGED','QUALIFYING','QUALIFIED','BOOKING','BOOKED','NOT_INTERESTED','HANDED_OFF','OPTED_OUT')`,
  ),
  index('idx_setter_lead_person').on(table.personId),
  index('idx_setter_lead_status').on(table.status),
  index('idx_setter_lead_window').on(table.windowExpiresAt),
])

// ── setter_conversation — cuelga de Person (memoria cross-canal) ─────────────
export const setterConversation = pgTable('setter_conversation', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => setterTenant.id, { onDelete: 'cascade' }),
  personId: text('person_id')
    .notNull()
    .references(() => setterPerson.id, { onDelete: 'cascade' }),
  channel: text('channel').notNull().default('whatsapp'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Una conversación por persona en Sprint 0 (memoria única cross-canal).
  uniqueIndex('uq_setter_conversation_person').on(table.personId),
])

// ── setter_message — turnos de la conversación, idempotentes ─────────────────
export const setterMessage = pgTable('setter_message', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => setterConversation.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  // Idempotencia: id del mensaje en el canal (unique; admite múltiples NULL en PG).
  messageId: text('message_id'),
  // Etiqueta de momento (apertura/calificación/objeción/booking…). Reusada por híbrido.
  beat: text('beat'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check(
    'setter_message_role_check',
    sql`${table.role} IN ('user','assistant','system','tool')`,
  ),
  uniqueIndex('uq_setter_message_message_id').on(table.messageId),
  index('idx_setter_message_conversation').on(table.conversationId, table.createdAt),
])

// ── setter_appointment — call agendada (Google Calendar) ─────────────────────
export const setterAppointment = pgTable('setter_appointment', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => setterTenant.id, { onDelete: 'cascade' }),
  leadId: text('lead_id')
    .notNull()
    .references(() => setterLead.id, { onDelete: 'cascade' }),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  // Event id de Google Calendar (no guardamos URLs que expiran).
  calendarRef: text('calendar_ref'),
  status: text('status').notNull().default('confirmed'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check(
    'setter_appointment_status_check',
    sql`${table.status} IN ('confirmed','cancelled','no_show','rescheduled')`,
  ),
  uniqueIndex('uq_setter_appointment_lead').on(table.leadId),
])

// ── setter_draft — cola de aprobación de shadow mode ─────────────────────────
export const setterDraft = pgTable('setter_draft', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => setterTenant.id, { onDelete: 'cascade' }),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => setterConversation.id, { onDelete: 'cascade' }),
  leadId: text('lead_id')
    .notNull()
    .references(() => setterLead.id, { onDelete: 'cascade' }),
  // Texto propuesto por la IA (lo que se enviaría al aprobar).
  content: text('content').notNull(),
  // Versión editada por el humano antes de enviar (si la hubo).
  editedContent: text('edited_content'),
  beat: text('beat'),
  // beatPolicy: text en Sprint 0; voice llega en Sprint 2.
  format: text('format').notNull().default('text'),
  status: text('status').notNull().default('pending'),
  // "Por qué dijo esto": tool calls + datos capturados (transparencia de la Bandeja).
  toolCalls: jsonb('tool_calls').$type<Record<string, unknown>>(),
  // Mensaje saliente generado al aprobar y enviar.
  sentMessageId: text('sent_message_id').references(() => setterMessage.id, {
    onDelete: 'set null',
  }),
  // Quién aprobó/editó (integra con los usuarios del CRM).
  approvedBy: text('approved_by').references(() => hubUser.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  check('setter_draft_format_check', sql`${table.format} IN ('text','voice')`),
  check(
    'setter_draft_status_check',
    sql`${table.status} IN ('pending','approved','edited','rejected','sent')`,
  ),
  index('idx_setter_draft_status').on(table.status),
  index('idx_setter_draft_conversation').on(table.conversationId),
  index('idx_setter_draft_tenant').on(table.tenantId),
])

// ── setter_event — log de actividad de la máquina (para la Consola) ──────────
export const setterEvent = pgTable('setter_event', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => setterTenant.id, { onDelete: 'cascade' }),
  level: text('level').notNull().default('info'),
  // inbound | agent | draft | approval | sync | autopilot | optout | error
  type: text('type').notNull(),
  message: text('message').notNull(),
  leadId: text('lead_id'),
  meta: jsonb('meta').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('setter_event_level_check', sql`${table.level} IN ('info','success','warn','error')`),
  index('idx_setter_event_tenant_time').on(table.tenantId, table.createdAt),
])
