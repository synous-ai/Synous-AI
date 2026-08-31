var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/app.ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform
} from "fastify-type-provider-zod";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUI from "@fastify/swagger-ui";
import fastifyWebsocket from "@fastify/websocket";
import fastifyMultipart from "@fastify/multipart";
import { ZodError } from "zod";

// src/config/env.ts
import "dotenv/config";
import { z } from "zod";
var envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  // Secreto para firmar tokens de NEGOCIO (no de sesión): tokens de booking
  // (cancel/reschedule) en calendar.service.ts y el token de onboarding. La auth
  // de sesión (admin y cliente) es 100% Clerk — no usa este secreto.
  ACCESS_TOKEN_SECRET: z.string().min(32, "ACCESS_TOKEN_SECRET debe tener al menos 32 caracteres"),
  // Integraciones — opcionales en Fase 1
  RESEND_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().email().optional(),
  ADMIN_URL: z.string().url().optional(),
  CLIENT_PORTAL_URL: z.string().url().optional(),
  API_URL: z.string().url().optional(),
  // Fathom webhook — opcional; sin secret configurado el webhook responde 401
  FATHOM_WEBHOOK_SECRET: z.string().optional(),
  // Clerk webhook — opcional; sin secret configurado el endpoint responde 401 (fail-closed)
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().optional(),
  // URL pública de la API para pixel de tracking (default: localhost en dev)
  PUBLIC_API_URL: z.string().url().default("http://localhost:3001"),
  // ── Clerk (auth) ──────────────────────────────────────────
  // Requerido en prod: sin esto el verifyToken de Clerk falla y nadie autentica.
  // default '' para no romper boot/tests cuando no está configurado (auth devuelve 401).
  CLERK_SECRET_KEY: z.string().default(""),
  // ── IA: Anthropic (setter) y Vertex/Gemini ────────────────
  ANTHROPIC_API_KEY: z.string().default(""),
  ANTHROPIC_MODEL: z.string().default(""),
  VERTEX_LOCATION: z.string().default(""),
  VERTEX_MODEL: z.string().default(""),
  // ── Google (Places/Maps + service account) ────────────────
  GOOGLE_MAPS_API_KEY: z.string().default(""),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().default(""),
  // ── Evolution API (WhatsApp del setter) ───────────────────
  EVOLUTION_API_URL: z.string().default(""),
  EVOLUTION_API_KEY: z.string().default(""),
  EVOLUTION_INSTANCE: z.string().default(""),
  EVOLUTION_WEBHOOK_SECRET: z.string().default(""),
  // ── Onboarding post-venta: asignación automática de responsable por fase del
  // pipeline "Producción" (ver modules/onboarding/assignees.ts). Opcionales con
  // default — si el hub_user no existe (email no seedeado), el helper devuelve
  // null y no rompe: se mantiene el owner actual del deal.
  PRODUCTION_ASSIGNEE_DIAGNOSTICO_EMAIL: z.string().email().default("laureanosierra.dev@gmail.com"),
  PRODUCTION_ASSIGNEE_DEFAULT_EMAIL: z.string().email().default("jeremiasingla@gmail.com")
});
var parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("\u274C Variables de entorno inv\xE1lidas:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}
var env = parsed.data;

// src/lib/errors.ts
var AppError = class extends Error {
  constructor(code, message, statusCode = 400, details) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.name = "AppError";
  }
  code;
  statusCode;
  details;
};
var Errors = {
  badRequest: (message = "Solicitud inv\xE1lida", details) => new AppError("BAD_REQUEST", message, 400, details),
  unauthorized: (message = "No autenticado") => new AppError("UNAUTHORIZED", message, 401),
  forbidden: (message = "No autorizado") => new AppError("FORBIDDEN", message, 403),
  notFound: (message = "Recurso no encontrado") => new AppError("NOT_FOUND", message, 404),
  conflict: (message = "Conflicto con el estado actual") => new AppError("CONFLICT", message, 409),
  internal: (message = "Error interno") => new AppError("INTERNAL", message, 500)
};

// src/modules/health/health.router.ts
import { sql as sql23 } from "drizzle-orm";

// src/db/index.ts
import { drizzle as drizzleNodePostgres } from "drizzle-orm/node-postgres";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { Pool as PgPool } from "pg";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// src/db/schema/index.ts
var schema_exports = {};
__export(schema_exports, {
  auditLog: () => auditLog,
  availabilityBlock: () => availabilityBlock,
  availabilityInterval: () => availabilityInterval,
  availabilityRule: () => availabilityRule,
  availabilitySchedule: () => availabilitySchedule,
  booking: () => booking,
  call: () => call,
  changeRequest: () => changeRequest,
  changeRequestAttachment: () => changeRequestAttachment,
  changeRequestComment: () => changeRequestComment,
  changeRequestHistory: () => changeRequestHistory,
  changeRequestItem: () => changeRequestItem,
  citext: () => citext,
  clientAccount: () => clientAccount,
  clientAsset: () => clientAsset,
  clientDealAccess: () => clientDealAccess,
  clientOnboarding: () => clientOnboarding,
  company: () => company,
  contact: () => contact,
  crmList: () => crmList,
  customField: () => customField,
  dateOverride: () => dateOverride,
  deal: () => deal,
  dealContact: () => dealContact,
  dealIntake: () => dealIntake,
  dealIntakeResponse: () => dealIntakeResponse,
  deliverable: () => deliverable,
  document: () => document,
  emailEvent: () => emailEvent,
  emailSend: () => emailSend,
  eventMembership: () => eventMembership,
  expense: () => expense,
  hubUser: () => hubUser,
  inet: () => inet,
  intakeForm: () => intakeForm,
  invoice: () => invoice,
  invoiceItem: () => invoiceItem,
  libraryItem: () => libraryItem,
  listMembership: () => listMembership,
  meeting: () => meeting,
  meetingType: () => meetingType,
  note: () => note,
  notification: () => notification,
  notificationPref: () => notificationPref,
  onboardingSubmission: () => onboardingSubmission,
  payment: () => payment,
  pipeline: () => pipeline,
  pipelineStage: () => pipelineStage,
  portal: () => portal,
  projectUpdate: () => projectUpdate,
  proposal: () => proposal,
  prospect: () => prospect,
  prospectSearch: () => prospectSearch,
  recordHistory: () => recordHistory,
  retainer: () => retainer,
  setterAppointment: () => setterAppointment,
  setterConversation: () => setterConversation,
  setterDraft: () => setterDraft,
  setterEvent: () => setterEvent,
  setterLead: () => setterLead,
  setterMessage: () => setterMessage,
  setterPerson: () => setterPerson,
  setterTenant: () => setterTenant,
  task: () => task,
  workItem: () => workItem
});

// src/db/schema/_custom.ts
import { customType } from "drizzle-orm/pg-core";
var citext = customType({
  dataType() {
    return "citext";
  }
});
var inet = customType({
  dataType() {
    return "inet";
  }
});

// src/db/schema/portal.ts
import { pgTable, text, char, timestamp } from "drizzle-orm/pg-core";

// src/lib/id.ts
import { createId } from "@paralleldrive/cuid2";

// src/db/schema/portal.ts
var portal = pgTable("portal", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  name: text("name").notNull(),
  domain: text("domain"),
  // Default actualizado en migración 0017: la agencia opera en Argentina.
  timeZone: text("time_zone").notNull().default("America/Argentina/Buenos_Aires"),
  currency: char("currency", { length: 3 }).notNull().default("USD"),
  /** Servicios de prospección habilitados para el módulo setter (null = no configurado). */
  prospectingServices: text("prospecting_services"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

// src/db/schema/users.ts
import { pgTable as pgTable2, text as text2, boolean, timestamp as timestamp2, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
var hubUser = pgTable2("hub_user", {
  id: text2("id").primaryKey().$defaultFn(() => createId()),
  portalId: text2("portal_id").notNull().references(() => portal.id, { onDelete: "cascade" }),
  email: citext("email").notNull(),
  firstName: text2("first_name"),
  lastName: text2("last_name"),
  role: text2("role").notNull().default("member"),
  isActive: boolean("is_active").notNull().default(true),
  // Federación con Clerk — ID del usuario en Clerk. Nullable hasta migrar los
  // usuarios existentes con el script migrate-users-to-clerk.ts. El índice único
  // garantiza lookups O(log n) por este campo en authenticate.ts y los WS.
  clerkUserId: text2("clerk_user_id").unique(),
  createdAt: timestamp2("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp2("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  unique("hub_user_portal_id_email_unique").on(table.portalId, table.email),
  // Roles del sistema:
  //   owner       → acceso total
  //   member      → opera CRM + finanzas, no puede borrar ni gestionar usuarios
  //   viewer      → solo lectura en todo (excepto finanzas)
  //   collaborator → opera el CRM (crear/editar registros) pero NO accede a
  //                 finanzas, usuarios, configuración, prospectos ni calendario
  check("hub_user_role_check", sql`${table.role} IN ('owner','member','viewer','collaborator')`)
]);

// src/db/schema/pipelines.ts
import { pgTable as pgTable3, text as text3, integer, boolean as boolean2, numeric, timestamp as timestamp3, index, check as check2 } from "drizzle-orm/pg-core";
import { sql as sql2 } from "drizzle-orm";
var pipeline = pgTable3("pipeline", {
  id: text3("id").primaryKey().$defaultFn(() => createId()),
  portalId: text3("portal_id").notNull().references(() => portal.id, { onDelete: "cascade" }),
  label: text3("label").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  archived: boolean2("archived").notNull().default(false),
  createdAt: timestamp3("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp3("updated_at", { withTimezone: true }).notNull().defaultNow()
});
var pipelineStage = pgTable3("pipeline_stage", {
  id: text3("id").primaryKey().$defaultFn(() => createId()),
  pipelineId: text3("pipeline_id").notNull().references(() => pipeline.id, { onDelete: "cascade" }),
  label: text3("label").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  probability: numeric("probability", { precision: 5, scale: 4 }),
  isClosed: boolean2("is_closed").notNull().default(false),
  isWon: boolean2("is_won").notNull().default(false),
  exitCriteria: text3("exit_criteria"),
  description: text3("description"),
  archived: boolean2("archived").notNull().default(false),
  createdAt: timestamp3("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index("idx_stage_pipeline").on(table.pipelineId, table.displayOrder),
  check2("pipeline_stage_probability_check", sql2`${table.probability} BETWEEN 0 AND 1`)
]);

// src/db/schema/companies.ts
import { pgTable as pgTable4, text as text4, boolean as boolean3, jsonb, timestamp as timestamp4, index as index2 } from "drizzle-orm/pg-core";
import { sql as sql3 } from "drizzle-orm";
var company = pgTable4("company", {
  id: text4("id").primaryKey().$defaultFn(() => createId()),
  portalId: text4("portal_id").notNull().references(() => portal.id, { onDelete: "cascade" }),
  ownerId: text4("owner_id").references(() => hubUser.id, { onDelete: "set null" }),
  name: text4("name").notNull(),
  domain: text4("domain"),
  industry: text4("industry"),
  phone: text4("phone"),
  website: text4("website"),
  custom: jsonb("custom").notNull().default({}),
  archived: boolean3("archived").notNull().default(false),
  archivedAt: timestamp4("archived_at", { withTimezone: true }),
  createdAt: timestamp4("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp4("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index2("idx_company_portal").on(table.portalId).where(sql3`archived = false`),
  index2("idx_company_owner").on(table.ownerId)
  // NOTE: idx_company_name_trgm uses gin_trgm_ops — omitted, see manual migrations
]);

// src/db/schema/contacts.ts
import { pgTable as pgTable5, text as text5, boolean as boolean4, jsonb as jsonb2, timestamp as timestamp5, index as index3, unique as unique2, check as check3 } from "drizzle-orm/pg-core";
import { sql as sql4 } from "drizzle-orm";
var contact = pgTable5("contact", {
  id: text5("id").primaryKey().$defaultFn(() => createId()),
  portalId: text5("portal_id").notNull().references(() => portal.id, { onDelete: "cascade" }),
  ownerId: text5("owner_id").references(() => hubUser.id, { onDelete: "set null" }),
  companyId: text5("company_id").references(() => company.id, { onDelete: "set null" }),
  firstName: text5("first_name"),
  lastName: text5("last_name"),
  email: citext("email"),
  phone: text5("phone"),
  jobTitle: text5("job_title"),
  lifecycleStage: text5("lifecycle_stage").notNull().default("lead"),
  custom: jsonb2("custom").notNull().default({}),
  archived: boolean4("archived").notNull().default(false),
  archivedAt: timestamp5("archived_at", { withTimezone: true }),
  createdAt: timestamp5("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp5("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  unique2("contact_portal_id_email_unique").on(table.portalId, table.email),
  check3("contact_lifecycle_stage_check", sql4`${table.lifecycleStage} IN ('lead','mql','sql','opportunity','customer','other')`),
  // Compuesto para el listado paginado por cursor (created_at DESC, id DESC).
  index3("idx_contact_portal_created").on(table.portalId, table.createdAt, table.id).where(sql4`archived = false`),
  index3("idx_contact_company").on(table.companyId),
  index3("idx_contact_owner").on(table.ownerId),
  index3("idx_contact_email").on(table.email)
]);

// src/db/schema/deals.ts
import { pgTable as pgTable6, text as text6, boolean as boolean5, numeric as numeric2, char as char2, date, jsonb as jsonb3, timestamp as timestamp6, index as index4, primaryKey } from "drizzle-orm/pg-core";
import { sql as sql5 } from "drizzle-orm";
var deal = pgTable6("deal", {
  id: text6("id").primaryKey().$defaultFn(() => createId()),
  portalId: text6("portal_id").notNull().references(() => portal.id, { onDelete: "cascade" }),
  ownerId: text6("owner_id").references(() => hubUser.id, { onDelete: "set null" }),
  pipelineId: text6("pipeline_id").notNull().references(() => pipeline.id),
  stageId: text6("stage_id").notNull().references(() => pipelineStage.id),
  primaryContactId: text6("primary_contact_id").references(() => contact.id, { onDelete: "set null" }),
  companyId: text6("company_id").references(() => company.id, { onDelete: "set null" }),
  name: text6("name").notNull(),
  amount: numeric2("amount", { precision: 12, scale: 2 }),
  currency: char2("currency", { length: 3 }).notNull().default("USD"),
  closeDate: date("close_date"),
  custom: jsonb3("custom").notNull().default({}),
  archived: boolean5("archived").notNull().default(false),
  archivedAt: timestamp6("archived_at", { withTimezone: true }),
  createdAt: timestamp6("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp6("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  // Compuesto para el listado paginado (WHERE portal AND archived=false ORDER BY created_at DESC, id DESC).
  // portal_id sigue de columna líder, así que también sirve los filtros por portal.
  index4("idx_deal_portal_created").on(table.portalId, table.createdAt, table.id).where(sql5`archived = false`),
  index4("idx_deal_pipeline").on(table.pipelineId, table.stageId),
  index4("idx_deal_owner").on(table.ownerId),
  index4("idx_deal_contact").on(table.primaryContactId),
  index4("idx_deal_company").on(table.companyId)
]);
var dealContact = pgTable6("deal_contact", {
  dealId: text6("deal_id").notNull().references(() => deal.id, { onDelete: "cascade" }),
  contactId: text6("contact_id").notNull().references(() => contact.id, { onDelete: "cascade" }),
  role: text6("role"),
  createdAt: timestamp6("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  primaryKey({ columns: [table.dealId, table.contactId] }),
  index4("idx_deal_contact_contact").on(table.contactId)
]);

// src/db/schema/calendar.ts
import { pgTable as pgTable7, text as text7, integer as integer2, boolean as boolean6, jsonb as jsonb4, time, timestamp as timestamp7, date as date2, index as index5, unique as unique3, check as check4 } from "drizzle-orm/pg-core";
import { sql as sql6 } from "drizzle-orm";
var availabilitySchedule = pgTable7("availability_schedule", {
  id: text7("id").primaryKey().$defaultFn(() => createId()),
  ownerId: text7("owner_id").notNull().references(() => hubUser.id, { onDelete: "cascade" }),
  portalId: text7("portal_id").notNull().references(() => portal.id, { onDelete: "cascade" }),
  name: text7("name").notNull(),
  timeZone: text7("time_zone").notNull(),
  /** Si true, este schedule se usa cuando el meeting_type no tiene uno asignado. */
  isDefault: boolean6("is_default").notNull().default(false)
}, (table) => [
  index5("idx_availability_schedule_portal_owner").on(table.portalId, table.ownerId)
]);
var availabilityInterval = pgTable7("availability_interval", {
  id: text7("id").primaryKey().$defaultFn(() => createId()),
  scheduleId: text7("schedule_id").notNull().references(() => availabilitySchedule.id, { onDelete: "cascade" }),
  dayOfWeek: integer2("day_of_week").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull()
}, (table) => [
  check4("availability_interval_day_check", sql6`${table.dayOfWeek} BETWEEN 0 AND 6`),
  check4("availability_interval_time_check", sql6`${table.endTime} > ${table.startTime}`),
  index5("idx_availability_interval_schedule_day").on(table.scheduleId, table.dayOfWeek)
]);
var dateOverride = pgTable7("date_override", {
  id: text7("id").primaryKey().$defaultFn(() => createId()),
  scheduleId: text7("schedule_id").notNull().references(() => availabilitySchedule.id, { onDelete: "cascade" }),
  date: date2("date").notNull(),
  /** Lista de {startTime, endTime} para ese día. Array vacío = bloqueado. */
  intervals: jsonb4("intervals").notNull().default([])
}, (table) => [
  // Un solo override por fecha por schedule.
  unique3("date_override_schedule_date_unique").on(table.scheduleId, table.date)
]);
var availabilityRule = pgTable7("availability_rule", {
  id: text7("id").primaryKey().$defaultFn(() => createId()),
  ownerId: text7("owner_id").notNull().references(() => hubUser.id, { onDelete: "cascade" }),
  dayOfWeek: integer2("day_of_week").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  // Default actualizado en migración 0017: la agencia opera en Argentina.
  timeZone: text7("time_zone").notNull().default("America/Argentina/Buenos_Aires")
}, (table) => [
  check4("availability_rule_day_of_week_check", sql6`${table.dayOfWeek} BETWEEN 0 AND 6`),
  check4("availability_rule_time_check", sql6`${table.endTime} > ${table.startTime}`)
]);
var availabilityBlock = pgTable7("availability_block", {
  id: text7("id").primaryKey().$defaultFn(() => createId()),
  ownerId: text7("owner_id").notNull().references(() => hubUser.id, { onDelete: "cascade" }),
  startsAt: timestamp7("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp7("ends_at", { withTimezone: true }).notNull(),
  reason: text7("reason")
}, (table) => [
  check4("availability_block_time_check", sql6`${table.endsAt} > ${table.startsAt}`)
]);
var meetingType = pgTable7("meeting_type", {
  id: text7("id").primaryKey().$defaultFn(() => createId()),
  portalId: text7("portal_id").notNull().references(() => portal.id, { onDelete: "cascade" }),
  ownerId: text7("owner_id").notNull().references(() => hubUser.id, { onDelete: "cascade" }),
  slug: text7("slug").notNull(),
  name: text7("name").notNull(),
  durationMin: integer2("duration_min").notNull(),
  bufferMin: integer2("buffer_min").notNull().default(10),
  location: text7("location"),
  description: text7("description"),
  isActive: boolean6("is_active").notNull().default(true),
  /** solo = 1 host, group = múltiples hosts (event_membership). */
  kind: text7("kind").notNull().default("solo"),
  /** Para reuniones grupales: null=no pooling, collective=todos disponibles. */
  poolingType: text7("pooling_type"),
  color: text7("color").default("#3b82f6"),
  /** Si true, el link no se lista públicamente. */
  secret: boolean6("secret").notNull().default(false),
  /** Preguntas adicionales para el invitado al reservar. */
  customQuestions: jsonb4("custom_questions").notNull().default([]),
  /** Ubicaciones configuradas (ej: Google Meet, Zoom, presencial). */
  locations: jsonb4("locations").notNull().default([]),
  startTimeIncrementMin: integer2("start_time_increment_min").notNull().default(30),
  minBookingNoticeMin: integer2("min_booking_notice_min").notNull().default(240),
  /** rolling=días desde hoy, range=fechas fijas, unlimited=sin límite. */
  bookingWindowType: text7("booking_window_type").notNull().default("rolling"),
  bookingWindowDays: integer2("booking_window_days").default(60),
  bookingWindowStart: date2("booking_window_start"),
  bookingWindowEnd: date2("booking_window_end"),
  bufferBeforeMin: integer2("buffer_before_min").notNull().default(0),
  bufferAfterMin: integer2("buffer_after_min").notNull().default(0),
  dailyLimit: integer2("daily_limit"),
  maxInvitees: integer2("max_invitees").default(1),
  /** Schedule de disponibilidad vinculado. Null = usa availability_rule del owner. */
  availabilityScheduleId: text7("availability_schedule_id").references(() => availabilitySchedule.id, { onDelete: "set null" })
}, (table) => [
  unique3("meeting_type_portal_id_slug_unique").on(table.portalId, table.slug),
  check4("meeting_type_duration_min_check", sql6`${table.durationMin} > 0`),
  check4("meeting_type_kind_check", sql6`${table.kind} IN ('solo', 'group')`),
  check4("meeting_type_pooling_check", sql6`${table.poolingType} IS NULL OR ${table.poolingType} = 'collective'`),
  check4("meeting_type_booking_window_check", sql6`${table.bookingWindowType} IN ('rolling', 'range', 'unlimited')`)
]);
var eventMembership = pgTable7("event_membership", {
  id: text7("id").primaryKey().$defaultFn(() => createId()),
  meetingTypeId: text7("meeting_type_id").notNull().references(() => meetingType.id, { onDelete: "cascade" }),
  hostId: text7("host_id").notNull().references(() => hubUser.id, { onDelete: "cascade" })
}, (table) => [
  unique3("event_membership_meeting_host_unique").on(table.meetingTypeId, table.hostId)
]);
var booking = pgTable7("booking", {
  id: text7("id").primaryKey().$defaultFn(() => createId()),
  meetingTypeId: text7("meeting_type_id").notNull().references(() => meetingType.id),
  ownerId: text7("owner_id").notNull().references(() => hubUser.id),
  contactId: text7("contact_id").references(() => contact.id, { onDelete: "set null" }),
  dealId: text7("deal_id").references(() => deal.id, { onDelete: "set null" }),
  guestName: text7("guest_name").notNull(),
  guestEmail: citext("guest_email").notNull(),
  startsAt: timestamp7("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp7("ends_at", { withTimezone: true }).notNull(),
  status: text7("status").notNull().default("confirmed"),
  meetLink: text7("meet_link"),
  notes: text7("notes"),
  cancelledAt: timestamp7("cancelled_at", { withTimezone: true }),
  createdAt: timestamp7("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** Zona horaria del invitado al momento de reservar. */
  inviteeTimeZone: text7("invitee_time_zone").notNull().default("UTC"),
  /** Respuestas del invitado a customQuestions del meeting_type. */
  questionAnswers: jsonb4("question_answers").notNull().default({}),
  /** Emails de invitados adicionales (para reuniones grupales). */
  guestEmails: jsonb4("guest_emails").notNull().default([]),
  /** Token para cancelar sin estar autenticado. */
  cancelToken: text7("cancel_token").unique(),
  /** Token para reprogramar sin estar autenticado. */
  rescheduleToken: text7("reschedule_token").unique(),
  /** Booking original si este es un reprogramado. */
  rescheduledFromId: text7("rescheduled_from_id").references(() => booking.id, { onDelete: "set null" })
}, (table) => [
  check4("booking_status_check", sql6`${table.status} IN ('confirmed','cancelled','rescheduled')`),
  check4("booking_time_check", sql6`${table.endsAt} > ${table.startsAt}`),
  index5("idx_booking_owner_time").on(table.ownerId, table.startsAt),
  index5("idx_booking_deal").on(table.dealId)
  // NOTE: EXCLUDE USING gist (booking_no_overlap) omitted — ver migraciones manuales
]);

// src/db/schema/activities.ts
import { pgTable as pgTable8, text as text8, integer as integer3, jsonb as jsonb5, timestamp as timestamp8, index as index6, check as check5 } from "drizzle-orm/pg-core";
import { sql as sql7 } from "drizzle-orm";
var note = pgTable8("note", {
  id: text8("id").primaryKey().$defaultFn(() => createId()),
  portalId: text8("portal_id").notNull().references(() => portal.id, { onDelete: "cascade" }),
  createdBy: text8("created_by").references(() => hubUser.id, { onDelete: "set null" }),
  body: text8("body").notNull(),
  dealId: text8("deal_id").references(() => deal.id, { onDelete: "cascade" }),
  contactId: text8("contact_id").references(() => contact.id, { onDelete: "cascade" }),
  companyId: text8("company_id").references(() => company.id, { onDelete: "cascade" }),
  createdAt: timestamp8("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index6("idx_note_deal").on(table.dealId),
  index6("idx_note_contact").on(table.contactId),
  index6("idx_note_company").on(table.companyId)
]);
var task = pgTable8("task", {
  id: text8("id").primaryKey().$defaultFn(() => createId()),
  portalId: text8("portal_id").notNull().references(() => portal.id, { onDelete: "cascade" }),
  createdBy: text8("created_by").references(() => hubUser.id, { onDelete: "set null" }),
  assignedTo: text8("assigned_to").references(() => hubUser.id, { onDelete: "set null" }),
  title: text8("title").notNull(),
  body: text8("body"),
  status: text8("status").notNull().default("pending"),
  priority: text8("priority").notNull().default("medium"),
  dueDate: timestamp8("due_date", { withTimezone: true }),
  completedAt: timestamp8("completed_at", { withTimezone: true }),
  dealId: text8("deal_id").references(() => deal.id, { onDelete: "cascade" }),
  contactId: text8("contact_id").references(() => contact.id, { onDelete: "cascade" }),
  companyId: text8("company_id").references(() => company.id, { onDelete: "cascade" }),
  createdAt: timestamp8("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  // 'blocked' agregado en migración 0020: tarea bloqueada por dependencia externa.
  check5("task_status_check", sql7`${table.status} IN ('pending','in_progress','completed','cancelled','blocked')`),
  check5("task_priority_check", sql7`${table.priority} IN ('low','medium','high')`),
  index6("idx_task_assignee").on(table.assignedTo, table.status),
  index6("idx_task_due").on(table.dueDate).where(sql7`status <> 'completed'`),
  index6("idx_task_deal").on(table.dealId),
  index6("idx_task_contact").on(table.contactId),
  index6("idx_task_company").on(table.companyId),
  // Compuesto para el listado (WHERE portal ORDER BY created_at DESC); portal_id sigue de columna líder.
  index6("idx_task_portal_created").on(table.portalId, table.createdAt, table.id)
]);
var call = pgTable8("call", {
  id: text8("id").primaryKey().$defaultFn(() => createId()),
  portalId: text8("portal_id").notNull().references(() => portal.id, { onDelete: "cascade" }),
  createdBy: text8("created_by").references(() => hubUser.id, { onDelete: "set null" }),
  title: text8("title"),
  body: text8("body"),
  direction: text8("direction"),
  durationSec: integer3("duration_sec"),
  occurredAt: timestamp8("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  dealId: text8("deal_id").references(() => deal.id, { onDelete: "cascade" }),
  contactId: text8("contact_id").references(() => contact.id, { onDelete: "cascade" }),
  createdAt: timestamp8("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  check5("call_direction_check", sql7`${table.direction} IN ('inbound','outbound')`),
  index6("idx_call_deal").on(table.dealId),
  index6("idx_call_contact").on(table.contactId)
]);
var meeting = pgTable8("meeting", {
  id: text8("id").primaryKey().$defaultFn(() => createId()),
  portalId: text8("portal_id").notNull().references(() => portal.id, { onDelete: "cascade" }),
  createdBy: text8("created_by").references(() => hubUser.id, { onDelete: "set null" }),
  bookingId: text8("booking_id").references(() => booking.id, { onDelete: "set null" }),
  title: text8("title").notNull(),
  startsAt: timestamp8("starts_at", { withTimezone: true }),
  endsAt: timestamp8("ends_at", { withTimezone: true }),
  location: text8("location"),
  dealId: text8("deal_id").references(() => deal.id, { onDelete: "cascade" }),
  contactId: text8("contact_id").references(() => contact.id, { onDelete: "cascade" }),
  fathomSummary: text8("fathom_summary"),
  fathomTranscriptUrl: text8("fathom_transcript_url"),
  fathomActionItems: jsonb5("fathom_action_items"),
  fathomParticipants: jsonb5("fathom_participants"),
  createdAt: timestamp8("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index6("idx_meeting_deal").on(table.dealId),
  index6("idx_meeting_booking").on(table.bookingId)
]);

// src/db/schema/history.ts
import { pgTable as pgTable9, text as text9, timestamp as timestamp9, index as index7 } from "drizzle-orm/pg-core";
var recordHistory = pgTable9("record_history", {
  id: text9("id").primaryKey().$defaultFn(() => createId()),
  portalId: text9("portal_id").notNull().references(() => portal.id, { onDelete: "cascade" }),
  entityType: text9("entity_type").notNull(),
  entityId: text9("entity_id").notNull(),
  fieldName: text9("field_name").notNull(),
  oldValue: text9("old_value"),
  newValue: text9("new_value"),
  sourceType: text9("source_type"),
  sourceId: text9("source_id"),
  changedBy: text9("changed_by").references(() => hubUser.id, { onDelete: "set null" }),
  changedAt: timestamp9("changed_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index7("idx_record_history_entity").on(table.entityType, table.entityId, table.fieldName, table.changedAt)
]);

// src/db/schema/lists.ts
import { pgTable as pgTable10, text as text10, jsonb as jsonb6, timestamp as timestamp10, primaryKey as primaryKey2, check as check6 } from "drizzle-orm/pg-core";
import { sql as sql8 } from "drizzle-orm";
var crmList = pgTable10("crm_list", {
  id: text10("id").primaryKey().$defaultFn(() => createId()),
  portalId: text10("portal_id").notNull().references(() => portal.id, { onDelete: "cascade" }),
  entityType: text10("entity_type").notNull(),
  name: text10("name").notNull(),
  processingType: text10("processing_type").notNull().default("MANUAL"),
  filterBranch: jsonb6("filter_branch"),
  createdAt: timestamp10("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp10("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  check6("crm_list_entity_type_check", sql8`${table.entityType} IN ('contact','company','deal')`),
  check6("crm_list_processing_type_check", sql8`${table.processingType} IN ('MANUAL','DYNAMIC')`)
]);
var listMembership = pgTable10("list_membership", {
  listId: text10("list_id").notNull().references(() => crmList.id, { onDelete: "cascade" }),
  // entityId is a polymorphic reference (not a declared FK) — kept as text (CUID2)
  entityId: text10("entity_id").notNull(),
  addedAt: timestamp10("added_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  primaryKey2({ columns: [table.listId, table.entityId] })
]);

// src/db/schema/client-portal.ts
import { pgTable as pgTable11, text as text11, boolean as boolean8, timestamp as timestamp11, unique as unique4, primaryKey as primaryKey3 } from "drizzle-orm/pg-core";
var clientAccount = pgTable11("client_account", {
  id: text11("id").primaryKey().$defaultFn(() => createId()),
  portalId: text11("portal_id").notNull().references(() => portal.id, { onDelete: "cascade" }),
  contactId: text11("contact_id").notNull().references(() => contact.id),
  email: citext("email").notNull(),
  inviteToken: text11("invite_token").unique(),
  inviteSentAt: timestamp11("invite_sent_at", { withTimezone: true }),
  inviteAccepted: boolean8("invite_accepted").notNull().default(false),
  lastLoginAt: timestamp11("last_login_at", { withTimezone: true }),
  isActive: boolean8("is_active").notNull().default(true),
  /** ID del usuario en Clerk (auth externo). Null si aún no se vinculó con Clerk. */
  clerkUserId: text11("clerk_user_id").unique(),
  /** Slug único del portal del cliente (usado en URLs personalizadas). */
  brandSlug: text11("brand_slug").unique(),
  /** Nombre de marca visible en el portal del cliente. */
  brandName: text11("brand_name"),
  /** Clave del logo de marca en R2 (sin URL; se genera on-demand). */
  brandLogoKey: text11("brand_logo_key"),
  /** Color primario de la marca en formato hex (#rrggbb). */
  brandPrimary: text11("brand_primary"),
  /** Color secundario de la marca en formato hex (#rrggbb). */
  brandSecondary: text11("brand_secondary"),
  createdAt: timestamp11("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  unique4("client_account_portal_id_email_unique").on(table.portalId, table.email)
]);
var clientDealAccess = pgTable11("client_deal_access", {
  clientId: text11("client_id").notNull().references(() => clientAccount.id, { onDelete: "cascade" }),
  dealId: text11("deal_id").notNull().references(() => deal.id, { onDelete: "cascade" })
}, (table) => [
  primaryKey3({ columns: [table.clientId, table.dealId] })
]);

// src/db/schema/intake.ts
import { pgTable as pgTable12, text as text12, jsonb as jsonb7, timestamp as timestamp12, unique as unique5, index as index8, check as check7, bigint } from "drizzle-orm/pg-core";
import { sql as sql9 } from "drizzle-orm";
var intakeForm = pgTable12("intake_form", {
  id: text12("id").primaryKey().$defaultFn(() => createId()),
  portalId: text12("portal_id").notNull().references(() => portal.id),
  name: text12("name").notNull(),
  description: text12("description"),
  slug: text12("slug").notNull(),
  fields: jsonb7("fields").notNull().default([]),
  createdAt: timestamp12("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  unique5("intake_form_portal_id_slug_unique").on(table.portalId, table.slug)
]);
var dealIntake = pgTable12("deal_intake", {
  id: text12("id").primaryKey().$defaultFn(() => createId()),
  dealId: text12("deal_id").notNull().references(() => deal.id, { onDelete: "cascade" }),
  formId: text12("form_id").notNull().references(() => intakeForm.id),
  title: text12("title").notNull(),
  status: text12("status").notNull().default("pending"),
  dueDate: timestamp12("due_date", { withTimezone: true }),
  completedAt: timestamp12("completed_at", { withTimezone: true }),
  createdAt: timestamp12("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  check7("deal_intake_status_check", sql9`${table.status} IN ('pending','in_progress','completed')`),
  index8("idx_deal_intake_deal").on(table.dealId)
]);
var dealIntakeResponse = pgTable12("deal_intake_response", {
  id: text12("id").primaryKey().$defaultFn(() => createId()),
  intakeId: text12("intake_id").notNull().references(() => dealIntake.id, { onDelete: "cascade" }),
  clientId: text12("client_id").notNull().references(() => clientAccount.id),
  answers: jsonb7("answers").notNull().default({}),
  submittedAt: timestamp12("submitted_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  unique5("deal_intake_response_intake_id_unique").on(table.intakeId)
]);
var clientAsset = pgTable12("client_asset", {
  id: text12("id").primaryKey().$defaultFn(() => createId()),
  portalId: text12("portal_id").notNull().references(() => portal.id),
  dealId: text12("deal_id").notNull().references(() => deal.id),
  clientId: text12("client_id").notNull().references(() => clientAccount.id),
  intakeId: text12("intake_id").references(() => dealIntake.id),
  fieldName: text12("field_name"),
  name: text12("name").notNull(),
  type: text12("type").notNull(),
  mimeType: text12("mime_type"),
  storageKey: text12("storage_key").notNull(),
  // sizeBytes is a real size in bytes — kept as bigint (not an ID)
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  uploadedAt: timestamp12("uploaded_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  check7("client_asset_type_check", sql9`${table.type} IN ('logo','foto','documento','acceso','otro')`),
  index8("idx_client_asset_deal").on(table.dealId)
]);

// src/db/schema/deliverables.ts
import { pgTable as pgTable13, text as text13, integer as integer4, timestamp as timestamp13, index as index9, check as check8 } from "drizzle-orm/pg-core";
import { sql as sql10 } from "drizzle-orm";
var deliverable = pgTable13("deliverable", {
  id: text13("id").primaryKey().$defaultFn(() => createId()),
  dealId: text13("deal_id").notNull().references(() => deal.id),
  title: text13("title").notNull(),
  description: text13("description"),
  type: text13("type").notNull(),
  url: text13("url"),
  version: integer4("version").notNull().default(1),
  status: text13("status").notNull().default("pending_review"),
  feedback: text13("feedback"),
  reviewedBy: text13("reviewed_by").references(() => clientAccount.id),
  reviewedAt: timestamp13("reviewed_at", { withTimezone: true }),
  createdBy: text13("created_by").references(() => hubUser.id),
  createdAt: timestamp13("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  check8("deliverable_type_check", sql10`${table.type} IN ('design','prototype','staging','final')`),
  check8("deliverable_status_check", sql10`${table.status} IN ('pending_review','approved','changes_requested')`),
  index9("idx_deliverable_deal").on(table.dealId)
]);

// src/db/schema/change-requests.ts
import { pgTable as pgTable14, text as text14, integer as integer5, numeric as numeric3, date as date3, timestamp as timestamp14, index as index10, unique as unique6, check as check9 } from "drizzle-orm/pg-core";
import { sql as sql11 } from "drizzle-orm";
var changeRequest = pgTable14("change_request", {
  id: text14("id").primaryKey().$defaultFn(() => createId()),
  portalId: text14("portal_id").notNull().references(() => portal.id),
  dealId: text14("deal_id").notNull().references(() => deal.id),
  number: integer5("number").notNull(),
  title: text14("title").notNull(),
  description: text14("description").notNull(),
  originalScopeRef: text14("original_scope_ref"),
  origin: text14("origin").notNull().default("client"),
  status: text14("status").notNull().default("draft"),
  version: integer5("version").notNull().default(1),
  totalAmount: numeric3("total_amount", { precision: 12, scale: 2 }),
  timelineImpactDays: integer5("timeline_impact_days").notNull().default(0),
  newDeliveryDate: date3("new_delivery_date"),
  approvedAt: timestamp14("approved_at", { withTimezone: true }),
  approvedBy: text14("approved_by").references(() => clientAccount.id),
  completedAt: timestamp14("completed_at", { withTimezone: true }),
  createdBy: text14("created_by").references(() => hubUser.id),
  createdAt: timestamp14("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp14("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  unique6("change_request_deal_id_number_unique").on(table.dealId, table.number),
  check9("change_request_origin_check", sql11`${table.origin} IN ('client','agency')`),
  check9("change_request_status_check", sql11`${table.status} IN ('draft','sent','approved','rejected','negotiating','approved_verbally','disputed','completed')`),
  index10("idx_cr_deal").on(table.dealId, table.status)
]);
var changeRequestItem = pgTable14("change_request_item", {
  id: text14("id").primaryKey().$defaultFn(() => createId()),
  changeRequestId: text14("change_request_id").notNull().references(() => changeRequest.id, { onDelete: "cascade" }),
  description: text14("description").notNull(),
  hours: numeric3("hours", { precision: 6, scale: 2 }),
  unitPrice: numeric3("unit_price", { precision: 12, scale: 2 }).notNull(),
  quantity: numeric3("quantity", { precision: 8, scale: 2 }).notNull().default("1"),
  subtotal: numeric3("subtotal", { precision: 12, scale: 2 }).generatedAlwaysAs(sql11`unit_price * quantity`)
}, (table) => [
  index10("idx_cr_item_cr").on(table.changeRequestId)
]);
var changeRequestAttachment = pgTable14("change_request_attachment", {
  id: text14("id").primaryKey().$defaultFn(() => createId()),
  changeRequestId: text14("change_request_id").notNull().references(() => changeRequest.id, { onDelete: "cascade" }),
  name: text14("name").notNull(),
  storageKey: text14("storage_key").notNull(),
  mimeType: text14("mime_type"),
  uploadedBy: text14("uploaded_by").references(() => hubUser.id),
  uploadedAt: timestamp14("uploaded_at", { withTimezone: true }).notNull().defaultNow()
});
var changeRequestHistory = pgTable14("change_request_history", {
  id: text14("id").primaryKey().$defaultFn(() => createId()),
  changeRequestId: text14("change_request_id").notNull().references(() => changeRequest.id, { onDelete: "cascade" }),
  fromStatus: text14("from_status"),
  toStatus: text14("to_status").notNull(),
  comment: text14("comment"),
  changedByUser: text14("changed_by_user").references(() => hubUser.id),
  changedByClient: text14("changed_by_client").references(() => clientAccount.id),
  changedAt: timestamp14("changed_at", { withTimezone: true }).notNull().defaultNow()
});
var changeRequestComment = pgTable14("change_request_comment", {
  id: text14("id").primaryKey().$defaultFn(() => createId()),
  changeRequestId: text14("change_request_id").notNull().references(() => changeRequest.id, { onDelete: "cascade" }),
  body: text14("body").notNull(),
  authorUser: text14("author_user").references(() => hubUser.id),
  authorClient: text14("author_client").references(() => clientAccount.id),
  createdAt: timestamp14("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  check9("change_request_comment_author_check", sql11`(${table.authorUser} IS NOT NULL AND ${table.authorClient} IS NULL) OR (${table.authorUser} IS NULL AND ${table.authorClient} IS NOT NULL)`),
  index10("idx_cr_comment_cr").on(table.changeRequestId, table.createdAt)
]);

// src/db/schema/documents.ts
import { pgTable as pgTable15, text as text15, integer as integer6, timestamp as timestamp15, index as index11, check as check10 } from "drizzle-orm/pg-core";
import { sql as sql12 } from "drizzle-orm";
var document = pgTable15("document", {
  id: text15("id").primaryKey().$defaultFn(() => createId()),
  portalId: text15("portal_id").notNull().references(() => portal.id),
  dealId: text15("deal_id").references(() => deal.id),
  crId: text15("cr_id").references(() => changeRequest.id),
  name: text15("name").notNull(),
  type: text15("type").notNull(),
  source: text15("source"),
  // docuseal IDs are external numeric IDs — kept as integer (not FKs)
  docusealSubmissionId: integer6("docuseal_submission_id"),
  docusealTemplateId: integer6("docuseal_template_id"),
  docusealStatus: text15("docuseal_status"),
  docusealExternalId: text15("docuseal_external_id").unique(),
  storageKey: text15("storage_key"),
  signedAt: timestamp15("signed_at", { withTimezone: true }),
  signedBy: text15("signed_by").references(() => clientAccount.id),
  createdBy: text15("created_by").references(() => hubUser.id),
  createdAt: timestamp15("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  check10("document_type_check", sql12`${table.type} IN ('contract','proposal','invoice','other')`),
  check10("document_source_check", sql12`${table.source} IN ('docuseal','manual','generated')`),
  check10("document_docuseal_status_check", sql12`${table.docusealStatus} IN ('pending','completed','declined','expired')`),
  index11("idx_document_deal").on(table.dealId)
]);

// src/db/schema/email.ts
import { pgTable as pgTable16, text as text16, uuid, timestamp as timestamp16, index as index12, check as check11 } from "drizzle-orm/pg-core";
import { sql as sql13 } from "drizzle-orm";
var emailSend = pgTable16("email_send", {
  id: text16("id").primaryKey().$defaultFn(() => createId()),
  portalId: text16("portal_id").notNull().references(() => portal.id),
  contactId: text16("contact_id").references(() => contact.id, { onDelete: "set null" }),
  dealId: text16("deal_id").references(() => deal.id, { onDelete: "set null" }),
  fromEmail: citext("from_email").notNull(),
  toEmail: citext("to_email").notNull(),
  subject: text16("subject").notNull(),
  bodyHtml: text16("body_html"),
  trackingId: uuid("tracking_id").notNull().defaultRandom(),
  sentAt: timestamp16("sent_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index12("idx_email_send_contact").on(table.contactId),
  index12("idx_email_send_tracking").on(table.trackingId),
  // Timeline filtra por deal_id y ordena por sent_at DESC → compuesto evita el Seq Scan.
  index12("idx_email_send_deal").on(table.dealId, table.sentAt)
]);
var emailEvent = pgTable16("email_event", {
  id: text16("id").primaryKey().$defaultFn(() => createId()),
  emailId: text16("email_id").notNull().references(() => emailSend.id, { onDelete: "cascade" }),
  type: text16("type").notNull(),
  linkUrl: text16("link_url"),
  userAgent: text16("user_agent"),
  ipAddress: inet("ip_address"),
  occurredAt: timestamp16("occurred_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  check11("email_event_type_check", sql13`${table.type} IN ('opened','clicked','bounced','unsubscribed')`),
  index12("idx_email_event_email").on(table.emailId, table.type)
]);

// src/db/schema/notifications.ts
import { pgTable as pgTable17, text as text17, timestamp as timestamp17, index as index13 } from "drizzle-orm/pg-core";
var notification = pgTable17("notification", {
  id: text17("id").primaryKey().$defaultFn(() => createId()),
  portalId: text17("portal_id").notNull().references(() => portal.id),
  userId: text17("user_id").references(() => hubUser.id),
  clientId: text17("client_id").references(() => clientAccount.id),
  entityType: text17("entity_type"),
  entityId: text17("entity_id"),
  type: text17("type").notNull(),
  title: text17("title").notNull(),
  body: text17("body"),
  actionUrl: text17("action_url"),
  readAt: timestamp17("read_at", { withTimezone: true }),
  createdAt: timestamp17("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index13("idx_notification_user").on(table.userId, table.readAt),
  index13("idx_notification_client").on(table.clientId, table.readAt),
  index13("idx_notification_portal_user").on(table.portalId, table.userId, table.readAt)
]);

// src/db/schema/audit.ts
import { pgTable as pgTable18, text as text18, jsonb as jsonb8, timestamp as timestamp18, index as index14 } from "drizzle-orm/pg-core";
var auditLog = pgTable18("audit_log", {
  id: text18("id").primaryKey().$defaultFn(() => createId()),
  portalId: text18("portal_id").notNull().references(() => portal.id),
  userId: text18("user_id").references(() => hubUser.id),
  clientId: text18("client_id").references(() => clientAccount.id),
  entityType: text18("entity_type"),
  entityId: text18("entity_id"),
  action: text18("action").notNull(),
  payload: jsonb8("payload"),
  ipAddress: inet("ip_address"),
  createdAt: timestamp18("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index14("idx_audit_entity").on(table.entityType, table.entityId, table.createdAt)
]);

// src/db/schema/library.ts
import { pgTable as pgTable19, text as text19, boolean as boolean9, jsonb as jsonb9, timestamp as timestamp19, index as index15, check as check12 } from "drizzle-orm/pg-core";
import { sql as sql14 } from "drizzle-orm";
var libraryItem = pgTable19("library_item", {
  id: text19("id").primaryKey().$defaultFn(() => createId()),
  portalId: text19("portal_id").notNull().references(() => portal.id),
  type: text19("type").notNull(),
  category: text19("category"),
  name: text19("name").notNull(),
  description: text19("description"),
  storageKey: text19("storage_key"),
  url: text19("url"),
  /**
   * Pasos/contenido de la entidad operativa sin estado.
   * Para 'procedure': lista ordenada de pasos. Para 'checklist': lista de ítems.
   * Se almacena como JSONB para permitir estructura flexible por variante.
   */
  steps: jsonb9("steps").default([]),
  /** Variante operativa: 'procedure' (SOP ordenado) o 'checklist' (lista de verificación). */
  kind: text19("kind"),
  createdBy: text19("created_by").references(() => hubUser.id),
  /** Responsable del contenido. null = sin dueño asignado. */
  ownerId: text19("owner_id").references(() => hubUser.id, { onDelete: "set null" }),
  archived: boolean9("archived").notNull().default(false),
  archivedAt: timestamp19("archived_at", { withTimezone: true }),
  createdAt: timestamp19("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp19("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  check12(
    "library_item_type_check",
    sql14`${table.type} IN ('document','sop','template','contract_base','proposal_base','checklist','tech_doc')`
  ),
  // kind aplica solo a entidades operativas (type='sop' tras la migración 0023).
  check12(
    "library_item_kind_check",
    sql14`${table.kind} IS NULL OR ${table.kind} IN ('procedure','checklist')`
  ),
  index15("idx_library_item_portal_type").on(table.portalId, table.type)
]);

// src/db/schema/work-items.ts
import { pgTable as pgTable20, text as text20, boolean as boolean10, timestamp as timestamp20, index as index16, check as check13 } from "drizzle-orm/pg-core";
import { sql as sql15 } from "drizzle-orm";
var workItem = pgTable20("work_item", {
  id: text20("id").primaryKey().$defaultFn(() => createId()),
  portalId: text20("portal_id").notNull().references(() => portal.id),
  type: text20("type").notNull(),
  title: text20("title").notNull(),
  description: text20("description"),
  status: text20("status").notNull().default("open"),
  priority: text20("priority").notNull().default("medium"),
  /** Horizonte de planificación: now = esta semana, next = próxima iteración, later = backlog. */
  timeframe: text20("timeframe"),
  dealId: text20("deal_id").references(() => deal.id, { onDelete: "set null" }),
  assignedTo: text20("assigned_to").references(() => hubUser.id, { onDelete: "set null" }),
  createdBy: text20("created_by").references(() => hubUser.id, { onDelete: "set null" }),
  archived: boolean10("archived").notNull().default(false),
  archivedAt: timestamp20("archived_at", { withTimezone: true }),
  createdAt: timestamp20("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp20("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  check13(
    "work_item_type_check",
    sql15`${table.type} IN ('bug','improvement','roadmap','process')`
  ),
  check13(
    "work_item_status_check",
    sql15`${table.status} IN ('open','in_progress','done','cancelled')`
  ),
  check13(
    "work_item_priority_check",
    sql15`${table.priority} IN ('low','medium','high')`
  ),
  // timeframe es opcional; si se setea, debe ser uno de los tres horizontes conocidos.
  check13(
    "work_item_timeframe_check",
    sql15`${table.timeframe} IS NULL OR ${table.timeframe} IN ('now','next','later')`
  ),
  index16("idx_work_item_portal_type").on(table.portalId, table.type),
  index16("idx_work_item_portal").on(table.portalId)
]);

// src/db/schema/finance.ts
import { pgTable as pgTable21, text as text21, integer as integer7, numeric as numeric4, date as date4, timestamp as timestamp21, boolean as boolean11, index as index17, check as check14 } from "drizzle-orm/pg-core";
import { sql as sql16 } from "drizzle-orm";
var retainer = pgTable21("retainer", {
  id: text21("id").primaryKey().$defaultFn(() => createId()),
  portalId: text21("portal_id").notNull().references(() => portal.id),
  companyId: text21("company_id").notNull().references(() => company.id),
  amount: numeric4("amount", { precision: 14, scale: 2 }).notNull(),
  currency: text21("currency").notNull(),
  /** Tipo de cambio al momento de emitir (1 si la moneda base == currency). */
  exchangeRate: numeric4("exchange_rate", { precision: 14, scale: 6 }).notNull().default("1"),
  /** Monto en moneda base del portal (siempre USD, calculado en el service). */
  amountBase: numeric4("amount_base", { precision: 14, scale: 2 }).notNull(),
  /** Día del mes en que se genera la factura automáticamente (1–28). */
  billingDay: integer7("billing_day").notNull(),
  status: text21("status").notNull().default("active"),
  startDate: date4("start_date").notNull(),
  endDate: date4("end_date"),
  notes: text21("notes"),
  createdBy: text21("created_by").references(() => hubUser.id),
  archived: boolean11("archived").notNull().default(false),
  archivedAt: timestamp21("archived_at", { withTimezone: true }),
  createdAt: timestamp21("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp21("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  check14("retainer_currency_check", sql16`${table.currency} IN ('USD','ARS')`),
  check14("retainer_status_check", sql16`${table.status} IN ('active','paused','cancelled')`),
  // El día de corte se limita al 28 para evitar ambigüedades en meses cortos.
  check14("retainer_billing_day_check", sql16`${table.billingDay} BETWEEN 1 AND 28`),
  index17("idx_retainer_portal_status").on(table.portalId, table.status)
]);
var invoice = pgTable21("invoice", {
  id: text21("id").primaryKey().$defaultFn(() => createId()),
  portalId: text21("portal_id").notNull().references(() => portal.id),
  number: integer7("number").notNull(),
  dealId: text21("deal_id").references(() => deal.id),
  companyId: text21("company_id").references(() => company.id),
  status: text21("status").notNull().default("draft"),
  issueDate: date4("issue_date"),
  dueDate: date4("due_date"),
  subtotal: numeric4("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
  tax: numeric4("tax", { precision: 14, scale: 2 }).notNull().default("0"),
  total: numeric4("total", { precision: 14, scale: 2 }).notNull().default("0"),
  currency: text21("currency").notNull().default("USD"),
  /** Tipo de cambio USD/ARS al momento de emitir (1 si currency == 'USD'). */
  exchangeRate: numeric4("exchange_rate", { precision: 14, scale: 6 }).notNull().default("1"),
  /** total × exchange_rate → monto en USD para comparaciones y reportes. */
  amountBase: numeric4("amount_base", { precision: 14, scale: 2 }).notNull().default("0"),
  notes: text21("notes"),
  /** Retainer que generó esta factura (null si es una factura puntual). */
  retainerId: text21("retainer_id").references(() => retainer.id),
  createdBy: text21("created_by").references(() => hubUser.id),
  archived: boolean11("archived").notNull().default(false),
  archivedAt: timestamp21("archived_at", { withTimezone: true }),
  createdAt: timestamp21("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp21("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  check14("invoice_status_check", sql16`${table.status} IN ('draft','sent','paid','overdue','void')`),
  check14("invoice_currency_check", sql16`${table.currency} IN ('USD','ARS')`),
  index17("idx_invoice_portal_status").on(table.portalId, table.status),
  index17("idx_invoice_retainer").on(table.retainerId),
  index17("idx_invoice_deal").on(table.dealId),
  index17("idx_invoice_company").on(table.companyId)
]);
var invoiceItem = pgTable21("invoice_item", {
  id: text21("id").primaryKey().$defaultFn(() => createId()),
  invoiceId: text21("invoice_id").notNull().references(() => invoice.id, { onDelete: "cascade" }),
  description: text21("description").notNull(),
  quantity: numeric4("quantity", { precision: 12, scale: 2 }).notNull().default("1"),
  unitPrice: numeric4("unit_price", { precision: 14, scale: 2 }).notNull().default("0")
}, (table) => [
  index17("idx_invoice_item_invoice").on(table.invoiceId)
]);
var payment = pgTable21("payment", {
  id: text21("id").primaryKey().$defaultFn(() => createId()),
  portalId: text21("portal_id").notNull().references(() => portal.id),
  invoiceId: text21("invoice_id").notNull().references(() => invoice.id),
  amount: numeric4("amount", { precision: 14, scale: 2 }).notNull(),
  currency: text21("currency").notNull().default("USD"),
  /** Tipo de cambio al momento del pago (1 si currency == 'USD'). */
  exchangeRate: numeric4("exchange_rate", { precision: 14, scale: 6 }).notNull().default("1"),
  /** amount × exchange_rate → monto en USD para conciliación. */
  amountBase: numeric4("amount_base", { precision: 14, scale: 2 }).notNull().default("0"),
  method: text21("method").notNull().default("transfer"),
  paidAt: timestamp21("paid_at", { withTimezone: true }).notNull().defaultNow(),
  reference: text21("reference"),
  createdBy: text21("created_by").references(() => hubUser.id),
  createdAt: timestamp21("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  check14("payment_method_check", sql16`${table.method} IN ('transfer','card','cash','other')`),
  check14("payment_currency_check", sql16`${table.currency} IN ('USD','ARS')`),
  index17("idx_payment_portal").on(table.portalId)
]);
var expense = pgTable21("expense", {
  id: text21("id").primaryKey().$defaultFn(() => createId()),
  portalId: text21("portal_id").notNull().references(() => portal.id),
  description: text21("description").notNull(),
  amount: numeric4("amount", { precision: 14, scale: 2 }).notNull(),
  currency: text21("currency").notNull(),
  /** Tipo de cambio al momento del gasto (1 si currency == 'USD'). */
  exchangeRate: numeric4("exchange_rate", { precision: 14, scale: 6 }).notNull().default("1"),
  /** amount × exchange_rate → monto en USD para dashboards y reportes. */
  amountBase: numeric4("amount_base", { precision: 14, scale: 2 }).notNull(),
  category: text21("category").notNull(),
  expenseDate: date4("expense_date").notNull(),
  vendor: text21("vendor"),
  dealId: text21("deal_id").references(() => deal.id),
  companyId: text21("company_id").references(() => company.id),
  paymentMethod: text21("payment_method"),
  /** Si el gasto es recurrente (ej.: suscripción mensual), se marca para alertas. */
  isRecurring: boolean11("is_recurring").notNull().default(false),
  notes: text21("notes"),
  /** Clave del comprobante subido a R2 (sin URL; la URL se genera on-demand). */
  storageKey: text21("storage_key"),
  createdBy: text21("created_by").references(() => hubUser.id),
  archived: boolean11("archived").notNull().default(false),
  archivedAt: timestamp21("archived_at", { withTimezone: true }),
  createdAt: timestamp21("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp21("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  check14("expense_currency_check", sql16`${table.currency} IN ('USD','ARS')`),
  check14(
    "expense_category_check",
    sql16`${table.category} IN ('software','infraestructura','equipo','impuestos','oficina','marketing','otros')`
  ),
  // payment_method es opcional; si viene, solo acepta los valores conocidos.
  check14(
    "expense_payment_method_check",
    sql16`${table.paymentMethod} IS NULL OR ${table.paymentMethod} IN ('transfer','card','cash','other')`
  ),
  index17("idx_expense_portal_date").on(table.portalId, table.expenseDate),
  index17("idx_expense_deal").on(table.dealId),
  index17("idx_expense_category").on(table.category)
]);

// src/db/schema/notification-prefs.ts
import { pgTable as pgTable22, text as text22, boolean as boolean12, timestamp as timestamp22, unique as unique8, index as index18 } from "drizzle-orm/pg-core";
var notificationPref = pgTable22(
  "notification_pref",
  {
    id: text22("id").primaryKey().$defaultFn(() => createId()),
    portalId: text22("portal_id").notNull().references(() => portal.id, { onDelete: "cascade" }),
    userId: text22("user_id").notNull().references(() => hubUser.id, { onDelete: "cascade" }),
    eventType: text22("event_type").notNull(),
    inApp: boolean12("in_app").notNull().default(true),
    email: boolean12("email").notNull().default(false),
    createdAt: timestamp22("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp22("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique8("notification_pref_user_id_event_type_unique").on(table.userId, table.eventType),
    index18("idx_notification_pref_portal_user").on(table.portalId, table.userId)
  ]
);

// src/db/schema/custom-fields.ts
import { pgTable as pgTable23, text as text23, integer as integer8, boolean as boolean13, timestamp as timestamp23, jsonb as jsonb10, unique as unique9, index as index19, check as check15 } from "drizzle-orm/pg-core";
import { sql as sql17 } from "drizzle-orm";
var customField = pgTable23(
  "custom_field",
  {
    id: text23("id").primaryKey().$defaultFn(() => createId()),
    portalId: text23("portal_id").notNull().references(() => portal.id, { onDelete: "cascade" }),
    entityType: text23("entity_type").notNull(),
    key: text23("key").notNull(),
    label: text23("label").notNull(),
    fieldType: text23("field_type").notNull(),
    options: jsonb10("options").$type().default(null),
    displayOrder: integer8("display_order").notNull().default(0),
    archived: boolean13("archived").notNull().default(false),
    archivedAt: timestamp23("archived_at", { withTimezone: true }),
    createdAt: timestamp23("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp23("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check15(
      "custom_field_entity_type_check",
      sql17`${table.entityType} IN ('contact','deal','company')`
    ),
    check15(
      "custom_field_field_type_check",
      sql17`${table.fieldType} IN ('text','number','date','select','boolean')`
    ),
    unique9("custom_field_portal_entity_key_unique").on(table.portalId, table.entityType, table.key),
    index19("idx_custom_field_portal_entity").on(table.portalId, table.entityType)
  ]
);

// src/db/schema/onboarding.ts
import { pgTable as pgTable24, text as text24, jsonb as jsonb11, timestamp as timestamp24, index as index20, check as check16 } from "drizzle-orm/pg-core";
import { sql as sql18 } from "drizzle-orm";
var onboardingSubmission = pgTable24("onboarding_submission", {
  id: text24("id").primaryKey().$defaultFn(() => createId()),
  portalId: text24("portal_id").notNull().references(() => portal.id, { onDelete: "cascade" }),
  // ── Denormalizado para listado rápido en el admin ──
  fullName: text24("full_name").notNull(),
  email: text24("email").notNull(),
  company: text24("company"),
  // ── Respuestas completas del wizard ──
  answers: jsonb11("answers").$type().notNull().default({}),
  // ── Routing de ventas: budget > 2000 || claridad baja → call ──
  decision: text24("decision").notNull(),
  // ── CRM creado automáticamente ──
  contactId: text24("contact_id").references(() => contact.id, { onDelete: "set null" }),
  dealId: text24("deal_id").references(() => deal.id, { onDelete: "set null" }),
  createdAt: timestamp24("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  check16("onboarding_submission_decision_check", sql18`${table.decision} IN ('call','proposal')`),
  index20("idx_onboarding_submission_portal").on(table.portalId)
]);

// src/db/schema/client-onboarding.ts
import { pgTable as pgTable25, text as text25, integer as integer9, jsonb as jsonb12, timestamp as timestamp25, unique as unique10, check as check17, index as index21 } from "drizzle-orm/pg-core";
import { sql as sql19 } from "drizzle-orm";
var clientOnboarding = pgTable25("client_onboarding", {
  id: text25("id").primaryKey().$defaultFn(() => createId()),
  portalId: text25("portal_id").notNull().references(() => portal.id, { onDelete: "cascade" }),
  dealId: text25("deal_id").notNull().references(() => deal.id, { onDelete: "cascade" }),
  clientId: text25("client_id").notNull().references(() => clientAccount.id, { onDelete: "cascade" }),
  status: text25("status").notNull().default("in_progress"),
  currentStep: integer9("current_step").notNull().default(1),
  /** Mapa { "1": ISOtimestamp, ..., "8": ISOtimestamp } de pasos completados. */
  stepsCompleted: jsonb12("steps_completed").$type().notNull().default({}),
  // ── Paso 5 — Firma. Checkbox de aceptación + nombre tipeado + timestamp + IP.
  // NO DocuSeal (decisión de negocio explícita).
  signatureName: text25("signature_name"),
  signatureAcceptedAt: timestamp25("signature_accepted_at", { withTimezone: true }),
  signatureIp: text25("signature_ip"),
  // ── Paso 6 — Brief del proyecto (16 preguntas, ver OnboardingBriefSchema).
  briefAnswers: jsonb12("brief_answers").$type(),
  // ── Paso 7 — Materiales. Estado por categoría fija (logoBrand, programContent,
  // clientBase, toolAccess) + IDs de client_asset vinculados por cada una.
  materials: jsonb12("materials").$type().notNull().default({}),
  completedAt: timestamp25("completed_at", { withTimezone: true }),
  createdAt: timestamp25("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp25("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  unique10("client_onboarding_deal_id_unique").on(table.dealId),
  check17("client_onboarding_status_check", sql19`${table.status} IN ('in_progress','completed')`),
  // listOnboardings (admin) filtra por portal_id y ordena por status/updated_at.
  index21("idx_client_onboarding_portal_status").on(table.portalId, table.status)
]);

// src/db/schema/prospecting.ts
import { pgTable as pgTable26, text as text26, integer as integer10, numeric as numeric5, jsonb as jsonb13, timestamp as timestamp26, index as index22, check as check18 } from "drizzle-orm/pg-core";
import { sql as sql20 } from "drizzle-orm";
var prospectSearch = pgTable26("prospect_search", {
  id: text26("id").primaryKey().$defaultFn(() => createId()),
  portalId: text26("portal_id").notNull().references(() => portal.id, { onDelete: "cascade" }),
  query: text26("query").notNull(),
  ourServices: text26("our_services"),
  requestedLimit: integer10("requested_limit").notNull().default(5),
  resultCount: integer10("result_count").notNull().default(0),
  status: text26("status").notNull().default("running"),
  error: text26("error"),
  createdBy: text26("created_by").references(() => hubUser.id, { onDelete: "set null" }),
  createdAt: timestamp26("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  check18("prospect_search_status_check", sql20`${table.status} IN ('running','completed','failed')`),
  index22("idx_prospect_search_portal").on(table.portalId)
]);
var prospect = pgTable26("prospect", {
  id: text26("id").primaryKey().$defaultFn(() => createId()),
  portalId: text26("portal_id").notNull().references(() => portal.id, { onDelete: "cascade" }),
  searchId: text26("search_id").notNull().references(() => prospectSearch.id, { onDelete: "cascade" }),
  // ── Datos del negocio (Google Places + scraping) ──
  name: text26("name").notNull(),
  address: text26("address"),
  phone: text26("phone"),
  website: text26("website"),
  email: text26("email"),
  rating: numeric5("rating", { precision: 2, scale: 1 }),
  userRatingsTotal: integer10("user_ratings_total"),
  googlePlaceId: text26("google_place_id"),
  types: jsonb13("types").$type().notNull().default([]),
  // ── Análisis IA (Vertex / Gemini) ──
  aiAnalysis: text26("ai_analysis"),
  aiProposal: jsonb13("ai_proposal").$type(),
  // ── Estado en el flujo de prospección ──
  status: text26("status").notNull().default("new"),
  importedContactId: text26("imported_contact_id").references(() => contact.id, { onDelete: "set null" }),
  createdAt: timestamp26("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  check18("prospect_status_check", sql20`${table.status} IN ('new','imported','discarded')`),
  index22("idx_prospect_portal").on(table.portalId),
  index22("idx_prospect_search").on(table.searchId)
]);

// src/db/schema/setter.ts
import {
  pgTable as pgTable27,
  text as text27,
  boolean as boolean14,
  integer as integer11,
  jsonb as jsonb14,
  timestamp as timestamp27,
  uniqueIndex as uniqueIndex2,
  index as index23,
  check as check19
} from "drizzle-orm/pg-core";
import { sql as sql21 } from "drizzle-orm";
var setterTenant = pgTable27("setter_tenant", {
  id: text27("id").primaryKey().$defaultFn(() => createId()),
  // El setter es interno del CRM: su config cuelga del portal (la org admin).
  portalId: text27("portal_id").notNull().references(() => portal.id, { onDelete: "cascade" }),
  name: text27("name").notNull(),
  // Lo que el agente "conoce": qué vende, ICP, qué califica, oferta, FAQs, precios.
  businessBrief: text27("business_brief").notNull(),
  agentName: text27("agent_name").notNull(),
  ownerName: text27("owner_name").notNull(),
  timezone: text27("timezone").notNull().default("America/Argentina/Buenos_Aires"),
  // shadow global en Sprint 0; el campo existe para el salto a híbrido/autopilot.
  operationMode: text27("operation_mode").notNull().default("shadow"),
  // Model Switcher: qué LLM genera los mensajes ('gemini' | 'claude').
  modelProvider: text27("model_provider").notNull().default("gemini"),
  // Prospección automática desde la oferta: qué ofrecemos (contexto para la IA)
  // y los nichos/ICP sugeridos para buscar leads sin tipear nada.
  prospectingServices: text27("prospecting_services"),
  prospectingNiches: jsonb14("prospecting_niches").$type().notNull().default([]),
  // Autopilot de prospección (loop nicho×ciudad cada 1h).
  prospectingCities: jsonb14("prospecting_cities").$type().notNull().default([]),
  prospectingAutopilot: boolean14("prospecting_autopilot").notNull().default(false),
  prospectingAutopilotCursor: integer11("prospecting_autopilot_cursor").notNull().default(0),
  // Nombre de la instancia de Evolution para este tenant (puede venir de env).
  evolutionInstance: text27("evolution_instance"),
  createdAt: timestamp27("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp27("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => /* @__PURE__ */ new Date())
}, (table) => [
  check19(
    "setter_tenant_operation_mode_check",
    sql21`${table.operationMode} IN ('shadow','hybrid','autopilot')`
  ),
  check19("setter_tenant_model_provider_check", sql21`${table.modelProvider} IN ('gemini','claude')`)
]);
var setterPerson = pgTable27("setter_person", {
  id: text27("id").primaryKey().$defaultFn(() => createId()),
  tenantId: text27("tenant_id").notNull().references(() => setterTenant.id, { onDelete: "cascade" }),
  name: text27("name"),
  // E.164 (+549...). En Sprint 0 (solo WhatsApp) es la clave de identidad.
  phone: text27("phone"),
  // Guardrail no negociable: si opta por salir, nunca más se le genera ni envía.
  optedOut: boolean14("opted_out").notNull().default(false),
  optedOutAt: timestamp27("opted_out_at", { withTimezone: true }),
  // Sync con el CRM: este Person es también un contact del CRM (lead/cliente).
  crmContactId: text27("crm_contact_id").references(() => contact.id, { onDelete: "set null" }),
  createdAt: timestamp27("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex2("uq_setter_person_tenant_phone").on(table.tenantId, table.phone)
]);
var setterLead = pgTable27("setter_lead", {
  id: text27("id").primaryKey().$defaultFn(() => createId()),
  tenantId: text27("tenant_id").notNull().references(() => setterTenant.id, { onDelete: "cascade" }),
  personId: text27("person_id").notNull().references(() => setterPerson.id, { onDelete: "cascade" }),
  status: text27("status").notNull().default("NEW"),
  // { pain, fit, authority, timing, score, notes } — lo llena save_qualification.
  qualification: jsonb14("qualification").$type(),
  source: text27("source"),
  // Cuándo cierra la ventana de servicio (último msg del lead + 24h).
  windowExpiresAt: timestamp27("window_expires_at", { withTimezone: true }),
  // Sync con el CRM: el deal generado para este lead (al calificar).
  crmDealId: text27("crm_deal_id").references(() => deal.id, { onDelete: "set null" }),
  createdAt: timestamp27("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp27("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => /* @__PURE__ */ new Date())
}, (table) => [
  check19(
    "setter_lead_status_check",
    sql21`${table.status} IN ('NEW','CONTACTED','ENGAGED','QUALIFYING','QUALIFIED','BOOKING','BOOKED','NOT_INTERESTED','HANDED_OFF','OPTED_OUT')`
  ),
  index23("idx_setter_lead_person").on(table.personId),
  index23("idx_setter_lead_status").on(table.status),
  index23("idx_setter_lead_window").on(table.windowExpiresAt)
]);
var setterConversation = pgTable27("setter_conversation", {
  id: text27("id").primaryKey().$defaultFn(() => createId()),
  tenantId: text27("tenant_id").notNull().references(() => setterTenant.id, { onDelete: "cascade" }),
  personId: text27("person_id").notNull().references(() => setterPerson.id, { onDelete: "cascade" }),
  channel: text27("channel").notNull().default("whatsapp"),
  createdAt: timestamp27("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  // Una conversación por persona en Sprint 0 (memoria única cross-canal).
  uniqueIndex2("uq_setter_conversation_person").on(table.personId)
]);
var setterMessage = pgTable27("setter_message", {
  id: text27("id").primaryKey().$defaultFn(() => createId()),
  conversationId: text27("conversation_id").notNull().references(() => setterConversation.id, { onDelete: "cascade" }),
  role: text27("role").notNull(),
  content: text27("content").notNull(),
  // Idempotencia: id del mensaje en el canal (unique; admite múltiples NULL en PG).
  messageId: text27("message_id"),
  // Etiqueta de momento (apertura/calificación/objeción/booking…). Reusada por híbrido.
  beat: text27("beat"),
  createdAt: timestamp27("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  check19(
    "setter_message_role_check",
    sql21`${table.role} IN ('user','assistant','system','tool')`
  ),
  uniqueIndex2("uq_setter_message_message_id").on(table.messageId),
  index23("idx_setter_message_conversation").on(table.conversationId, table.createdAt)
]);
var setterAppointment = pgTable27("setter_appointment", {
  id: text27("id").primaryKey().$defaultFn(() => createId()),
  tenantId: text27("tenant_id").notNull().references(() => setterTenant.id, { onDelete: "cascade" }),
  leadId: text27("lead_id").notNull().references(() => setterLead.id, { onDelete: "cascade" }),
  startsAt: timestamp27("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp27("ends_at", { withTimezone: true }).notNull(),
  // Event id de Google Calendar (no guardamos URLs que expiran).
  calendarRef: text27("calendar_ref"),
  status: text27("status").notNull().default("confirmed"),
  createdAt: timestamp27("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  check19(
    "setter_appointment_status_check",
    sql21`${table.status} IN ('confirmed','cancelled','no_show','rescheduled')`
  ),
  uniqueIndex2("uq_setter_appointment_lead").on(table.leadId)
]);
var setterDraft = pgTable27("setter_draft", {
  id: text27("id").primaryKey().$defaultFn(() => createId()),
  tenantId: text27("tenant_id").notNull().references(() => setterTenant.id, { onDelete: "cascade" }),
  conversationId: text27("conversation_id").notNull().references(() => setterConversation.id, { onDelete: "cascade" }),
  leadId: text27("lead_id").notNull().references(() => setterLead.id, { onDelete: "cascade" }),
  // Texto propuesto por la IA (lo que se enviaría al aprobar).
  content: text27("content").notNull(),
  // Versión editada por el humano antes de enviar (si la hubo).
  editedContent: text27("edited_content"),
  beat: text27("beat"),
  // beatPolicy: text en Sprint 0; voice llega en Sprint 2.
  format: text27("format").notNull().default("text"),
  status: text27("status").notNull().default("pending"),
  // "Por qué dijo esto": tool calls + datos capturados (transparencia de la Bandeja).
  toolCalls: jsonb14("tool_calls").$type(),
  // Mensaje saliente generado al aprobar y enviar.
  sentMessageId: text27("sent_message_id").references(() => setterMessage.id, {
    onDelete: "set null"
  }),
  // Quién aprobó/editó (integra con los usuarios del CRM).
  approvedBy: text27("approved_by").references(() => hubUser.id, { onDelete: "set null" }),
  createdAt: timestamp27("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp27("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => /* @__PURE__ */ new Date())
}, (table) => [
  check19("setter_draft_format_check", sql21`${table.format} IN ('text','voice')`),
  check19(
    "setter_draft_status_check",
    sql21`${table.status} IN ('pending','approved','edited','rejected','sent')`
  ),
  index23("idx_setter_draft_status").on(table.status),
  index23("idx_setter_draft_conversation").on(table.conversationId),
  index23("idx_setter_draft_tenant").on(table.tenantId)
]);
var setterEvent = pgTable27("setter_event", {
  id: text27("id").primaryKey().$defaultFn(() => createId()),
  tenantId: text27("tenant_id").notNull().references(() => setterTenant.id, { onDelete: "cascade" }),
  level: text27("level").notNull().default("info"),
  // inbound | agent | draft | approval | sync | autopilot | optout | error
  type: text27("type").notNull(),
  message: text27("message").notNull(),
  leadId: text27("lead_id"),
  meta: jsonb14("meta").$type(),
  createdAt: timestamp27("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  check19("setter_event_level_check", sql21`${table.level} IN ('info','success','warn','error')`),
  index23("idx_setter_event_tenant_time").on(table.tenantId, table.createdAt)
]);

// src/db/schema/proposals.ts
import { pgTable as pgTable28, text as text28, jsonb as jsonb15, numeric as numeric6, char as char3, timestamp as timestamp28, index as index24, check as check20 } from "drizzle-orm/pg-core";
import { sql as sql22 } from "drizzle-orm";
var proposal = pgTable28(
  "proposal",
  {
    id: text28("id").primaryKey().$defaultFn(() => createId()),
    portalId: text28("portal_id").notNull().references(() => portal.id, { onDelete: "cascade" }),
    // Deal/contacto que origina la propuesta (set null si se archivan).
    dealId: text28("deal_id").references(() => deal.id, { onDelete: "set null" }),
    contactId: text28("contact_id").references(() => contact.id, { onDelete: "set null" }),
    // Submission del onboarding que alimentó la generación (trazabilidad).
    onboardingSubmissionId: text28("onboarding_submission_id").references(() => onboardingSubmission.id, {
      onDelete: "set null"
    }),
    // Credencial pública del link `/p/<token>`. Inadivinable.
    token: text28("token").notNull().$defaultFn(() => createId()),
    title: text28("title").notNull(),
    status: text28("status").notNull().default("draft"),
    content: jsonb15("content").$type().notNull(),
    // Provider de IA que la generó (gemini | claude | manual).
    model: text28("model"),
    // Total denormalizado para listados rápidos.
    amount: numeric6("amount", { precision: 12, scale: 2 }),
    currency: char3("currency", { length: 3 }).notNull().default("USD"),
    acceptedAt: timestamp28("accepted_at", { withTimezone: true }),
    sentAt: timestamp28("sent_at", { withTimezone: true }),
    viewedAt: timestamp28("viewed_at", { withTimezone: true }),
    // Primera vez que el cliente llegó al ÚLTIMO paso de la presentación.
    completedAt: timestamp28("completed_at", { withTimezone: true }),
    createdAt: timestamp28("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp28("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => /* @__PURE__ */ new Date())
  },
  (table) => [
    check20("proposal_status_check", sql22`${table.status} IN ('draft','accepted','sent','viewed')`),
    index24("idx_proposal_portal").on(table.portalId),
    index24("idx_proposal_token").on(table.token),
    index24("idx_proposal_deal").on(table.dealId)
  ]
);

// src/db/schema/project-updates.ts
import { pgTable as pgTable29, text as text29, boolean as boolean15, timestamp as timestamp29, index as index25 } from "drizzle-orm/pg-core";
var projectUpdate = pgTable29(
  "project_update",
  {
    id: text29("id").primaryKey().$defaultFn(() => createId()),
    portalId: text29("portal_id").notNull().references(() => portal.id, { onDelete: "cascade" }),
    dealId: text29("deal_id").notNull().references(() => deal.id, { onDelete: "cascade" }),
    stageId: text29("stage_id").references(() => pipelineStage.id, { onDelete: "set null" }),
    body: text29("body").notNull(),
    createdBy: text29("created_by").notNull().references(() => hubUser.id),
    archived: boolean15("archived").notNull().default(false),
    archivedAt: timestamp29("archived_at", { withTimezone: true }),
    createdAt: timestamp29("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    // Listado del cliente/admin: WHERE deal_id [AND archived=false] ORDER BY created_at DESC.
    index25("idx_project_update_deal").on(table.dealId, table.createdAt)
  ]
);

// src/db/index.ts
neonConfig.webSocketConstructor = ws;
function createDb() {
  if (env.DATABASE_URL.includes("neon.tech")) {
    const pool3 = new NeonPool({ connectionString: env.DATABASE_URL });
    const db3 = drizzleNeon(pool3, { schema: schema_exports, casing: "snake_case" });
    return { pool: pool3, db: db3 };
  }
  const pool2 = new PgPool({ connectionString: env.DATABASE_URL });
  const db2 = drizzleNodePostgres(pool2, { schema: schema_exports, casing: "snake_case" });
  return { pool: pool2, db: db2 };
}
var instance = createDb();
var pool = instance.pool;
var db = instance.db;

// src/lib/response.ts
function ok(data, meta) {
  return meta ? { data, meta } : { data };
}

// src/modules/health/health.router.ts
async function healthRoutes(app2) {
  app2.get(
    "/health",
    { schema: { tags: ["Salud"], summary: "Liveness", description: "Indica que la API est\xE1 en ejecuci\xF3n." } },
    async () => {
      return ok({ status: "ok", time: (/* @__PURE__ */ new Date()).toISOString() });
    }
  );
  app2.get(
    "/health/ready",
    {
      schema: {
        tags: ["Salud"],
        summary: "Readiness",
        description: "Verifica que la API pueda conectarse a la base de datos. Responde 503 si la DB no responde."
      }
    },
    async (_request, reply) => {
      try {
        await db.execute(sql23`select 1`);
        return ok({ status: "ready", db: "up" });
      } catch {
        return reply.status(503).send({
          error: { code: "NOT_READY", message: "La base de datos no responde" }
        });
      }
    }
  );
}

// src/middleware/clerk-auth.ts
import { verifyToken } from "@clerk/backend";
import { eq, and } from "drizzle-orm";
async function verifyClerkToken(token) {
  try {
    const claims = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });
    return claims.sub;
  } catch {
    throw Errors.unauthorized("Token de acceso inv\xE1lido o expirado");
  }
}
async function resolveHubUser(clerkUserId) {
  const [u] = await db.select({ sub: hubUser.id, portalId: hubUser.portalId, role: hubUser.role }).from(hubUser).where(and(eq(hubUser.clerkUserId, clerkUserId), eq(hubUser.isActive, true))).limit(1);
  if (!u) throw Errors.unauthorized("Usuario no autorizado");
  return { sub: u.sub, portalId: u.portalId, role: u.role };
}
async function resolveClientAccount(clerkUserId) {
  const [account] = await db.select({
    id: clientAccount.id,
    portalId: clientAccount.portalId,
    contactId: clientAccount.contactId
  }).from(clientAccount).where(
    and(
      eq(clientAccount.clerkUserId, clerkUserId),
      eq(clientAccount.isActive, true)
    )
  ).limit(1);
  if (!account) {
    console.warn(
      `[auth-client] Sesi\xF3n de Clerk v\xE1lida sin client_account vinculado (clerk_user_id=${clerkUserId}) \u2192 401`
    );
    throw Errors.unauthorized("Cliente no encontrado o inactivo.");
  }
  return {
    sub: account.id,
    portalId: account.portalId,
    contactId: account.contactId,
    type: "client_access"
  };
}

// src/middleware/authenticate.ts
async function authenticate(request, _reply) {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw Errors.unauthorized("Falta el token de acceso");
  }
  const token = header.slice("Bearer ".length);
  try {
    const clerkUserId = await verifyClerkToken(token);
    request.hubUser = await resolveHubUser(clerkUserId);
  } catch {
    throw Errors.unauthorized("Token de acceso inv\xE1lido o expirado");
  }
}

// src/modules/auth/auth.service.ts
import { eq as eq2 } from "drizzle-orm";
function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    portalId: u.portalId
  };
}
async function getCurrentUser(id) {
  const [user] = await db.select().from(hubUser).where(eq2(hubUser.id, id)).limit(1);
  if (!user) throw Errors.notFound("Usuario no encontrado");
  return publicUser(user);
}

// src/modules/auth/auth.router.ts
async function authRoutes(app2) {
  const r = app2.withTypeProvider();
  r.get(
    "/me",
    {
      schema: {
        tags: ["Autenticaci\xF3n"],
        summary: "Usuario autenticado actual",
        description: "Devuelve los datos del hub_user resuelto desde la sesi\xF3n de Clerk.",
        security: [{ bearerAuth: [] }]
      },
      preHandler: [authenticate]
    },
    async (request) => {
      const user = await getCurrentUser(request.hubUser.sub);
      return ok(user);
    }
  );
}

// src/middleware/authorize.ts
function authorize(...roles) {
  return async function authorizeHook(request, _reply) {
    const user = request.hubUser;
    if (!user) throw Errors.unauthorized();
    if (roles.length > 0 && !roles.includes(user.role)) {
      throw Errors.forbidden("Tu rol no permite esta acci\xF3n");
    }
  };
}

// src/lib/crm-schemas.ts
import { z as z2 } from "zod";
var ListQuerySchema = z2.object({
  limit: z2.coerce.number().int().min(1).max(100).default(20),
  cursor: z2.string().optional()
});
var IdParamSchema = z2.object({
  id: z2.string().min(1)
});

// src/lib/filter.ts
import {
  and as and2,
  or,
  eq as eq3,
  ne,
  ilike,
  gt,
  gte,
  lt,
  lte,
  inArray,
  isNull,
  isNotNull
} from "drizzle-orm";
import { z as z3 } from "zod";
var ConditionSchema = z3.object({
  field: z3.string().min(1),
  operator: z3.enum(["eq", "neq", "contains", "gt", "gte", "lt", "lte", "in", "is_null", "is_not_null"]),
  value: z3.union([z3.string(), z3.number(), z3.boolean(), z3.array(z3.union([z3.string(), z3.number()])), z3.null()]).optional()
});
var FilterNodeSchema = z3.lazy(
  () => z3.union([
    z3.object({ and: z3.array(FilterNodeSchema) }),
    z3.object({ or: z3.array(FilterNodeSchema) }),
    ConditionSchema
  ])
);
var SearchBodySchema = z3.object({
  filter: FilterNodeSchema.optional(),
  limit: z3.number().int().min(1).max(100).default(50),
  cursor: z3.string().optional()
});
var OPERATORS_BY_KIND = {
  text: /* @__PURE__ */ new Set(["eq", "neq", "contains", "is_null", "is_not_null"]),
  number: /* @__PURE__ */ new Set(["eq", "neq", "gt", "gte", "lt", "lte", "is_null", "is_not_null"]),
  date: /* @__PURE__ */ new Set(["eq", "neq", "gt", "gte", "lt", "lte", "is_null", "is_not_null"]),
  enum: /* @__PURE__ */ new Set(["eq", "neq", "in", "is_null", "is_not_null"])
};
function coerce(kind, value) {
  if (value === null || value === void 0) return value;
  if (kind === "number") {
    const n = Number(value);
    if (Number.isNaN(n)) throw Errors.badRequest("Valor num\xE9rico inv\xE1lido");
    return n;
  }
  if (kind === "date") {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw Errors.badRequest("Fecha inv\xE1lida");
    return value;
  }
  return value;
}
function compileCondition(c, fields) {
  const def = fields[c.field];
  if (!def) throw Errors.badRequest(`Campo no permitido: ${c.field}`);
  if (!OPERATORS_BY_KIND[def.kind].has(c.operator)) {
    throw Errors.badRequest(`Operador "${c.operator}" no v\xE1lido para "${c.field}"`);
  }
  const col = def.column;
  const v = coerce(def.kind, c.value);
  switch (c.operator) {
    case "is_null":
      return isNull(col);
    case "is_not_null":
      return isNotNull(col);
    case "contains":
      return ilike(col, `%${String(c.value ?? "")}%`);
    case "in":
      if (!Array.isArray(c.value)) throw Errors.badRequest('El operador "in" requiere un array');
      return inArray(col, c.value.map((x) => coerce(def.kind, x)));
    case "eq":
      return eq3(col, v);
    case "neq":
      return ne(col, v);
    case "gt":
      return gt(col, v);
    case "gte":
      return gte(col, v);
    case "lt":
      return lt(col, v);
    case "lte":
      return lte(col, v);
    default:
      throw Errors.badRequest("Operador desconocido");
  }
}
function buildFilter(node, fields) {
  if ("and" in node) {
    const parts = node.and.map((n) => buildFilter(n, fields)).filter((x) => Boolean(x));
    return parts.length > 0 ? and2(...parts) : void 0;
  }
  if ("or" in node) {
    const parts = node.or.map((n) => buildFilter(n, fields)).filter((x) => Boolean(x));
    return parts.length > 0 ? or(...parts) : void 0;
  }
  return compileCondition(node, fields);
}

// src/modules/contacts/contacts.schema.ts
import { z as z4 } from "zod";
var CreateContactSchema = z4.object({
  firstName: z4.string().min(1).optional(),
  lastName: z4.string().min(1).optional(),
  email: z4.string().email().optional(),
  phone: z4.string().optional(),
  jobTitle: z4.string().optional(),
  companyId: z4.string().min(1).optional(),
  ownerId: z4.string().min(1).optional(),
  lifecycleStage: z4.enum(["lead", "mql", "sql", "opportunity", "customer", "other"]).optional(),
  custom: z4.record(z4.string(), z4.unknown()).optional()
});
var UpdateContactSchema = CreateContactSchema.partial();

// src/modules/contacts/contacts.service.ts
import { and as and4, desc as desc2, eq as eq5, inArray as inArray2 } from "drizzle-orm";

// src/lib/audit.ts
function toStringValue(v) {
  if (v === null || v === void 0) return null;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
async function recordFieldChanges(input) {
  const rows = [];
  for (const key of Object.keys(input.after)) {
    if (input.after[key] === void 0) continue;
    const oldVal = toStringValue(input.before[key]);
    const newVal = toStringValue(input.after[key]);
    if (oldVal !== newVal) {
      rows.push({
        portalId: input.portalId,
        entityType: input.entityType,
        entityId: input.entityId,
        fieldName: key,
        oldValue: oldVal,
        newValue: newVal,
        sourceType: input.sourceType ?? "API",
        changedBy: input.changedBy
      });
    }
  }
  if (rows.length > 0) {
    await input.tx.insert(recordHistory).values(rows);
  }
}
async function writeAudit(input) {
  await input.tx.insert(auditLog).values({
    portalId: input.portalId,
    userId: input.userId ?? null,
    clientId: input.clientId ?? null,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    payload: input.payload ?? null
  });
}

// src/lib/pagination.ts
import { and as and3, eq as eq4, lt as lt2, or as or2 } from "drizzle-orm";
function encodeCursor(row) {
  const iso = row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt;
  return Buffer.from(`${iso}|${row.id}`).toString("base64url");
}
function decodeCursor(cursor) {
  if (!cursor) return void 0;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = raw.lastIndexOf("|");
    if (sep === -1) return void 0;
    const isoStr = raw.slice(0, sep);
    const id = raw.slice(sep + 1);
    const createdAt = new Date(isoStr);
    if (!id || isNaN(createdAt.getTime())) return void 0;
    return { createdAt, id };
  } catch {
    return void 0;
  }
}
function cursorWhere(createdAtCol, idCol, cursor) {
  return or2(
    lt2(createdAtCol, cursor.createdAt),
    and3(eq4(createdAtCol, cursor.createdAt), lt2(idCol, cursor.id))
  );
}
function paginateRows(rows, limit) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return { items, nextCursor: hasMore && last ? encodeCursor(last) : null };
}

// src/modules/contacts/contacts.service.ts
var ENTITY = "contact";
var CONTACT_FIELDS = {
  firstName: { column: contact.firstName, kind: "text" },
  lastName: { column: contact.lastName, kind: "text" },
  email: { column: contact.email, kind: "text" },
  phone: { column: contact.phone, kind: "text" },
  jobTitle: { column: contact.jobTitle, kind: "text" },
  lifecycleStage: { column: contact.lifecycleStage, kind: "enum" },
  companyId: { column: contact.companyId, kind: "text" },
  ownerId: { column: contact.ownerId, kind: "text" },
  createdAt: { column: contact.createdAt, kind: "date" }
};
async function searchContacts(portalId, body) {
  const cond = body.filter ? buildFilter(body.filter, CONTACT_FIELDS) : void 0;
  const cursor = decodeCursor(body.cursor);
  const rows = await db.select().from(contact).where(
    and4(
      eq5(contact.portalId, portalId),
      eq5(contact.archived, false),
      cond,
      cursor ? cursorWhere(contact.createdAt, contact.id, cursor) : void 0
    )
  ).orderBy(desc2(contact.createdAt), desc2(contact.id)).limit(body.limit + 1);
  return paginateRows(rows, body.limit);
}
async function listContacts(portalId, query) {
  const cursor = decodeCursor(query.cursor);
  const rows = await db.select().from(contact).where(
    and4(
      eq5(contact.portalId, portalId),
      eq5(contact.archived, false),
      cursor ? cursorWhere(contact.createdAt, contact.id, cursor) : void 0
    )
  ).orderBy(desc2(contact.createdAt), desc2(contact.id)).limit(query.limit + 1);
  return paginateRows(rows, query.limit);
}
async function getContact(portalId, id) {
  const [row] = await db.select().from(contact).where(and4(eq5(contact.portalId, portalId), eq5(contact.id, id), eq5(contact.archived, false))).limit(1);
  if (!row) throw Errors.notFound("Contacto no encontrado");
  return row;
}
async function createContact(portalId, userId, input) {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(contact).values({ ...input, portalId }).returning();
    if (!row) throw Errors.internal("No se pudo crear el contacto");
    await writeAudit({ tx, portalId, userId, entityType: ENTITY, entityId: row.id, action: "CREATE", payload: input });
    return row;
  });
}
async function updateContact(portalId, userId, id, input) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(contact).where(and4(eq5(contact.portalId, portalId), eq5(contact.id, id), eq5(contact.archived, false))).limit(1);
    if (!existing) throw Errors.notFound("Contacto no encontrado");
    const [updated] = await tx.update(contact).set({ ...input, updatedAt: /* @__PURE__ */ new Date() }).where(eq5(contact.id, id)).returning();
    if (!updated) throw Errors.internal("No se pudo actualizar el contacto");
    await recordFieldChanges({ tx, portalId, entityType: ENTITY, entityId: id, before: existing, after: input, changedBy: userId });
    await writeAudit({ tx, portalId, userId, entityType: ENTITY, entityId: id, action: "UPDATE", payload: input });
    return updated;
  });
}
async function archiveContact(portalId, userId, id) {
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(contact).where(and4(eq5(contact.portalId, portalId), eq5(contact.id, id), eq5(contact.archived, false))).limit(1);
    if (!existing) throw Errors.notFound("Contacto no encontrado");
    await tx.update(contact).set({ archived: true, archivedAt: /* @__PURE__ */ new Date() }).where(eq5(contact.id, id));
    await writeAudit({ tx, portalId, userId, entityType: ENTITY, entityId: id, action: "DELETE" });
  });
}
async function listContactsByLifecycle(portalId, stages, query) {
  const cursor = decodeCursor(query.cursor);
  const rows = await db.select().from(contact).where(
    and4(
      eq5(contact.portalId, portalId),
      eq5(contact.archived, false),
      inArray2(contact.lifecycleStage, stages),
      cursor ? cursorWhere(contact.createdAt, contact.id, cursor) : void 0
    )
  ).orderBy(desc2(contact.createdAt), desc2(contact.id)).limit(query.limit + 1);
  return paginateRows(rows, query.limit);
}
async function getContactDetail(portalId, id) {
  const contactRow = await getContact(portalId, id);
  const primaryDeals = await db.select().from(deal).where(and4(eq5(deal.portalId, portalId), eq5(deal.primaryContactId, id), eq5(deal.archived, false)));
  const links = await db.select({ dealId: dealContact.dealId }).from(dealContact).where(eq5(dealContact.contactId, id));
  let linkedDeals = [];
  if (links.length > 0) {
    linkedDeals = await db.select().from(deal).where(
      and4(
        eq5(deal.portalId, portalId),
        eq5(deal.archived, false),
        inArray2(
          deal.id,
          links.map((l) => l.dealId)
        )
      )
    );
  }
  const dealsById = /* @__PURE__ */ new Map();
  for (const d of [...primaryDeals, ...linkedDeals]) dealsById.set(d.id, d);
  const history = await db.select().from(recordHistory).where(and4(eq5(recordHistory.entityType, ENTITY), eq5(recordHistory.entityId, id))).orderBy(desc2(recordHistory.changedAt)).limit(50);
  const notes = await db.select().from(note).where(and4(eq5(note.portalId, portalId), eq5(note.contactId, id))).orderBy(desc2(note.createdAt)).limit(50);
  const tasks = await db.select().from(task).where(and4(eq5(task.portalId, portalId), eq5(task.contactId, id))).orderBy(desc2(task.createdAt)).limit(50);
  return { contact: contactRow, deals: [...dealsById.values()], history, notes, tasks };
}

// src/lib/http.ts
var ADMIN_SECURITY = [{ bearerAuth: [] }];
var CLIENT_SECURITY = [{ bearerAuth: [] }];

// src/modules/contacts/contacts.router.ts
var TAG = "Contactos";
var security = ADMIN_SECURITY;
async function contactsRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/",
    { schema: { tags: [TAG], summary: "Listar contactos", description: "Listado paginado por cursor (no archivados).", security, querystring: ListQuerySchema } },
    async (request) => {
      const { items, nextCursor } = await listContacts(request.hubUser.portalId, request.query);
      return ok(items, { nextCursor });
    }
  );
  r.get(
    "/:id",
    { schema: { tags: [TAG], summary: "Obtener contacto", description: "Devuelve un contacto por id.", security, params: IdParamSchema } },
    async (request) => {
      return ok(await getContact(request.hubUser.portalId, request.params.id));
    }
  );
  r.get(
    "/:id/detail",
    {
      schema: {
        tags: [TAG],
        summary: "Detalle completo del contacto",
        description: "Contacto + deals + notas + tareas + historial. Alimenta el User Detail.",
        security,
        params: IdParamSchema
      }
    },
    async (request) => ok(await getContactDetail(request.hubUser.portalId, request.params.id))
  );
  r.post(
    "/search",
    {
      schema: {
        tags: [TAG],
        summary: "B\xFAsqueda avanzada de contactos",
        description: "Filtra contactos con un filterBranch: \xE1rbol and/or de condiciones {field, operator, value} sobre campos permitidos (firstName, lastName, email, phone, jobTitle, lifecycleStage, companyId, ownerId, createdAt).",
        security,
        body: SearchBodySchema
      }
    },
    async (request) => {
      const { items, nextCursor } = await searchContacts(request.hubUser.portalId, request.body);
      return ok(items, { nextCursor });
    }
  );
  r.post(
    "/",
    { schema: { tags: [TAG], summary: "Crear contacto", description: "Crea un contacto. Requiere rol owner o member.", security, body: CreateContactSchema }, preHandler: [authorize("owner", "member", "collaborator")] },
    async (request, reply) => {
      const created = await createContact(request.hubUser.portalId, request.hubUser.sub, request.body);
      return reply.status(201).send(ok(created));
    }
  );
  r.patch(
    "/:id",
    { schema: { tags: [TAG], summary: "Actualizar contacto", description: "Actualiza campos del contacto y registra los cambios en record_history. Requiere owner o member.", security, params: IdParamSchema, body: UpdateContactSchema }, preHandler: [authorize("owner", "member", "collaborator")] },
    async (request) => {
      return ok(await updateContact(request.hubUser.portalId, request.hubUser.sub, request.params.id, request.body));
    }
  );
  r.delete(
    "/:id",
    { schema: { tags: [TAG], summary: "Archivar contacto", description: "Soft delete (archived = true). Requiere rol owner.", security, params: IdParamSchema }, preHandler: [authorize("owner")] },
    async (request) => {
      await archiveContact(request.hubUser.portalId, request.hubUser.sub, request.params.id);
      return ok({ success: true });
    }
  );
}

// src/modules/companies/companies.schema.ts
import { z as z5 } from "zod";
var CreateCompanySchema = z5.object({
  name: z5.string().min(1),
  domain: z5.string().optional(),
  industry: z5.string().optional(),
  phone: z5.string().optional(),
  website: z5.string().url().optional(),
  ownerId: z5.string().min(1).optional(),
  custom: z5.record(z5.string(), z5.unknown()).optional()
});
var UpdateCompanySchema = CreateCompanySchema.partial();

// src/modules/companies/companies.service.ts
import { and as and5, desc as desc3, eq as eq6 } from "drizzle-orm";
var ENTITY2 = "company";
async function listCompanies(portalId, query) {
  const cursor = decodeCursor(query.cursor);
  const rows = await db.select().from(company).where(
    and5(
      eq6(company.portalId, portalId),
      eq6(company.archived, false),
      cursor ? cursorWhere(company.createdAt, company.id, cursor) : void 0
    )
  ).orderBy(desc3(company.createdAt), desc3(company.id)).limit(query.limit + 1);
  return paginateRows(rows, query.limit);
}
async function getCompany(portalId, id) {
  const [row] = await db.select().from(company).where(and5(eq6(company.portalId, portalId), eq6(company.id, id), eq6(company.archived, false))).limit(1);
  if (!row) throw Errors.notFound("Empresa no encontrada");
  return row;
}
async function createCompany(portalId, userId, input) {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(company).values({ ...input, portalId }).returning();
    if (!row) throw Errors.internal("No se pudo crear la empresa");
    await writeAudit({ tx, portalId, userId, entityType: ENTITY2, entityId: row.id, action: "CREATE", payload: input });
    return row;
  });
}
async function updateCompany(portalId, userId, id, input) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(company).where(and5(eq6(company.portalId, portalId), eq6(company.id, id), eq6(company.archived, false))).limit(1);
    if (!existing) throw Errors.notFound("Empresa no encontrada");
    const [updated] = await tx.update(company).set({ ...input, updatedAt: /* @__PURE__ */ new Date() }).where(eq6(company.id, id)).returning();
    if (!updated) throw Errors.internal("No se pudo actualizar la empresa");
    await recordFieldChanges({ tx, portalId, entityType: ENTITY2, entityId: id, before: existing, after: input, changedBy: userId });
    await writeAudit({ tx, portalId, userId, entityType: ENTITY2, entityId: id, action: "UPDATE", payload: input });
    return updated;
  });
}
async function archiveCompany(portalId, userId, id) {
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(company).where(and5(eq6(company.portalId, portalId), eq6(company.id, id), eq6(company.archived, false))).limit(1);
    if (!existing) throw Errors.notFound("Empresa no encontrada");
    await tx.update(company).set({ archived: true, archivedAt: /* @__PURE__ */ new Date() }).where(eq6(company.id, id));
    await writeAudit({ tx, portalId, userId, entityType: ENTITY2, entityId: id, action: "DELETE" });
  });
}
async function getCompanyDetail(portalId, id) {
  const companyRow = await getCompany(portalId, id);
  const [contacts, deals, notes, tasks, history] = await Promise.all([
    db.select().from(contact).where(and5(eq6(contact.portalId, portalId), eq6(contact.companyId, id), eq6(contact.archived, false))).orderBy(desc3(contact.createdAt)),
    db.select().from(deal).where(and5(eq6(deal.portalId, portalId), eq6(deal.companyId, id), eq6(deal.archived, false))).orderBy(desc3(deal.createdAt)),
    db.select().from(note).where(and5(eq6(note.portalId, portalId), eq6(note.companyId, id))).orderBy(desc3(note.createdAt)).limit(50),
    db.select().from(task).where(and5(eq6(task.portalId, portalId), eq6(task.companyId, id))).orderBy(desc3(task.createdAt)),
    db.select().from(recordHistory).where(and5(eq6(recordHistory.entityType, ENTITY2), eq6(recordHistory.entityId, id))).orderBy(desc3(recordHistory.changedAt)).limit(50)
  ]);
  return { company: companyRow, contacts, deals, notes, tasks, history };
}

// src/modules/companies/companies.router.ts
var TAG2 = "Empresas";
var security2 = ADMIN_SECURITY;
async function companiesRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/",
    { schema: { tags: [TAG2], summary: "Listar empresas", description: "Listado paginado por cursor (no archivadas).", security: security2, querystring: ListQuerySchema } },
    async (request) => {
      const { items, nextCursor } = await listCompanies(request.hubUser.portalId, request.query);
      return ok(items, { nextCursor });
    }
  );
  r.get(
    "/:id",
    { schema: { tags: [TAG2], summary: "Obtener empresa", description: "Devuelve una empresa por id.", security: security2, params: IdParamSchema } },
    async (request) => {
      return ok(await getCompany(request.hubUser.portalId, request.params.id));
    }
  );
  r.get(
    "/:id/detail",
    {
      schema: {
        tags: [TAG2],
        summary: "Detalle completo de la empresa",
        description: "Empresa + contactos + deals + notas + tareas + historial. Alimenta el Company Detail.",
        security: security2,
        params: IdParamSchema
      }
    },
    async (request) => ok(await getCompanyDetail(request.hubUser.portalId, request.params.id))
  );
  r.post(
    "/",
    { schema: { tags: [TAG2], summary: "Crear empresa", description: "Crea una empresa. Requiere rol owner o member.", security: security2, body: CreateCompanySchema }, preHandler: [authorize("owner", "member", "collaborator")] },
    async (request, reply) => {
      const created = await createCompany(request.hubUser.portalId, request.hubUser.sub, request.body);
      return reply.status(201).send(ok(created));
    }
  );
  r.patch(
    "/:id",
    { schema: { tags: [TAG2], summary: "Actualizar empresa", description: "Actualiza campos y registra cambios en record_history. Requiere owner o member.", security: security2, params: IdParamSchema, body: UpdateCompanySchema }, preHandler: [authorize("owner", "member", "collaborator")] },
    async (request) => {
      return ok(await updateCompany(request.hubUser.portalId, request.hubUser.sub, request.params.id, request.body));
    }
  );
  r.delete(
    "/:id",
    { schema: { tags: [TAG2], summary: "Archivar empresa", description: "Soft delete (archived = true). Requiere rol owner.", security: security2, params: IdParamSchema }, preHandler: [authorize("owner")] },
    async (request) => {
      await archiveCompany(request.hubUser.portalId, request.hubUser.sub, request.params.id);
      return ok({ success: true });
    }
  );
}

// src/modules/deals/deals.schema.ts
import { z as z6 } from "zod";
var CreateDealSchema = z6.object({
  name: z6.string().min(1),
  amount: z6.number().nonnegative().optional(),
  currency: z6.string().length(3).optional(),
  closeDate: z6.string().date().optional(),
  // YYYY-MM-DD
  pipelineId: z6.string().min(1),
  stageId: z6.string().min(1),
  primaryContactId: z6.string().min(1).optional(),
  companyId: z6.string().min(1).optional(),
  ownerId: z6.string().min(1).optional(),
  custom: z6.record(z6.string(), z6.unknown()).optional()
});
var UpdateDealSchema = z6.object({
  name: z6.string().min(1),
  amount: z6.number().nonnegative(),
  currency: z6.string().length(3),
  closeDate: z6.string().date(),
  primaryContactId: z6.string().min(1),
  companyId: z6.string().min(1),
  ownerId: z6.string().min(1),
  custom: z6.record(z6.string(), z6.unknown())
}).partial();
var ChangeStageSchema = z6.object({
  stageId: z6.string().min(1)
});
var AddDealContactSchema = z6.object({
  contactId: z6.string().min(1),
  role: z6.string().optional()
});
var DealContactParamSchema = z6.object({
  id: z6.string().min(1),
  contactId: z6.string().min(1)
});

// src/modules/deals/project-updates.schema.ts
import { z as z7 } from "zod";
var CreateProjectUpdateSchema = z7.object({
  body: z7.string().min(1).max(2e3),
  stageId: z7.string().min(1).optional()
});
var ProjectUpdateIdParamSchema = z7.object({
  id: z7.string().min(1)
});

// src/modules/deals/deals.service.ts
import { and as and9, desc as desc5, eq as eq10, inArray as inArray3 } from "drizzle-orm";

// src/modules/deals/stage.service.ts
import { randomUUID } from "crypto";
import { and as and8, eq as eq9 } from "drizzle-orm";

// src/modules/notifications/notifications.service.ts
import { and as and6, count, desc as desc4, eq as eq7, isNull as isNull2 } from "drizzle-orm";

// src/lib/notification-bus.ts
import { EventEmitter } from "events";
var NotificationBus = class extends EventEmitter {
};
var notificationBus = new NotificationBus();
notificationBus.setMaxListeners(0);
function emitNotification(event) {
  notificationBus.emit("notification", event);
}

// src/modules/notifications/notifications.service.ts
async function createNotification(input) {
  const [row] = await db.insert(notification).values({
    portalId: input.portalId,
    userId: input.userId ?? null,
    clientId: input.clientId ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    actionUrl: input.actionUrl ?? null
  }).returning();
  if (!row) return;
  emitNotification({
    portalId: row.portalId,
    userId: row.userId,
    type: row.type,
    title: row.title,
    entityType: row.entityType,
    entityId: row.entityId,
    createdAt: (row.createdAt instanceof Date ? row.createdAt : /* @__PURE__ */ new Date()).toISOString()
  });
}
async function listNotifications(portalId, userId) {
  return db.select().from(notification).where(and6(eq7(notification.portalId, portalId), eq7(notification.userId, userId))).orderBy(desc4(notification.createdAt)).limit(50);
}
async function unreadCount(portalId, userId) {
  const [row] = await db.select({ n: count() }).from(notification).where(and6(eq7(notification.portalId, portalId), eq7(notification.userId, userId), isNull2(notification.readAt)));
  return row?.n ?? 0;
}
async function markRead(portalId, userId, id) {
  const res = await db.update(notification).set({ readAt: /* @__PURE__ */ new Date() }).where(and6(eq7(notification.portalId, portalId), eq7(notification.userId, userId), eq7(notification.id, id))).returning({ id: notification.id });
  if (res.length === 0) throw Errors.notFound("Notificaci\xF3n no encontrada");
}
async function markAllRead(portalId, userId) {
  await db.update(notification).set({ readAt: /* @__PURE__ */ new Date() }).where(and6(eq7(notification.portalId, portalId), eq7(notification.userId, userId), isNull2(notification.readAt)));
}
async function actorName(portalId, userId) {
  const [u] = await db.select({ firstName: hubUser.firstName, lastName: hubUser.lastName, email: hubUser.email }).from(hubUser).where(and6(eq7(hubUser.id, userId), eq7(hubUser.portalId, portalId))).limit(1);
  if (!u) return "Alguien";
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email || "Alguien";
}
async function notifyAdmins(portalId, payload, opts) {
  const admins = await db.select({ id: hubUser.id }).from(hubUser).where(and6(eq7(hubUser.portalId, portalId), eq7(hubUser.isActive, true)));
  for (const a of admins) {
    if (opts?.exceptUserId && a.id === opts.exceptUserId) continue;
    await createNotification({ portalId, userId: a.id, ...payload });
  }
}

// src/lib/clerk-provisioning.ts
import { createClerkClient } from "@clerk/backend";
var _client = null;
function clerk() {
  if (!_client) _client = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
  return _client;
}
async function ensureClerkUserType(args) {
  if (!env.CLERK_SECRET_KEY) return null;
  const { email, firstName, lastName, userType } = args;
  try {
    const c = clerk();
    const list = await c.users.getUserList({ emailAddress: [email], limit: 1 });
    const found = list.data?.[0];
    if (found) {
      await c.users.updateUserMetadata(found.id, { publicMetadata: { userType } });
      return found.id;
    }
    const created = await c.users.createUser({
      emailAddress: [email],
      firstName: firstName ?? void 0,
      lastName: lastName ?? void 0,
      publicMetadata: { userType },
      skipPasswordRequirement: true
    });
    return created.id;
  } catch (err) {
    console.error(
      `[clerk-provisioning] No se pudo provisionar el usuario de Clerk (${email}, ${userType}):`,
      err?.message ?? err
    );
    return null;
  }
}

// src/modules/onboarding/assignees.ts
import { and as and7, eq as eq8 } from "drizzle-orm";
var PRODUCTION_PIPELINE_LABEL = "Producci\xF3n";
var PRODUCTION_DIAGNOSTICO_STAGE_LABEL = "Diagn\xF3stico";
async function resolveProductionAssignee(dbOrTx, portalId, stageLabel) {
  const email = stageLabel === PRODUCTION_DIAGNOSTICO_STAGE_LABEL ? env.PRODUCTION_ASSIGNEE_DIAGNOSTICO_EMAIL : env.PRODUCTION_ASSIGNEE_DEFAULT_EMAIL;
  const [u] = await dbOrTx.select({ id: hubUser.id }).from(hubUser).where(and7(eq8(hubUser.portalId, portalId), eq8(hubUser.email, email), eq8(hubUser.isActive, true))).limit(1);
  return u?.id ?? null;
}

// src/modules/deals/stage.service.ts
var ENTITY3 = "deal";
async function assertStageInPipeline(tx, pipelineId, stageId) {
  const [stage] = await tx.select().from(pipelineStage).where(eq9(pipelineStage.id, stageId)).limit(1);
  if (!stage) throw Errors.badRequest("Stage inexistente");
  if (stage.pipelineId !== pipelineId) throw Errors.badRequest("El stage no pertenece al pipeline indicado");
  return stage;
}
async function activateClientPortal(tx, portalId, dealId) {
  const [d] = await tx.select().from(deal).where(eq9(deal.id, dealId)).limit(1);
  if (!d?.primaryContactId) return;
  const [c] = await tx.select().from(contact).where(eq9(contact.id, d.primaryContactId)).limit(1);
  if (!c?.email) return;
  let [account] = await tx.select().from(clientAccount).where(and8(eq9(clientAccount.portalId, portalId), eq9(clientAccount.email, c.email))).limit(1);
  if (!account) {
    ;
    [account] = await tx.insert(clientAccount).values({ portalId, contactId: c.id, email: c.email, inviteToken: randomUUID(), inviteSentAt: /* @__PURE__ */ new Date() }).returning();
  }
  await tx.insert(clientDealAccess).values({ clientId: account.id, dealId }).onConflictDoNothing();
  if (c.lifecycleStage !== "customer") {
    await tx.update(contact).set({ lifecycleStage: "customer", updatedAt: /* @__PURE__ */ new Date() }).where(eq9(contact.id, c.id));
  }
  if (account && !account.clerkUserId) {
    const clerkUserId = await ensureClerkUserType({
      email: c.email,
      firstName: c.firstName,
      lastName: c.lastName,
      userType: "client"
    });
    if (clerkUserId) {
      await tx.update(clientAccount).set({ clerkUserId }).where(eq9(clientAccount.id, account.id));
    }
  }
}
async function reassignProductionOwner(tx, portalId, stageLabel, currentOwnerId) {
  const newOwnerId = await resolveProductionAssignee(tx, portalId, stageLabel);
  if (!newOwnerId || newOwnerId === currentOwnerId) return null;
  return newOwnerId;
}
async function changeStage(portalId, userId, dealId, newStageId) {
  const result = await db.transaction(async (tx) => {
    const [row] = await tx.select({ deal, pipelineLabel: pipeline.label }).from(deal).innerJoin(pipeline, eq9(pipeline.id, deal.pipelineId)).where(and8(eq9(deal.portalId, portalId), eq9(deal.id, dealId), eq9(deal.archived, false))).limit(1);
    if (!row) throw Errors.notFound("Deal no encontrado");
    const { deal: d, pipelineLabel } = row;
    const stage = await assertStageInPipeline(tx, d.pipelineId, newStageId);
    if (d.stageId === newStageId) {
      return { deal: d, notify: null };
    }
    const [updated] = await tx.update(deal).set({ stageId: newStageId, updatedAt: /* @__PURE__ */ new Date() }).where(eq9(deal.id, dealId)).returning();
    if (!updated) throw Errors.internal("No se pudo cambiar la etapa");
    await recordFieldChanges({
      tx,
      portalId,
      entityType: ENTITY3,
      entityId: dealId,
      before: { stageId: d.stageId },
      after: { stageId: newStageId },
      changedBy: userId
    });
    await writeAudit({
      tx,
      portalId,
      userId,
      entityType: ENTITY3,
      entityId: dealId,
      action: "STAGE_CHANGE",
      payload: { from: d.stageId, to: newStageId }
    });
    let finalDeal = updated;
    if (pipelineLabel === PRODUCTION_PIPELINE_LABEL) {
      const newOwnerId = await reassignProductionOwner(tx, portalId, stage.label, updated.ownerId);
      if (newOwnerId) {
        const [reassigned] = await tx.update(deal).set({ ownerId: newOwnerId, updatedAt: /* @__PURE__ */ new Date() }).where(eq9(deal.id, dealId)).returning();
        if (reassigned) {
          finalDeal = reassigned;
          await recordFieldChanges({
            tx,
            portalId,
            entityType: ENTITY3,
            entityId: dealId,
            before: { ownerId: updated.ownerId },
            after: { ownerId: newOwnerId },
            changedBy: userId
          });
        }
      }
    }
    if (stage.isWon) await activateClientPortal(tx, portalId, dealId);
    return { deal: finalDeal, notify: { ownerId: finalDeal.ownerId, dealName: d.name, stageLabel: stage.label } };
  });
  if (result.notify) {
    await createNotification({
      portalId,
      userId: result.notify.ownerId ?? userId,
      entityType: ENTITY3,
      entityId: dealId,
      type: "deal_stage_changed",
      title: `El deal "${result.notify.dealName}" pas\xF3 a la etapa "${result.notify.stageLabel}"`
    });
  }
  return result.deal;
}
async function moveDealToProduction(tx, portalId, dealId, actor) {
  const [pl] = await tx.select().from(pipeline).where(and8(eq9(pipeline.portalId, portalId), eq9(pipeline.label, PRODUCTION_PIPELINE_LABEL))).limit(1);
  if (!pl) throw Errors.internal('Pipeline "Producci\xF3n" no seedeado en este portal');
  const [stage] = await tx.select().from(pipelineStage).where(and8(eq9(pipelineStage.pipelineId, pl.id), eq9(pipelineStage.label, PRODUCTION_DIAGNOSTICO_STAGE_LABEL))).limit(1);
  if (!stage) throw Errors.internal('Stage "Diagn\xF3stico" no seedeado en el pipeline Producci\xF3n');
  const [d] = await tx.select().from(deal).where(and8(eq9(deal.portalId, portalId), eq9(deal.id, dealId), eq9(deal.archived, false))).limit(1);
  if (!d) throw Errors.notFound("Deal no encontrado");
  const resolvedOwnerId = await reassignProductionOwner(tx, portalId, stage.label, d.ownerId);
  const finalOwnerId = resolvedOwnerId ?? d.ownerId;
  const [updated] = await tx.update(deal).set({
    pipelineId: pl.id,
    stageId: stage.id,
    ...resolvedOwnerId ? { ownerId: resolvedOwnerId } : {},
    updatedAt: /* @__PURE__ */ new Date()
  }).where(eq9(deal.id, dealId)).returning();
  if (!updated) throw Errors.internal("No se pudo mover el deal a Producci\xF3n");
  await recordFieldChanges({
    tx,
    portalId,
    entityType: ENTITY3,
    entityId: dealId,
    before: { pipelineId: d.pipelineId, stageId: d.stageId, ownerId: d.ownerId },
    after: { pipelineId: pl.id, stageId: stage.id, ownerId: finalOwnerId },
    changedBy: actor.userId ?? null
  });
  await writeAudit({
    tx,
    portalId,
    userId: actor.userId ?? null,
    clientId: actor.clientId ?? null,
    entityType: ENTITY3,
    entityId: dealId,
    action: "STAGE_CHANGE",
    payload: { from: d.stageId, to: stage.id, pipelineFrom: d.pipelineId, pipelineTo: pl.id }
  });
  await writeAudit({
    tx,
    portalId,
    userId: actor.userId ?? null,
    clientId: actor.clientId ?? null,
    entityType: ENTITY3,
    entityId: dealId,
    action: "ONBOARDING_COMPLETED",
    payload: { dealId }
  });
  return { ownerId: finalOwnerId, dealName: d.name, stageLabel: stage.label };
}

// src/modules/deals/deals.service.ts
var ENTITY4 = "deal";
function toAmount(amount) {
  return amount === void 0 ? void 0 : amount.toFixed(2);
}
async function assertStageInPipeline2(tx, pipelineId, stageId) {
  const [stage] = await tx.select().from(pipelineStage).where(eq10(pipelineStage.id, stageId)).limit(1);
  if (!stage) throw Errors.badRequest("Stage inexistente");
  if (stage.pipelineId !== pipelineId) throw Errors.badRequest("El stage no pertenece al pipeline indicado");
  return stage;
}
async function listDeals(portalId, query) {
  const cursor = decodeCursor(query.cursor);
  const rows = await db.select().from(deal).where(
    and9(eq10(deal.portalId, portalId), eq10(deal.archived, false), cursor ? cursorWhere(deal.createdAt, deal.id, cursor) : void 0)
  ).orderBy(desc5(deal.createdAt), desc5(deal.id)).limit(query.limit + 1);
  return paginateRows(rows, query.limit);
}
async function getDeal(portalId, id) {
  const [row] = await db.select().from(deal).where(and9(eq10(deal.portalId, portalId), eq10(deal.id, id), eq10(deal.archived, false))).limit(1);
  if (!row) throw Errors.notFound("Deal no encontrado");
  return row;
}
async function createDeal(portalId, userId, input) {
  return db.transaction(async (tx) => {
    const [pl] = await tx.select().from(pipeline).where(and9(eq10(pipeline.id, input.pipelineId), eq10(pipeline.portalId, portalId))).limit(1);
    if (!pl) throw Errors.badRequest("Pipeline inexistente");
    await assertStageInPipeline2(tx, input.pipelineId, input.stageId);
    const [row] = await tx.insert(deal).values({ ...input, amount: toAmount(input.amount), portalId }).returning();
    if (!row) throw Errors.internal("No se pudo crear el deal");
    await writeAudit({ tx, portalId, userId, entityType: ENTITY4, entityId: row.id, action: "CREATE", payload: input });
    return row;
  });
}
async function updateDeal(portalId, userId, id, input) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(deal).where(and9(eq10(deal.portalId, portalId), eq10(deal.id, id), eq10(deal.archived, false))).limit(1);
    if (!existing) throw Errors.notFound("Deal no encontrado");
    const patch = { ...input, amount: toAmount(input.amount) };
    const [updated] = await tx.update(deal).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq10(deal.id, id)).returning();
    if (!updated) throw Errors.internal("No se pudo actualizar el deal");
    await recordFieldChanges({ tx, portalId, entityType: ENTITY4, entityId: id, before: existing, after: patch, changedBy: userId });
    await writeAudit({ tx, portalId, userId, entityType: ENTITY4, entityId: id, action: "UPDATE", payload: input });
    return updated;
  });
}
async function archiveDeal(portalId, userId, id) {
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(deal).where(and9(eq10(deal.portalId, portalId), eq10(deal.id, id), eq10(deal.archived, false))).limit(1);
    if (!existing) throw Errors.notFound("Deal no encontrado");
    await tx.update(deal).set({ archived: true, archivedAt: /* @__PURE__ */ new Date() }).where(eq10(deal.id, id));
    await writeAudit({ tx, portalId, userId, entityType: ENTITY4, entityId: id, action: "DELETE" });
  });
}
async function addDealContact(portalId, dealId, contactId, role) {
  await getDeal(portalId, dealId);
  const [c] = await db.select().from(contact).where(and9(eq10(contact.portalId, portalId), eq10(contact.id, contactId))).limit(1);
  if (!c) throw Errors.badRequest("Contacto inexistente");
  await db.insert(dealContact).values({ dealId, contactId, role }).onConflictDoNothing();
}
async function removeDealContact(portalId, dealId, contactId) {
  await getDeal(portalId, dealId);
  await db.delete(dealContact).where(and9(eq10(dealContact.dealId, dealId), eq10(dealContact.contactId, contactId)));
}
async function getDealDetail(portalId, id) {
  const dealRow = await getDeal(portalId, id);
  let companyRow = null;
  if (dealRow.companyId) {
    const [c] = await db.select().from(company).where(eq10(company.id, dealRow.companyId)).limit(1);
    companyRow = c ?? null;
  }
  const ids = /* @__PURE__ */ new Set();
  if (dealRow.primaryContactId) ids.add(dealRow.primaryContactId);
  const links = await db.select({ contactId: dealContact.contactId }).from(dealContact).where(eq10(dealContact.dealId, id));
  for (const l of links) ids.add(l.contactId);
  let contacts = [];
  if (ids.size > 0) {
    contacts = await db.select().from(contact).where(and9(eq10(contact.portalId, portalId), inArray3(contact.id, [...ids])));
  }
  const notes = await db.select().from(note).where(and9(eq10(note.portalId, portalId), eq10(note.dealId, id))).orderBy(desc5(note.createdAt)).limit(50);
  const tasks = await db.select().from(task).where(and9(eq10(task.portalId, portalId), eq10(task.dealId, id))).orderBy(desc5(task.createdAt)).limit(50);
  const history = await db.select().from(recordHistory).where(and9(eq10(recordHistory.entityType, ENTITY4), eq10(recordHistory.entityId, id))).orderBy(desc5(recordHistory.changedAt)).limit(50);
  return { deal: dealRow, company: companyRow, contacts, notes, tasks, history };
}
var DEAL_FIELDS = {
  name: { column: deal.name, kind: "text" },
  amount: { column: deal.amount, kind: "number" },
  currency: { column: deal.currency, kind: "text" },
  pipelineId: { column: deal.pipelineId, kind: "text" },
  stageId: { column: deal.stageId, kind: "text" },
  companyId: { column: deal.companyId, kind: "text" },
  ownerId: { column: deal.ownerId, kind: "text" },
  closeDate: { column: deal.closeDate, kind: "date" },
  createdAt: { column: deal.createdAt, kind: "date" }
};
async function searchDeals(portalId, body) {
  const cond = body.filter ? buildFilter(body.filter, DEAL_FIELDS) : void 0;
  const cursor = decodeCursor(body.cursor);
  const rows = await db.select().from(deal).where(
    and9(eq10(deal.portalId, portalId), eq10(deal.archived, false), cond, cursor ? cursorWhere(deal.createdAt, deal.id, cursor) : void 0)
  ).orderBy(desc5(deal.createdAt), desc5(deal.id)).limit(body.limit + 1);
  return paginateRows(rows, body.limit);
}

// src/modules/deals/project-updates.service.ts
import { and as and11, desc as desc6, eq as eq12 } from "drizzle-orm";

// src/lib/portal-access.ts
import { and as and10, eq as eq11 } from "drizzle-orm";
async function clientDealIds(clientId) {
  const rows = await db.select({ dealId: clientDealAccess.dealId }).from(clientDealAccess).where(eq11(clientDealAccess.clientId, clientId));
  return rows.map((r) => r.dealId);
}
async function assertDealInPortal(portalId, dealId) {
  const [d] = await db.select().from(deal).where(and10(eq11(deal.id, dealId), eq11(deal.portalId, portalId), eq11(deal.archived, false))).limit(1);
  if (!d) throw Errors.badRequest("Deal inexistente");
  return d;
}

// src/modules/deals/project-updates.service.ts
var ENTITY5 = "project_update";
async function assertStageInPipeline3(tx, pipelineId, stageId) {
  const [stage] = await tx.select().from(pipelineStage).where(eq12(pipelineStage.id, stageId)).limit(1);
  if (!stage) throw Errors.badRequest("Stage inexistente");
  if (stage.pipelineId !== pipelineId) throw Errors.badRequest("El stage no pertenece al pipeline del deal");
  return stage;
}
async function listDealUpdates(portalId, dealId) {
  await assertDealInPortal(portalId, dealId);
  const rows = await db.select({
    id: projectUpdate.id,
    body: projectUpdate.body,
    archived: projectUpdate.archived,
    archivedAt: projectUpdate.archivedAt,
    createdAt: projectUpdate.createdAt,
    stageLabel: pipelineStage.label,
    createdById: hubUser.id,
    createdByFirstName: hubUser.firstName,
    createdByEmail: hubUser.email
  }).from(projectUpdate).innerJoin(hubUser, eq12(hubUser.id, projectUpdate.createdBy)).leftJoin(pipelineStage, eq12(pipelineStage.id, projectUpdate.stageId)).where(and11(eq12(projectUpdate.portalId, portalId), eq12(projectUpdate.dealId, dealId))).orderBy(desc6(projectUpdate.createdAt));
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    archived: r.archived,
    archivedAt: r.archivedAt,
    createdAt: r.createdAt,
    phaseLabel: r.stageLabel ?? null,
    createdBy: { id: r.createdById, firstName: r.createdByFirstName, email: r.createdByEmail }
  }));
}
async function createDealUpdate(portalId, userId, dealId, input) {
  const d = await assertDealInPortal(portalId, dealId);
  return db.transaction(async (tx) => {
    let stageId = null;
    if (input.stageId) {
      const stage = await assertStageInPipeline3(tx, d.pipelineId, input.stageId);
      stageId = stage.id;
    } else {
      const [pl] = await tx.select({ label: pipeline.label }).from(pipeline).where(eq12(pipeline.id, d.pipelineId)).limit(1);
      if (pl?.label === PRODUCTION_PIPELINE_LABEL) stageId = d.stageId;
    }
    const [row] = await tx.insert(projectUpdate).values({ portalId, dealId, stageId, body: input.body, createdBy: userId }).returning();
    if (!row) throw Errors.internal("No se pudo crear la novedad");
    await writeAudit({
      tx,
      portalId,
      userId,
      entityType: ENTITY5,
      entityId: row.id,
      action: "PROJECT_UPDATE_CREATED",
      payload: { dealId, stageId }
    });
    return row;
  });
}
async function archiveDealUpdate(portalId, userId, id) {
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(projectUpdate).where(and11(eq12(projectUpdate.portalId, portalId), eq12(projectUpdate.id, id), eq12(projectUpdate.archived, false))).limit(1);
    if (!existing) throw Errors.notFound("Novedad no encontrada");
    await tx.update(projectUpdate).set({ archived: true, archivedAt: /* @__PURE__ */ new Date() }).where(eq12(projectUpdate.id, id));
    await writeAudit({
      tx,
      portalId,
      userId,
      entityType: ENTITY5,
      entityId: id,
      action: "PROJECT_UPDATE_ARCHIVED",
      payload: { dealId: existing.dealId }
    });
  });
}

// src/modules/deals/deals.router.ts
var TAG3 = "Deals";
var security3 = ADMIN_SECURITY;
async function dealsRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/",
    { schema: { tags: [TAG3], summary: "Listar deals", description: "Listado paginado por cursor (no archivados).", security: security3, querystring: ListQuerySchema } },
    async (request) => {
      const { items, nextCursor } = await listDeals(request.hubUser.portalId, request.query);
      return ok(items, { nextCursor });
    }
  );
  r.get(
    "/:id",
    { schema: { tags: [TAG3], summary: "Obtener deal", description: "Devuelve un deal por id.", security: security3, params: IdParamSchema } },
    async (request) => {
      return ok(await getDeal(request.hubUser.portalId, request.params.id));
    }
  );
  r.get(
    "/:id/detail",
    {
      schema: {
        tags: [TAG3],
        summary: "Detalle completo del deal",
        description: "Deal + empresa + contactos asociados + notas + tareas + historial. Alimenta la vista de deal.",
        security: security3,
        params: IdParamSchema
      }
    },
    async (request) => ok(await getDealDetail(request.hubUser.portalId, request.params.id))
  );
  r.get(
    "/:id/updates",
    {
      schema: {
        tags: [TAG3],
        summary: "Novedades del proyecto (deal)",
        description: "Listado completo de novedades del deal, incluidas las archivadas (con flag `archived`). Alimenta la vista admin del estado de proyecto.",
        security: security3,
        params: IdParamSchema
      }
    },
    async (request) => ok(await listDealUpdates(request.hubUser.portalId, request.params.id))
  );
  r.post(
    "/:id/updates",
    {
      schema: {
        tags: [TAG3],
        summary: "Crear novedad de proyecto",
        description: 'Novedad curada por el equipo, visible al cliente en el Client Portal. Si no se indica `stageId` y el deal est\xE1 en el pipeline "Producci\xF3n", se usa la fase actual del deal.',
        security: security3,
        params: IdParamSchema,
        body: CreateProjectUpdateSchema
      },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request, reply) => {
      const created = await createDealUpdate(request.hubUser.portalId, request.hubUser.sub, request.params.id, request.body);
      return reply.status(201).send(ok(created));
    }
  );
  r.patch(
    "/updates/:id/archive",
    {
      schema: {
        tags: [TAG3],
        summary: "Archivar novedad de proyecto",
        description: "Soft delete (archived = true). La novedad deja de verse en el Client Portal pero sigue visible para el admin.",
        security: security3,
        params: ProjectUpdateIdParamSchema
      },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request) => {
      await archiveDealUpdate(request.hubUser.portalId, request.hubUser.sub, request.params.id);
      return ok({ success: true });
    }
  );
  r.post(
    "/search",
    {
      schema: {
        tags: [TAG3],
        summary: "B\xFAsqueda avanzada de deals",
        description: "Filtra deals con un filterBranch sobre campos permitidos (name, amount, currency, pipelineId, stageId, companyId, ownerId, closeDate, createdAt).",
        security: security3,
        body: SearchBodySchema
      }
    },
    async (request) => {
      const { items, nextCursor } = await searchDeals(request.hubUser.portalId, request.body);
      return ok(items, { nextCursor });
    }
  );
  r.post(
    "/:id/contacts",
    {
      schema: {
        tags: [TAG3],
        summary: "Asociar contacto al deal",
        description: "Agrega un contacto al deal (join deal_contact). Idempotente.",
        security: security3,
        params: IdParamSchema,
        body: AddDealContactSchema
      },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request) => {
      await addDealContact(request.hubUser.portalId, request.params.id, request.body.contactId, request.body.role);
      return ok({ success: true });
    }
  );
  r.delete(
    "/:id/contacts/:contactId",
    {
      schema: {
        tags: [TAG3],
        summary: "Quitar contacto del deal",
        description: "Elimina la asociaci\xF3n contacto\u2194deal.",
        security: security3,
        params: DealContactParamSchema
      },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request) => {
      await removeDealContact(request.hubUser.portalId, request.params.id, request.params.contactId);
      return ok({ success: true });
    }
  );
  r.post(
    "/",
    { schema: { tags: [TAG3], summary: "Crear deal", description: "Crea un deal. Valida que el stage pertenezca al pipeline. Requiere owner o member.", security: security3, body: CreateDealSchema }, preHandler: [authorize("owner", "member", "collaborator")] },
    async (request, reply) => {
      const created = await createDeal(request.hubUser.portalId, request.hubUser.sub, request.body);
      return reply.status(201).send(ok(created));
    }
  );
  r.patch(
    "/:id",
    { schema: { tags: [TAG3], summary: "Actualizar deal", description: "Actualiza campos del deal (no la etapa; usar /stage). Requiere owner o member.", security: security3, params: IdParamSchema, body: UpdateDealSchema }, preHandler: [authorize("owner", "member", "collaborator")] },
    async (request) => {
      return ok(await updateDeal(request.hubUser.portalId, request.hubUser.sub, request.params.id, request.body));
    }
  );
  r.patch(
    "/:id/stage",
    { schema: { tags: [TAG3], summary: "Cambiar etapa del deal", description: "Mueve el deal de etapa. Registra STAGE_CHANGE en record_history + audit_log y crea una notificaci\xF3n. Requiere owner o member.", security: security3, params: IdParamSchema, body: ChangeStageSchema }, preHandler: [authorize("owner", "member", "collaborator")] },
    async (request) => {
      return ok(await changeStage(request.hubUser.portalId, request.hubUser.sub, request.params.id, request.body.stageId));
    }
  );
  r.delete(
    "/:id",
    { schema: { tags: [TAG3], summary: "Archivar deal", description: "Soft delete (archived = true). Requiere rol owner.", security: security3, params: IdParamSchema }, preHandler: [authorize("owner")] },
    async (request) => {
      await archiveDeal(request.hubUser.portalId, request.hubUser.sub, request.params.id);
      return ok({ success: true });
    }
  );
}

// src/modules/pipelines/pipelines.router.ts
import { z as z9 } from "zod";

// src/modules/pipelines/pipelines.schema.ts
import { z as z8 } from "zod";
var StageInputSchema = z8.object({
  label: z8.string().min(1),
  displayOrder: z8.number().int().min(0).optional(),
  probability: z8.number().min(0).max(1).optional(),
  isClosed: z8.boolean().optional(),
  isWon: z8.boolean().optional(),
  exitCriteria: z8.string().optional(),
  description: z8.string().optional()
});
var CreatePipelineSchema = z8.object({
  label: z8.string().min(1),
  stages: z8.array(StageInputSchema).min(1).optional()
});
var AddStageSchema = StageInputSchema;
var UpdateStageSchema = z8.object({
  label: z8.string().min(1).optional(),
  displayOrder: z8.number().int().min(0).optional(),
  probability: z8.number().min(0).max(1).optional().nullable(),
  isClosed: z8.boolean().optional(),
  isWon: z8.boolean().optional(),
  exitCriteria: z8.string().optional().nullable(),
  description: z8.string().optional().nullable()
});

// src/modules/pipelines/pipelines.service.ts
import { and as and12, asc, count as count2, eq as eq13 } from "drizzle-orm";
async function assertPipeline(portalId, pipelineId) {
  const [pl] = await db.select({ id: pipeline.id }).from(pipeline).where(and12(eq13(pipeline.id, pipelineId), eq13(pipeline.portalId, portalId))).limit(1);
  if (!pl) throw Errors.notFound("Pipeline no encontrado");
}
async function addStage(portalId, pipelineId, input) {
  await assertPipeline(portalId, pipelineId);
  const existing = await db.select({ id: pipelineStage.id }).from(pipelineStage).where(eq13(pipelineStage.pipelineId, pipelineId));
  const [row] = await db.insert(pipelineStage).values({
    pipelineId,
    label: input.label,
    displayOrder: existing.length,
    probability: input.probability === void 0 ? null : input.probability.toFixed(4),
    isClosed: input.isClosed ?? false,
    isWon: input.isWon ?? false,
    exitCriteria: input.exitCriteria ?? null,
    description: input.description ?? null
  }).returning();
  if (!row) throw Errors.internal("No se pudo crear la etapa");
  return row;
}
async function deleteStage(portalId, pipelineId, stageId) {
  await assertPipeline(portalId, pipelineId);
  const [used] = await db.select({ n: count2() }).from(deal).where(eq13(deal.stageId, stageId));
  if ((used?.n ?? 0) > 0) throw Errors.badRequest("La etapa tiene deals; movelos antes de eliminarla");
  const res = await db.delete(pipelineStage).where(and12(eq13(pipelineStage.id, stageId), eq13(pipelineStage.pipelineId, pipelineId))).returning({ id: pipelineStage.id });
  if (res.length === 0) throw Errors.notFound("Etapa no encontrada");
}
async function listPipelines(portalId) {
  const pipelines = await db.select().from(pipeline).where(and12(eq13(pipeline.portalId, portalId), eq13(pipeline.archived, false))).orderBy(asc(pipeline.displayOrder), asc(pipeline.id));
  const result = [];
  for (const pl of pipelines) {
    const stages = await db.select().from(pipelineStage).where(and12(eq13(pipelineStage.pipelineId, pl.id), eq13(pipelineStage.archived, false))).orderBy(asc(pipelineStage.displayOrder), asc(pipelineStage.id));
    result.push({ ...pl, stages });
  }
  return result;
}
async function getStages(portalId, pipelineId) {
  const [pl] = await db.select().from(pipeline).where(and12(eq13(pipeline.id, pipelineId), eq13(pipeline.portalId, portalId))).limit(1);
  if (!pl) throw Errors.notFound("Pipeline no encontrado");
  return db.select().from(pipelineStage).where(and12(eq13(pipelineStage.pipelineId, pipelineId), eq13(pipelineStage.archived, false))).orderBy(asc(pipelineStage.displayOrder), asc(pipelineStage.id));
}
async function updateStage(portalId, pipelineId, stageId, input) {
  await assertPipeline(portalId, pipelineId);
  const updates = {};
  if (input.label !== void 0) updates.label = input.label;
  if (input.displayOrder !== void 0) updates.displayOrder = input.displayOrder;
  if (input.isClosed !== void 0) updates.isClosed = input.isClosed;
  if (input.isWon !== void 0) updates.isWon = input.isWon;
  if ("probability" in input) updates.probability = input.probability === void 0 || input.probability === null ? null : input.probability.toFixed(4);
  if ("exitCriteria" in input) updates.exitCriteria = input.exitCriteria ?? null;
  if ("description" in input) updates.description = input.description ?? null;
  const [row] = await db.update(pipelineStage).set(updates).where(and12(eq13(pipelineStage.id, stageId), eq13(pipelineStage.pipelineId, pipelineId))).returning();
  if (!row) throw Errors.notFound("Etapa no encontrada");
  return row;
}
async function createPipeline(portalId, input) {
  return db.transaction(async (tx) => {
    const [pl] = await tx.insert(pipeline).values({ portalId, label: input.label }).returning();
    if (!pl) throw Errors.internal("No se pudo crear el pipeline");
    let stages = [];
    if (input.stages && input.stages.length > 0) {
      stages = await tx.insert(pipelineStage).values(
        input.stages.map((s, i) => ({
          pipelineId: pl.id,
          label: s.label,
          displayOrder: s.displayOrder ?? i,
          probability: s.probability === void 0 ? null : s.probability.toFixed(4),
          isClosed: s.isClosed ?? false,
          isWon: s.isWon ?? false,
          exitCriteria: s.exitCriteria ?? null,
          description: s.description ?? null
        }))
      ).returning();
    }
    return { ...pl, stages };
  });
}

// src/modules/pipelines/pipelines.router.ts
var StageParamSchema = z9.object({
  id: z9.string().min(1),
  stageId: z9.string().min(1)
});
var TAG4 = "Pipelines";
var security4 = ADMIN_SECURITY;
async function pipelinesRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/",
    { schema: { tags: [TAG4], summary: "Listar pipelines", description: "Devuelve los pipelines del portal con sus etapas anidadas.", security: security4 } },
    async (request) => {
      return ok(await listPipelines(request.hubUser.portalId));
    }
  );
  r.get(
    "/:id/stages",
    { schema: { tags: [TAG4], summary: "Etapas de un pipeline", description: "Devuelve las etapas de un pipeline ordenadas.", security: security4, params: IdParamSchema } },
    async (request) => {
      return ok(await getStages(request.hubUser.portalId, request.params.id));
    }
  );
  r.post(
    "/",
    { schema: { tags: [TAG4], summary: "Crear pipeline", description: "Crea un pipeline con sus etapas. Requiere rol owner.", security: security4, body: CreatePipelineSchema }, preHandler: [authorize("owner")] },
    async (request, reply) => {
      const created = await createPipeline(request.hubUser.portalId, request.body);
      return reply.status(201).send(ok(created));
    }
  );
  r.post(
    "/:id/stages",
    { schema: { tags: [TAG4], summary: "Agregar etapa", description: "Agrega una etapa al final del pipeline. Solo owner.", security: security4, params: IdParamSchema, body: AddStageSchema }, preHandler: [authorize("owner")] },
    async (request, reply) => {
      const created = await addStage(request.hubUser.portalId, request.params.id, request.body);
      return reply.status(201).send(ok(created));
    }
  );
  r.patch(
    "/:id/stages/:stageId",
    {
      schema: {
        tags: [TAG4],
        summary: "Actualizar etapa",
        description: "Actualiza campos de una etapa (label, probability, exitCriteria, description, etc.). Owner o member.",
        security: security4,
        params: StageParamSchema,
        body: UpdateStageSchema
      },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request) => {
      const updated = await updateStage(request.hubUser.portalId, request.params.id, request.params.stageId, request.body);
      return ok(updated);
    }
  );
  r.delete(
    "/:id/stages/:stageId",
    { schema: { tags: [TAG4], summary: "Eliminar etapa", description: "Elimina una etapa (si no tiene deals). Solo owner.", security: security4, params: StageParamSchema }, preHandler: [authorize("owner")] },
    async (request) => {
      await deleteStage(request.hubUser.portalId, request.params.id, request.params.stageId);
      return ok({ success: true });
    }
  );
}

// src/modules/leads/leads.service.ts
var LEAD_STAGES = ["lead", "mql", "sql", "opportunity"];
function listLeads(portalId, query) {
  return listContactsByLifecycle(portalId, LEAD_STAGES, query);
}
function getLeadDetail(portalId, id) {
  return getContactDetail(portalId, id);
}

// src/modules/leads/leads.router.ts
var TAG5 = "Leads";
var security5 = ADMIN_SECURITY;
async function leadsRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/",
    {
      schema: {
        tags: [TAG5],
        summary: "Listar leads",
        description: "Contactos en etapa lead/mql/sql/opportunity (paginado por cursor).",
        security: security5,
        querystring: ListQuerySchema
      }
    },
    async (request) => {
      const { items, nextCursor } = await listLeads(request.hubUser.portalId, request.query);
      return ok(items, { nextCursor });
    }
  );
  r.get(
    "/:id",
    {
      schema: {
        tags: [TAG5],
        summary: "Detalle de lead",
        description: "Contacto + deals asociados + historial de cambios. Alimenta el User Detail.",
        security: security5,
        params: IdParamSchema
      }
    },
    async (request) => {
      return ok(await getLeadDetail(request.hubUser.portalId, request.params.id));
    }
  );
}

// src/modules/clients/clients.service.ts
import { eq as eq14, inArray as inArray4, desc as desc7 } from "drizzle-orm";
var CLIENT_STAGES = ["customer"];
function listClients(portalId, query) {
  return listContactsByLifecycle(portalId, CLIENT_STAGES, query);
}
function getClientDetail(portalId, id) {
  return getContactDetail(portalId, id);
}
async function listClientAccounts(portalId) {
  const accounts = await db.select({
    id: clientAccount.id,
    email: clientAccount.email,
    inviteAccepted: clientAccount.inviteAccepted,
    isActive: clientAccount.isActive,
    createdAt: clientAccount.createdAt
  }).from(clientAccount).where(eq14(clientAccount.portalId, portalId)).orderBy(desc7(clientAccount.createdAt));
  if (accounts.length === 0) return [];
  const accIds = accounts.map((a) => a.id);
  const accesses = await db.select({ clientId: clientDealAccess.clientId, dealId: clientDealAccess.dealId }).from(clientDealAccess).where(inArray4(clientDealAccess.clientId, accIds));
  const dealMap = /* @__PURE__ */ new Map();
  for (const acc of accesses) {
    if (!dealMap.has(acc.clientId)) dealMap.set(acc.clientId, []);
    dealMap.get(acc.clientId).push(acc.dealId);
  }
  return accounts.map((a) => ({
    ...a,
    dealIds: dealMap.get(a.id) ?? []
  }));
}

// src/modules/clients/clients.router.ts
var TAG6 = "Clientes";
var security6 = ADMIN_SECURITY;
async function clientsRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/",
    {
      schema: {
        tags: [TAG6],
        summary: "Listar clientes",
        description: "Contactos en etapa customer (paginado por cursor).",
        security: security6,
        querystring: ListQuerySchema
      }
    },
    async (request) => {
      const { items, nextCursor } = await listClients(request.hubUser.portalId, request.query);
      return ok(items, { nextCursor });
    }
  );
  r.get(
    "/:id",
    {
      schema: {
        tags: [TAG6],
        summary: "Detalle de cliente",
        description: "Contacto + deals asociados + historial de cambios. Alimenta el User Detail.",
        security: security6,
        params: IdParamSchema
      }
    },
    async (request) => {
      return ok(await getClientDetail(request.hubUser.portalId, request.params.id));
    }
  );
  r.get(
    "/accounts",
    {
      schema: {
        tags: [TAG6],
        summary: "Listar cuentas del portal de clientes",
        description: "Lista todas las client_account del portal con su estado de invitaci\xF3n y los deal IDs a los que tienen acceso. No expone password_hash ni invite_token.",
        security: security6
      }
    },
    async (request) => {
      const accounts = await listClientAccounts(request.hubUser.portalId);
      return ok(accounts);
    }
  );
}

// src/modules/activities/activities.schema.ts
import { z as z10 } from "zod";
var CreateNoteSchema = z10.object({
  body: z10.string().min(1),
  dealId: z10.string().min(1).optional(),
  contactId: z10.string().min(1).optional(),
  companyId: z10.string().min(1).optional()
});
var NoteQuerySchema = z10.object({
  contactId: z10.string().min(1).optional(),
  dealId: z10.string().min(1).optional(),
  companyId: z10.string().min(1).optional()
});
var taskStatus = z10.enum(["pending", "in_progress", "completed", "cancelled"]);
var taskPriority = z10.enum(["low", "medium", "high"]);
var CreateTaskSchema = z10.object({
  title: z10.string().min(1),
  body: z10.string().optional(),
  status: taskStatus.optional(),
  priority: taskPriority.optional(),
  dueDate: z10.string().datetime().optional(),
  assignedTo: z10.string().min(1).optional(),
  dealId: z10.string().min(1).optional(),
  contactId: z10.string().min(1).optional(),
  companyId: z10.string().min(1).optional()
});
var UpdateTaskSchema = z10.object({
  title: z10.string().min(1).optional(),
  body: z10.string().optional(),
  status: taskStatus.optional(),
  priority: taskPriority.optional(),
  dueDate: z10.string().datetime().nullable().optional(),
  assignedTo: z10.string().min(1).nullable().optional()
});
var TaskQuerySchema = z10.object({
  status: taskStatus.optional(),
  assignedTo: z10.string().min(1).optional(),
  contactId: z10.string().min(1).optional(),
  dealId: z10.string().min(1).optional()
});

// src/modules/activities/activities.service.ts
import { and as and13, desc as desc8, eq as eq15 } from "drizzle-orm";
async function createNote(portalId, userId, input) {
  const [row] = await db.insert(note).values({ ...input, portalId, createdBy: userId }).returning();
  if (!row) throw Errors.internal("No se pudo crear la nota");
  return row;
}
async function listNotes(portalId, filters) {
  const conds = [eq15(note.portalId, portalId)];
  if (filters.contactId) conds.push(eq15(note.contactId, filters.contactId));
  if (filters.dealId) conds.push(eq15(note.dealId, filters.dealId));
  if (filters.companyId) conds.push(eq15(note.companyId, filters.companyId));
  return db.select().from(note).where(and13(...conds)).orderBy(desc8(note.createdAt)).limit(100);
}
async function deleteNote(portalId, id) {
  const res = await db.delete(note).where(and13(eq15(note.portalId, portalId), eq15(note.id, id))).returning({ id: note.id });
  if (res.length === 0) throw Errors.notFound("Nota no encontrada");
}
async function createTask(portalId, userId, input) {
  const { dueDate, ...rest } = input;
  const [row] = await db.insert(task).values({ ...rest, portalId, createdBy: userId, dueDate: dueDate ? new Date(dueDate) : void 0 }).returning();
  if (!row) throw Errors.internal("No se pudo crear la tarea");
  return row;
}
async function listTasks(portalId, filters) {
  const conds = [eq15(task.portalId, portalId)];
  if (filters.status) conds.push(eq15(task.status, filters.status));
  if (filters.assignedTo) conds.push(eq15(task.assignedTo, filters.assignedTo));
  if (filters.contactId) conds.push(eq15(task.contactId, filters.contactId));
  if (filters.dealId) conds.push(eq15(task.dealId, filters.dealId));
  return db.select().from(task).where(and13(...conds)).orderBy(desc8(task.createdAt)).limit(200);
}
async function updateTask(portalId, id, input) {
  const [existing] = await db.select().from(task).where(and13(eq15(task.portalId, portalId), eq15(task.id, id))).limit(1);
  if (!existing) throw Errors.notFound("Tarea no encontrada");
  const patch = {};
  if (input.title !== void 0) patch.title = input.title;
  if (input.body !== void 0) patch.body = input.body;
  if (input.priority !== void 0) patch.priority = input.priority;
  if (input.assignedTo !== void 0) patch.assignedTo = input.assignedTo;
  if (input.dueDate !== void 0) patch.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  if (input.status !== void 0) {
    patch.status = input.status;
    if (input.status === "completed") patch.completedAt = existing.completedAt ?? /* @__PURE__ */ new Date();
    else patch.completedAt = null;
  }
  const [row] = await db.update(task).set(patch).where(eq15(task.id, id)).returning();
  if (!row) throw Errors.internal("No se pudo actualizar la tarea");
  return row;
}
async function deleteTask(portalId, id) {
  const res = await db.delete(task).where(and13(eq15(task.portalId, portalId), eq15(task.id, id))).returning({ id: task.id });
  if (res.length === 0) throw Errors.notFound("Tarea no encontrada");
}

// src/modules/activities/notes.router.ts
var TAG7 = "Notas";
var security7 = ADMIN_SECURITY;
async function notesRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/",
    {
      schema: {
        tags: [TAG7],
        summary: "Listar notas",
        description: "Notas filtradas por contacto/deal/empresa (m\xE1s recientes primero).",
        security: security7,
        querystring: NoteQuerySchema
      }
    },
    async (request) => ok(await listNotes(request.hubUser.portalId, request.query))
  );
  r.post(
    "/",
    {
      schema: {
        tags: [TAG7],
        summary: "Crear nota",
        description: "Crea una nota asociada a un contacto, deal y/o empresa.",
        security: security7,
        body: CreateNoteSchema
      },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request, reply) => {
      const created = await createNote(request.hubUser.portalId, request.hubUser.sub, request.body);
      return reply.status(201).send(ok(created));
    }
  );
  r.delete(
    "/:id",
    {
      schema: { tags: [TAG7], summary: "Eliminar nota", description: "Borra una nota.", security: security7, params: IdParamSchema },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request) => {
      await deleteNote(request.hubUser.portalId, request.params.id);
      return ok({ success: true });
    }
  );
}

// src/modules/activities/tasks.router.ts
var TAG8 = "Tareas";
var security8 = ADMIN_SECURITY;
async function tasksRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/",
    {
      schema: {
        tags: [TAG8],
        summary: "Listar tareas",
        description: "Tareas filtrables por estado, responsable, contacto o deal.",
        security: security8,
        querystring: TaskQuerySchema
      }
    },
    async (request) => ok(await listTasks(request.hubUser.portalId, request.query))
  );
  r.post(
    "/",
    {
      schema: {
        tags: [TAG8],
        summary: "Crear tarea",
        description: "Crea una tarea con responsable, vencimiento y asociaciones opcionales.",
        security: security8,
        body: CreateTaskSchema
      },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request, reply) => {
      const created = await createTask(request.hubUser.portalId, request.hubUser.sub, request.body);
      return reply.status(201).send(ok(created));
    }
  );
  r.patch(
    "/:id",
    {
      schema: {
        tags: [TAG8],
        summary: "Actualizar tarea",
        description: "Actualiza una tarea. Al pasar a completed se setea completed_at autom\xE1ticamente.",
        security: security8,
        params: IdParamSchema,
        body: UpdateTaskSchema
      },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request) => ok(await updateTask(request.hubUser.portalId, request.params.id, request.body))
  );
  r.delete(
    "/:id",
    {
      schema: { tags: [TAG8], summary: "Eliminar tarea", description: "Borra una tarea.", security: security8, params: IdParamSchema },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request) => {
      await deleteTask(request.hubUser.portalId, request.params.id);
      return ok({ success: true });
    }
  );
}

// src/modules/dashboard/dashboard.service.ts
import { and as and14, asc as asc2, count as count3, desc as desc9, eq as eq16, inArray as inArray5, notInArray, sql as sql24 } from "drizzle-orm";
var OPEN_TASK_STATUSES = ["completed", "cancelled"];
async function getDashboard(portalId) {
  const [
    [leadsRow],
    [clientsRow],
    [companiesRow],
    [tasksRow],
    [dealAgg],
    [forecastRow],
    dealsByStage,
    recentTasks,
    recentDeals
  ] = await Promise.all([
    db.select({ n: count3() }).from(contact).where(and14(eq16(contact.portalId, portalId), eq16(contact.archived, false), inArray5(contact.lifecycleStage, LEAD_STAGES))),
    db.select({ n: count3() }).from(contact).where(and14(eq16(contact.portalId, portalId), eq16(contact.archived, false), eq16(contact.lifecycleStage, "customer"))),
    db.select({ n: count3() }).from(company).where(and14(eq16(company.portalId, portalId), eq16(company.archived, false))),
    db.select({ n: count3() }).from(task).where(and14(eq16(task.portalId, portalId), notInArray(task.status, OPEN_TASK_STATUSES))),
    db.select({ openDeals: count3(), openValue: sql24`coalesce(sum(${deal.amount}), 0)` }).from(deal).where(and14(eq16(deal.portalId, portalId), eq16(deal.archived, false))),
    db.select({
      weighted: sql24`coalesce(sum(${deal.amount} * coalesce(${pipelineStage.probability}, 0)), 0)`
    }).from(deal).innerJoin(pipelineStage, eq16(deal.stageId, pipelineStage.id)).where(and14(eq16(deal.portalId, portalId), eq16(deal.archived, false))),
    db.select({
      stageId: pipelineStage.id,
      label: pipelineStage.label,
      deals: count3(deal.id),
      value: sql24`coalesce(sum(${deal.amount}), 0)`
    }).from(pipelineStage).innerJoin(
      pipeline,
      and14(eq16(pipelineStage.pipelineId, pipeline.id), eq16(pipeline.portalId, portalId), eq16(pipeline.archived, false))
    ).leftJoin(deal, and14(eq16(deal.stageId, pipelineStage.id), eq16(deal.archived, false))).groupBy(pipelineStage.id, pipelineStage.label, pipelineStage.displayOrder).orderBy(asc2(pipelineStage.displayOrder)),
    db.select().from(task).where(and14(eq16(task.portalId, portalId), notInArray(task.status, OPEN_TASK_STATUSES))).orderBy(asc2(task.dueDate), desc9(task.createdAt)).limit(6),
    db.select().from(deal).where(and14(eq16(deal.portalId, portalId), eq16(deal.archived, false))).orderBy(desc9(deal.createdAt)).limit(6)
  ]);
  return {
    counts: {
      leads: leadsRow?.n ?? 0,
      clients: clientsRow?.n ?? 0,
      companies: companiesRow?.n ?? 0,
      openTasks: tasksRow?.n ?? 0
    },
    pipeline: {
      openDeals: dealAgg?.openDeals ?? 0,
      openValue: dealAgg?.openValue ?? "0",
      weightedForecast: forecastRow?.weighted ?? "0"
    },
    dealsByStage,
    recentTasks,
    recentDeals
  };
}

// src/modules/dashboard/dashboard.router.ts
async function dashboardRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/",
    {
      schema: {
        tags: ["Dashboard"],
        summary: "M\xE9tricas del dashboard",
        description: "Resumen del portal: conteos (leads, clientes, empresas, tareas abiertas), pipeline (deals abiertos, valor, forecast ponderado por probabilidad de etapa), deals por etapa, y pr\xF3ximas tareas / deals recientes.",
        security: [{ bearerAuth: [] }]
      }
    },
    async (request) => ok(await getDashboard(request.hubUser.portalId))
  );
}

// src/modules/calendar/calendar.schema.ts
import { z as z11 } from "zod";
var ianaTimezone = z11.string().refine(
  (tz) => {
    try {
      Intl.DateTimeFormat(void 0, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: "Zona horaria IANA inv\xE1lida (ej. America/Bogota, Europe/Madrid)" }
);
var CreateBookingSchema = z11.object({
  /** Nombre del invitado principal. */
  guestName: z11.string().min(1, "El nombre es requerido"),
  /** Email del invitado principal. */
  guestEmail: z11.string().email("Email inv\xE1lido"),
  /** Inicio del slot elegido — ISO 8601 UTC. */
  startsAt: z11.string().datetime({ message: "startsAt debe ser ISO 8601 UTC" }),
  /** Zona horaria IANA del invitado (para mostrar la hora en sus emails). */
  inviteeTimeZone: ianaTimezone,
  /** Respuestas del invitado a las customQuestions del meeting type (clave → valor). */
  questionAnswers: z11.record(z11.string()).optional().default({}),
  /** Emails de invitados adicionales para reuniones grupales. */
  guestEmails: z11.array(z11.string().email()).optional().default([]),
  /** Notas libres del invitado (ej. contexto de la reunión). */
  notes: z11.string().optional()
});
var CancelBookingSchema = z11.object({
  /** JWT de tipo 'booking-cancel' enviado al invitado en el email de confirmación. */
  token: z11.string().min(1, "El token es requerido"),
  /** Motivo opcional de cancelación (para log interno). */
  reason: z11.string().optional()
});
var RescheduleByTokenSchema = z11.object({
  /** JWT de tipo 'booking-reschedule' enviado al invitado en el email de confirmación. */
  token: z11.string().min(1, "El token es requerido"),
  /** Nuevo inicio del slot elegido — ISO 8601 UTC. */
  newStartsAt: z11.string().datetime({ message: "newStartsAt debe ser ISO 8601 UTC" }),
  /** Zona horaria IANA actualizada del invitado (opcional; si no viene, se mantiene la original). */
  inviteeTimeZone: ianaTimezone.optional()
});
var CreateMeetingTypeSchema = z11.object({
  name: z11.string().min(1),
  slug: z11.string().optional(),
  durationMin: z11.number().int().positive(),
  bufferMin: z11.number().int().min(0).optional(),
  location: z11.string().optional(),
  description: z11.string().optional(),
  isActive: z11.boolean().optional()
});
var UpdateMeetingTypeSchema = CreateMeetingTypeSchema.partial();
var CreateAvailabilityRuleSchema = z11.object({
  dayOfWeek: z11.number().int().min(0).max(6),
  startTime: z11.string().regex(/^\d{2}:\d{2}$/, "Formato HH:MM"),
  endTime: z11.string().regex(/^\d{2}:\d{2}$/, "Formato HH:MM"),
  timeZone: z11.string().optional()
});
var CreateScheduleSchema = z11.object({
  name: z11.string().min(1, "El nombre es requerido"),
  timeZone: z11.string().min(1, "La zona horaria es requerida"),
  isDefault: z11.boolean().optional()
});
var UpdateScheduleSchema = CreateScheduleSchema.partial();
var ScheduleParamSchema = z11.object({
  scheduleId: z11.string().min(1)
});
var ScheduleIntervalParamSchema = z11.object({
  scheduleId: z11.string().min(1),
  intervalId: z11.string().min(1)
});
var ScheduleOverrideParamSchema = z11.object({
  scheduleId: z11.string().min(1),
  overrideId: z11.string().min(1)
});
var IntervalInputSchema = z11.object({
  dayOfWeek: z11.number().int().min(0).max(6),
  startTime: z11.string().regex(/^\d{2}:\d{2}$/, "Formato HH:MM"),
  endTime: z11.string().regex(/^\d{2}:\d{2}$/, "Formato HH:MM")
});
var CreateIntervalSchema = IntervalInputSchema;
var ReplaceIntervalsSchema = z11.object({
  intervals: z11.array(IntervalInputSchema)
});
var TimeRangeSchema = z11.object({
  from: z11.string().regex(/^\d{2}:\d{2}$/, "Formato HH:MM"),
  to: z11.string().regex(/^\d{2}:\d{2}$/, "Formato HH:MM")
});
var DateOverrideInputSchema = z11.object({
  date: z11.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD"),
  intervals: z11.array(TimeRangeSchema)
});
var CustomQuestionSchema = z11.object({
  id: z11.string(),
  label: z11.string(),
  type: z11.enum(["text", "textarea", "select", "phone"]),
  required: z11.boolean(),
  options: z11.array(z11.string()).optional()
});
var MeetingLocationSchema = z11.object({
  type: z11.enum(["video", "phone", "in_person", "custom"]),
  value: z11.string().optional()
});
var CreateEventTypeV2Schema = z11.object({
  name: z11.string().min(1, "El nombre es requerido"),
  slug: z11.string().optional(),
  durationMin: z11.number().int().positive(),
  kind: z11.enum(["solo", "group"]).optional().default("solo"),
  poolingType: z11.enum(["collective"]).nullable().optional(),
  color: z11.string().optional().default("#3b82f6"),
  secret: z11.boolean().optional().default(false),
  description: z11.string().optional(),
  isActive: z11.boolean().optional().default(true),
  locations: z11.array(MeetingLocationSchema).optional().default([]),
  customQuestions: z11.array(CustomQuestionSchema).optional().default([]),
  startTimeIncrementMin: z11.number().int().positive().optional().default(30),
  minBookingNoticeMin: z11.number().int().min(0).optional().default(240),
  bookingWindowType: z11.enum(["rolling", "range", "unlimited"]).optional().default("rolling"),
  bookingWindowDays: z11.number().int().positive().nullable().optional(),
  bookingWindowStart: z11.string().nullable().optional(),
  bookingWindowEnd: z11.string().nullable().optional(),
  bufferBeforeMin: z11.number().int().min(0).optional().default(0),
  bufferAfterMin: z11.number().int().min(0).optional().default(0),
  dailyLimit: z11.number().int().positive().nullable().optional(),
  maxInvitees: z11.number().int().positive().optional(),
  availabilityScheduleId: z11.string().nullable().optional(),
  hostIds: z11.array(z11.string()).optional()
});
var UpdateEventTypeV2Schema = CreateEventTypeV2Schema.partial();
var WeekBookingsQuerySchema = z11.object({
  from: z11.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD"),
  to: z11.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD")
});

// src/modules/calendar/calendar.service.ts
import { and as and15, asc as asc3, eq as eq17, gte as gte2, inArray as inArray6, lte as lte2 } from "drizzle-orm";
import { addMinutes as addMinutes2 } from "date-fns";
import { format as formatTz2, toZonedTime as toZonedTime2 } from "date-fns-tz";
import jwt from "jsonwebtoken";

// src/lib/mailer.ts
import { Resend } from "resend";
var resendClient = null;
function getResend() {
  if (!env.RESEND_API_KEY) return null;
  if (!resendClient) {
    resendClient = new Resend(env.RESEND_API_KEY);
  }
  return resendClient;
}
async function sendEmail(params) {
  const client4 = getResend();
  if (!client4) {
    console.info("[mailer] RESEND_API_KEY no configurada \u2014 email omitido", {
      to: params.to,
      subject: params.subject
    });
    return;
  }
  const from = params.from ?? env.FROM_EMAIL ?? "noreply@onboarding.resend.dev";
  const { error } = await client4.emails.send({
    from,
    to: Array.isArray(params.to) ? params.to : [params.to],
    subject: params.subject,
    html: params.html
  });
  if (error) {
    console.error("[mailer] Error al enviar email via Resend", {
      to: params.to,
      subject: params.subject,
      error
    });
  }
}

// src/modules/calendar/slots.service.ts
import { fromZonedTime, toZonedTime, format as formatTz } from "date-fns-tz";
import { addMinutes, addDays, startOfDay, isBefore, isAfter } from "date-fns";
function wallClockToUtc(date5, time2, hostTz) {
  const localStr = `${date5}T${time2}:00`;
  return fromZonedTime(localStr, hostTz);
}
function utcDateInHostTz(utcDate, hostTz) {
  return formatTz(toZonedTime(utcDate, hostTz), "yyyy-MM-dd", { timeZone: hostTz });
}
function eachDayInRange(fromDate, toDate) {
  const days = [];
  let current = /* @__PURE__ */ new Date(`${fromDate}T00:00:00Z`);
  const end = /* @__PURE__ */ new Date(`${toDate}T00:00:00Z`);
  while (!isAfter(current, end)) {
    const y = current.getUTCFullYear();
    const m = String(current.getUTCMonth() + 1).padStart(2, "0");
    const d = String(current.getUTCDate()).padStart(2, "0");
    days.push(`${y}-${m}-${d}`);
    current = addDays(current, 1);
  }
  return days;
}
function weekdayOfDate(dateStr) {
  return (/* @__PURE__ */ new Date(`${dateStr}T00:00:00Z`)).getUTCDay();
}
function overlaps(aStart, aEnd, bStart, bEnd) {
  return isBefore(aStart, bEnd) && isBefore(bStart, aEnd);
}
function getWindowsForDay(dateStr, schedule) {
  const { timeZone, intervals, dateOverrides } = schedule;
  const override = dateOverrides.find((o) => o.date === dateStr);
  if (override) {
    if (override.intervals.length === 0) return [];
    return override.intervals.map(({ from, to }) => ({
      start: wallClockToUtc(dateStr, from, timeZone),
      end: wallClockToUtc(dateStr, to, timeZone)
    }));
  }
  const dow = weekdayOfDate(dateStr);
  const dayIntervals = intervals.filter((i) => i.dayOfWeek === dow);
  return dayIntervals.map((i) => ({
    start: wallClockToUtc(dateStr, i.startTime, timeZone),
    end: wallClockToUtc(dateStr, i.endTime, timeZone)
  }));
}
function intersectWindows(a, b) {
  const result = [];
  for (const wa of a) {
    for (const wb of b) {
      const start = isAfter(wa.start, wb.start) ? wa.start : wb.start;
      const end = isBefore(wa.end, wb.end) ? wa.end : wb.end;
      if (isBefore(start, end)) {
        result.push({ start, end });
      }
    }
  }
  return result;
}
function isWithinBookingWindow(slotStart, now, et) {
  if (et.bookingWindowType === "unlimited") return true;
  if (et.bookingWindowType === "rolling") {
    const days = et.bookingWindowDays ?? 60;
    const windowEnd = addDays(startOfDay(now), days + 1);
    return !isAfter(slotStart, windowEnd);
  }
  if (et.bookingWindowType === "range") {
    if (!et.bookingWindowStart || !et.bookingWindowEnd) return false;
    const rangeStart = /* @__PURE__ */ new Date(`${et.bookingWindowStart}T00:00:00Z`);
    const rangeEnd = /* @__PURE__ */ new Date(`${et.bookingWindowEnd}T23:59:59Z`);
    return !isBefore(slotStart, rangeStart) && !isAfter(slotStart, rangeEnd);
  }
  return false;
}
function computeSlots(input) {
  const { eventType: et, schedules, existingBookings, fromDate, toDate, now } = input;
  if (schedules.length === 0) return [];
  const confirmedBookings = existingBookings.filter((b) => b.status === "confirmed");
  const noticeThreshold = addMinutes(now, et.minBookingNoticeMin);
  const slots = [];
  const primaryTz = schedules[0]?.timeZone ?? "UTC";
  const confirmedByDay = /* @__PURE__ */ new Map();
  for (const b of confirmedBookings) {
    const dayStr = utcDateInHostTz(new Date(b.startsAt), primaryTz);
    confirmedByDay.set(dayStr, (confirmedByDay.get(dayStr) ?? 0) + 1);
  }
  for (const dateStr of eachDayInRange(fromDate, toDate)) {
    if (et.dailyLimit !== null && et.dailyLimit !== void 0) {
      const dayKey = dateStr;
      const booked = confirmedByDay.get(dayKey) ?? 0;
      if (booked >= et.dailyLimit) continue;
    }
    let windows;
    if (schedules.length === 1) {
      windows = getWindowsForDay(dateStr, schedules[0]);
    } else {
      let combined = null;
      for (const schedule of schedules) {
        const dayWindows = getWindowsForDay(dateStr, schedule);
        if (combined === null) {
          combined = dayWindows;
        } else {
          combined = intersectWindows(combined, dayWindows);
        }
      }
      windows = combined ?? [];
    }
    if (windows.length === 0) continue;
    let slotsToday = 0;
    for (const window of windows) {
      let cursor = window.start;
      while (true) {
        const slotEnd = addMinutes(cursor, et.durationMin);
        if (isAfter(slotEnd, window.end)) break;
        if (et.dailyLimit !== null && et.dailyLimit !== void 0) {
          const dayKey = dateStr;
          const booked = confirmedByDay.get(dayKey) ?? 0;
          if (booked + slotsToday >= et.dailyLimit) break;
        }
        if (isBefore(cursor, noticeThreshold)) {
          cursor = addMinutes(cursor, et.startTimeIncrementMin);
          continue;
        }
        if (!isWithinBookingWindow(cursor, now, et)) {
          cursor = addMinutes(cursor, et.startTimeIncrementMin);
          continue;
        }
        const slotWithBufferStart = addMinutes(cursor, -et.bufferBeforeMin);
        const slotWithBufferEnd = addMinutes(slotEnd, et.bufferAfterMin);
        const isBlocked = confirmedBookings.some((b) => {
          const bStart = new Date(b.startsAt);
          const bEnd = new Date(b.endsAt);
          return overlaps(slotWithBufferStart, slotWithBufferEnd, bStart, bEnd);
        });
        if (!isBlocked) {
          slots.push({
            startUtc: cursor.toISOString(),
            endUtc: slotEnd.toISOString()
          });
          slotsToday++;
        }
        cursor = addMinutes(cursor, et.startTimeIncrementMin);
      }
    }
  }
  return slots;
}
function toInviteeDisplay(slotUtc, tz, fmt = "HH:mm") {
  const zonedDate = toZonedTime(new Date(slotUtc), tz);
  return formatTz(zonedDate, fmt, { timeZone: tz });
}

// src/modules/calendar/emails/booking-confirm-invitee.ts
function bookingConfirmInviteeHtml(p) {
  const locationBlock = p.location ? `<p><strong>Ubicaci\xF3n / Link:</strong> <a href="${p.location}">${p.location}</a></p>` : "";
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirmaci\xF3n de reuni\xF3n</title>
</head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #2563eb;">\u2705 Reuni\xF3n confirmada</h2>

  <p>Hola ${escHtml(p.guestName)},</p>
  <p>Tu reuni\xF3n ha sido confirmada. Aqu\xED est\xE1n los detalles:</p>

  <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
    <tr>
      <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold; width: 40%;">Evento</td>
      <td style="padding: 8px 12px;">${escHtml(p.eventName)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold;">Fecha y hora</td>
      <td style="padding: 8px 12px;">${escHtml(p.startLocal)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold;">Duraci\xF3n</td>
      <td style="padding: 8px 12px;">${p.durationMin} minutos</td>
    </tr>
    ${p.location ? `<tr>
      <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold;">Ubicaci\xF3n / Link</td>
      <td style="padding: 8px 12px;"><a href="${escAttr(p.location)}" style="color: #2563eb;">${escHtml(p.location)}</a></td>
    </tr>` : ""}
  </table>

  <p style="margin-top: 24px;">\xBFNecesit\xE1s cambiar algo?</p>
  <p>
    <a href="${escAttr(p.cancelUrl)}"
       style="display: inline-block; margin-right: 12px; padding: 10px 18px; background: #ef4444; color: #fff; border-radius: 6px; text-decoration: none;">
      Cancelar reuni\xF3n
    </a>
    <a href="${escAttr(p.rescheduleUrl)}"
       style="display: inline-block; padding: 10px 18px; background: #2563eb; color: #fff; border-radius: 6px; text-decoration: none;">
      Reprogramar
    </a>
  </p>

  <hr style="margin: 32px 0; border: none; border-top: 1px solid #e2e8f0;" />
  <p style="font-size: 12px; color: #64748b;">
    Si no esperabas este email, pod\xE9s ignorarlo.
    Los links de cancelaci\xF3n y reprogramaci\xF3n son personales \u2014 no los compartas.
  </p>
</body>
</html>`;
}
function escHtml(s) {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escAttr(s) {
  if (!s) return "#";
  return s.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// src/modules/calendar/emails/booking-cancelled.ts
function bookingCancelledHtml(p) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reuni\xF3n cancelada</title>
</head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #ef4444;">\u274C Reuni\xF3n cancelada</h2>

  <p>Hola ${escHtml2(p.guestName)},</p>
  <p>Tu reuni\xF3n ha sido cancelada.</p>

  <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
    <tr>
      <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold; width: 40%;">Evento</td>
      <td style="padding: 8px 12px;">${escHtml2(p.eventName)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold;">Fecha y hora original</td>
      <td style="padding: 8px 12px;">${escHtml2(p.startLocal)}</td>
    </tr>
  </table>

  <p>Si quer\xE9s agendar otra reuni\xF3n, pod\xE9s hacerlo cuando quieras usando el link original.</p>

  <hr style="margin: 32px 0; border: none; border-top: 1px solid #e2e8f0;" />
  <p style="font-size: 12px; color: #64748b;">
    Si no solicitaste esta cancelaci\xF3n, por favor contactanos de inmediato.
  </p>
</body>
</html>`;
}
function escHtml2(s) {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// src/modules/calendar/emails/booking-host-notify.ts
function bookingHostNotifyHtml(p) {
  const greeting = p.hostName ? `Hola ${escHtml3(p.hostName)},` : "Hola,";
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nueva reuni\xF3n agendada</title>
</head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #2563eb;">\u{1F4C5} Nueva reuni\xF3n agendada</h2>

  <p>${escHtml3(greeting)}</p>
  <p>Ten\xE9s una nueva reuni\xF3n confirmada en tu agenda:</p>

  <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
    <tr>
      <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold; width: 40%;">Evento</td>
      <td style="padding: 8px 12px;">${escHtml3(p.eventName)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold;">Invitado</td>
      <td style="padding: 8px 12px;">${escHtml3(p.guestName)} &lt;<a href="mailto:${escAttr2(p.guestEmail)}" style="color: #2563eb;">${escHtml3(p.guestEmail)}</a>&gt;</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold;">Fecha y hora</td>
      <td style="padding: 8px 12px;">${escHtml3(p.startLocalHost)}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold;">Duraci\xF3n</td>
      <td style="padding: 8px 12px;">${p.durationMin} minutos</td>
    </tr>
    ${p.location ? `<tr>
      <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold;">Ubicaci\xF3n / Link</td>
      <td style="padding: 8px 12px;"><a href="${escAttr2(p.location)}" style="color: #2563eb;">${escHtml3(p.location)}</a></td>
    </tr>` : ""}
    ${p.notes ? `<tr>
      <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold;">Notas</td>
      <td style="padding: 8px 12px;">${escHtml3(p.notes)}</td>
    </tr>` : ""}
  </table>

  <hr style="margin: 32px 0; border: none; border-top: 1px solid #e2e8f0;" />
  <p style="font-size: 12px; color: #64748b;">
    Este email fue enviado autom\xE1ticamente por tu sistema de agenda.
  </p>
</body>
</html>`;
}
function escHtml3(s) {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escAttr2(s) {
  if (!s) return "#";
  return s.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// src/modules/calendar/calendar.service.ts
function slugify(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
async function listMeetingTypes(portalId) {
  return db.select().from(meetingType).where(eq17(meetingType.portalId, portalId)).orderBy(asc3(meetingType.name));
}
async function createMeetingType(portalId, ownerId, input) {
  const [row] = await db.insert(meetingType).values({
    portalId,
    ownerId,
    slug: input.slug ? slugify(input.slug) : slugify(input.name),
    name: input.name,
    durationMin: input.durationMin,
    bufferMin: input.bufferMin ?? 10,
    location: input.location,
    description: input.description,
    isActive: input.isActive ?? true
  }).returning();
  if (!row) throw Errors.internal("No se pudo crear el tipo de reuni\xF3n");
  return row;
}
async function updateMeetingType(portalId, id, input) {
  const [existing] = await db.select().from(meetingType).where(and15(eq17(meetingType.portalId, portalId), eq17(meetingType.id, id))).limit(1);
  if (!existing) throw Errors.notFound("Tipo de reuni\xF3n no encontrado");
  const [row] = await db.update(meetingType).set({ ...input, slug: input.slug ? slugify(input.slug) : void 0 }).where(eq17(meetingType.id, id)).returning();
  return row;
}
async function deleteMeetingType(portalId, id) {
  const res = await db.delete(meetingType).where(and15(eq17(meetingType.portalId, portalId), eq17(meetingType.id, id))).returning({ id: meetingType.id });
  if (res.length === 0) throw Errors.notFound("Tipo de reuni\xF3n no encontrado");
}
async function listAvailabilityRules(ownerId) {
  return db.select().from(availabilityRule).where(eq17(availabilityRule.ownerId, ownerId)).orderBy(asc3(availabilityRule.dayOfWeek), asc3(availabilityRule.startTime));
}
async function createAvailabilityRule(ownerId, input) {
  if (input.endTime <= input.startTime) throw Errors.badRequest("La hora de fin debe ser posterior a la de inicio");
  const [row] = await db.insert(availabilityRule).values({
    ownerId,
    dayOfWeek: input.dayOfWeek,
    startTime: input.startTime,
    endTime: input.endTime,
    timeZone: input.timeZone ?? "America/Bogota"
  }).returning();
  if (!row) throw Errors.internal("No se pudo crear la regla");
  return row;
}
async function deleteAvailabilityRule(ownerId, id) {
  const res = await db.delete(availabilityRule).where(and15(eq17(availabilityRule.ownerId, ownerId), eq17(availabilityRule.id, id))).returning({ id: availabilityRule.id });
  if (res.length === 0) throw Errors.notFound("Regla no encontrada");
}
async function loadHostSchedule(mt, ownerId) {
  if (mt.availabilityScheduleId) {
    const [schedule] = await db.select().from(availabilitySchedule).where(eq17(availabilitySchedule.id, mt.availabilityScheduleId)).limit(1);
    if (!schedule) {
      return loadLegacyRules(ownerId);
    }
    const intervals = await db.select().from(availabilityInterval).where(eq17(availabilityInterval.scheduleId, schedule.id)).orderBy(asc3(availabilityInterval.dayOfWeek), asc3(availabilityInterval.startTime));
    const overrides = await db.select().from(dateOverride).where(eq17(dateOverride.scheduleId, schedule.id));
    const weeklyIntervals = intervals.map((i) => ({
      dayOfWeek: i.dayOfWeek,
      // Los campos time en Drizzle/PG llegan como string 'HH:MM:SS' → tomar solo 'HH:MM'
      startTime: i.startTime.slice(0, 5),
      endTime: i.endTime.slice(0, 5)
    }));
    const dateOverrides = overrides.map((o) => ({
      // date llega como string 'YYYY-MM-DD' desde Drizzle (campo date de PG)
      date: o.date,
      intervals: o.intervals ?? []
    }));
    return {
      timeZone: schedule.timeZone,
      intervals: weeklyIntervals,
      dateOverrides
    };
  }
  return loadLegacyRules(ownerId);
}
async function loadLegacyRules(ownerId) {
  const rules = await db.select().from(availabilityRule).where(eq17(availabilityRule.ownerId, ownerId)).orderBy(asc3(availabilityRule.dayOfWeek), asc3(availabilityRule.startTime));
  const timeZone = rules[0]?.timeZone ?? "America/Argentina/Buenos_Aires";
  const intervals = rules.map((r) => ({
    dayOfWeek: r.dayOfWeek,
    startTime: r.startTime.slice(0, 5),
    endTime: r.endTime.slice(0, 5)
  }));
  return {
    timeZone,
    intervals,
    dateOverrides: []
  };
}
function signBookingToken(bookingId, type, startsAt) {
  const nowSec = Math.floor(Date.now() / 1e3);
  const expSec = Math.floor(startsAt.getTime() / 1e3);
  const exp = Math.max(expSec, nowSec + 60);
  return jwt.sign(
    { sub: bookingId, type },
    env.ACCESS_TOKEN_SECRET,
    { expiresIn: exp - nowSec }
  );
}
function verifyBookingToken(token, expectedType) {
  try {
    const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET);
    if (decoded.type !== expectedType) {
      throw Errors.unauthorized("Tipo de token inv\xE1lido para esta operaci\xF3n");
    }
    return decoded;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw Errors.unauthorized("Token inv\xE1lido o expirado");
  }
}
async function getPublicEventType(portalId, eventSlug) {
  const [mt] = await db.select().from(meetingType).where(
    and15(
      eq17(meetingType.portalId, portalId),
      eq17(meetingType.slug, eventSlug),
      eq17(meetingType.isActive, true)
    )
  ).limit(1);
  if (!mt) throw Errors.notFound("Tipo de reuni\xF3n no encontrado o inactivo");
  return {
    id: mt.id,
    slug: mt.slug,
    name: mt.name,
    description: mt.description,
    durationMin: mt.durationMin,
    locations: mt.locations,
    customQuestions: mt.customQuestions,
    color: mt.color,
    kind: mt.kind,
    maxInvitees: mt.maxInvitees
  };
}
function toEventTypeConfig(mt) {
  return {
    durationMin: mt.durationMin,
    startTimeIncrementMin: mt.startTimeIncrementMin,
    minBookingNoticeMin: mt.minBookingNoticeMin,
    bufferBeforeMin: mt.bufferBeforeMin,
    bufferAfterMin: mt.bufferAfterMin,
    bookingWindowType: mt.bookingWindowType,
    bookingWindowDays: mt.bookingWindowDays,
    bookingWindowStart: mt.bookingWindowStart,
    bookingWindowEnd: mt.bookingWindowEnd,
    dailyLimit: mt.dailyLimit
  };
}
async function getSchedulesForMeetingType(mt) {
  if (mt.kind === "group") {
    const memberships = await db.select({ hostId: eventMembership.hostId }).from(eventMembership).where(eq17(eventMembership.meetingTypeId, mt.id));
    const hostIds = memberships.map((m) => m.hostId);
    if (hostIds.length === 0) return { schedules: [], hostIds: [] };
    const schedules = await Promise.all(hostIds.map((hostId) => loadHostSchedule(mt, hostId)));
    return { schedules, hostIds };
  }
  return { schedules: [await loadHostSchedule(mt, mt.ownerId)], hostIds: [mt.ownerId] };
}
async function getBusyBookings(hostIds, excludeBookingId) {
  if (hostIds.length === 0) return [];
  const rows = await db.select({ id: booking.id, startsAt: booking.startsAt, endsAt: booking.endsAt, status: booking.status }).from(booking).where(and15(inArray6(booking.ownerId, hostIds), eq17(booking.status, "confirmed")));
  return rows.filter((b) => b.id !== excludeBookingId).map((b) => ({
    startsAt: new Date(b.startsAt).toISOString(),
    endsAt: new Date(b.endsAt).toISOString(),
    status: b.status
  }));
}
async function assertSlotAvailable(mt, startsAtIso, excludeBookingId) {
  const startsAt = new Date(startsAtIso);
  if (Number.isNaN(startsAt.getTime())) throw Errors.badRequest("Fecha de inicio inv\xE1lida");
  const { schedules, hostIds } = await getSchedulesForMeetingType(mt);
  if (schedules.length === 0) {
    throw Errors.badRequest("El horario seleccionado no est\xE1 disponible");
  }
  const busy = await getBusyBookings(hostIds, excludeBookingId);
  const dayMs = 24 * 60 * 60 * 1e3;
  const fromDate = new Date(startsAt.getTime() - dayMs).toISOString().slice(0, 10);
  const toDate = new Date(startsAt.getTime() + dayMs).toISOString().slice(0, 10);
  const slots = computeSlots({
    eventType: toEventTypeConfig(mt),
    schedules,
    existingBookings: busy,
    fromDate,
    toDate,
    inviteeTimezone: "UTC",
    now: /* @__PURE__ */ new Date()
  });
  const target = startsAt.getTime();
  const available = slots.some((s) => new Date(s.startUtc).getTime() === target);
  if (!available) {
    throw Errors.badRequest("El horario seleccionado no est\xE1 disponible");
  }
}
async function getPublicSlots(portalId, eventSlug, from, to, tz) {
  const [mt] = await db.select().from(meetingType).where(
    and15(
      eq17(meetingType.portalId, portalId),
      eq17(meetingType.slug, eventSlug),
      eq17(meetingType.isActive, true)
    )
  ).limit(1);
  if (!mt) throw Errors.notFound("Tipo de reuni\xF3n no encontrado o inactivo");
  const { schedules, hostIds } = await getSchedulesForMeetingType(mt);
  if (schedules.length === 0) {
    return [];
  }
  const existingBookings = await getBusyBookings(hostIds);
  const slots = computeSlots({
    eventType: toEventTypeConfig(mt),
    schedules,
    existingBookings,
    fromDate: from,
    toDate: to,
    inviteeTimezone: tz,
    now: /* @__PURE__ */ new Date()
  });
  return slots.map((s) => ({
    startUtc: s.startUtc,
    endUtc: s.endUtc,
    startLocal: toInviteeDisplay(s.startUtc, tz, "yyyy-MM-dd HH:mm")
  }));
}
async function createPublicBooking(portalId, eventSlug, input, baseUrl) {
  const [mt] = await db.select().from(meetingType).where(
    and15(
      eq17(meetingType.portalId, portalId),
      eq17(meetingType.slug, eventSlug),
      eq17(meetingType.isActive, true)
    )
  ).limit(1);
  if (!mt) throw Errors.notFound("Tipo de reuni\xF3n no encontrado o inactivo");
  await assertSlotAvailable(mt, input.startsAt);
  const startsAt = new Date(input.startsAt);
  const endsAt = addMinutes2(startsAt, mt.durationMin);
  const [owner] = await db.select({ email: hubUser.email, firstName: hubUser.firstName, lastName: hubUser.lastName }).from(hubUser).where(eq17(hubUser.id, mt.ownerId)).limit(1);
  let newBooking;
  try {
    newBooking = await db.transaction(async (tx) => {
      const [row] = await tx.insert(booking).values({
        meetingTypeId: mt.id,
        ownerId: mt.ownerId,
        guestName: input.guestName,
        guestEmail: input.guestEmail,
        startsAt,
        endsAt,
        status: "confirmed",
        inviteeTimeZone: input.inviteeTimeZone,
        questionAnswers: input.questionAnswers ?? {},
        guestEmails: input.guestEmails ?? [],
        notes: input.notes ?? null
      }).returning();
      if (!row) throw Errors.internal("No se pudo crear el booking");
      return row;
    });
  } catch (err) {
    const pgErr = err;
    if (pgErr.code === "23P01") {
      throw Errors.conflict("El horario seleccionado ya fue reservado. Por favor eleg\xED otro slot.");
    }
    throw err;
  }
  const cancelToken = signBookingToken(newBooking.id, "booking-cancel", startsAt);
  const rescheduleToken = signBookingToken(newBooking.id, "booking-reschedule", startsAt);
  const [updated] = await db.update(booking).set({ cancelToken, rescheduleToken }).where(eq17(booking.id, newBooking.id)).returning();
  const finalBooking = updated ?? newBooking;
  const cancelUrl = `${baseUrl}/book/cancel?token=${cancelToken}`;
  const rescheduleUrl = `${baseUrl}/book/reschedule?token=${rescheduleToken}`;
  const startLocal = toInviteeDisplay(startsAt.toISOString(), input.inviteeTimeZone, "yyyy-MM-dd HH:mm");
  const location = Array.isArray(mt.locations) && mt.locations.length > 0 ? mt.locations[0]?.link ?? mt.locations[0]?.address ?? null : null;
  try {
    await sendEmail({
      to: input.guestEmail,
      subject: `Confirmaci\xF3n: ${mt.name}`,
      html: bookingConfirmInviteeHtml({
        guestName: input.guestName,
        eventName: mt.name,
        startLocal: `${startLocal} (${input.inviteeTimeZone})`,
        durationMin: mt.durationMin,
        location,
        cancelUrl,
        rescheduleUrl
      })
    });
  } catch (emailErr) {
    console.error("[calendar.service] Error al enviar email de confirmaci\xF3n al invitado", emailErr);
  }
  if (owner?.email) {
    try {
      const ownerSchedule = await loadHostSchedule(mt, mt.ownerId);
      const startLocalHost = formatTz2(
        toZonedTime2(startsAt, ownerSchedule.timeZone),
        "yyyy-MM-dd HH:mm",
        { timeZone: ownerSchedule.timeZone }
      );
      await sendEmail({
        to: owner.email,
        subject: `Nueva reuni\xF3n: ${mt.name} con ${input.guestName}`,
        html: bookingHostNotifyHtml({
          hostEmail: owner.email,
          hostName: owner.firstName,
          guestName: input.guestName,
          guestEmail: input.guestEmail,
          eventName: mt.name,
          startLocalHost: `${startLocalHost} (${ownerSchedule.timeZone})`,
          durationMin: mt.durationMin,
          location,
          notes: input.notes ?? null
        })
      });
    } catch (emailErr) {
      console.error("[calendar.service] Error al enviar email de notificaci\xF3n al host", emailErr);
    }
  }
  return {
    booking: finalBooking,
    cancelUrl,
    rescheduleUrl
  };
}
async function cancelPublicBooking(token) {
  const decoded = verifyBookingToken(token, "booking-cancel");
  const [existing] = await db.select().from(booking).where(eq17(booking.id, decoded.sub)).limit(1);
  if (!existing) throw Errors.notFound("Booking no encontrado");
  if (existing.cancelToken !== token) {
    throw Errors.unauthorized("Token de cancelaci\xF3n ya revocado o inv\xE1lido");
  }
  if (existing.status === "cancelled") {
    throw Errors.conflict("El booking ya est\xE1 cancelado");
  }
  const [cancelled] = await db.update(booking).set({
    status: "cancelled",
    cancelledAt: /* @__PURE__ */ new Date(),
    cancelToken: null
    // Revocar para que no pueda usarse dos veces
  }).where(eq17(booking.id, existing.id)).returning();
  const [mt] = await db.select({ name: meetingType.name }).from(meetingType).where(eq17(meetingType.id, existing.meetingTypeId)).limit(1);
  try {
    const startLocal = toInviteeDisplay(
      new Date(existing.startsAt).toISOString(),
      existing.inviteeTimeZone,
      "yyyy-MM-dd HH:mm"
    );
    await sendEmail({
      to: existing.guestEmail,
      subject: `Reuni\xF3n cancelada: ${mt?.name ?? "Reuni\xF3n"}`,
      html: bookingCancelledHtml({
        guestName: existing.guestName,
        eventName: mt?.name ?? "Reuni\xF3n",
        startLocal: `${startLocal} (${existing.inviteeTimeZone})`
      })
    });
  } catch (emailErr) {
    console.error("[calendar.service] Error al enviar email de cancelaci\xF3n", emailErr);
  }
  return { booking: cancelled ?? existing };
}
async function reschedulePublicBooking(token, rescheduleData, baseUrl) {
  const decoded = verifyBookingToken(token, "booking-reschedule");
  const [original] = await db.select().from(booking).where(eq17(booking.id, decoded.sub)).limit(1);
  if (!original) throw Errors.notFound("Booking no encontrado");
  if (original.rescheduleToken !== token) {
    throw Errors.unauthorized("Token de reprogramaci\xF3n ya revocado o inv\xE1lido");
  }
  if (original.status === "cancelled") {
    throw Errors.badRequest("No se puede reprogramar un booking cancelado");
  }
  const [mt] = await db.select().from(meetingType).where(eq17(meetingType.id, original.meetingTypeId)).limit(1);
  if (!mt) throw Errors.notFound("Tipo de reuni\xF3n no encontrado");
  await assertSlotAvailable(mt, rescheduleData.newStartsAt, original.id);
  const newStartsAt = new Date(rescheduleData.newStartsAt);
  const newEndsAt = addMinutes2(newStartsAt, mt.durationMin);
  const inviteeTimeZone = rescheduleData.inviteeTimeZone ?? original.inviteeTimeZone;
  let newBooking;
  try {
    newBooking = await db.transaction(async (tx) => {
      await tx.update(booking).set({
        status: "cancelled",
        cancelledAt: /* @__PURE__ */ new Date(),
        cancelToken: null,
        rescheduleToken: null
        // Revocar ambos tokens del original
      }).where(eq17(booking.id, original.id));
      const [row] = await tx.insert(booking).values({
        meetingTypeId: original.meetingTypeId,
        ownerId: original.ownerId,
        contactId: original.contactId,
        dealId: original.dealId,
        guestName: original.guestName,
        guestEmail: original.guestEmail,
        startsAt: newStartsAt,
        endsAt: newEndsAt,
        status: "confirmed",
        inviteeTimeZone,
        questionAnswers: original.questionAnswers,
        guestEmails: original.guestEmails,
        notes: original.notes,
        rescheduledFromId: original.id
      }).returning();
      if (!row) throw Errors.internal("No se pudo crear el booking reprogramado");
      return row;
    });
  } catch (err) {
    const pgErr = err;
    if (pgErr.code === "23P01") {
      throw Errors.conflict("El nuevo horario ya fue reservado. Por favor eleg\xED otro slot.");
    }
    throw err;
  }
  const cancelToken = signBookingToken(newBooking.id, "booking-cancel", newStartsAt);
  const rescheduleToken = signBookingToken(newBooking.id, "booking-reschedule", newStartsAt);
  const [updated] = await db.update(booking).set({ cancelToken, rescheduleToken }).where(eq17(booking.id, newBooking.id)).returning();
  const finalBooking = updated ?? newBooking;
  const cancelUrl = `${baseUrl}/book/cancel?token=${cancelToken}`;
  const rescheduleUrl = `${baseUrl}/book/reschedule?token=${rescheduleToken}`;
  const startLocal = toInviteeDisplay(newStartsAt.toISOString(), inviteeTimeZone, "yyyy-MM-dd HH:mm");
  const location = Array.isArray(mt.locations) && mt.locations.length > 0 ? mt.locations[0]?.link ?? mt.locations[0]?.address ?? null : null;
  try {
    await sendEmail({
      to: original.guestEmail,
      subject: `Reuni\xF3n reprogramada: ${mt.name}`,
      html: bookingConfirmInviteeHtml({
        guestName: original.guestName,
        eventName: mt.name,
        startLocal: `${startLocal} (${inviteeTimeZone})`,
        durationMin: mt.durationMin,
        location,
        cancelUrl,
        rescheduleUrl
      })
    });
  } catch (emailErr) {
    console.error("[calendar.service] Error al enviar email de reprogramaci\xF3n", emailErr);
  }
  return {
    booking: finalBooking,
    cancelUrl,
    rescheduleUrl
  };
}
async function listSchedules(portalId) {
  const schedules = await db.select().from(availabilitySchedule).where(eq17(availabilitySchedule.portalId, portalId)).orderBy(asc3(availabilitySchedule.name));
  if (schedules.length === 0) return [];
  const scheduleIds = schedules.map((s) => s.id);
  const [intervals, overrides] = await Promise.all([
    db.select().from(availabilityInterval).where(inArray6(availabilityInterval.scheduleId, scheduleIds)).orderBy(asc3(availabilityInterval.dayOfWeek), asc3(availabilityInterval.startTime)),
    db.select().from(dateOverride).where(inArray6(dateOverride.scheduleId, scheduleIds))
  ]);
  return schedules.map((s) => ({
    ...s,
    intervals: intervals.filter((i) => i.scheduleId === s.id),
    dateOverrides: overrides.filter((o) => o.scheduleId === s.id)
  }));
}
async function getSchedule(portalId, scheduleId) {
  const [schedule] = await db.select().from(availabilitySchedule).where(and15(eq17(availabilitySchedule.id, scheduleId), eq17(availabilitySchedule.portalId, portalId))).limit(1);
  if (!schedule) throw Errors.notFound("Schedule no encontrado");
  const [intervals, overrides] = await Promise.all([
    db.select().from(availabilityInterval).where(eq17(availabilityInterval.scheduleId, scheduleId)).orderBy(asc3(availabilityInterval.dayOfWeek), asc3(availabilityInterval.startTime)),
    db.select().from(dateOverride).where(eq17(dateOverride.scheduleId, scheduleId))
  ]);
  return { ...schedule, intervals, dateOverrides: overrides };
}
async function createSchedule(portalId, ownerId, input) {
  return db.transaction(async (tx) => {
    const existing = await tx.select({ id: availabilitySchedule.id }).from(availabilitySchedule).where(
      and15(eq17(availabilitySchedule.portalId, portalId), eq17(availabilitySchedule.ownerId, ownerId))
    );
    const makeDefault = input.isDefault === true || existing.length === 0;
    if (makeDefault && existing.length > 0) {
      await tx.update(availabilitySchedule).set({ isDefault: false }).where(
        and15(
          eq17(availabilitySchedule.portalId, portalId),
          eq17(availabilitySchedule.ownerId, ownerId)
        )
      );
    }
    const [row] = await tx.insert(availabilitySchedule).values({ portalId, ownerId, name: input.name, timeZone: input.timeZone, isDefault: makeDefault }).returning();
    if (!row) throw Errors.internal("No se pudo crear el schedule");
    return { ...row, intervals: [], dateOverrides: [] };
  });
}
async function updateSchedule(portalId, scheduleId, input) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(availabilitySchedule).where(and15(eq17(availabilitySchedule.id, scheduleId), eq17(availabilitySchedule.portalId, portalId))).limit(1);
    if (!existing) throw Errors.notFound("Schedule no encontrado");
    if (input.isDefault === true && !existing.isDefault) {
      await tx.update(availabilitySchedule).set({ isDefault: false }).where(
        and15(
          eq17(availabilitySchedule.portalId, portalId),
          eq17(availabilitySchedule.ownerId, existing.ownerId)
        )
      );
    }
    const updateData = {};
    if (input.name !== void 0) updateData.name = input.name;
    if (input.timeZone !== void 0) updateData.timeZone = input.timeZone;
    if (input.isDefault !== void 0) updateData.isDefault = input.isDefault;
    const [updated] = await tx.update(availabilitySchedule).set(updateData).where(eq17(availabilitySchedule.id, scheduleId)).returning();
    if (!updated) throw Errors.internal("No se pudo actualizar el schedule");
    const [intervals, overrides] = await Promise.all([
      tx.select().from(availabilityInterval).where(eq17(availabilityInterval.scheduleId, scheduleId)).orderBy(asc3(availabilityInterval.dayOfWeek), asc3(availabilityInterval.startTime)),
      tx.select().from(dateOverride).where(eq17(dateOverride.scheduleId, scheduleId))
    ]);
    return { ...updated, intervals, dateOverrides: overrides };
  });
}
async function deleteSchedule(portalId, scheduleId) {
  const res = await db.delete(availabilitySchedule).where(and15(eq17(availabilitySchedule.id, scheduleId), eq17(availabilitySchedule.portalId, portalId))).returning({ id: availabilitySchedule.id });
  if (res.length === 0) throw Errors.notFound("Schedule no encontrado");
}
async function assertScheduleOwnership(portalId, scheduleId) {
  const [s] = await db.select({ id: availabilitySchedule.id }).from(availabilitySchedule).where(and15(eq17(availabilitySchedule.id, scheduleId), eq17(availabilitySchedule.portalId, portalId))).limit(1);
  if (!s) throw Errors.notFound("Schedule no encontrado");
}
async function addScheduleInterval(portalId, scheduleId, input) {
  await assertScheduleOwnership(portalId, scheduleId);
  if (input.endTime <= input.startTime) {
    throw Errors.badRequest("La hora de fin debe ser posterior a la de inicio");
  }
  const [row] = await db.insert(availabilityInterval).values({
    scheduleId,
    dayOfWeek: input.dayOfWeek,
    startTime: input.startTime,
    endTime: input.endTime
  }).returning();
  if (!row) throw Errors.internal("No se pudo agregar el intervalo");
  return row;
}
async function replaceScheduleIntervals(portalId, scheduleId, input) {
  await assertScheduleOwnership(portalId, scheduleId);
  for (const interval of input.intervals) {
    if (interval.endTime <= interval.startTime) {
      throw Errors.badRequest(
        `Intervalo del d\xEDa ${interval.dayOfWeek}: la hora de fin debe ser posterior a la de inicio`
      );
    }
  }
  return db.transaction(async (tx) => {
    await tx.delete(availabilityInterval).where(eq17(availabilityInterval.scheduleId, scheduleId));
    if (input.intervals.length === 0) return [];
    const rows = await tx.insert(availabilityInterval).values(
      input.intervals.map((i) => ({
        scheduleId,
        dayOfWeek: i.dayOfWeek,
        startTime: i.startTime,
        endTime: i.endTime
      }))
    ).returning();
    return rows;
  });
}
async function deleteScheduleInterval(portalId, scheduleId, intervalId) {
  await assertScheduleOwnership(portalId, scheduleId);
  const res = await db.delete(availabilityInterval).where(
    and15(eq17(availabilityInterval.id, intervalId), eq17(availabilityInterval.scheduleId, scheduleId))
  ).returning({ id: availabilityInterval.id });
  if (res.length === 0) throw Errors.notFound("Intervalo no encontrado");
}
async function upsertDateOverride(portalId, scheduleId, input) {
  await assertScheduleOwnership(portalId, scheduleId);
  const [existing] = await db.select().from(dateOverride).where(and15(eq17(dateOverride.scheduleId, scheduleId), eq17(dateOverride.date, input.date))).limit(1);
  if (existing) {
    const [updated] = await db.update(dateOverride).set({ intervals: input.intervals }).where(eq17(dateOverride.id, existing.id)).returning();
    return updated;
  }
  const [row] = await db.insert(dateOverride).values({ scheduleId, date: input.date, intervals: input.intervals }).returning();
  if (!row) throw Errors.internal("No se pudo crear el override");
  return row;
}
async function deleteDateOverride(portalId, scheduleId, overrideId) {
  await assertScheduleOwnership(portalId, scheduleId);
  const res = await db.delete(dateOverride).where(and15(eq17(dateOverride.id, overrideId), eq17(dateOverride.scheduleId, scheduleId))).returning({ id: dateOverride.id });
  if (res.length === 0) throw Errors.notFound("Override no encontrado");
}
function toEventTypeV2(mt, hosts) {
  return {
    id: mt.id,
    portalId: mt.portalId,
    ownerId: mt.ownerId,
    slug: mt.slug,
    name: mt.name,
    durationMin: mt.durationMin,
    kind: mt.kind,
    poolingType: mt.poolingType,
    color: mt.color,
    secret: mt.secret,
    description: mt.description,
    isActive: mt.isActive,
    locations: mt.locations,
    customQuestions: mt.customQuestions,
    startTimeIncrementMin: mt.startTimeIncrementMin,
    minBookingNoticeMin: mt.minBookingNoticeMin,
    bookingWindowType: mt.bookingWindowType,
    bookingWindowDays: mt.bookingWindowDays,
    bookingWindowStart: mt.bookingWindowStart,
    bookingWindowEnd: mt.bookingWindowEnd,
    bufferBeforeMin: mt.bufferBeforeMin,
    bufferAfterMin: mt.bufferAfterMin,
    dailyLimit: mt.dailyLimit,
    maxInvitees: mt.maxInvitees,
    availabilityScheduleId: mt.availabilityScheduleId,
    hosts
  };
}
async function listEventTypesV2(portalId) {
  const types = await db.select().from(meetingType).where(eq17(meetingType.portalId, portalId)).orderBy(asc3(meetingType.name));
  if (types.length === 0) return [];
  const typeIds = types.map((t) => t.id);
  const memberships = await db.select({ meetingTypeId: eventMembership.meetingTypeId, hostId: eventMembership.hostId }).from(eventMembership).where(inArray6(eventMembership.meetingTypeId, typeIds));
  return types.map((t) => {
    const hosts = memberships.filter((m) => m.meetingTypeId === t.id).map((m) => m.hostId);
    return toEventTypeV2(t, hosts);
  });
}
async function getEventTypeV2(portalId, id) {
  const [mt] = await db.select().from(meetingType).where(and15(eq17(meetingType.id, id), eq17(meetingType.portalId, portalId))).limit(1);
  if (!mt) throw Errors.notFound("Event type no encontrado");
  const memberships = await db.select({ hostId: eventMembership.hostId }).from(eventMembership).where(eq17(eventMembership.meetingTypeId, id));
  return toEventTypeV2(mt, memberships.map((m) => m.hostId));
}
async function createEventTypeV2(portalId, ownerId, input) {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(meetingType).values({
      portalId,
      ownerId,
      slug: input.slug ? slugify(input.slug) : slugify(input.name),
      name: input.name,
      durationMin: input.durationMin,
      kind: input.kind ?? "solo",
      poolingType: input.poolingType ?? null,
      color: input.color ?? "#3b82f6",
      secret: input.secret ?? false,
      description: input.description ?? null,
      isActive: input.isActive ?? true,
      locations: input.locations ?? [],
      customQuestions: input.customQuestions ?? [],
      startTimeIncrementMin: input.startTimeIncrementMin ?? 30,
      minBookingNoticeMin: input.minBookingNoticeMin ?? 240,
      bookingWindowType: input.bookingWindowType ?? "rolling",
      bookingWindowDays: input.bookingWindowDays ?? null,
      bookingWindowStart: input.bookingWindowStart ?? null,
      bookingWindowEnd: input.bookingWindowEnd ?? null,
      bufferBeforeMin: input.bufferBeforeMin ?? 0,
      bufferAfterMin: input.bufferAfterMin ?? 0,
      dailyLimit: input.dailyLimit ?? null,
      maxInvitees: input.maxInvitees ?? 1,
      availabilityScheduleId: input.availabilityScheduleId ?? null,
      // bufferMin se mantiene para compatibilidad con el schema legacy
      bufferMin: 0
    }).returning();
    if (!row) throw Errors.internal("No se pudo crear el event type");
    const hostIds = input.hostIds ?? [];
    if (hostIds.length > 0) {
      await tx.insert(eventMembership).values(hostIds.map((hostId) => ({ meetingTypeId: row.id, hostId })));
    }
    return toEventTypeV2(row, hostIds);
  });
}
async function updateEventTypeV2(portalId, id, input) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(meetingType).where(and15(eq17(meetingType.id, id), eq17(meetingType.portalId, portalId))).limit(1);
    if (!existing) throw Errors.notFound("Event type no encontrado");
    const updateData = {};
    if (input.name !== void 0) updateData.name = input.name;
    if (input.slug !== void 0) updateData.slug = slugify(input.slug);
    if (input.durationMin !== void 0) updateData.durationMin = input.durationMin;
    if (input.kind !== void 0) updateData.kind = input.kind;
    if (input.poolingType !== void 0) updateData.poolingType = input.poolingType ?? null;
    if (input.color !== void 0) updateData.color = input.color;
    if (input.secret !== void 0) updateData.secret = input.secret;
    if (input.description !== void 0) updateData.description = input.description;
    if (input.isActive !== void 0) updateData.isActive = input.isActive;
    if (input.locations !== void 0) updateData.locations = input.locations;
    if (input.customQuestions !== void 0) updateData.customQuestions = input.customQuestions;
    if (input.startTimeIncrementMin !== void 0) updateData.startTimeIncrementMin = input.startTimeIncrementMin;
    if (input.minBookingNoticeMin !== void 0) updateData.minBookingNoticeMin = input.minBookingNoticeMin;
    if (input.bookingWindowType !== void 0) updateData.bookingWindowType = input.bookingWindowType;
    if (input.bookingWindowDays !== void 0) updateData.bookingWindowDays = input.bookingWindowDays;
    if (input.bookingWindowStart !== void 0) updateData.bookingWindowStart = input.bookingWindowStart;
    if (input.bookingWindowEnd !== void 0) updateData.bookingWindowEnd = input.bookingWindowEnd;
    if (input.bufferBeforeMin !== void 0) updateData.bufferBeforeMin = input.bufferBeforeMin;
    if (input.bufferAfterMin !== void 0) updateData.bufferAfterMin = input.bufferAfterMin;
    if (input.dailyLimit !== void 0) updateData.dailyLimit = input.dailyLimit;
    if (input.maxInvitees !== void 0) updateData.maxInvitees = input.maxInvitees;
    if (input.availabilityScheduleId !== void 0) updateData.availabilityScheduleId = input.availabilityScheduleId;
    const [updated] = await tx.update(meetingType).set(updateData).where(eq17(meetingType.id, id)).returning();
    if (!updated) throw Errors.internal("No se pudo actualizar el event type");
    let hostIds;
    if (input.hostIds !== void 0) {
      await tx.delete(eventMembership).where(eq17(eventMembership.meetingTypeId, id));
      if (input.hostIds.length > 0) {
        await tx.insert(eventMembership).values(input.hostIds.map((hostId) => ({ meetingTypeId: id, hostId })));
      }
      hostIds = input.hostIds;
    } else {
      const memberships = await tx.select({ hostId: eventMembership.hostId }).from(eventMembership).where(eq17(eventMembership.meetingTypeId, id));
      hostIds = memberships.map((m) => m.hostId);
    }
    return toEventTypeV2(updated, hostIds);
  });
}
async function deleteEventTypeV2(portalId, id) {
  const res = await db.delete(meetingType).where(and15(eq17(meetingType.id, id), eq17(meetingType.portalId, portalId))).returning({ id: meetingType.id });
  if (res.length === 0) throw Errors.notFound("Event type no encontrado");
}
async function listWeekBookings(portalId, from, to) {
  const fromDate = /* @__PURE__ */ new Date(`${from}T00:00:00.000Z`);
  const toDate = /* @__PURE__ */ new Date(`${to}T23:59:59.999Z`);
  return db.select({
    id: booking.id,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    status: booking.status,
    meetLink: booking.meetLink,
    inviteeTimeZone: booking.inviteeTimeZone,
    meetingTypeName: meetingType.name,
    meetingTypeColor: meetingType.color
  }).from(booking).innerJoin(meetingType, eq17(booking.meetingTypeId, meetingType.id)).where(
    and15(
      eq17(meetingType.portalId, portalId),
      gte2(booking.startsAt, fromDate),
      lte2(booking.startsAt, toDate)
    )
  ).orderBy(asc3(booking.startsAt));
}
async function cancelAdminBooking(portalId, bookingId) {
  const [existing] = await db.select({
    id: booking.id,
    status: booking.status,
    portalId: meetingType.portalId
  }).from(booking).innerJoin(meetingType, eq17(booking.meetingTypeId, meetingType.id)).where(eq17(booking.id, bookingId)).limit(1);
  if (!existing) throw Errors.notFound("Booking no encontrado");
  if (existing.portalId !== portalId) throw Errors.notFound("Booking no encontrado");
  if (existing.status === "cancelled") {
    throw Errors.conflict("El booking ya est\xE1 cancelado");
  }
  const [cancelled] = await db.update(booking).set({
    status: "cancelled",
    cancelledAt: /* @__PURE__ */ new Date(),
    cancelToken: null,
    rescheduleToken: null
  }).where(eq17(booking.id, bookingId)).returning({ id: booking.id });
  return { bookingId: cancelled.id };
}
async function listBookings(portalId) {
  return db.select({
    id: booking.id,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    status: booking.status,
    meetLink: booking.meetLink,
    meetingTypeName: meetingType.name
  }).from(booking).innerJoin(meetingType, eq17(booking.meetingTypeId, meetingType.id)).where(eq17(meetingType.portalId, portalId)).orderBy(asc3(booking.startsAt)).limit(100);
}

// src/modules/calendar/calendar.router.ts
var TAG9 = "Calendario";
var security9 = ADMIN_SECURITY;
async function calendarRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/meeting-types",
    { schema: { tags: [TAG9], summary: "Listar tipos de reuni\xF3n", security: security9 } },
    async (request) => ok(await listMeetingTypes(request.hubUser.portalId))
  );
  r.post(
    "/meeting-types",
    { schema: { tags: [TAG9], summary: "Crear tipo de reuni\xF3n", security: security9, body: CreateMeetingTypeSchema }, preHandler: [authorize("owner", "member")] },
    async (request, reply) => {
      const created = await createMeetingType(request.hubUser.portalId, request.hubUser.sub, request.body);
      return reply.status(201).send(ok(created));
    }
  );
  r.patch(
    "/meeting-types/:id",
    { schema: { tags: [TAG9], summary: "Actualizar tipo de reuni\xF3n", security: security9, params: IdParamSchema, body: UpdateMeetingTypeSchema }, preHandler: [authorize("owner", "member")] },
    async (request) => ok(await updateMeetingType(request.hubUser.portalId, request.params.id, request.body))
  );
  r.delete(
    "/meeting-types/:id",
    { schema: { tags: [TAG9], summary: "Eliminar tipo de reuni\xF3n", security: security9, params: IdParamSchema }, preHandler: [authorize("owner", "member")] },
    async (request) => {
      await deleteMeetingType(request.hubUser.portalId, request.params.id);
      return ok({ success: true });
    }
  );
  r.get(
    "/availability",
    { schema: { tags: [TAG9], summary: "Listar reglas de disponibilidad", description: "Reglas semanales del usuario autenticado.", security: security9 } },
    async (request) => ok(await listAvailabilityRules(request.hubUser.sub))
  );
  r.post(
    "/availability",
    { schema: { tags: [TAG9], summary: "Crear regla de disponibilidad", security: security9, body: CreateAvailabilityRuleSchema }, preHandler: [authorize("owner", "member")] },
    async (request, reply) => {
      const created = await createAvailabilityRule(request.hubUser.sub, request.body);
      return reply.status(201).send(ok(created));
    }
  );
  r.delete(
    "/availability/:id",
    { schema: { tags: [TAG9], summary: "Eliminar regla de disponibilidad", security: security9, params: IdParamSchema }, preHandler: [authorize("owner", "member")] },
    async (request) => {
      await deleteAvailabilityRule(request.hubUser.sub, request.params.id);
      return ok({ success: true });
    }
  );
  r.get(
    "/bookings",
    { schema: { tags: [TAG9], summary: "Listar reuniones agendadas", security: security9 } },
    async (request) => ok(await listBookings(request.hubUser.portalId))
  );
}

// src/modules/users/users.schema.ts
import { z as z12 } from "zod";
var CreateUserSchema = z12.object({
  email: z12.string().email(),
  firstName: z12.string().optional(),
  lastName: z12.string().optional(),
  // Roles: owner = acceso total; member = CRM + finanzas; viewer = solo lectura;
  // collaborator = opera el CRM pero sin acceso a finanzas ni administración
  role: z12.enum(["owner", "member", "viewer", "collaborator"])
});
var UpdateUserSchema = z12.object({
  firstName: z12.string().optional(),
  lastName: z12.string().optional(),
  role: z12.enum(["owner", "member", "viewer", "collaborator"]).optional(),
  isActive: z12.boolean().optional()
}).partial();

// src/modules/users/users.service.ts
import { and as and16, asc as asc4, eq as eq18 } from "drizzle-orm";
var publicCols = {
  id: hubUser.id,
  email: hubUser.email,
  firstName: hubUser.firstName,
  lastName: hubUser.lastName,
  role: hubUser.role,
  isActive: hubUser.isActive
};
async function listUsers(portalId) {
  return db.select(publicCols).from(hubUser).where(eq18(hubUser.portalId, portalId)).orderBy(asc4(hubUser.id));
}
async function createUser(portalId, input) {
  const [existing] = await db.select({ id: hubUser.id }).from(hubUser).where(and16(eq18(hubUser.portalId, portalId), eq18(hubUser.email, input.email))).limit(1);
  if (existing) throw Errors.conflict("Ya existe un usuario con ese email");
  const [row] = await db.insert(hubUser).values({
    portalId,
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    role: input.role
  }).returning(publicCols);
  if (!row) throw Errors.internal("No se pudo crear el usuario");
  const clerkUserId = await ensureClerkUserType({
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    userType: "admin"
  });
  if (clerkUserId) {
    await db.update(hubUser).set({ clerkUserId }).where(eq18(hubUser.id, row.id));
  }
  return row;
}
async function updateUser(portalId, id, input) {
  const [existing] = await db.select({ id: hubUser.id }).from(hubUser).where(and16(eq18(hubUser.portalId, portalId), eq18(hubUser.id, id))).limit(1);
  if (!existing) throw Errors.notFound("Usuario no encontrado");
  const [row] = await db.update(hubUser).set({ ...input, updatedAt: /* @__PURE__ */ new Date() }).where(eq18(hubUser.id, id)).returning(publicCols);
  return row;
}

// src/modules/users/users.router.ts
var TAG10 = "Usuarios";
var security10 = ADMIN_SECURITY;
async function usersRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/",
    { schema: { tags: [TAG10], summary: "Listar usuarios del equipo", security: security10 } },
    async (request) => ok(await listUsers(request.hubUser.portalId))
  );
  r.post(
    "/",
    { schema: { tags: [TAG10], summary: "Crear usuario", description: "Crea un hub_user. Solo owner.", security: security10, body: CreateUserSchema }, preHandler: [authorize("owner")] },
    async (request, reply) => {
      const created = await createUser(request.hubUser.portalId, request.body);
      return reply.status(201).send(ok(created));
    }
  );
  r.patch(
    "/:id",
    { schema: { tags: [TAG10], summary: "Actualizar usuario", description: "Rol, estado o nombre. Solo owner.", security: security10, params: IdParamSchema, body: UpdateUserSchema }, preHandler: [authorize("owner")] },
    async (request) => ok(await updateUser(request.hubUser.portalId, request.params.id, request.body))
  );
}

// src/modules/settings/settings.service.ts
import { eq as eq19 } from "drizzle-orm";
import { z as z13 } from "zod";
var UpdatePortalSchema = z13.object({
  name: z13.string().min(1).optional(),
  timeZone: z13.string().optional(),
  currency: z13.string().length(3).optional()
});
async function getPortal(portalId) {
  const [row] = await db.select().from(portal).where(eq19(portal.id, portalId)).limit(1);
  if (!row) throw Errors.notFound("Portal no encontrado");
  return row;
}
async function updatePortal(portalId, input) {
  const [row] = await db.update(portal).set({ ...input, updatedAt: /* @__PURE__ */ new Date() }).where(eq19(portal.id, portalId)).returning();
  if (!row) throw Errors.notFound("Portal no encontrado");
  return row;
}

// src/modules/settings/settings.router.ts
var TAG11 = "Configuraci\xF3n";
var security11 = ADMIN_SECURITY;
async function settingsRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/portal",
    { schema: { tags: [TAG11], summary: "Datos del portal", security: security11 } },
    async (request) => ok(await getPortal(request.hubUser.portalId))
  );
  r.patch(
    "/portal",
    { schema: { tags: [TAG11], summary: "Actualizar portal", description: "Nombre, zona horaria y moneda. Solo owner.", security: security11, body: UpdatePortalSchema }, preHandler: [authorize("owner")] },
    async (request) => ok(await updatePortal(request.hubUser.portalId, request.body))
  );
}

// src/middleware/authenticate-client.ts
async function authenticateClient(request, _reply) {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw Errors.unauthorized("Falta el token de acceso del cliente");
  }
  const clerkUserId = await verifyClerkToken(header.slice("Bearer ".length));
  request.clientAccount = await resolveClientAccount(clerkUserId);
}

// src/modules/client-auth/client-auth.service.ts
import { eq as eq20 } from "drizzle-orm";
function toPublicClient(row) {
  return {
    id: row.id,
    email: row.email,
    portalId: row.portalId,
    contactId: row.contactId,
    isActive: row.isActive,
    inviteAccepted: row.inviteAccepted,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt
  };
}
async function getClientAccount(id) {
  const [account] = await db.select().from(clientAccount).where(eq20(clientAccount.id, id)).limit(1);
  if (!account) throw Errors.notFound("Cuenta de cliente no encontrada");
  return toPublicClient(account);
}

// src/modules/client-auth/client-auth.router.ts
async function clientAuthRoutes(app2) {
  const r = app2.withTypeProvider();
  r.get(
    "/me",
    {
      schema: {
        tags: ["Client Portal"],
        summary: "Cliente autenticado actual",
        description: "Devuelve los datos p\xFAblicos del clientAccount resuelto desde la sesi\xF3n de Clerk. Requiere header Authorization: Bearer <clerk_session_token>.",
        security: [{ bearerAuth: [] }]
      },
      preHandler: [authenticateClient]
    },
    async (request) => {
      const client4 = await getClientAccount(request.clientAccount.sub);
      return ok(client4);
    }
  );
}

// src/modules/deliverables/deliverables.schema.ts
import { z as z14 } from "zod";
var DeliverableTypeEnum = z14.enum(["design", "prototype", "staging", "final"]);
var DeliverableStatusEnum = z14.enum(["pending_review", "approved", "changes_requested"]);
var CreateDeliverableSchema = z14.object({
  dealId: z14.string().min(1),
  title: z14.string().min(1),
  type: DeliverableTypeEnum,
  url: z14.string().url().optional(),
  description: z14.string().optional()
});
var UpdateDeliverableSchema = z14.object({
  title: z14.string().min(1),
  url: z14.string().url(),
  description: z14.string(),
  status: DeliverableStatusEnum,
  feedback: z14.string()
}).partial();
var DeliverableListQuerySchema = z14.object({
  dealId: z14.string().min(1).optional()
});

// src/modules/deliverables/deliverables.service.ts
import { and as and17, desc as desc10, eq as eq21 } from "drizzle-orm";
async function requireDeliverableInPortal(tx, id, portalId) {
  const [row] = await tx.select({ deliverable }).from(deliverable).innerJoin(deal, and17(eq21(deal.id, deliverable.dealId), eq21(deal.portalId, portalId), eq21(deal.archived, false))).where(eq21(deliverable.id, id)).limit(1);
  if (!row) throw Errors.notFound("Entregable no encontrado");
  return row.deliverable;
}
async function listDeliverables(portalId, query) {
  const rows = await db.select({ deliverable }).from(deliverable).innerJoin(deal, and17(eq21(deal.id, deliverable.dealId), eq21(deal.portalId, portalId), eq21(deal.archived, false))).where(query.dealId ? eq21(deliverable.dealId, query.dealId) : void 0).orderBy(desc10(deliverable.createdAt));
  return rows.map((r) => r.deliverable);
}
async function createDeliverable(portalId, userId, input) {
  return db.transaction(async (tx) => {
    await assertDealInPortal(portalId, input.dealId);
    const [row] = await tx.insert(deliverable).values({
      dealId: input.dealId,
      title: input.title,
      type: input.type,
      url: input.url ?? null,
      description: input.description ?? null,
      createdBy: userId
    }).returning();
    if (!row) throw Errors.internal("No se pudo crear el entregable");
    return row;
  });
}
async function updateDeliverable(portalId, id, input) {
  return db.transaction(async (tx) => {
    await requireDeliverableInPortal(tx, id, portalId);
    const reviewTimestamp = input.status === "approved" || input.status === "changes_requested" ? /* @__PURE__ */ new Date() : void 0;
    const [updated] = await tx.update(deliverable).set({
      ...input,
      ...reviewTimestamp ? { reviewedAt: reviewTimestamp } : {}
    }).where(eq21(deliverable.id, id)).returning();
    if (!updated) throw Errors.internal("No se pudo actualizar el entregable");
    return updated;
  });
}
async function deleteDeliverable(portalId, id) {
  await db.transaction(async (tx) => {
    await requireDeliverableInPortal(tx, id, portalId);
    await tx.delete(deliverable).where(eq21(deliverable.id, id));
  });
}

// src/modules/deliverables/deliverables.router.ts
var TAG12 = "Entregables";
var security12 = ADMIN_SECURITY;
async function deliverablesRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/",
    {
      schema: {
        tags: [TAG12],
        summary: "Listar entregables",
        description: "Lista todos los entregables del portal. Filtr\xE1 por dealId para obtener los de un deal espec\xEDfico.",
        security: security12,
        querystring: DeliverableListQuerySchema
      }
    },
    async (request) => {
      const items = await listDeliverables(request.hubUser.portalId, request.query);
      return ok(items);
    }
  );
  r.post(
    "/",
    {
      schema: {
        tags: [TAG12],
        summary: "Crear entregable",
        description: "Crea un entregable asociado a un deal. Requiere rol owner o member.",
        security: security12,
        body: CreateDeliverableSchema
      },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request, reply) => {
      const created = await createDeliverable(request.hubUser.portalId, request.hubUser.sub, request.body);
      return reply.status(201).send(ok(created));
    }
  );
  r.patch(
    "/:id",
    {
      schema: {
        tags: [TAG12],
        summary: "Actualizar entregable",
        description: "Actualiza campos del entregable. Si el status pasa a approved o changes_requested, se registra reviewedAt autom\xE1ticamente. Requiere rol owner o member.",
        security: security12,
        params: IdParamSchema,
        body: UpdateDeliverableSchema
      },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request) => {
      return ok(await updateDeliverable(request.hubUser.portalId, request.params.id, request.body));
    }
  );
  r.delete(
    "/:id",
    {
      schema: {
        tags: [TAG12],
        summary: "Eliminar entregable",
        description: "Elimina el entregable permanentemente. Requiere rol owner.",
        security: security12,
        params: IdParamSchema
      },
      preHandler: [authorize("owner")]
    },
    async (request) => {
      await deleteDeliverable(request.hubUser.portalId, request.params.id);
      return ok({ success: true });
    }
  );
}

// src/modules/client/client.router.ts
import { z as z15 } from "zod";

// src/modules/client/client.service.ts
import { and as and18, asc as asc5, desc as desc11, eq as eq22, inArray as inArray7, sql as sql25 } from "drizzle-orm";
async function clientDeals(clientId) {
  const ids = await clientDealIds(clientId);
  if (ids.length === 0) return [];
  return db.select({ id: deal.id, name: deal.name, amount: deal.amount, currency: deal.currency, stageId: deal.stageId, createdAt: deal.createdAt }).from(deal).where(and18(inArray7(deal.id, ids), eq22(deal.archived, false)));
}
async function clientDeliverables(clientId) {
  const ids = await clientDealIds(clientId);
  if (ids.length === 0) return [];
  return db.select().from(deliverable).where(inArray7(deliverable.dealId, ids)).orderBy(desc11(deliverable.createdAt));
}
async function assertClientDeliverable(clientId, deliverableId) {
  const ids = await clientDealIds(clientId);
  const [dv] = await db.select().from(deliverable).where(eq22(deliverable.id, deliverableId)).limit(1);
  if (!dv || !ids.includes(dv.dealId)) throw Errors.notFound("Entregable no encontrado");
  return dv;
}
async function approveDeliverable(clientId, deliverableId) {
  await assertClientDeliverable(clientId, deliverableId);
  await db.update(deliverable).set({ status: "approved", reviewedBy: clientId, reviewedAt: /* @__PURE__ */ new Date(), feedback: null }).where(eq22(deliverable.id, deliverableId));
}
async function requestChanges(clientId, deliverableId, feedback) {
  await assertClientDeliverable(clientId, deliverableId);
  await db.update(deliverable).set({ status: "changes_requested", reviewedBy: clientId, reviewedAt: /* @__PURE__ */ new Date(), feedback }).where(eq22(deliverable.id, deliverableId));
}
async function listClientInvoices(clientId) {
  const dealIds = await clientDealIds(clientId);
  if (dealIds.length === 0) return [];
  const invoices = await db.select().from(invoice).where(and18(inArray7(invoice.dealId, dealIds), eq22(invoice.archived, false))).orderBy(desc11(invoice.createdAt));
  if (invoices.length === 0) return [];
  const invoiceIds = invoices.map((inv) => inv.id);
  const paymentTotals = await db.select({
    invoiceId: payment.invoiceId,
    paid: sql25`COALESCE(SUM(${payment.amount}), '0')`
  }).from(payment).where(inArray7(payment.invoiceId, invoiceIds)).groupBy(payment.invoiceId);
  const paidByInvoice = new Map(
    paymentTotals.map((r) => [r.invoiceId, Number(r.paid)])
  );
  return invoices.map((inv) => {
    const totalPaid = paidByInvoice.get(inv.id) ?? 0;
    const balance = Math.max(0, Number(inv.total) - totalPaid);
    return {
      id: inv.id,
      number: inv.number,
      total: inv.total,
      currency: inv.currency,
      status: inv.status,
      issueDate: inv.issueDate ?? null,
      dueDate: inv.dueDate ?? null,
      balance: balance.toFixed(2)
    };
  });
}
async function resolveActiveClientDeal(clientId) {
  const [row] = await db.select({ id: deal.id, portalId: deal.portalId, name: deal.name, pipelineId: deal.pipelineId, stageId: deal.stageId }).from(clientDealAccess).innerJoin(deal, eq22(deal.id, clientDealAccess.dealId)).where(and18(eq22(clientDealAccess.clientId, clientId), eq22(deal.archived, false))).orderBy(desc11(deal.createdAt)).limit(1);
  if (!row) throw Errors.notFound("No hay un proyecto activo asociado a esta cuenta");
  return row;
}
async function getClientProject(clientId) {
  const activeDeal = await resolveActiveClientDeal(clientId);
  const [pl] = await db.select({ id: pipeline.id, label: pipeline.label }).from(pipeline).where(eq22(pipeline.id, activeDeal.pipelineId)).limit(1);
  const inProduction = pl?.label === PRODUCTION_PIPELINE_LABEL;
  let currentPhase = null;
  let phases = null;
  if (inProduction) {
    const stages = await db.select({
      id: pipelineStage.id,
      label: pipelineStage.label,
      description: pipelineStage.description,
      displayOrder: pipelineStage.displayOrder
    }).from(pipelineStage).where(and18(eq22(pipelineStage.pipelineId, activeDeal.pipelineId), eq22(pipelineStage.archived, false))).orderBy(asc5(pipelineStage.displayOrder));
    const current = stages.find((s) => s.id === activeDeal.stageId);
    const currentDisplayOrder = current?.displayOrder ?? -1;
    phases = stages.map((s) => ({
      id: s.id,
      label: s.label,
      description: s.description,
      displayOrder: s.displayOrder,
      isCurrent: s.id === activeDeal.stageId,
      isDone: s.displayOrder < currentDisplayOrder
    }));
    if (current) {
      currentPhase = { id: current.id, label: current.label, description: current.description };
    }
  }
  const updateRows = await db.select({ id: projectUpdate.id, body: projectUpdate.body, createdAt: projectUpdate.createdAt, stageLabel: pipelineStage.label }).from(projectUpdate).leftJoin(pipelineStage, eq22(pipelineStage.id, projectUpdate.stageId)).where(and18(eq22(projectUpdate.dealId, activeDeal.id), eq22(projectUpdate.archived, false))).orderBy(desc11(projectUpdate.createdAt)).limit(20);
  const updates = updateRows.map((u) => ({
    id: u.id,
    body: u.body,
    phaseLabel: u.stageLabel ?? null,
    createdAt: u.createdAt
  }));
  return {
    deal: { id: activeDeal.id, name: activeDeal.name },
    inProduction,
    currentPhase,
    phases,
    updates
  };
}

// src/modules/documents/documents.service.ts
import { and as and19, desc as desc12, eq as eq23, inArray as inArray8 } from "drizzle-orm";
function toDTO(row) {
  return {
    id: row.id,
    portalId: row.portalId,
    dealId: row.dealId,
    crId: row.crId,
    name: row.name,
    type: row.type,
    source: row.source,
    storageKey: row.storageKey,
    signedAt: row.signedAt ? row.signedAt.toISOString() : null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString()
  };
}
async function listDocuments(portalId, query) {
  const conditions = [eq23(document.portalId, portalId)];
  if (query.dealId) {
    conditions.push(eq23(document.dealId, query.dealId));
  }
  const rows = await db.select().from(document).where(and19(...conditions)).orderBy(desc12(document.createdAt));
  return rows.map(toDTO);
}
async function createDocument(portalId, userId, input) {
  const [row] = await db.insert(document).values({
    portalId,
    dealId: input.dealId,
    crId: input.crId ?? null,
    name: input.name,
    type: input.type,
    source: "manual",
    storageKey: input.storageKey ?? null,
    createdBy: userId
  }).returning();
  if (!row) throw Errors.internal("Error al crear documento");
  return toDTO(row);
}
async function deleteDocument(portalId, id) {
  const [row] = await db.select({ id: document.id }).from(document).where(and19(eq23(document.id, id), eq23(document.portalId, portalId))).limit(1);
  if (!row) throw Errors.notFound("Documento no encontrado");
  await db.delete(document).where(eq23(document.id, id));
}
async function listClientDocuments(dealIds) {
  if (dealIds.length === 0) return [];
  const rows = await db.select().from(document).where(inArray8(document.dealId, dealIds)).orderBy(desc12(document.createdAt));
  return rows.map((row) => ({
    id: row.id,
    dealId: row.dealId,
    name: row.name,
    type: row.type,
    storageKey: row.storageKey,
    signedAt: row.signedAt ? row.signedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString()
  }));
}

// src/modules/client/client.router.ts
var TAG13 = "Client Portal";
var security13 = CLIENT_SECURITY;
var RequestChangesSchema = z15.object({ feedback: z15.string().min(1) });
async function clientRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticateClient);
  r.get(
    "/deals",
    { schema: { tags: [TAG13], summary: "Deals del cliente", description: "Deals a los que el cliente tiene acceso.", security: security13 } },
    async (request) => ok(await clientDeals(request.clientAccount.sub))
  );
  r.get(
    "/project",
    {
      schema: {
        tags: [TAG13],
        summary: "Estado de proyecto visible al cliente",
        description: 'Fase actual del deal activo dentro del pipeline "Producci\xF3n" (si ya est\xE1 ah\xED), roadmap completo de las 9 fases y novedades curadas por el equipo. No expone tareas internas.',
        security: security13
      }
    },
    async (request) => ok(await getClientProject(request.clientAccount.sub))
  );
  r.get(
    "/deliverables",
    { schema: { tags: [TAG13], summary: "Entregables del cliente", description: "Entregables de los deals del cliente.", security: security13 } },
    async (request) => ok(await clientDeliverables(request.clientAccount.sub))
  );
  r.post(
    "/deliverables/:id/approve",
    { schema: { tags: [TAG13], summary: "Aprobar entregable", security: security13, params: IdParamSchema } },
    async (request) => {
      await approveDeliverable(request.clientAccount.sub, request.params.id);
      return ok({ success: true });
    }
  );
  r.post(
    "/deliverables/:id/request-changes",
    { schema: { tags: [TAG13], summary: "Pedir cambios en un entregable", security: security13, params: IdParamSchema, body: RequestChangesSchema } },
    async (request) => {
      await requestChanges(request.clientAccount.sub, request.params.id, request.body.feedback);
      return ok({ success: true });
    }
  );
  r.get(
    "/invoices",
    {
      schema: {
        tags: [TAG13],
        summary: "Facturas del cliente",
        description: "Lista de facturas asociadas a los deals del cliente autenticado (read-only).",
        security: security13
      }
    },
    async (request) => ok(await listClientInvoices(request.clientAccount.sub))
  );
  r.get(
    "/documents",
    {
      schema: {
        tags: [TAG13],
        summary: "Documentos del cliente",
        description: "Lista de documentos asociados a los deals del cliente autenticado (read-only).",
        security: security13
      }
    },
    async (request) => {
      const dealIds = await clientDealIds(request.clientAccount.sub);
      const docs = await listClientDocuments(dealIds);
      return ok(docs);
    }
  );
}

// src/modules/intake/intake.schema.ts
import { z as z16 } from "zod";
var FieldSchema = z16.object({
  name: z16.string().min(1),
  label: z16.string().min(1),
  type: z16.enum(["text", "textarea", "email", "number", "date", "file"]).default("text")
});
var CreateIntakeFormSchema = z16.object({
  name: z16.string().min(1),
  description: z16.string().optional(),
  slug: z16.string().optional(),
  fields: z16.array(FieldSchema).default([])
});
var AssignIntakeSchema = z16.object({
  dealId: z16.string().min(1),
  formId: z16.string().min(1),
  title: z16.string().optional(),
  dueDate: z16.string().datetime().optional()
});
var DealIntakeQuerySchema = z16.object({
  dealId: z16.string().min(1)
});
var RespondIntakeSchema = z16.object({
  answers: z16.record(z16.string(), z16.unknown())
});

// src/modules/intake/intake.service.ts
import { and as and20, asc as asc6, desc as desc13, eq as eq24, inArray as inArray9 } from "drizzle-orm";
function slugify2(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
async function listIntakeForms(portalId) {
  return db.select().from(intakeForm).where(eq24(intakeForm.portalId, portalId)).orderBy(asc6(intakeForm.name));
}
async function createIntakeForm(portalId, input) {
  const [row] = await db.insert(intakeForm).values({
    portalId,
    name: input.name,
    description: input.description,
    slug: slugify2(input.slug ?? input.name),
    fields: input.fields
  }).returning();
  if (!row) throw Errors.internal("No se pudo crear el formulario");
  return row;
}
async function listDealIntakes(portalId, dealId) {
  return db.select({
    id: dealIntake.id,
    title: dealIntake.title,
    status: dealIntake.status,
    dueDate: dealIntake.dueDate,
    completedAt: dealIntake.completedAt,
    formName: intakeForm.name
  }).from(dealIntake).innerJoin(deal, and20(eq24(deal.id, dealIntake.dealId), eq24(deal.portalId, portalId))).innerJoin(intakeForm, eq24(intakeForm.id, dealIntake.formId)).where(eq24(dealIntake.dealId, dealId)).orderBy(desc13(dealIntake.createdAt));
}
async function assignIntake(portalId, input) {
  const [d] = await db.select().from(deal).where(and20(eq24(deal.id, input.dealId), eq24(deal.portalId, portalId))).limit(1);
  if (!d) throw Errors.badRequest("Deal inexistente");
  const [f] = await db.select().from(intakeForm).where(and20(eq24(intakeForm.id, input.formId), eq24(intakeForm.portalId, portalId))).limit(1);
  if (!f) throw Errors.badRequest("Formulario inexistente");
  const [row] = await db.insert(dealIntake).values({
    dealId: input.dealId,
    formId: input.formId,
    title: input.title ?? f.name,
    dueDate: input.dueDate ? new Date(input.dueDate) : void 0
  }).returning();
  return row;
}
async function clientIntakes(clientId) {
  const ids = await clientDealIds(clientId);
  if (ids.length === 0) return [];
  return db.select({
    id: dealIntake.id,
    title: dealIntake.title,
    status: dealIntake.status,
    dueDate: dealIntake.dueDate,
    fields: intakeForm.fields,
    answers: dealIntakeResponse.answers
  }).from(dealIntake).innerJoin(intakeForm, eq24(intakeForm.id, dealIntake.formId)).leftJoin(dealIntakeResponse, eq24(dealIntakeResponse.intakeId, dealIntake.id)).where(inArray9(dealIntake.dealId, ids)).orderBy(asc6(dealIntake.status));
}
async function respondIntake(clientId, intakeId, answers) {
  const ids = await clientDealIds(clientId);
  const [intake] = await db.select().from(dealIntake).where(eq24(dealIntake.id, intakeId)).limit(1);
  if (!intake || !ids.includes(intake.dealId)) throw Errors.notFound("Formulario no encontrado");
  await db.insert(dealIntakeResponse).values({ intakeId, clientId, answers }).onConflictDoUpdate({ target: dealIntakeResponse.intakeId, set: { answers, clientId, submittedAt: /* @__PURE__ */ new Date() } });
  await db.update(dealIntake).set({ status: "completed", completedAt: /* @__PURE__ */ new Date() }).where(eq24(dealIntake.id, intakeId));
}

// src/modules/intake/intake.router.ts
var TAG14 = "Intake Forms";
var security14 = ADMIN_SECURITY;
async function intakeRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/forms",
    { schema: { tags: [TAG14], summary: "Listar plantillas de intake", security: security14 } },
    async (request) => ok(await listIntakeForms(request.hubUser.portalId))
  );
  r.post(
    "/forms",
    { schema: { tags: [TAG14], summary: "Crear plantilla de intake", description: "fields = [{name,label,type}]. Solo owner/member.", security: security14, body: CreateIntakeFormSchema }, preHandler: [authorize("owner", "member", "collaborator")] },
    async (request, reply) => {
      const created = await createIntakeForm(request.hubUser.portalId, request.body);
      return reply.status(201).send(ok(created));
    }
  );
  r.get(
    "/deal-intakes",
    { schema: { tags: [TAG14], summary: "Intakes asignados a un deal", security: security14, querystring: DealIntakeQuerySchema } },
    async (request) => ok(await listDealIntakes(request.hubUser.portalId, request.query.dealId))
  );
  r.post(
    "/deal-intakes",
    { schema: { tags: [TAG14], summary: "Asignar formulario a un deal", security: security14, body: AssignIntakeSchema }, preHandler: [authorize("owner", "member", "collaborator")] },
    async (request, reply) => {
      const created = await assignIntake(request.hubUser.portalId, request.body);
      return reply.status(201).send(ok(created));
    }
  );
}

// src/modules/intake/client-intake.router.ts
var TAG15 = "Client Portal";
var security15 = CLIENT_SECURITY;
async function clientIntakeRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticateClient);
  r.get(
    "/",
    { schema: { tags: [TAG15], summary: "Formularios de intake del cliente", description: "Intakes de los deals del cliente, con campos y respuesta si existe.", security: security15 } },
    async (request) => ok(await clientIntakes(request.clientAccount.sub))
  );
  r.post(
    "/:id/respond",
    { schema: { tags: [TAG15], summary: "Responder un intake", security: security15, params: IdParamSchema, body: RespondIntakeSchema } },
    async (request) => {
      await respondIntake(request.clientAccount.sub, request.params.id, request.body.answers);
      return ok({ success: true });
    }
  );
}

// src/modules/notifications/notifications.router.ts
var TAG16 = "Notificaciones";
var security16 = ADMIN_SECURITY;
async function notificationsRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/",
    { schema: { tags: [TAG16], summary: "Listar notificaciones del usuario", security: security16 } },
    async (request) => ok(await listNotifications(request.hubUser.portalId, request.hubUser.sub))
  );
  r.get(
    "/unread-count",
    { schema: { tags: [TAG16], summary: "Cantidad de no le\xEDdas", security: security16 } },
    async (request) => ok({ count: await unreadCount(request.hubUser.portalId, request.hubUser.sub) })
  );
  r.post(
    "/:id/read",
    { schema: { tags: [TAG16], summary: "Marcar como le\xEDda", security: security16, params: IdParamSchema } },
    async (request) => {
      await markRead(request.hubUser.portalId, request.hubUser.sub, request.params.id);
      return ok({ success: true });
    }
  );
  r.post(
    "/read-all",
    { schema: { tags: [TAG16], summary: "Marcar todas como le\xEDdas", security: security16 } },
    async (request) => {
      await markAllRead(request.hubUser.portalId, request.hubUser.sub);
      return ok({ success: true });
    }
  );
}

// src/modules/notifications/notifications.ws.ts
async function notificationsWsRoutes(app2) {
  app2.get("/ws/notifications", { websocket: true }, async (socket, request) => {
    const token = request.query.token;
    let user;
    try {
      if (!token) throw new Error("no token");
      const clerkUserId = await verifyClerkToken(token);
      user = await resolveHubUser(clerkUserId);
    } catch {
      socket.close(1008, "unauthorized");
      return;
    }
    const handler2 = (event) => {
      if (event.portalId !== user.portalId) return;
      if (event.userId !== null && event.userId !== user.sub) return;
      try {
        socket.send(JSON.stringify(event));
      } catch {
      }
    };
    notificationBus.on("notification", handler2);
    socket.send(JSON.stringify({ type: "connected" }));
    socket.on("close", () => notificationBus.off("notification", handler2));
  });
}

// src/modules/files/files.service.ts
import { randomUUID as randomUUID2 } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { existsSync, createReadStream } from "fs";
import { join, basename, extname } from "path";
var UPLOADS_DIR = join(process.cwd(), "uploads");
var MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf"
};
function sanitize(name) {
  return basename(name).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "archivo";
}
async function saveUpload(buffer, originalName, mimeType) {
  await mkdir(UPLOADS_DIR, { recursive: true });
  const storageKey = `${randomUUID2()}-${sanitize(originalName)}`;
  await writeFile(join(UPLOADS_DIR, storageKey), buffer);
  return { storageKey, name: originalName, mimeType, sizeBytes: buffer.length, url: `/api/files/${storageKey}` };
}
function resolveFile(key) {
  const safe = basename(key);
  const path = join(UPLOADS_DIR, safe);
  if (!existsSync(path)) return null;
  return { path, mime: MIME_BY_EXT[extname(safe).toLowerCase()] ?? "application/octet-stream" };
}
function fileStream(path) {
  return createReadStream(path);
}

// src/modules/files/files.router.ts
var TAG17 = "Archivos";
async function filesRoutes(app2) {
  app2.post(
    "/",
    { preHandler: [authenticate], schema: { tags: [TAG17], summary: "Subir archivo (admin)", security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const file = await request.file();
      if (!file) throw Errors.badRequest("No se envi\xF3 ning\xFAn archivo");
      const saved = await saveUpload(await file.toBuffer(), file.filename, file.mimetype);
      return reply.status(201).send(ok(saved));
    }
  );
  app2.get("/:key", { schema: { tags: [TAG17], summary: "Descargar archivo por key" } }, async (request, reply) => {
    const { key } = request.params;
    const f = resolveFile(key);
    if (!f) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Archivo no encontrado" } });
    return reply.type(f.mime).send(fileStream(f.path));
  });
}
async function clientFilesRoutes(app2) {
  app2.post(
    "/",
    { preHandler: [authenticateClient], schema: { tags: ["Client Portal"], summary: "Subir archivo (cliente)", security: [{ bearerAuth: [] }] } },
    async (request, reply) => {
      const file = await request.file();
      if (!file) throw Errors.badRequest("No se envi\xF3 ning\xFAn archivo");
      const saved = await saveUpload(await file.toBuffer(), file.filename, file.mimetype);
      return reply.status(201).send(ok(saved));
    }
  );
}

// src/modules/change-requests/cr.router.ts
import { z as z18 } from "zod";

// src/modules/change-requests/cr.schema.ts
import { z as z17 } from "zod";
var ItemSchema = z17.object({
  description: z17.string().min(1),
  hours: z17.number().nonnegative().optional(),
  unitPrice: z17.number().nonnegative(),
  quantity: z17.number().positive().optional()
});
var CreateCRSchema = z17.object({
  dealId: z17.string().min(1),
  title: z17.string().min(1),
  description: z17.string().min(1),
  originalScopeRef: z17.string().optional(),
  origin: z17.enum(["client", "agency"]).optional(),
  totalAmount: z17.number().nonnegative().optional(),
  timelineImpactDays: z17.number().int().optional(),
  items: z17.array(ItemSchema).optional()
});
var UpdateCRSchema = z17.object({
  title: z17.string().min(1),
  description: z17.string().min(1),
  originalScopeRef: z17.string(),
  totalAmount: z17.number().nonnegative(),
  timelineImpactDays: z17.number().int()
}).partial();
var AddItemSchema = ItemSchema;
var CRListQuerySchema = z17.object({ dealId: z17.string().min(1).optional() });
var CR_STATUSES = ["draft", "sent", "approved", "rejected", "negotiating", "approved_verbally", "disputed", "completed"];
var TransitionSchema = z17.object({ status: z17.enum(CR_STATUSES), comment: z17.string().optional() });
var CommentSchema = z17.object({ body: z17.string().min(1) });
var ClientDecisionSchema = z17.object({ comment: z17.string().optional() });

// src/modules/change-requests/cr.service.ts
import { and as and21, asc as asc7, desc as desc14, eq as eq25, inArray as inArray10, ne as ne2, sql as sql26 } from "drizzle-orm";

// src/lib/money.ts
function toDecimal(n) {
  return n === void 0 ? void 0 : n.toFixed(2);
}

// src/modules/change-requests/cr.service.ts
async function getCRInPortal(portalId, id) {
  const [cr] = await db.select().from(changeRequest).where(and21(eq25(changeRequest.id, id), eq25(changeRequest.portalId, portalId))).limit(1);
  if (!cr) throw Errors.notFound("Change request no encontrada");
  return cr;
}
async function listCRs(portalId, dealId) {
  return db.select().from(changeRequest).where(dealId ? and21(eq25(changeRequest.portalId, portalId), eq25(changeRequest.dealId, dealId)) : eq25(changeRequest.portalId, portalId)).orderBy(desc14(changeRequest.createdAt));
}
async function getCRDetail(portalId, id) {
  const cr = await getCRInPortal(portalId, id);
  const items = await db.select().from(changeRequestItem).where(eq25(changeRequestItem.changeRequestId, id));
  const comments = await db.select().from(changeRequestComment).where(eq25(changeRequestComment.changeRequestId, id)).orderBy(asc7(changeRequestComment.createdAt));
  const history = await db.select().from(changeRequestHistory).where(eq25(changeRequestHistory.changeRequestId, id)).orderBy(desc14(changeRequestHistory.changedAt));
  return { changeRequest: cr, items, comments, history };
}
async function createCR(portalId, userId, input) {
  await assertDealInPortal(portalId, input.dealId);
  return db.transaction(async (tx) => {
    const numRows = await tx.select({ next: sql26`coalesce(max(${changeRequest.number}), 0) + 1` }).from(changeRequest).where(eq25(changeRequest.dealId, input.dealId));
    const next = numRows[0]?.next ?? 1;
    const [cr] = await tx.insert(changeRequest).values({
      portalId,
      dealId: input.dealId,
      number: next,
      title: input.title,
      description: input.description,
      originalScopeRef: input.originalScopeRef,
      origin: input.origin ?? "agency",
      totalAmount: toDecimal(input.totalAmount),
      timelineImpactDays: input.timelineImpactDays ?? 0,
      createdBy: userId
    }).returning();
    if (!cr) throw Errors.internal("No se pudo crear la CR");
    if (input.items?.length) {
      await tx.insert(changeRequestItem).values(
        input.items.map((it) => ({
          changeRequestId: cr.id,
          description: it.description,
          hours: toDecimal(it.hours),
          unitPrice: it.unitPrice.toFixed(2),
          quantity: (it.quantity ?? 1).toFixed(2)
        }))
      );
    }
    await tx.insert(changeRequestHistory).values({ changeRequestId: cr.id, toStatus: "draft", changedByUser: userId });
    return cr;
  });
}
async function updateCR(portalId, id, input) {
  const cr = await getCRInPortal(portalId, id);
  if (cr.status !== "draft") throw Errors.badRequest("Solo se puede editar una CR en borrador");
  const [row] = await db.update(changeRequest).set({ ...input, totalAmount: toDecimal(input.totalAmount), updatedAt: /* @__PURE__ */ new Date() }).where(eq25(changeRequest.id, id)).returning();
  return row;
}
async function addItem(portalId, id, input) {
  const cr = await getCRInPortal(portalId, id);
  if (cr.status !== "draft") throw Errors.badRequest("Solo se editan \xEDtems en borrador");
  const [row] = await db.insert(changeRequestItem).values({
    changeRequestId: id,
    description: input.description,
    hours: toDecimal(input.hours),
    unitPrice: input.unitPrice.toFixed(2),
    quantity: (input.quantity ?? 1).toFixed(2)
  }).returning();
  return row;
}
async function deleteItem(portalId, id, itemId) {
  await getCRInPortal(portalId, id);
  await db.delete(changeRequestItem).where(and21(eq25(changeRequestItem.id, itemId), eq25(changeRequestItem.changeRequestId, id)));
}
async function transitionCR(portalId, userId, id, status, comment) {
  const cr = await getCRInPortal(portalId, id);
  const patch = { status, updatedAt: /* @__PURE__ */ new Date() };
  if (status === "completed") patch.completedAt = /* @__PURE__ */ new Date();
  const [row] = await db.update(changeRequest).set(patch).where(eq25(changeRequest.id, id)).returning();
  await db.insert(changeRequestHistory).values({ changeRequestId: id, fromStatus: cr.status, toStatus: status, comment, changedByUser: userId });
  return row;
}
async function addComment(portalId, userId, id, body) {
  await getCRInPortal(portalId, id);
  const [row] = await db.insert(changeRequestComment).values({ changeRequestId: id, body, authorUser: userId }).returning();
  return row;
}
async function getClientCR(clientId, id) {
  const ids = await clientDealIds(clientId);
  const [cr] = await db.select().from(changeRequest).where(eq25(changeRequest.id, id)).limit(1);
  if (!cr || !ids.includes(cr.dealId)) throw Errors.notFound("Change request no encontrada");
  return cr;
}
async function clientListCRs(clientId) {
  const ids = await clientDealIds(clientId);
  if (ids.length === 0) return [];
  return db.select().from(changeRequest).where(and21(inArray10(changeRequest.dealId, ids), ne2(changeRequest.status, "draft"))).orderBy(desc14(changeRequest.createdAt));
}
async function clientDecision(clientId, id, decision, comment) {
  const cr = await getClientCR(clientId, id);
  await db.update(changeRequest).set({
    status: decision,
    updatedAt: /* @__PURE__ */ new Date(),
    ...decision === "approved" ? { approvedAt: /* @__PURE__ */ new Date(), approvedBy: clientId } : {}
  }).where(eq25(changeRequest.id, id));
  await db.insert(changeRequestHistory).values({ changeRequestId: id, fromStatus: cr.status, toStatus: decision, comment, changedByClient: clientId });
  await createNotification({
    portalId: cr.portalId,
    entityType: "change_request",
    entityId: id,
    type: decision === "approved" ? "cr_approved" : "cr_rejected",
    title: `El cliente ${decision === "approved" ? "aprob\xF3" : "rechaz\xF3"} la CR #${cr.number}`
  });
}
async function clientComment(clientId, id, body) {
  await getClientCR(clientId, id);
  const [row] = await db.insert(changeRequestComment).values({ changeRequestId: id, body, authorClient: clientId }).returning();
  return row;
}

// src/modules/change-requests/cr.router.ts
var TAG18 = "Change Requests";
var security17 = ADMIN_SECURITY;
var mut = { preHandler: [authorize("owner", "member", "collaborator")] };
var ItemParam = z18.object({ id: z18.string().min(1), itemId: z18.string().min(1) });
async function crRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/",
    { schema: { tags: [TAG18], summary: "Listar change requests", security: security17, querystring: CRListQuerySchema } },
    async (req) => ok(await listCRs(req.hubUser.portalId, req.query.dealId))
  );
  r.get(
    "/:id",
    { schema: { tags: [TAG18], summary: "Detalle de CR (items, comentarios, historial)", security: security17, params: IdParamSchema } },
    async (req) => ok(await getCRDetail(req.hubUser.portalId, req.params.id))
  );
  r.post(
    "/",
    { schema: { tags: [TAG18], summary: "Crear CR (borrador, number auto por deal)", security: security17, body: CreateCRSchema }, ...mut },
    async (req, reply) => reply.status(201).send(ok(await createCR(req.hubUser.portalId, req.hubUser.sub, req.body)))
  );
  r.patch(
    "/:id",
    { schema: { tags: [TAG18], summary: "Editar CR (solo borrador)", security: security17, params: IdParamSchema, body: UpdateCRSchema }, ...mut },
    async (req) => ok(await updateCR(req.hubUser.portalId, req.params.id, req.body))
  );
  r.post(
    "/:id/items",
    { schema: { tags: [TAG18], summary: "Agregar \xEDtem", security: security17, params: IdParamSchema, body: AddItemSchema }, ...mut },
    async (req, reply) => reply.status(201).send(ok(await addItem(req.hubUser.portalId, req.params.id, req.body)))
  );
  r.delete("/:id/items/:itemId", { schema: { tags: [TAG18], summary: "Quitar \xEDtem", security: security17, params: ItemParam }, ...mut }, async (req) => {
    await deleteItem(req.hubUser.portalId, req.params.id, req.params.itemId);
    return ok({ success: true });
  });
  r.post(
    "/:id/transition",
    { schema: { tags: [TAG18], summary: "Cambiar estado (send/approve/reject/\u2026)", security: security17, params: IdParamSchema, body: TransitionSchema }, ...mut },
    async (req) => ok(await transitionCR(req.hubUser.portalId, req.hubUser.sub, req.params.id, req.body.status, req.body.comment))
  );
  r.post(
    "/:id/comments",
    { schema: { tags: [TAG18], summary: "Comentar", security: security17, params: IdParamSchema, body: CommentSchema }, ...mut },
    async (req, reply) => reply.status(201).send(ok(await addComment(req.hubUser.portalId, req.hubUser.sub, req.params.id, req.body.body)))
  );
}

// src/modules/change-requests/client-cr.router.ts
var TAG19 = "Client Portal";
var security18 = CLIENT_SECURITY;
async function clientCrRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticateClient);
  r.get(
    "/",
    { schema: { tags: [TAG19], summary: "Change requests del cliente", security: security18 } },
    async (req) => ok(await clientListCRs(req.clientAccount.sub))
  );
  r.post("/:id/approve", { schema: { tags: [TAG19], summary: "Aprobar CR", security: security18, params: IdParamSchema, body: ClientDecisionSchema } }, async (req) => {
    await clientDecision(req.clientAccount.sub, req.params.id, "approved", req.body.comment);
    return ok({ success: true });
  });
  r.post("/:id/reject", { schema: { tags: [TAG19], summary: "Rechazar CR", security: security18, params: IdParamSchema, body: ClientDecisionSchema } }, async (req) => {
    await clientDecision(req.clientAccount.sub, req.params.id, "rejected", req.body.comment);
    return ok({ success: true });
  });
  r.post(
    "/:id/comments",
    { schema: { tags: [TAG19], summary: "Comentar CR", security: security18, params: IdParamSchema, body: CommentSchema } },
    async (req, reply) => reply.status(201).send(ok(await clientComment(req.clientAccount.sub, req.params.id, req.body.body)))
  );
}

// src/modules/library/library.schema.ts
import { z as z19 } from "zod";
var LibraryItemTypeEnum = z19.enum([
  "document",
  "sop",
  "template",
  "contract_base",
  "proposal_base",
  "checklist",
  "tech_doc"
]);
var LibraryKindEnum = z19.enum(["procedure", "checklist"]);
var LibraryStepSchema = z19.object({
  title: z19.string().min(1, "El t\xEDtulo del paso es requerido"),
  body: z19.string().optional()
});
var CreateLibraryItemSchema = z19.object({
  type: LibraryItemTypeEnum,
  name: z19.string().min(1),
  category: z19.string().optional(),
  description: z19.string().optional(),
  storageKey: z19.string().optional(),
  url: z19.string().url().optional(),
  /**
   * Pasos del SOP/procedimiento. Solo aplica cuando type='sop'.
   * Máx 200 pasos por ítem (límite razonable para un SOP operativo).
   * Se REEMPLAZA completo en updates — no hay merge parcial.
   */
  steps: z19.array(LibraryStepSchema).max(200).optional(),
  /**
   * Variante operativa: 'procedure' o 'checklist'.
   * Solo aplica cuando type='sop'. Null para los demás types.
   */
  kind: LibraryKindEnum.nullable().optional(),
  /**
   * ID del hub_user responsable del contenido (owner).
   * Solo aplica a ítems operativos (type='sop').
   * Null = sin responsable asignado.
   */
  ownerId: z19.string().min(1).nullable().optional()
});
var UpdateLibraryItemSchema = z19.object({
  type: LibraryItemTypeEnum,
  name: z19.string().min(1),
  category: z19.string(),
  description: z19.string(),
  storageKey: z19.string(),
  url: z19.string().url(),
  /**
   * Lista completa de pasos. Se REEMPLAZA — nunca se hace merge con `||`.
   * El front envía siempre la lista completa reordenada/editada.
   */
  steps: z19.array(LibraryStepSchema).max(200),
  kind: LibraryKindEnum.nullable(),
  ownerId: z19.string().min(1).nullable()
}).partial();
var ListLibraryQuerySchema = z19.object({
  type: LibraryItemTypeEnum.optional(),
  /**
   * Filtro por kind. Aplica solo cuando type='sop'.
   * El frontend hace el filtrado client-side para /library/sops,
   * pero este parámetro permite que el server también lo filtre si se pide.
   */
  kind: LibraryKindEnum.optional()
});

// src/modules/library/library.service.ts
import { and as and22, desc as desc15, eq as eq26 } from "drizzle-orm";
async function requireItemInPortal(portalId, id) {
  const [row] = await db.select().from(libraryItem).where(and22(eq26(libraryItem.id, id), eq26(libraryItem.portalId, portalId), eq26(libraryItem.archived, false))).limit(1);
  if (!row) throw Errors.notFound("\xCDtem de biblioteca no encontrado");
  return row;
}
async function listLibraryItems(portalId, query) {
  const conditions = [
    eq26(libraryItem.portalId, portalId),
    eq26(libraryItem.archived, false),
    ...query.type ? [eq26(libraryItem.type, query.type)] : [],
    ...query.kind ? [eq26(libraryItem.kind, query.kind)] : []
  ];
  return db.select().from(libraryItem).where(and22(...conditions)).orderBy(desc15(libraryItem.createdAt));
}
async function getLibraryItem(portalId, id) {
  return requireItemInPortal(portalId, id);
}
async function createLibraryItem(portalId, userId, input) {
  const [row] = await db.insert(libraryItem).values({
    portalId,
    type: input.type,
    name: input.name,
    category: input.category ?? null,
    description: input.description ?? null,
    storageKey: input.storageKey ?? null,
    url: input.url ?? null,
    // steps: solo para ítems operativos; default [] para el resto
    steps: input.steps ?? [],
    // kind y ownerId: solo con sentido para type='sop'
    kind: input.kind ?? null,
    ownerId: input.ownerId ?? null,
    createdBy: userId
  }).returning();
  if (!row) throw Errors.internal("No se pudo crear el \xEDtem de biblioteca");
  return row;
}
async function updateLibraryItem(portalId, id, input) {
  return db.transaction(async (tx) => {
    await tx.select({ id: libraryItem.id }).from(libraryItem).where(and22(eq26(libraryItem.id, id), eq26(libraryItem.portalId, portalId), eq26(libraryItem.archived, false))).limit(1).then(([row]) => {
      if (!row) throw Errors.notFound("\xCDtem de biblioteca no encontrado");
    });
    const patch = { updatedAt: /* @__PURE__ */ new Date() };
    if (input.type !== void 0) patch.type = input.type;
    if (input.name !== void 0) patch.name = input.name;
    if (input.category !== void 0) patch.category = input.category;
    if (input.description !== void 0) patch.description = input.description;
    if (input.storageKey !== void 0) patch.storageKey = input.storageKey;
    if (input.url !== void 0) patch.url = input.url;
    if (input.kind !== void 0) patch.kind = input.kind;
    if (input.ownerId !== void 0) patch.ownerId = input.ownerId;
    if (input.steps !== void 0) {
      patch.steps = input.steps;
    }
    const [updated] = await tx.update(libraryItem).set(patch).where(eq26(libraryItem.id, id)).returning();
    if (!updated) throw Errors.internal("No se pudo actualizar el \xEDtem de biblioteca");
    return updated;
  });
}
async function archiveLibraryItem(portalId, id) {
  await db.transaction(async (tx) => {
    const [row] = await tx.select({ id: libraryItem.id }).from(libraryItem).where(and22(eq26(libraryItem.id, id), eq26(libraryItem.portalId, portalId), eq26(libraryItem.archived, false))).limit(1);
    if (!row) throw Errors.notFound("\xCDtem de biblioteca no encontrado");
    await tx.update(libraryItem).set({ archived: true, archivedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }).where(eq26(libraryItem.id, id));
  });
}

// src/modules/library/library.router.ts
var TAG20 = "Biblioteca";
var security19 = ADMIN_SECURITY;
async function libraryRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/",
    {
      schema: {
        tags: [TAG20],
        summary: "Listar \xEDtems de biblioteca",
        description: "Lista \xEDtems del portal. Filtr\xE1 por type y/o kind. kind aplica especialmente para type=sop.",
        security: security19,
        querystring: ListLibraryQuerySchema
      }
    },
    async (request) => {
      return ok(await listLibraryItems(request.hubUser.portalId, request.query));
    }
  );
  r.post(
    "/",
    {
      schema: {
        tags: [TAG20],
        summary: "Crear \xEDtem de biblioteca",
        description: "Crea un \xEDtem de biblioteca. Para type=sop incluye steps/kind/ownerId.",
        security: security19,
        body: CreateLibraryItemSchema
      },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request, reply) => {
      const created = await createLibraryItem(
        request.hubUser.portalId,
        request.hubUser.sub,
        request.body
      );
      return reply.status(201).send(ok(created));
    }
  );
  r.get(
    "/:id",
    {
      schema: {
        tags: [TAG20],
        summary: "Detalle de \xEDtem de biblioteca",
        description: "Devuelve un \xEDtem por ID verificando pertenencia al portal.",
        security: security19,
        params: IdParamSchema
      }
    },
    async (request) => {
      return ok(await getLibraryItem(request.hubUser.portalId, request.params.id));
    }
  );
  r.patch(
    "/:id",
    {
      schema: {
        tags: [TAG20],
        summary: "Actualizar \xEDtem de biblioteca",
        description: "Actualiza campos. Para steps: siempre enviar la lista completa (reemplazo, no merge).",
        security: security19,
        params: IdParamSchema,
        body: UpdateLibraryItemSchema
      },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request) => {
      return ok(await updateLibraryItem(request.hubUser.portalId, request.params.id, request.body));
    }
  );
  r.delete(
    "/:id",
    {
      schema: {
        tags: [TAG20],
        summary: "Archivar \xEDtem de biblioteca",
        description: "Archiva el \xEDtem (soft-delete).",
        security: security19,
        params: IdParamSchema
      },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request) => {
      await archiveLibraryItem(request.hubUser.portalId, request.params.id);
      return ok({ success: true });
    }
  );
}

// src/modules/work-items/work-items.schema.ts
import { z as z20 } from "zod";
var WorkItemTypeEnum = z20.enum(["bug", "improvement", "roadmap", "process"]);
var WorkItemStatusEnum = z20.enum(["open", "in_progress", "done", "cancelled"]);
var WorkItemPriorityEnum = z20.enum(["low", "medium", "high"]);
var CreateWorkItemSchema = z20.object({
  type: WorkItemTypeEnum,
  title: z20.string().min(1),
  description: z20.string().optional(),
  status: WorkItemStatusEnum.optional(),
  priority: WorkItemPriorityEnum.optional(),
  dealId: z20.string().min(1).optional(),
  assignedTo: z20.string().min(1).optional()
});
var UpdateWorkItemSchema = z20.object({
  type: WorkItemTypeEnum,
  title: z20.string().min(1),
  description: z20.string(),
  status: WorkItemStatusEnum,
  priority: WorkItemPriorityEnum,
  dealId: z20.string().min(1),
  assignedTo: z20.string().min(1)
}).partial();
var ListWorkItemsQuerySchema = z20.object({
  type: WorkItemTypeEnum.optional(),
  status: WorkItemStatusEnum.optional()
});

// src/modules/work-items/work-items.service.ts
import { and as and23, desc as desc16, eq as eq27 } from "drizzle-orm";
async function listWorkItems(portalId, query) {
  const conditions = [
    eq27(workItem.portalId, portalId),
    eq27(workItem.archived, false),
    ...query.type ? [eq27(workItem.type, query.type)] : [],
    ...query.status ? [eq27(workItem.status, query.status)] : []
  ];
  return db.select().from(workItem).where(and23(...conditions)).orderBy(desc16(workItem.createdAt));
}
async function createWorkItem(portalId, userId, input) {
  const [row] = await db.insert(workItem).values({
    portalId,
    type: input.type,
    title: input.title,
    description: input.description ?? null,
    status: input.status ?? "open",
    priority: input.priority ?? "medium",
    dealId: input.dealId ?? null,
    assignedTo: input.assignedTo ?? null,
    createdBy: userId
  }).returning();
  if (!row) throw Errors.internal("No se pudo crear el \xEDtem de operaciones");
  return row;
}
async function updateWorkItem(portalId, id, input) {
  return db.transaction(async (tx) => {
    await tx.select({ id: workItem.id }).from(workItem).where(and23(eq27(workItem.id, id), eq27(workItem.portalId, portalId), eq27(workItem.archived, false))).limit(1).then(([row]) => {
      if (!row) throw Errors.notFound("\xCDtem de operaciones no encontrado");
    });
    const [updated] = await tx.update(workItem).set({ ...input, updatedAt: /* @__PURE__ */ new Date() }).where(eq27(workItem.id, id)).returning();
    if (!updated) throw Errors.internal("No se pudo actualizar el \xEDtem de operaciones");
    return updated;
  });
}
async function archiveWorkItem(portalId, id) {
  await db.transaction(async (tx) => {
    const [row] = await tx.select({ id: workItem.id }).from(workItem).where(and23(eq27(workItem.id, id), eq27(workItem.portalId, portalId), eq27(workItem.archived, false))).limit(1);
    if (!row) throw Errors.notFound("\xCDtem de operaciones no encontrado");
    await tx.update(workItem).set({ archived: true, archivedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }).where(eq27(workItem.id, id));
  });
}

// src/modules/work-items/work-items.router.ts
var TAG21 = "Operaciones";
var security20 = ADMIN_SECURITY;
async function workItemsRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/",
    {
      schema: {
        tags: [TAG21],
        summary: "Listar \xEDtems de operaciones",
        description: "Lista todos los \xEDtems del portal. Filtr\xE1 por type y/o status.",
        security: security20,
        querystring: ListWorkItemsQuerySchema
      }
    },
    async (request) => {
      const items = await listWorkItems(request.hubUser.portalId, request.query);
      return ok(items);
    }
  );
  r.post(
    "/",
    {
      schema: {
        tags: [TAG21],
        summary: "Crear \xEDtem de operaciones",
        description: "Crea un nuevo \xEDtem de operaciones (bug, mejora, roadmap, proceso). Requiere rol owner o member.",
        security: security20,
        body: CreateWorkItemSchema
      },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request, reply) => {
      const created = await createWorkItem(
        request.hubUser.portalId,
        request.hubUser.sub,
        request.body
      );
      return reply.status(201).send(ok(created));
    }
  );
  r.patch(
    "/:id",
    {
      schema: {
        tags: [TAG21],
        summary: "Actualizar \xEDtem de operaciones",
        description: "Actualiza campos del \xEDtem. Requiere rol owner o member.",
        security: security20,
        params: IdParamSchema,
        body: UpdateWorkItemSchema
      },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request) => {
      return ok(await updateWorkItem(request.hubUser.portalId, request.params.id, request.body));
    }
  );
  r.delete(
    "/:id",
    {
      schema: {
        tags: [TAG21],
        summary: "Archivar \xEDtem de operaciones",
        description: "Archiva el \xEDtem (soft delete). Requiere rol owner o member.",
        security: security20,
        params: IdParamSchema
      },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request) => {
      await archiveWorkItem(request.hubUser.portalId, request.params.id);
      return ok({ success: true });
    }
  );
}

// src/modules/finance/finance.router.ts
import { z as z22 } from "zod";

// src/modules/finance/finance.schema.ts
import { z as z21 } from "zod";
var CurrencyEnum = z21.enum(["USD", "ARS"]);
var InvoiceStatusEnum = z21.enum(["draft", "sent", "paid", "overdue", "void"]);
var PaymentMethodEnum = z21.enum(["transfer", "card", "cash", "other"]);
var ExpenseCategoryEnum = z21.enum([
  "software",
  "infraestructura",
  "equipo",
  "impuestos",
  "oficina",
  "marketing",
  "otros"
]);
var RetainerStatusEnum = z21.enum(["active", "paused", "cancelled"]);
var InvoiceItemInputSchema = z21.object({
  description: z21.string().min(1),
  quantity: z21.number().positive().optional(),
  unitPrice: z21.number().min(0)
});
var CreateInvoiceSchema = z21.object({
  dealId: z21.string().min(1).optional(),
  companyId: z21.string().min(1).optional(),
  issueDate: z21.string().optional(),
  // YYYY-MM-DD
  dueDate: z21.string().optional(),
  /** Moneda de la factura. Default USD. */
  currency: CurrencyEnum.optional(),
  /**
   * Tipo de cambio ARS/USD al momento de emitir (ARS por 1 USD).
   * Requerido cuando currency === 'ARS'; ignorado (se fuerza 1) cuando USD.
   */
  exchangeRate: z21.number().positive().optional(),
  notes: z21.string().optional(),
  tax: z21.number().min(0).optional(),
  items: z21.array(InvoiceItemInputSchema).min(1),
  /** Retainer que origina esta factura (null = factura puntual). */
  retainerId: z21.string().min(1).optional()
});
var UpdateInvoiceSchema = CreateInvoiceSchema.omit({ items: true }).partial();
var TransitionInvoiceSchema = z21.object({
  status: InvoiceStatusEnum
});
var CreatePaymentSchema = z21.object({
  invoiceId: z21.string().min(1),
  amount: z21.number().positive(),
  /** Moneda en la que se realiza el pago. Puede diferir de la factura. */
  currency: CurrencyEnum.optional(),
  /**
   * Tipo de cambio ARS/USD al momento del pago.
   * Requerido cuando currency === 'ARS'.
   */
  exchangeRate: z21.number().positive().optional(),
  method: PaymentMethodEnum.optional(),
  paidAt: z21.string().optional(),
  // ISO datetime
  reference: z21.string().optional()
});
var ListInvoicesQuerySchema = z21.object({
  /**
   * Tabs de listado:
   * - 'all': todas las facturas no archivadas
   * - 'por_cobrar': enviadas + vencidas (saldo > 0)
   * - 'vencidas': solo vencidas
   * - 'pagadas': pagadas completamente (saldo 0)
   * - 'borradores': en draft
   */
  tab: z21.enum(["all", "por_cobrar", "vencidas", "pagadas", "borradores"]).optional(),
  status: InvoiceStatusEnum.optional()
});
var ListPaymentsQuerySchema = z21.object({
  method: PaymentMethodEnum.optional(),
  from: z21.string().optional(),
  to: z21.string().optional(),
  companyId: z21.string().optional(),
  invoiceId: z21.string().optional()
});
var CreateExpenseSchema = z21.object({
  description: z21.string().min(1),
  amount: z21.number().positive(),
  currency: CurrencyEnum,
  /**
   * Tipo de cambio ARS/USD al momento del gasto.
   * Requerido cuando currency === 'ARS'; se ignora (forzado a 1) para USD.
   */
  exchangeRate: z21.number().positive().optional(),
  /** amountBase pre-calculado por el front (evita recalculo); si no viene, se calcula en el service. */
  amountBase: z21.number().positive().optional(),
  category: ExpenseCategoryEnum,
  expenseDate: z21.string(),
  // YYYY-MM-DD
  vendor: z21.string().optional(),
  dealId: z21.string().min(1).optional(),
  companyId: z21.string().min(1).optional(),
  paymentMethod: PaymentMethodEnum.optional(),
  isRecurring: z21.boolean().optional(),
  storageKey: z21.string().optional(),
  notes: z21.string().optional()
});
var UpdateExpenseSchema = CreateExpenseSchema.partial();
var ListExpensesQuerySchema = z21.object({
  category: ExpenseCategoryEnum.optional(),
  dealId: z21.string().optional(),
  from: z21.string().optional(),
  to: z21.string().optional(),
  isRecurring: z21.string().transform((v) => v === "true").optional()
});
var CreateRetainerSchema = z21.object({
  companyId: z21.string().min(1),
  amount: z21.number().positive(),
  currency: CurrencyEnum,
  /** Tipo de cambio ARS/USD al crear el retainer. Requerido para ARS. */
  exchangeRate: z21.number().positive().optional(),
  /** amountBase pre-calculado; si no viene, se calcula en el service. */
  amountBase: z21.number().positive().optional(),
  /** Día del mes (1–28) en que se genera la factura mensual. */
  billingDay: z21.number().int().min(1).max(28),
  startDate: z21.string(),
  // YYYY-MM-DD
  endDate: z21.string().optional(),
  notes: z21.string().optional()
});
var UpdateRetainerSchema = z21.object({
  status: RetainerStatusEnum.optional(),
  amount: z21.number().positive().optional(),
  currency: CurrencyEnum.optional(),
  exchangeRate: z21.number().positive().optional(),
  amountBase: z21.number().positive().optional(),
  billingDay: z21.number().int().min(1).max(28).optional(),
  endDate: z21.string().optional(),
  notes: z21.string().optional()
});
var ListRetainersQuerySchema = z21.object({
  status: RetainerStatusEnum.optional(),
  companyId: z21.string().optional()
});
var SummaryQuerySchema = z21.object({
  from: z21.string().optional(),
  // YYYY-MM-DD
  to: z21.string().optional()
});
var MonthlySummaryQuerySchema = z21.object({
  months: z21.string().transform((v) => parseInt(v, 10)).pipe(z21.number().int().min(1).max(24)).optional()
});
var DebtorsQuerySchema = z21.object({
  limit: z21.string().transform((v) => parseInt(v, 10)).pipe(z21.number().int().min(1).max(50)).optional()
});

// src/modules/finance/finance.service.ts
import { and as and24, asc as asc8, between, desc as desc17, eq as eq28, gte as gte3, inArray as inArray11, lte as lte3, sql as sql27, sum as sum2 } from "drizzle-orm";

// src/lib/fx.ts
var CACHE_TTL_MS = 10 * 60 * 1e3;
var cache = null;
async function fetchRate(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    // Timeout explícito usando AbortSignal (Node 18+)
    signal: AbortSignal.timeout(5e3)
  });
  if (!res.ok) {
    throw new Error(`dolarapi respondi\xF3 ${res.status} para ${url}`);
  }
  const json = await res.json();
  return {
    compra: json.compra,
    venta: json.venta,
    fecha: json.fechaActualizacion
  };
}
async function getDolarRates() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.rates;
  }
  try {
    const [blue, tarjeta] = await Promise.all([
      fetchRate("https://dolarapi.com/v1/dolares/blue"),
      fetchRate("https://dolarapi.com/v1/dolares/tarjeta")
    ]);
    const rates = { blue, tarjeta };
    cache = { rates, fetchedAt: Date.now() };
    return rates;
  } catch (err) {
    if (cache) {
      console.warn("[fx] dolarapi no disponible \u2014 usando cach\xE9 anterior:", err.message);
      return cache.rates;
    }
    console.error("[fx] dolarapi no disponible y sin cach\xE9:", err.message);
    throw Errors.internal(
      "No se pudo obtener la cotizaci\xF3n del d\xF3lar. Intent\xE1 de nuevo en unos segundos."
    );
  }
}

// src/modules/finance/finance.service.ts
function num(n) {
  return toDecimal(n);
}
function calcAmountBase(amount, currency, exchangeRate) {
  if (currency === "USD") return amount;
  return amount / exchangeRate;
}
async function requireInvoice(portalId, id) {
  const [row] = await db.select().from(invoice).where(and24(eq28(invoice.id, id), eq28(invoice.portalId, portalId), eq28(invoice.archived, false))).limit(1);
  if (!row) throw Errors.notFound("Factura no encontrada");
  return row;
}
async function requireExpense(portalId, id) {
  const [row] = await db.select().from(expense).where(and24(eq28(expense.id, id), eq28(expense.portalId, portalId), eq28(expense.archived, false))).limit(1);
  if (!row) throw Errors.notFound("Gasto no encontrado");
  return row;
}
async function requireRetainer(portalId, id) {
  const [row] = await db.select().from(retainer).where(and24(eq28(retainer.id, id), eq28(retainer.portalId, portalId), eq28(retainer.archived, false))).limit(1);
  if (!row) throw Errors.notFound("Retainer no encontrado");
  return row;
}
function computeDerivedStatus(inv, balance) {
  if (inv.status === "draft") return "borrador";
  if (inv.status === "void") return "anulada";
  const amtBase = Number(inv.amountBase);
  if (balance <= 0) return "pagada";
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  if (inv.dueDate && inv.dueDate < today) return "vencida";
  if (balance < amtBase) return "parcial";
  return "enviada";
}
async function listInvoices(portalId, query) {
  const conditions = [eq28(invoice.portalId, portalId), eq28(invoice.archived, false)];
  const { tab, status } = query;
  if (status) {
    conditions.push(eq28(invoice.status, status));
  } else if (tab === "borradores") {
    conditions.push(eq28(invoice.status, "draft"));
  } else if (tab === "vencidas") {
    conditions.push(eq28(invoice.status, "overdue"));
  } else if (tab === "pagadas") {
    conditions.push(eq28(invoice.status, "paid"));
  } else if (tab === "por_cobrar") {
    conditions.push(inArray11(invoice.status, ["sent", "overdue"]));
  }
  const invoices = await db.select().from(invoice).where(and24(...conditions)).orderBy(desc17(invoice.createdAt));
  if (invoices.length === 0) return [];
  const ids = invoices.map((i) => i.id);
  const paidByInvoice = await db.select({ invoiceId: payment.invoiceId, total: sum2(payment.amountBase) }).from(payment).where(inArray11(payment.invoiceId, ids)).groupBy(payment.invoiceId);
  const paidMap = new Map(
    paidByInvoice.map((r) => [r.invoiceId, Number(r.total ?? 0)])
  );
  const companyIds = [...new Set(invoices.map((i) => i.companyId).filter(Boolean))];
  let companyMap = /* @__PURE__ */ new Map();
  if (companyIds.length > 0) {
    const companies = await db.select({ id: company.id, name: company.name }).from(company).where(inArray11(company.id, companyIds));
    companyMap = new Map(companies.map((c) => [c.id, c.name]));
  }
  return invoices.map((inv) => {
    const totalPaid = paidMap.get(inv.id) ?? 0;
    const balanceNum = Math.max(0, Number(inv.amountBase) - totalPaid);
    return {
      ...inv,
      balance: num(balanceNum),
      derivedStatus: computeDerivedStatus(inv, balanceNum),
      companyName: inv.companyId ? companyMap.get(inv.companyId) ?? null : null
    };
  });
}
async function getInvoiceDetail(portalId, id) {
  const inv = await requireInvoice(portalId, id);
  const items = await db.select().from(invoiceItem).where(eq28(invoiceItem.invoiceId, id));
  const payments_ = await db.select().from(payment).where(eq28(payment.invoiceId, id)).orderBy(desc17(payment.paidAt));
  const totalPaid = payments_.reduce((acc, p) => acc + Number(p.amountBase), 0);
  const balance = num(Math.max(0, Number(inv.amountBase) - totalPaid));
  return { invoice: inv, items, payments: payments_, balance };
}
async function createInvoice(portalId, userId, input) {
  return db.transaction(async (tx) => {
    const [numRow] = await tx.select({ next: sql27`coalesce(max(${invoice.number}), 0) + 1` }).from(invoice).where(eq28(invoice.portalId, portalId));
    const next = numRow?.next ?? 1;
    const subtotal = input.items.reduce((acc, it) => acc + (it.quantity ?? 1) * it.unitPrice, 0);
    const tax = input.tax ?? 0;
    const total = subtotal + tax;
    const currency = input.currency ?? "USD";
    const exchangeRate = currency === "ARS" ? input.exchangeRate ?? 1 : 1;
    const amountBase = calcAmountBase(total, currency, exchangeRate);
    const [row] = await tx.insert(invoice).values({
      portalId,
      number: next,
      dealId: input.dealId ?? null,
      companyId: input.companyId ?? null,
      status: "draft",
      issueDate: input.issueDate ?? null,
      dueDate: input.dueDate ?? null,
      currency,
      exchangeRate: num(exchangeRate),
      amountBase: num(amountBase),
      subtotal: num(subtotal),
      tax: num(tax),
      total: num(total),
      notes: input.notes ?? null,
      retainerId: input.retainerId ?? null,
      createdBy: userId
    }).returning();
    if (!row) throw Errors.internal("No se pudo crear la factura");
    await tx.insert(invoiceItem).values(
      input.items.map((it) => ({
        invoiceId: row.id,
        description: it.description,
        quantity: num(it.quantity ?? 1),
        unitPrice: num(it.unitPrice)
      }))
    );
    return row;
  });
}
async function updateInvoice(portalId, id, input) {
  const inv = await requireInvoice(portalId, id);
  if (inv.status !== "draft") throw Errors.badRequest("Solo se puede editar una factura en borrador");
  const currency = input.currency ?? inv.currency;
  const exchangeRate = input.exchangeRate != null ? currency === "ARS" ? input.exchangeRate : 1 : Number(inv.exchangeRate);
  const needsRecalc = input.currency != null || input.exchangeRate != null;
  const amountBase = needsRecalc ? calcAmountBase(Number(inv.total), currency, exchangeRate) : Number(inv.amountBase);
  const [row] = await db.update(invoice).set({
    ...input.dealId !== void 0 ? { dealId: input.dealId } : {},
    ...input.companyId !== void 0 ? { companyId: input.companyId } : {},
    ...input.issueDate !== void 0 ? { issueDate: input.issueDate } : {},
    ...input.dueDate !== void 0 ? { dueDate: input.dueDate } : {},
    ...input.currency !== void 0 ? { currency } : {},
    ...needsRecalc ? { exchangeRate: num(exchangeRate), amountBase: num(amountBase) } : {},
    ...input.notes !== void 0 ? { notes: input.notes } : {},
    updatedAt: /* @__PURE__ */ new Date()
  }).where(eq28(invoice.id, id)).returning();
  return row;
}
async function transitionInvoice(portalId, id, status) {
  await requireInvoice(portalId, id);
  const [row] = await db.update(invoice).set({ status, updatedAt: /* @__PURE__ */ new Date() }).where(eq28(invoice.id, id)).returning();
  return row;
}
async function archiveInvoice(portalId, id) {
  await requireInvoice(portalId, id);
  await db.update(invoice).set({ archived: true, archivedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }).where(eq28(invoice.id, id));
}
async function listPayments(portalId, query) {
  const conditions = [eq28(payment.portalId, portalId)];
  if (query.method) conditions.push(eq28(payment.method, query.method));
  if (query.invoiceId) conditions.push(eq28(payment.invoiceId, query.invoiceId));
  if (query.from && query.to) {
    conditions.push(between(payment.paidAt, new Date(query.from), /* @__PURE__ */ new Date(query.to + "T23:59:59Z")));
  } else if (query.from) {
    conditions.push(gte3(payment.paidAt, new Date(query.from)));
  } else if (query.to) {
    conditions.push(lte3(payment.paidAt, /* @__PURE__ */ new Date(query.to + "T23:59:59Z")));
  }
  const payments_ = await db.select().from(payment).where(and24(...conditions)).orderBy(desc17(payment.paidAt));
  if (payments_.length === 0) {
    return { payments: [], meta: { totalPeriod: "0.00" } };
  }
  const invoiceIds = [...new Set(payments_.map((p) => p.invoiceId))];
  const invoiceRows = await db.select({ id: invoice.id, number: invoice.number, currency: invoice.currency, companyId: invoice.companyId }).from(invoice).where(inArray11(invoice.id, invoiceIds));
  const invoiceMap = new Map(invoiceRows.map((r) => [r.id, r]));
  const companyIds = [
    ...new Set(invoiceRows.map((r) => r.companyId).filter(Boolean))
  ];
  let companyMap = /* @__PURE__ */ new Map();
  if (companyIds.length > 0) {
    const companies = await db.select({ id: company.id, name: company.name }).from(company).where(inArray11(company.id, companyIds));
    companyMap = new Map(companies.map((c) => [c.id, c.name]));
  }
  let filtered = payments_;
  if (query.companyId) {
    const validInvoiceIds = new Set(
      invoiceRows.filter((r) => r.companyId === query.companyId).map((r) => r.id)
    );
    filtered = payments_.filter((p) => validInvoiceIds.has(p.invoiceId));
  }
  const totalPeriod = filtered.reduce((acc, p) => acc + Number(p.amountBase ?? 0), 0);
  const enriched = filtered.map((p) => {
    const inv = invoiceMap.get(p.invoiceId);
    return {
      ...p,
      invoiceNumber: inv?.number ?? null,
      invoiceCurrency: inv?.currency ?? null,
      companyName: inv?.companyId ? companyMap.get(inv.companyId) ?? null : null
    };
  });
  return { payments: enriched, meta: { totalPeriod: num(totalPeriod) } };
}
async function registerPayment(portalId, userId, input) {
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invoice).where(and24(eq28(invoice.id, input.invoiceId), eq28(invoice.portalId, portalId), eq28(invoice.archived, false))).limit(1);
    if (!inv) throw Errors.notFound("Factura no encontrada");
    const currency = input.currency ?? "USD";
    const exchangeRate = currency === "ARS" ? input.exchangeRate ?? 1 : 1;
    const amountBase = calcAmountBase(input.amount, currency, exchangeRate);
    const [row] = await tx.insert(payment).values({
      portalId,
      invoiceId: input.invoiceId,
      amount: num(input.amount),
      currency,
      exchangeRate: num(exchangeRate),
      amountBase: num(amountBase),
      method: input.method ?? "transfer",
      paidAt: input.paidAt ? new Date(input.paidAt) : /* @__PURE__ */ new Date(),
      reference: input.reference ?? null,
      createdBy: userId
    }).returning();
    if (!row) throw Errors.internal("No se pudo registrar el cobro");
    const [totals] = await tx.select({ total: sum2(payment.amountBase) }).from(payment).where(eq28(payment.invoiceId, input.invoiceId));
    const totalPaid = Number(totals?.total ?? 0);
    if (totalPaid >= Number(inv.amountBase)) {
      await tx.update(invoice).set({ status: "paid", updatedAt: /* @__PURE__ */ new Date() }).where(eq28(invoice.id, input.invoiceId));
    }
    return row;
  });
}
async function listExpenses(portalId, query) {
  const conditions = [eq28(expense.portalId, portalId), eq28(expense.archived, false)];
  if (query.category) conditions.push(eq28(expense.category, query.category));
  if (query.dealId) conditions.push(eq28(expense.dealId, query.dealId));
  if (query.isRecurring != null) conditions.push(eq28(expense.isRecurring, query.isRecurring));
  if (query.from && query.to) {
    conditions.push(between(expense.expenseDate, query.from, query.to));
  } else if (query.from) {
    conditions.push(gte3(expense.expenseDate, query.from));
  } else if (query.to) {
    conditions.push(lte3(expense.expenseDate, query.to));
  }
  return db.select().from(expense).where(and24(...conditions)).orderBy(desc17(expense.expenseDate));
}
async function createExpense(portalId, userId, input) {
  return db.transaction(async (tx) => {
    const currency = input.currency;
    const exchangeRate = currency === "ARS" ? input.exchangeRate ?? 1 : 1;
    const amountBase = input.amountBase != null ? input.amountBase : calcAmountBase(input.amount, currency, exchangeRate);
    const [row] = await tx.insert(expense).values({
      portalId,
      description: input.description,
      amount: num(input.amount),
      currency,
      exchangeRate: num(exchangeRate),
      amountBase: num(amountBase),
      category: input.category,
      expenseDate: input.expenseDate,
      vendor: input.vendor ?? null,
      dealId: input.dealId ?? null,
      companyId: input.companyId ?? null,
      paymentMethod: input.paymentMethod ?? null,
      isRecurring: input.isRecurring ?? false,
      notes: input.notes ?? null,
      storageKey: input.storageKey ?? null,
      createdBy: userId
    }).returning();
    if (!row) throw Errors.internal("No se pudo crear el gasto");
    await recordFieldChanges({
      tx,
      portalId,
      entityType: "expense",
      entityId: row.id,
      before: {},
      after: {
        description: input.description,
        amount: input.amount,
        currency,
        category: input.category,
        expenseDate: input.expenseDate
      },
      changedBy: userId,
      sourceType: "API"
    });
    return row;
  });
}
async function updateExpense(portalId, id, userId, input) {
  return db.transaction(async (tx) => {
    const current = await requireExpense(portalId, id);
    const currency = input.currency ?? current.currency;
    const amount = input.amount ?? Number(current.amount);
    const exchangeRate = input.exchangeRate != null ? currency === "ARS" ? input.exchangeRate : 1 : Number(current.exchangeRate);
    const needsRecalc = input.amount != null || input.currency != null || input.exchangeRate != null;
    const amountBase = needsRecalc ? calcAmountBase(amount, currency, exchangeRate) : Number(current.amountBase);
    const patch = {
      updatedAt: /* @__PURE__ */ new Date()
    };
    if (input.description != null) patch.description = input.description;
    if (input.amount != null) patch.amount = num(input.amount);
    if (input.currency != null) patch.currency = input.currency;
    if (needsRecalc) {
      patch.exchangeRate = num(exchangeRate);
      patch.amountBase = num(amountBase);
    }
    if (input.category != null) patch.category = input.category;
    if (input.expenseDate != null) patch.expenseDate = input.expenseDate;
    if (input.vendor !== void 0) patch.vendor = input.vendor ?? null;
    if (input.dealId !== void 0) patch.dealId = input.dealId ?? null;
    if (input.companyId !== void 0) patch.companyId = input.companyId ?? null;
    if (input.paymentMethod !== void 0) patch.paymentMethod = input.paymentMethod ?? null;
    if (input.isRecurring != null) patch.isRecurring = input.isRecurring;
    if (input.notes !== void 0) patch.notes = input.notes ?? null;
    if (input.storageKey !== void 0) patch.storageKey = input.storageKey ?? null;
    const [updated] = await tx.update(expense).set(patch).where(eq28(expense.id, id)).returning();
    if (!updated) throw Errors.internal("No se pudo actualizar el gasto");
    await recordFieldChanges({
      tx,
      portalId,
      entityType: "expense",
      entityId: id,
      before: current,
      after: patch,
      changedBy: userId,
      sourceType: "API"
    });
    return updated;
  });
}
async function archiveExpense(portalId, id) {
  await requireExpense(portalId, id);
  await db.update(expense).set({ archived: true, archivedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }).where(eq28(expense.id, id));
}
async function expenseSummary(portalId) {
  const expenses = await db.select().from(expense).where(and24(eq28(expense.portalId, portalId), eq28(expense.archived, false)));
  let totalUsd = 0;
  let totalArs = 0;
  const byCategory = {};
  for (const e of expenses) {
    const base = Number(e.amountBase);
    totalUsd += base;
    if (e.currency === "ARS") {
      totalArs += Number(e.amount);
    }
    byCategory[e.category] = (byCategory[e.category] ?? 0) + base;
  }
  return {
    totalExpenses: num(totalUsd),
    totalExpensesArs: num(totalArs),
    byCategory: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [k, num(v)])
    )
  };
}
async function listRetainers(portalId, query) {
  const conditions = [eq28(retainer.portalId, portalId), eq28(retainer.archived, false)];
  if (query.status) conditions.push(eq28(retainer.status, query.status));
  if (query.companyId) conditions.push(eq28(retainer.companyId, query.companyId));
  const retainers = await db.select().from(retainer).where(and24(...conditions)).orderBy(asc8(retainer.startDate));
  if (retainers.length === 0) return [];
  const companyIds = [...new Set(retainers.map((r) => r.companyId))];
  const companies = await db.select({ id: company.id, name: company.name }).from(company).where(inArray11(company.id, companyIds));
  const companyMap = new Map(companies.map((c) => [c.id, c.name]));
  return retainers.map((r) => ({ ...r, companyName: companyMap.get(r.companyId) ?? null }));
}
async function getRetainerDetail(portalId, id) {
  const ret = await requireRetainer(portalId, id);
  const [companyRow] = await db.select({ name: company.name }).from(company).where(eq28(company.id, ret.companyId)).limit(1);
  const invoices_ = await db.select().from(invoice).where(and24(eq28(invoice.retainerId, id), eq28(invoice.archived, false))).orderBy(desc17(invoice.createdAt));
  return {
    ...ret,
    companyName: companyRow?.name ?? null,
    invoices: invoices_
  };
}
async function createRetainer(portalId, userId, input) {
  const [companyRow] = await db.select().from(company).where(and24(eq28(company.id, input.companyId), eq28(company.portalId, portalId))).limit(1);
  if (!companyRow) throw Errors.notFound("Empresa no encontrada");
  const currency = input.currency;
  const exchangeRate = currency === "ARS" ? input.exchangeRate ?? 1 : 1;
  const amountBase = input.amountBase != null ? input.amountBase : calcAmountBase(input.amount, currency, exchangeRate);
  const [row] = await db.insert(retainer).values({
    portalId,
    companyId: input.companyId,
    amount: num(input.amount),
    currency,
    exchangeRate: num(exchangeRate),
    amountBase: num(amountBase),
    billingDay: input.billingDay,
    status: "active",
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    notes: input.notes ?? null,
    createdBy: userId
  }).returning();
  if (!row) throw Errors.internal("No se pudo crear el retainer");
  return { ...row, companyName: companyRow.name };
}
async function updateRetainer(portalId, id, input) {
  return db.transaction(async (tx) => {
    const current = await requireRetainer(portalId, id);
    if (current.status === "cancelled" && input.status && input.status !== "cancelled") {
      throw Errors.badRequest("Un retainer cancelado no puede reactivarse");
    }
    const currency = input.currency ?? current.currency;
    const amount = input.amount ?? Number(current.amount);
    const exchangeRate = input.exchangeRate != null ? currency === "ARS" ? input.exchangeRate : 1 : Number(current.exchangeRate);
    const needsRecalc = input.amount != null || input.currency != null || input.exchangeRate != null;
    const amountBase = needsRecalc ? calcAmountBase(amount, currency, exchangeRate) : Number(current.amountBase);
    const [updated] = await tx.update(retainer).set({
      ...input.status != null ? { status: input.status } : {},
      ...input.amount != null ? { amount: num(input.amount) } : {},
      ...input.currency != null ? { currency } : {},
      ...needsRecalc ? { exchangeRate: num(exchangeRate), amountBase: num(amountBase) } : {},
      ...input.billingDay != null ? { billingDay: input.billingDay } : {},
      ...input.endDate !== void 0 ? { endDate: input.endDate ?? null } : {},
      ...input.notes !== void 0 ? { notes: input.notes ?? null } : {},
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq28(retainer.id, id)).returning();
    if (!updated) throw Errors.internal("No se pudo actualizar el retainer");
    const [companyRow] = await db.select({ name: company.name }).from(company).where(eq28(company.id, updated.companyId)).limit(1);
    return { ...updated, companyName: companyRow?.name ?? null };
  });
}
async function archiveRetainer(portalId, id) {
  await requireRetainer(portalId, id);
  await db.update(retainer).set({ archived: true, archivedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }).where(eq28(retainer.id, id));
}
async function generateRetainerInvoice(portalId, retainerId, userId) {
  return db.transaction(async (tx) => {
    const ret = await requireRetainer(portalId, retainerId);
    if (ret.status !== "active") {
      throw Errors.badRequest("Solo se puede generar factura para un retainer activo");
    }
    const currentMonth = (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
    const [existing] = await tx.select().from(invoice).where(
      and24(
        eq28(invoice.retainerId, retainerId),
        eq28(invoice.archived, false),
        // issueDate LIKE 'YYYY-MM-%'
        sql27`${invoice.issueDate} LIKE ${currentMonth + "-%"}`
      )
    ).limit(1);
    if (existing) return { invoice: existing, created: false };
    const [numRow] = await tx.select({ next: sql27`coalesce(max(${invoice.number}), 0) + 1` }).from(invoice).where(eq28(invoice.portalId, portalId));
    const next = numRow?.next ?? 1;
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const [row] = await tx.insert(invoice).values({
      portalId,
      number: next,
      companyId: ret.companyId,
      status: "draft",
      issueDate: today,
      // vencimiento = mismo día del billing day del mes actual
      dueDate: `${currentMonth}-${String(ret.billingDay).padStart(2, "0")}`,
      currency: ret.currency,
      exchangeRate: ret.exchangeRate,
      amountBase: ret.amountBase,
      subtotal: ret.amount,
      tax: "0",
      total: ret.amount,
      notes: `Factura autom\xE1tica \u2014 retainer ${retainerId.slice(-6)}`,
      retainerId,
      createdBy: userId
    }).returning();
    if (!row) throw Errors.internal("No se pudo generar la factura del retainer");
    await tx.insert(invoiceItem).values({
      invoiceId: row.id,
      description: "Honorarios mensuales (retainer)",
      quantity: "1",
      unitPrice: ret.amount
    });
    return { invoice: row, created: true };
  });
}
async function financeSummary(portalId, query) {
  const invoiceConds = [eq28(invoice.portalId, portalId), eq28(invoice.archived, false)];
  if (query.from && query.to) {
    invoiceConds.push(between(invoice.issueDate, query.from, query.to));
  } else if (query.from) {
    invoiceConds.push(gte3(invoice.issueDate, query.from));
  } else if (query.to) {
    invoiceConds.push(lte3(invoice.issueDate, query.to));
  }
  const invoicesInPeriod = await db.select().from(invoice).where(and24(...invoiceConds));
  const totalInvoiced = invoicesInPeriod.filter((i) => i.status !== "void").reduce((acc, i) => acc + Number(i.amountBase), 0);
  const invoicesByStatus = {};
  for (const inv of invoicesInPeriod) {
    invoicesByStatus[inv.status] = (invoicesByStatus[inv.status] ?? 0) + 1;
  }
  const paymentConds = [eq28(payment.portalId, portalId)];
  if (query.from && query.to) {
    paymentConds.push(between(payment.paidAt, new Date(query.from), /* @__PURE__ */ new Date(query.to + "T23:59:59Z")));
  } else if (query.from) {
    paymentConds.push(gte3(payment.paidAt, new Date(query.from)));
  } else if (query.to) {
    paymentConds.push(lte3(payment.paidAt, /* @__PURE__ */ new Date(query.to + "T23:59:59Z")));
  }
  const [payTotals] = await db.select({ total: sum2(payment.amountBase) }).from(payment).where(and24(...paymentConds));
  const totalPaid = Number(payTotals?.total ?? 0);
  const expenseConds = [eq28(expense.portalId, portalId), eq28(expense.archived, false)];
  if (query.from && query.to) {
    expenseConds.push(between(expense.expenseDate, query.from, query.to));
  } else if (query.from) {
    expenseConds.push(gte3(expense.expenseDate, query.from));
  } else if (query.to) {
    expenseConds.push(lte3(expense.expenseDate, query.to));
  }
  const [expTotals] = await db.select({ total: sum2(expense.amountBase) }).from(expense).where(and24(...expenseConds));
  const totalExpenses = Number(expTotals?.total ?? 0);
  const netProfit = totalPaid - totalExpenses;
  const openInvoices = await db.select().from(invoice).where(
    and24(
      eq28(invoice.portalId, portalId),
      eq28(invoice.archived, false),
      inArray11(invoice.status, ["sent", "overdue"])
    )
  );
  let outstanding = 0;
  if (openInvoices.length > 0) {
    const openIds = openInvoices.map((i) => i.id);
    const paidByInvoice = await db.select({ invoiceId: payment.invoiceId, total: sum2(payment.amountBase) }).from(payment).where(inArray11(payment.invoiceId, openIds)).groupBy(payment.invoiceId);
    const paidMap = new Map(
      paidByInvoice.map((r) => [r.invoiceId, Number(r.total ?? 0)])
    );
    for (const inv of openInvoices) {
      outstanding += Math.max(0, Number(inv.amountBase) - (paidMap.get(inv.id) ?? 0));
    }
  }
  const [mrrRow] = await db.select({ total: sum2(retainer.amountBase) }).from(retainer).where(and24(eq28(retainer.portalId, portalId), eq28(retainer.status, "active"), eq28(retainer.archived, false)));
  const mrr = Number(mrrRow?.total ?? 0);
  return {
    totalInvoiced: num(totalInvoiced),
    totalPaid: num(totalPaid),
    outstanding: num(outstanding),
    totalExpenses: num(totalExpenses),
    netProfit: num(netProfit),
    mrr: num(mrr),
    invoicesByStatus
  };
}
async function monthlySummary(portalId, months = 6) {
  const now = /* @__PURE__ */ new Date();
  const points = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = d.toISOString().slice(0, 7);
    points.push({ month, income: 0, expenses: 0 });
  }
  const from = points[0].month + "-01";
  const to = now.toISOString().slice(0, 10);
  const incomeRows = await db.select({
    month: sql27`to_char(${payment.paidAt}, 'YYYY-MM')`,
    total: sum2(payment.amountBase)
  }).from(payment).where(and24(eq28(payment.portalId, portalId), gte3(payment.paidAt, new Date(from)))).groupBy(sql27`to_char(${payment.paidAt}, 'YYYY-MM')`);
  const expenseRows = await db.select({
    month: sql27`to_char(${expense.expenseDate}::date, 'YYYY-MM')`,
    total: sum2(expense.amountBase)
  }).from(expense).where(
    and24(
      eq28(expense.portalId, portalId),
      eq28(expense.archived, false),
      between(expense.expenseDate, from, to)
    )
  ).groupBy(sql27`to_char(${expense.expenseDate}::date, 'YYYY-MM')`);
  const incomeMap = new Map(incomeRows.map((r) => [r.month, Number(r.total ?? 0)]));
  const expenseMap = new Map(expenseRows.map((r) => [r.month, Number(r.total ?? 0)]));
  return points.map((p) => {
    const income = incomeMap.get(p.month) ?? 0;
    const expenses = expenseMap.get(p.month) ?? 0;
    return { month: p.month, income: num(income), expenses: num(expenses), net: num(income - expenses) };
  });
}
async function topDebtors(portalId, limit = 5) {
  const openInvoices = await db.select().from(invoice).where(
    and24(
      eq28(invoice.portalId, portalId),
      eq28(invoice.archived, false),
      inArray11(invoice.status, ["sent", "overdue"])
    )
  );
  if (openInvoices.length === 0) return [];
  const openIds = openInvoices.map((i) => i.id);
  const paidByInvoice = await db.select({ invoiceId: payment.invoiceId, total: sum2(payment.amountBase) }).from(payment).where(inArray11(payment.invoiceId, openIds)).groupBy(payment.invoiceId);
  const paidMap = new Map(
    paidByInvoice.map((r) => [r.invoiceId, Number(r.total ?? 0)])
  );
  const debtorMap = /* @__PURE__ */ new Map();
  for (const inv of openInvoices) {
    if (!inv.companyId) continue;
    const balance = Math.max(0, Number(inv.amountBase) - (paidMap.get(inv.id) ?? 0));
    debtorMap.set(inv.companyId, (debtorMap.get(inv.companyId) ?? 0) + balance);
  }
  if (debtorMap.size === 0) return [];
  const companyIds = [...debtorMap.keys()].slice(0, 50);
  const companies = await db.select({ id: company.id, name: company.name }).from(company).where(inArray11(company.id, companyIds));
  const companyMap = new Map(companies.map((c) => [c.id, c.name]));
  return [...debtorMap.entries()].sort(([, a], [, b]) => b - a).slice(0, limit).map(([companyId, outstanding]) => ({
    companyId,
    companyName: companyMap.get(companyId) ?? companyId,
    outstanding: num(outstanding)
  }));
}
async function generateInvoicePdf(portalId, id) {
  const { invoice: inv, items } = await getInvoiceDetail(portalId, id);
  const [portalRow] = await db.select({ name: portal.name }).from(portal).where(eq28(portal.id, portalId)).limit(1);
  const portalName = portalRow?.name ?? "NOUS";
  let companyName = "\u2014";
  if (inv.companyId) {
    const [companyRow] = await db.select({ name: company.name }).from(company).where(eq28(company.id, inv.companyId)).limit(1);
    companyName = companyRow?.name ?? "\u2014";
  }
  const easyinvoice = (await import("easyinvoice")).default;
  const result = await easyinvoice.createInvoice({
    apiKey: "free",
    sender: { company: portalName },
    client: { company: companyName },
    information: {
      number: String(inv.number),
      date: inv.issueDate ?? void 0,
      dueDate: inv.dueDate ?? void 0
    },
    products: items.map((item) => ({
      quantity: String(item.quantity),
      description: item.description,
      taxRate: 0,
      price: Number(item.unitPrice)
    })),
    settings: { currency: inv.currency ?? "USD" }
  });
  return { filename: `factura-${inv.number}.pdf`, pdf: result.pdf };
}

// src/modules/finance/finance.router.ts
var TAG22 = "Finanzas";
var security21 = ADMIN_SECURITY;
var financeAuth = [authorize("owner", "member")];
async function financeRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/invoices",
    {
      schema: {
        tags: [TAG22],
        summary: "Listar facturas",
        description: "Lista facturas con derivedStatus y balance. Soporta tabs: all|por_cobrar|vencidas|pagadas|borradores.",
        security: security21,
        querystring: ListInvoicesQuerySchema
      },
      preHandler: financeAuth
    },
    async (request) => {
      const invoices = await listInvoices(request.hubUser.portalId, request.query);
      return ok(invoices);
    }
  );
  r.post(
    "/invoices",
    {
      schema: {
        tags: [TAG22],
        summary: "Crear factura",
        description: "Crea una factura con multimoneda. Calcula amountBase autom\xE1ticamente.",
        security: security21,
        body: CreateInvoiceSchema
      },
      preHandler: financeAuth
    },
    async (request, reply) => {
      const created = await createInvoice(request.hubUser.portalId, request.hubUser.sub, request.body);
      return reply.status(201).send(ok(created));
    }
  );
  r.get(
    "/invoices/:id",
    {
      schema: {
        tags: [TAG22],
        summary: "Detalle de factura",
        description: "Devuelve la factura con \xEDtems, cobros y balance pendiente en USD.",
        security: security21,
        params: IdParamSchema
      },
      preHandler: financeAuth
    },
    async (request) => {
      return ok(await getInvoiceDetail(request.hubUser.portalId, request.params.id));
    }
  );
  r.get(
    "/invoices/:id/pdf",
    {
      schema: {
        tags: [TAG22],
        summary: "PDF de factura",
        description: "Genera el PDF en el servidor y devuelve el base64 para descarga en el cliente.",
        security: security21,
        params: IdParamSchema
      },
      preHandler: financeAuth
    },
    async (request) => {
      return ok(await generateInvoicePdf(request.hubUser.portalId, request.params.id));
    }
  );
  r.patch(
    "/invoices/:id",
    {
      schema: {
        tags: [TAG22],
        summary: "Actualizar factura",
        description: "Actualiza campos de una factura en borrador. Recalcula amountBase si cambia moneda/TC.",
        security: security21,
        params: IdParamSchema,
        body: UpdateInvoiceSchema
      },
      preHandler: financeAuth
    },
    async (request) => {
      return ok(await updateInvoice(request.hubUser.portalId, request.params.id, request.body));
    }
  );
  r.post(
    "/invoices/:id/transition",
    {
      schema: {
        tags: [TAG22],
        summary: "Cambiar estado de factura",
        description: "Transiciona el estado manual (draft\u2192sent, sent\u2192overdue, etc.).",
        security: security21,
        params: IdParamSchema,
        body: TransitionInvoiceSchema
      },
      preHandler: financeAuth
    },
    async (request) => {
      return ok(await transitionInvoice(request.hubUser.portalId, request.params.id, request.body.status));
    }
  );
  r.delete(
    "/invoices/:id",
    {
      schema: {
        tags: [TAG22],
        summary: "Archivar factura",
        description: "Archiva la factura (soft-delete). No elimina datos de cobros asociados.",
        security: security21,
        params: IdParamSchema
      },
      preHandler: financeAuth
    },
    async (request) => {
      await archiveInvoice(request.hubUser.portalId, request.params.id);
      return ok({ success: true });
    }
  );
  r.get(
    "/payments",
    {
      schema: {
        tags: [TAG22],
        summary: "Listar cobros",
        description: "Lista cobros enriquecidos (n\xFAmero de factura, moneda, empresa). Soporta filtros method/from/to/companyId/invoiceId.",
        security: security21,
        querystring: ListPaymentsQuerySchema
      },
      preHandler: financeAuth
    },
    async (request) => {
      const result = await listPayments(request.hubUser.portalId, request.query);
      return ok(result.payments, { totalPeriod: result.meta.totalPeriod });
    }
  );
  r.post(
    "/payments",
    {
      schema: {
        tags: [TAG22],
        summary: "Registrar cobro",
        description: "Registra un cobro. El TC se congela al momento del pago. Si cubre el amountBase, marca la factura como pagada.",
        security: security21,
        body: CreatePaymentSchema
      },
      preHandler: financeAuth
    },
    async (request, reply) => {
      const created = await registerPayment(request.hubUser.portalId, request.hubUser.sub, request.body);
      return reply.status(201).send(ok(created));
    }
  );
  r.get(
    "/expenses",
    {
      schema: {
        tags: [TAG22],
        summary: "Listar gastos",
        description: "Lista gastos con filtros por categor\xEDa, deal, per\xEDodo y recurrencia.",
        security: security21,
        querystring: ListExpensesQuerySchema
      },
      preHandler: financeAuth
    },
    async (request) => {
      return ok(await listExpenses(request.hubUser.portalId, request.query));
    }
  );
  r.get(
    "/expenses/summary",
    {
      schema: {
        tags: [TAG22],
        summary: "Resumen de gastos",
        description: "Total de gastos en USD y ARS, m\xE1s desglose por categor\xEDa.",
        security: security21
      },
      preHandler: financeAuth
    },
    async (request) => {
      return ok(await expenseSummary(request.hubUser.portalId));
    }
  );
  r.post(
    "/expenses",
    {
      schema: {
        tags: [TAG22],
        summary: "Crear gasto",
        description: "Crea un gasto con multimoneda. Calcula amountBase autom\xE1ticamente. Registra en record_history.",
        security: security21,
        body: CreateExpenseSchema
      },
      preHandler: financeAuth
    },
    async (request, reply) => {
      const created = await createExpense(request.hubUser.portalId, request.hubUser.sub, request.body);
      return reply.status(201).send(ok(created));
    }
  );
  r.patch(
    "/expenses/:id",
    {
      schema: {
        tags: [TAG22],
        summary: "Actualizar gasto",
        description: "Actualiza campos del gasto. Recalcula amountBase si cambia monto/moneda/TC.",
        security: security21,
        params: IdParamSchema,
        body: UpdateExpenseSchema
      },
      preHandler: financeAuth
    },
    async (request) => {
      return ok(await updateExpense(request.hubUser.portalId, request.params.id, request.hubUser.sub, request.body));
    }
  );
  r.delete(
    "/expenses/:id",
    {
      schema: {
        tags: [TAG22],
        summary: "Archivar gasto",
        description: "Archiva el gasto (soft-delete).",
        security: security21,
        params: IdParamSchema
      },
      preHandler: financeAuth
    },
    async (request) => {
      await archiveExpense(request.hubUser.portalId, request.params.id);
      return ok({ success: true });
    }
  );
  r.get(
    "/retainers",
    {
      schema: {
        tags: [TAG22],
        summary: "Listar retainers",
        description: "Lista retainers con companyName. Filtr\xE1 por status o companyId.",
        security: security21,
        querystring: ListRetainersQuerySchema
      },
      preHandler: financeAuth
    },
    async (request) => {
      return ok(await listRetainers(request.hubUser.portalId, request.query));
    }
  );
  r.post(
    "/retainers",
    {
      schema: {
        tags: [TAG22],
        summary: "Crear retainer",
        description: "Crea un contrato de honorarios mensuales. billingDay controla cu\xE1ndo se genera la factura (1\u201328).",
        security: security21,
        body: CreateRetainerSchema
      },
      preHandler: financeAuth
    },
    async (request, reply) => {
      const created = await createRetainer(request.hubUser.portalId, request.hubUser.sub, request.body);
      return reply.status(201).send(ok(created));
    }
  );
  r.get(
    "/retainers/:id",
    {
      schema: {
        tags: [TAG22],
        summary: "Detalle de retainer",
        description: "Devuelve el retainer con sus facturas vinculadas.",
        security: security21,
        params: IdParamSchema
      },
      preHandler: financeAuth
    },
    async (request) => {
      return ok(await getRetainerDetail(request.hubUser.portalId, request.params.id));
    }
  );
  r.patch(
    "/retainers/:id",
    {
      schema: {
        tags: [TAG22],
        summary: "Actualizar retainer",
        description: "Actualiza estado, monto o configuraci\xF3n. Un retainer cancelado no puede reactivarse.",
        security: security21,
        params: IdParamSchema,
        body: UpdateRetainerSchema
      },
      preHandler: financeAuth
    },
    async (request) => {
      return ok(await updateRetainer(request.hubUser.portalId, request.params.id, request.body));
    }
  );
  r.delete(
    "/retainers/:id",
    {
      schema: {
        tags: [TAG22],
        summary: "Archivar retainer",
        description: "Archiva el retainer (soft-delete). Las facturas ya generadas se mantienen.",
        security: security21,
        params: IdParamSchema
      },
      preHandler: financeAuth
    },
    async (request) => {
      await archiveRetainer(request.hubUser.portalId, request.params.id);
      return ok({ success: true });
    }
  );
  r.post(
    "/retainers/:id/generate-invoice",
    {
      schema: {
        tags: [TAG22],
        summary: "Generar factura de retainer",
        description: "Genera la factura del per\xEDodo actual (idempotente: no duplica si ya existe en el mes).",
        security: security21,
        params: IdParamSchema,
        body: z22.object({})
      },
      preHandler: financeAuth
    },
    async (request, reply) => {
      const result = await generateRetainerInvoice(
        request.hubUser.portalId,
        request.params.id,
        request.hubUser.sub
      );
      const status = result.created ? 201 : 200;
      return reply.status(status).send(ok(result));
    }
  );
  r.get(
    "/summary",
    {
      schema: {
        tags: [TAG22],
        summary: "Resumen financiero",
        description: "KPIs: totalInvoiced/totalPaid/outstanding/totalExpenses/netProfit/mrr/invoicesByStatus. Filtrable por per\xEDodo from/to.",
        security: security21,
        querystring: SummaryQuerySchema
      },
      preHandler: financeAuth
    },
    async (request) => {
      return ok(await financeSummary(request.hubUser.portalId, request.query));
    }
  );
  r.get(
    "/summary/monthly",
    {
      schema: {
        tags: [TAG22],
        summary: "Resumen mensual",
        description: "Ingresos vs gastos por mes para el gr\xE1fico de barras. months=6 por default (m\xE1x 24).",
        security: security21,
        querystring: MonthlySummaryQuerySchema
      },
      preHandler: financeAuth
    },
    async (request) => {
      const months = request.query.months ?? 6;
      return ok(await monthlySummary(request.hubUser.portalId, months));
    }
  );
  r.get(
    "/summary/debtors",
    {
      schema: {
        tags: [TAG22],
        summary: "Top deudores",
        description: "Empresas con mayor saldo pendiente de CxC. limit=5 por default.",
        security: security21,
        querystring: DebtorsQuerySchema
      },
      preHandler: financeAuth
    },
    async (request) => {
      const limit = request.query.limit ?? 5;
      return ok(await topDebtors(request.hubUser.portalId, limit));
    }
  );
  r.get(
    "/fx",
    {
      schema: {
        tags: [TAG22],
        summary: "Tipo de cambio ARS/USD",
        description: "Cotizaciones blue y tarjeta de dolarapi.com (cach\xE9 10 min). El front usa blue.venta como TC por defecto.",
        security: security21
      },
      preHandler: financeAuth
    },
    async () => {
      const rates = await getDolarRates();
      return ok(rates);
    }
  );
}

// src/modules/notification-prefs/notification-prefs.schema.ts
import { z as z23 } from "zod";
var KNOWN_EVENT_TYPES = [
  "deal_stage_changed",
  "cr_approved",
  "cr_rejected",
  "task_due",
  "deal_stale",
  "client_message"
];
var UpsertPrefSchema = z23.object({
  eventType: z23.string().min(1),
  inApp: z23.boolean(),
  email: z23.boolean()
});
var BulkUpsertPrefSchema = z23.object({
  prefs: z23.array(UpsertPrefSchema).min(1)
});

// src/modules/notification-prefs/notification-prefs.service.ts
import { and as and25, eq as eq29 } from "drizzle-orm";
function defaultPref(portalId, userId, eventType) {
  return {
    id: "",
    portalId,
    userId,
    eventType,
    inApp: true,
    email: false,
    createdAt: /* @__PURE__ */ new Date(),
    updatedAt: /* @__PURE__ */ new Date()
  };
}
async function listPrefs(portalId, userId) {
  const rows = await db.select().from(notificationPref).where(and25(eq29(notificationPref.portalId, portalId), eq29(notificationPref.userId, userId)));
  const rowsByType = new Map(rows.map((r) => [r.eventType, r]));
  return KNOWN_EVENT_TYPES.map(
    (et) => rowsByType.get(et) ?? defaultPref(portalId, userId, et)
  );
}
async function upsertPref(portalId, userId, input) {
  const [row] = await db.insert(notificationPref).values({
    portalId,
    userId,
    eventType: input.eventType,
    inApp: input.inApp,
    email: input.email
  }).onConflictDoUpdate({
    target: [notificationPref.userId, notificationPref.eventType],
    set: {
      inApp: input.inApp,
      email: input.email,
      updatedAt: /* @__PURE__ */ new Date()
    }
  }).returning();
  return row;
}

// src/modules/notification-prefs/notification-prefs.router.ts
var TAG23 = "Notificaciones";
var security22 = ADMIN_SECURITY;
async function notificationPrefsRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/",
    {
      schema: {
        tags: [TAG23],
        summary: "Listar preferencias de notificaci\xF3n",
        description: "Devuelve las preferencias del usuario autenticado para todos los eventTypes conocidos. Si no hay filas guardadas se devuelven los defaults sin persistirlos.",
        security: security22
      }
    },
    async (request) => {
      const prefs = await listPrefs(request.hubUser.portalId, request.hubUser.sub);
      return ok(prefs);
    }
  );
  r.patch(
    "/:eventType",
    {
      schema: {
        tags: [TAG23],
        summary: "Actualizar preferencia de notificaci\xF3n",
        description: "Upsert de una preferencia (inApp / email) para el eventType indicado.",
        security: security22,
        body: UpsertPrefSchema.omit({ eventType: true })
      }
    },
    async (request) => {
      const { eventType } = request.params;
      const row = await upsertPref(request.hubUser.portalId, request.hubUser.sub, {
        eventType,
        ...request.body
      });
      return ok(row);
    }
  );
}

// src/modules/custom-fields/custom-fields.schema.ts
import { z as z24 } from "zod";
var EntityTypeEnum = z24.enum(["contact", "deal", "company"]);
var FieldTypeEnum = z24.enum(["text", "number", "date", "select", "boolean"]);
var keySchema = z24.string().regex(/^[a-z][a-z0-9_]*$/, {
  message: "La clave debe comenzar con una letra min\xFAscula y contener solo letras, n\xFAmeros y guion bajo"
});
var CreateCustomFieldSchema = z24.object({
  entityType: EntityTypeEnum,
  key: keySchema,
  label: z24.string().min(1),
  fieldType: FieldTypeEnum,
  options: z24.array(z24.string().min(1)).optional(),
  displayOrder: z24.number().int().min(0).optional()
});
var UpdateCustomFieldSchema = z24.object({
  label: z24.string().min(1),
  fieldType: FieldTypeEnum,
  options: z24.array(z24.string().min(1)).nullable(),
  displayOrder: z24.number().int().min(0)
}).partial();
var ListCustomFieldsQuerySchema = z24.object({
  entityType: EntityTypeEnum.optional()
});

// src/modules/custom-fields/custom-fields.service.ts
import { and as and26, asc as asc9, eq as eq30 } from "drizzle-orm";
async function listCustomFields(portalId, query) {
  const conditions = [
    eq30(customField.portalId, portalId),
    eq30(customField.archived, false),
    ...query.entityType ? [eq30(customField.entityType, query.entityType)] : []
  ];
  return db.select().from(customField).where(and26(...conditions)).orderBy(asc9(customField.displayOrder), asc9(customField.createdAt));
}
async function createCustomField(portalId, input) {
  const [existing] = await db.select({ id: customField.id }).from(customField).where(
    and26(
      eq30(customField.portalId, portalId),
      eq30(customField.entityType, input.entityType),
      eq30(customField.key, input.key),
      eq30(customField.archived, false)
    )
  ).limit(1);
  if (existing) {
    throw Errors.badRequest(
      `Ya existe un campo con la clave "${input.key}" para la entidad ${input.entityType}`
    );
  }
  try {
    const [row] = await db.insert(customField).values({
      portalId,
      entityType: input.entityType,
      key: input.key,
      label: input.label,
      fieldType: input.fieldType,
      options: input.options ?? null,
      displayOrder: input.displayOrder ?? 0
    }).returning();
    if (!row) throw Errors.internal("No se pudo crear el campo personalizado");
    return row;
  } catch (err) {
    if (err instanceof Error && err.message.includes("custom_field_portal_entity_key_unique")) {
      throw Errors.badRequest(
        `Ya existe un campo con la clave "${input.key}" para la entidad ${input.entityType}`
      );
    }
    throw err;
  }
}
async function updateCustomField(portalId, id, input) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: customField.id }).from(customField).where(
      and26(
        eq30(customField.id, id),
        eq30(customField.portalId, portalId),
        eq30(customField.archived, false)
      )
    ).limit(1);
    if (!existing) throw Errors.notFound("Campo personalizado no encontrado");
    const [updated] = await tx.update(customField).set({ ...input, updatedAt: /* @__PURE__ */ new Date() }).where(eq30(customField.id, id)).returning();
    if (!updated) throw Errors.internal("No se pudo actualizar el campo personalizado");
    return updated;
  });
}
async function archiveCustomField(portalId, id) {
  await db.transaction(async (tx) => {
    const [row] = await tx.select({ id: customField.id }).from(customField).where(
      and26(
        eq30(customField.id, id),
        eq30(customField.portalId, portalId),
        eq30(customField.archived, false)
      )
    ).limit(1);
    if (!row) throw Errors.notFound("Campo personalizado no encontrado");
    await tx.update(customField).set({ archived: true, archivedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }).where(eq30(customField.id, id));
  });
}

// src/modules/custom-fields/custom-fields.router.ts
var TAG24 = "Configuraci\xF3n";
var security23 = ADMIN_SECURITY;
async function customFieldsRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/",
    {
      schema: {
        tags: [TAG24],
        summary: "Listar campos personalizados",
        description: "Lista las definiciones de campos personalizados del portal. Los valores reales viven en el jsonb `custom` de cada entidad.",
        security: security23,
        querystring: ListCustomFieldsQuerySchema
      }
    },
    async (request) => {
      const fields = await listCustomFields(request.hubUser.portalId, request.query);
      return ok(fields);
    }
  );
  r.post(
    "/",
    {
      schema: {
        tags: [TAG24],
        summary: "Crear campo personalizado",
        description: "Crea una nueva definici\xF3n de campo personalizado. La clave (key) debe ser \xFAnica por portal + entidad. Requiere rol owner o member.",
        security: security23,
        body: CreateCustomFieldSchema
      },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request, reply) => {
      const created = await createCustomField(request.hubUser.portalId, request.body);
      return reply.status(201).send(ok(created));
    }
  );
  r.patch(
    "/:id",
    {
      schema: {
        tags: [TAG24],
        summary: "Actualizar campo personalizado",
        description: "Actualiza label, fieldType, options o displayOrder. La entityType y key no se pueden cambiar. Requiere rol owner o member.",
        security: security23,
        params: IdParamSchema,
        body: UpdateCustomFieldSchema
      },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request) => {
      return ok(await updateCustomField(request.hubUser.portalId, request.params.id, request.body));
    }
  );
  r.delete(
    "/:id",
    {
      schema: {
        tags: [TAG24],
        summary: "Archivar campo personalizado",
        description: "Archiva el campo (soft delete). Los valores ya guardados en el jsonb `custom` de las entidades no se borran. Requiere rol owner o member.",
        security: security23,
        params: IdParamSchema
      },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request) => {
      await archiveCustomField(request.hubUser.portalId, request.params.id);
      return ok({ success: true });
    }
  );
}

// src/modules/timeline/timeline.schema.ts
import { z as z25 } from "zod";
var LogCallSchema = z25.object({
  title: z25.string().min(1).optional(),
  body: z25.string().optional(),
  direction: z25.enum(["inbound", "outbound"]).optional(),
  durationSec: z25.number().int().nonnegative().optional(),
  occurredAt: z25.string().datetime().optional(),
  dealId: z25.string().min(1).optional(),
  contactId: z25.string().min(1).optional()
}).refine((v) => v.dealId != null || v.contactId != null, {
  message: "Se requiere al menos dealId o contactId"
});
var LogMeetingSchema = z25.object({
  title: z25.string().min(1),
  startsAt: z25.string().datetime().optional(),
  endsAt: z25.string().datetime().optional(),
  location: z25.string().optional(),
  dealId: z25.string().min(1).optional(),
  contactId: z25.string().min(1).optional()
}).refine((v) => v.dealId != null || v.contactId != null, {
  message: "Se requiere al menos dealId o contactId"
});
var LogEmailSchema = z25.object({
  fromEmail: z25.string().email(),
  toEmail: z25.string().email(),
  subject: z25.string().min(1),
  bodyHtml: z25.string().optional(),
  dealId: z25.string().min(1).optional(),
  contactId: z25.string().min(1).optional()
}).refine((v) => v.dealId != null || v.contactId != null, {
  message: "Se requiere al menos dealId o contactId"
});
var TimelineQuerySchema = z25.object({
  dealId: z25.string().min(1).optional(),
  contactId: z25.string().min(1).optional(),
  companyId: z25.string().min(1).optional()
}).refine((v) => [v.dealId, v.contactId, v.companyId].filter(Boolean).length === 1, {
  message: "Se requiere exactamente uno de: dealId, contactId, companyId"
});

// src/modules/timeline/timeline.service.ts
import { and as and27, desc as desc18, eq as eq32, inArray as inArray12 } from "drizzle-orm";

// src/modules/email-tracking/email-tracking.service.ts
import { eq as eq31 } from "drizzle-orm";
var TRACKING_PIXEL_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);
async function recordOpen(trackingId, userAgent, ip) {
  const [send] = await db.select({ id: emailSend.id }).from(emailSend).where(eq31(emailSend.trackingId, trackingId)).limit(1);
  if (!send) return;
  await db.insert(emailEvent).values({
    emailId: send.id,
    type: "opened",
    userAgent: userAgent ?? null,
    ipAddress: ip ?? null
  });
}
async function recordClick(trackingId, url, userAgent, ip) {
  const [send] = await db.select({ id: emailSend.id }).from(emailSend).where(eq31(emailSend.trackingId, trackingId)).limit(1);
  if (!send) return;
  await db.insert(emailEvent).values({
    emailId: send.id,
    type: "clicked",
    linkUrl: url,
    userAgent: userAgent ?? null,
    ipAddress: ip ?? null
  });
}
function buildPixelTag(trackingId) {
  const base = env.PUBLIC_API_URL.replace(/\/$/, "");
  return `<img src="${base}/track/open/${trackingId}" width="1" height="1" style="display:none" alt="" />`;
}
function injectTrackingPixel(html, trackingId) {
  const pixel = buildPixelTag(trackingId);
  if (html.includes("</body>")) {
    return html.replace("</body>", `${pixel}</body>`);
  }
  return html + pixel;
}
function validateRedirectUrl(url) {
  if (!url) return env.PUBLIC_API_URL;
  try {
    const parsed2 = new URL(url);
    if (parsed2.protocol === "http:" || parsed2.protocol === "https:") {
      return url;
    }
    return env.PUBLIC_API_URL;
  } catch {
    return env.PUBLIC_API_URL;
  }
}

// src/modules/timeline/timeline.service.ts
async function logCall(portalId, userId, input) {
  const [row] = await db.insert(call).values({
    portalId,
    createdBy: userId,
    title: input.title ?? null,
    body: input.body ?? null,
    direction: input.direction ?? null,
    durationSec: input.durationSec ?? null,
    occurredAt: input.occurredAt ? new Date(input.occurredAt) : /* @__PURE__ */ new Date(),
    dealId: input.dealId ?? null,
    contactId: input.contactId ?? null
  }).returning();
  if (!row) throw Errors.internal("No se pudo registrar la llamada");
  return row;
}
async function logMeeting(portalId, userId, input) {
  const [row] = await db.insert(meeting).values({
    portalId,
    createdBy: userId,
    title: input.title,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    location: input.location ?? null,
    dealId: input.dealId ?? null,
    contactId: input.contactId ?? null
  }).returning();
  if (!row) throw Errors.internal("No se pudo registrar la reuni\xF3n");
  return row;
}
async function logEmail(portalId, _userId, input) {
  const [row] = await db.insert(emailSend).values({
    portalId,
    fromEmail: input.fromEmail,
    toEmail: input.toEmail,
    subject: input.subject,
    bodyHtml: input.bodyHtml ?? null,
    dealId: input.dealId ?? null,
    contactId: input.contactId ?? null
  }).returning();
  if (!row) throw Errors.internal("No se pudo registrar el email");
  if (input.bodyHtml) {
    const htmlWithPixel = injectTrackingPixel(input.bodyHtml, row.trackingId);
    const [updated] = await db.update(emailSend).set({ bodyHtml: htmlWithPixel }).where(eq32(emailSend.id, row.id)).returning();
    if (updated) return updated;
  }
  return row;
}
async function getTimeline(portalId, query) {
  const { dealId, contactId, companyId } = query;
  const items = [];
  if (dealId != null || contactId != null) {
    const callConds = [eq32(call.portalId, portalId)];
    if (dealId != null) callConds.push(eq32(call.dealId, dealId));
    else if (contactId != null) callConds.push(eq32(call.contactId, contactId));
    const calls = await db.select().from(call).where(and27(...callConds)).orderBy(desc18(call.occurredAt)).limit(100);
    for (const c of calls) {
      items.push({
        kind: "call",
        id: c.id,
        title: c.title ?? "Llamada",
        body: c.body ?? null,
        occurredAt: c.occurredAt.toISOString(),
        meta: {
          direction: c.direction ?? null,
          durationSec: c.durationSec ?? null
        }
      });
    }
  }
  if (dealId != null || contactId != null) {
    const meetConds = [eq32(meeting.portalId, portalId)];
    if (dealId != null) meetConds.push(eq32(meeting.dealId, dealId));
    else if (contactId != null) meetConds.push(eq32(meeting.contactId, contactId));
    const meetings = await db.select().from(meeting).where(and27(...meetConds)).orderBy(desc18(meeting.createdAt)).limit(100);
    for (const m of meetings) {
      items.push({
        kind: "meeting",
        id: m.id,
        title: m.title,
        body: null,
        occurredAt: (m.startsAt ?? m.createdAt).toISOString(),
        meta: {
          endsAt: m.endsAt?.toISOString() ?? null,
          location: m.location ?? null,
          fathomSummary: m.fathomSummary ?? null
        }
      });
    }
  }
  if (dealId != null || contactId != null) {
    const emailConds = [eq32(emailSend.portalId, portalId)];
    if (dealId != null) emailConds.push(eq32(emailSend.dealId, dealId));
    else if (contactId != null) emailConds.push(eq32(emailSend.contactId, contactId));
    const emails = await db.select().from(emailSend).where(and27(...emailConds)).orderBy(desc18(emailSend.sentAt)).limit(100);
    const emailIds = emails.map((e) => e.id);
    const eventRows = emailIds.length ? await db.select({ emailId: emailEvent.emailId, type: emailEvent.type }).from(emailEvent).where(inArray12(emailEvent.emailId, emailIds)) : [];
    const openedSet = /* @__PURE__ */ new Set();
    const clickedSet = /* @__PURE__ */ new Set();
    for (const ev of eventRows) {
      if (ev.type === "opened") openedSet.add(ev.emailId);
      else if (ev.type === "clicked") clickedSet.add(ev.emailId);
    }
    for (const e of emails) {
      const opened = openedSet.has(e.id);
      const clicked = clickedSet.has(e.id);
      items.push({
        kind: "email",
        id: e.id,
        title: e.subject,
        body: e.bodyHtml ?? null,
        occurredAt: e.sentAt.toISOString(),
        meta: {
          fromEmail: e.fromEmail,
          toEmail: e.toEmail,
          opened,
          clicked
        }
      });
    }
  }
  {
    const noteConds = [eq32(note.portalId, portalId)];
    if (dealId != null) noteConds.push(eq32(note.dealId, dealId));
    else if (contactId != null) noteConds.push(eq32(note.contactId, contactId));
    else if (companyId != null) noteConds.push(eq32(note.companyId, companyId));
    const notes = await db.select().from(note).where(and27(...noteConds)).orderBy(desc18(note.createdAt)).limit(100);
    for (const n of notes) {
      items.push({
        kind: "note",
        id: n.id,
        title: "Nota",
        body: n.body,
        occurredAt: n.createdAt.toISOString()
      });
    }
  }
  {
    const taskConds = [eq32(task.portalId, portalId)];
    if (dealId != null) taskConds.push(eq32(task.dealId, dealId));
    else if (contactId != null) taskConds.push(eq32(task.contactId, contactId));
    else if (companyId != null) taskConds.push(eq32(task.companyId, companyId));
    const tasks = await db.select().from(task).where(and27(...taskConds)).orderBy(desc18(task.createdAt)).limit(100);
    for (const t of tasks) {
      items.push({
        kind: "task",
        id: t.id,
        title: t.title,
        body: t.body ?? null,
        occurredAt: (t.dueDate ?? t.createdAt).toISOString(),
        meta: {
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate?.toISOString() ?? null,
          completedAt: t.completedAt?.toISOString() ?? null
        }
      });
    }
  }
  {
    let entityType;
    let entityId;
    if (dealId != null) {
      entityType = "deal";
      entityId = dealId;
    } else if (contactId != null) {
      entityType = "contact";
      entityId = contactId;
    } else {
      entityType = "company";
      entityId = companyId;
    }
    const history = await db.select().from(recordHistory).where(
      and27(
        eq32(recordHistory.portalId, portalId),
        eq32(recordHistory.entityType, entityType),
        eq32(recordHistory.entityId, entityId)
      )
    ).orderBy(desc18(recordHistory.changedAt)).limit(100);
    for (const h of history) {
      items.push({
        kind: "history",
        id: h.id,
        title: h.fieldName,
        body: `${h.oldValue ?? "\u2014"} \u2192 ${h.newValue ?? "\u2014"}`,
        occurredAt: h.changedAt.toISOString()
      });
    }
  }
  return items.sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );
}

// src/modules/timeline/timeline.router.ts
var TAG25 = "Actividades";
var security24 = ADMIN_SECURITY;
async function timelineRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/",
    {
      schema: {
        tags: [TAG25],
        summary: "Timeline unificado",
        description: "Devuelve el timeline unificado (llamadas, reuniones, emails, notas, tareas, historial de cambios) para un deal, contacto o empresa. Exactamente uno de los tres filtros es requerido.",
        security: security24,
        querystring: TimelineQuerySchema
      }
    },
    async (request) => {
      const items = await getTimeline(request.hubUser.portalId, request.query);
      return ok(items);
    }
  );
  r.post(
    "/calls",
    {
      schema: {
        tags: [TAG25],
        summary: "Registrar llamada",
        description: "Registra manualmente una llamada (entrante o saliente) asociada a un deal o contacto.",
        security: security24,
        body: LogCallSchema
      },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request, reply) => {
      const created = await logCall(
        request.hubUser.portalId,
        request.hubUser.sub,
        request.body
      );
      return reply.status(201).send(ok(created));
    }
  );
  r.post(
    "/meetings",
    {
      schema: {
        tags: [TAG25],
        summary: "Registrar reuni\xF3n",
        description: "Registra manualmente una reuni\xF3n asociada a un deal o contacto.",
        security: security24,
        body: LogMeetingSchema
      },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request, reply) => {
      const created = await logMeeting(
        request.hubUser.portalId,
        request.hubUser.sub,
        request.body
      );
      return reply.status(201).send(ok(created));
    }
  );
  r.post(
    "/emails",
    {
      schema: {
        tags: [TAG25],
        summary: "Registrar email enviado",
        description: "Registra manualmente un email enviado (for logging purposes). El trackingId se genera autom\xE1ticamente en la base de datos.",
        security: security24,
        body: LogEmailSchema
      },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request, reply) => {
      const created = await logEmail(
        request.hubUser.portalId,
        request.hubUser.sub,
        request.body
      );
      return reply.status(201).send(ok(created));
    }
  );
}

// src/modules/focus/focus.schema.ts
import { z as z26 } from "zod";
var FocusQuerySchema = z26.object({
  mine: z26.string().optional().transform((v) => v === "true").describe("Si es true, filtra follow-ups asignados al usuario autenticado")
});

// src/modules/focus/focus.service.ts
import { and as and28, asc as asc10, eq as eq33, inArray as inArray13, lte as lte4, isNotNull as isNotNull2, sql as sql28 } from "drizzle-orm";

// src/lib/dates.ts
function startOfDay2(d) {
  const out = new Date(d ?? /* @__PURE__ */ new Date());
  out.setHours(0, 0, 0, 0);
  return out;
}
function endOfDay(d) {
  const out = new Date(d ?? /* @__PURE__ */ new Date());
  out.setHours(23, 59, 59, 999);
  return out;
}

// src/modules/focus/focus.service.ts
function isSameDay(date5, reference) {
  return date5.toDateString() === reference.toDateString();
}
async function getFollowUps(portalId, userId) {
  const now = /* @__PURE__ */ new Date();
  const todayStart = startOfDay2(now);
  const sevenDaysEnd = endOfDay(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1e3));
  const baseConds = [
    eq33(task.portalId, portalId),
    inArray13(task.status, ["pending", "in_progress"]),
    isNotNull2(task.dueDate),
    lte4(task.dueDate, sevenDaysEnd)
    // only up to 7 days out
  ];
  if (userId != null) baseConds.push(eq33(task.assignedTo, userId));
  const openTasks = await db.select().from(task).where(and28(...baseConds)).orderBy(asc10(task.dueDate));
  const dealIds = [...new Set(openTasks.filter((t) => t.dealId != null).map((t) => t.dealId))];
  const contactIds = [...new Set(openTasks.filter((t) => t.contactId != null).map((t) => t.contactId))];
  const companyIds = [...new Set(openTasks.filter((t) => t.companyId != null).map((t) => t.companyId))];
  const [dealRows, contactRows, companyRows] = await Promise.all([
    dealIds.length ? db.select({ id: deal.id, name: deal.name }).from(deal).where(inArray13(deal.id, dealIds)) : Promise.resolve([]),
    contactIds.length ? db.select({ id: contact.id, firstName: contact.firstName, lastName: contact.lastName, email: contact.email }).from(contact).where(inArray13(contact.id, contactIds)) : Promise.resolve([]),
    companyIds.length ? db.select({ id: company.id, name: company.name }).from(company).where(inArray13(company.id, companyIds)) : Promise.resolve([])
  ]);
  const dealLabelMap = new Map(dealRows.map((r) => [r.id, r.name]));
  const contactLabelMap = new Map(
    contactRows.map((r) => [
      r.id,
      [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email || `#${r.id}`
    ])
  );
  const companyLabelMap = new Map(companyRows.map((r) => [r.id, r.name]));
  function resolveEntity(t) {
    if (t.dealId != null) {
      return { kind: "deal", id: t.dealId, label: dealLabelMap.get(t.dealId) ?? `Deal #${t.dealId}` };
    }
    if (t.contactId != null) {
      return { kind: "contact", id: t.contactId, label: contactLabelMap.get(t.contactId) ?? `Contacto #${t.contactId}` };
    }
    if (t.companyId != null) {
      return { kind: "company", id: t.companyId, label: companyLabelMap.get(t.companyId) ?? `Empresa #${t.companyId}` };
    }
    return null;
  }
  const buckets = { overdue: [], today: [], upcoming: [] };
  for (const t of openTasks) {
    const item = {
      id: t.id,
      title: t.title,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      priority: t.priority,
      assignedTo: t.assignedTo,
      entity: resolveEntity(t)
    };
    if (!t.dueDate) continue;
    const due = t.dueDate;
    if (due < todayStart) {
      buckets.overdue.push(item);
    } else if (isSameDay(due, now)) {
      buckets.today.push(item);
    } else {
      buckets.upcoming.push(item);
    }
  }
  return buckets;
}
async function getDealsNeedingAttention(portalId) {
  const now = /* @__PURE__ */ new Date();
  const openDeals = await db.select({
    id: deal.id,
    name: deal.name,
    amount: deal.amount,
    ownerId: deal.ownerId,
    createdAt: deal.createdAt,
    stageLabel: pipelineStage.label
  }).from(deal).innerJoin(pipelineStage, eq33(deal.stageId, pipelineStage.id)).where(
    and28(
      eq33(deal.portalId, portalId),
      eq33(deal.archived, false),
      eq33(pipelineStage.isClosed, false)
    )
  );
  if (openDeals.length === 0) return { noNextAction: [], stale: [] };
  const dealIds = openDeals.map((d) => d.id);
  const openTaskRows = await db.select({ dealId: task.dealId, id: task.id, dueDate: task.dueDate }).from(task).where(
    and28(
      eq33(task.portalId, portalId),
      inArray13(task.status, ["pending", "in_progress"]),
      inArray13(task.dealId, dealIds)
    )
  );
  const dealsWithTask = new Set(openTaskRows.map((t) => t.dealId).filter((id) => id != null));
  const [callAgg, meetingAgg, emailAgg, noteAgg, taskAgg] = await Promise.all([
    // calls: max(occurredAt)
    db.select({ dealId: call.dealId, maxDate: sql28`max(${call.occurredAt})` }).from(call).where(and28(eq33(call.portalId, portalId), inArray13(call.dealId, dealIds))).groupBy(call.dealId),
    // meetings: max(coalesce(starts_at, created_at))
    db.select({
      dealId: meeting.dealId,
      maxDate: sql28`max(coalesce(${meeting.startsAt}, ${meeting.createdAt}))`
    }).from(meeting).where(and28(eq33(meeting.portalId, portalId), inArray13(meeting.dealId, dealIds))).groupBy(meeting.dealId),
    // emails: max(sentAt)
    db.select({ dealId: emailSend.dealId, maxDate: sql28`max(${emailSend.sentAt})` }).from(emailSend).where(and28(eq33(emailSend.portalId, portalId), inArray13(emailSend.dealId, dealIds))).groupBy(emailSend.dealId),
    // notes: max(createdAt)
    db.select({ dealId: note.dealId, maxDate: sql28`max(${note.createdAt})` }).from(note).where(and28(eq33(note.portalId, portalId), inArray13(note.dealId, dealIds))).groupBy(note.dealId),
    // tasks (any task, completed too): max(completedAt ?? createdAt)
    db.select({
      dealId: task.dealId,
      maxDate: sql28`max(coalesce(${task.completedAt}, ${task.createdAt}))`
    }).from(task).where(and28(eq33(task.portalId, portalId), inArray13(task.dealId, dealIds))).groupBy(task.dealId)
  ]);
  const lastActivityMap = /* @__PURE__ */ new Map();
  function applyAgg(rows) {
    for (const row of rows) {
      if (!row.dealId || !row.maxDate) continue;
      const d = new Date(row.maxDate);
      const existing = lastActivityMap.get(row.dealId);
      if (!existing || d > existing) lastActivityMap.set(row.dealId, d);
    }
  }
  applyAgg(callAgg);
  applyAgg(meetingAgg);
  applyAgg(emailAgg);
  applyAgg(noteAgg);
  applyAgg(taskAgg);
  const STALE_DAYS = 14;
  const noNextAction = [];
  const stale = [];
  for (const d of openDeals) {
    const lastActivity = lastActivityMap.get(d.id) ?? null;
    const referenceDate = lastActivity ?? d.createdAt;
    const msAgo = now.getTime() - referenceDate.getTime();
    const daysAgo = Math.floor(msAgo / (1e3 * 60 * 60 * 24));
    const item = {
      id: d.id,
      name: d.name,
      amount: d.amount,
      stageLabel: d.stageLabel,
      ownerId: d.ownerId,
      lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
      daysSinceActivity: daysAgo
    };
    if (!dealsWithTask.has(d.id)) noNextAction.push(item);
    if (daysAgo > STALE_DAYS) stale.push(item);
  }
  return { noNextAction, stale };
}
async function getFocus(portalId, userId) {
  const [followUps, attention] = await Promise.all([
    getFollowUps(portalId, userId),
    getDealsNeedingAttention(portalId)
  ]);
  return { followUps, attention };
}

// src/modules/focus/focus.router.ts
var TAG26 = "Seguimientos";
var security25 = ADMIN_SECURITY;
async function focusRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/",
    {
      schema: {
        tags: [TAG26],
        summary: "Seguimientos + deals que necesitan atenci\xF3n",
        description: "Devuelve las tareas abiertas bucketizadas (vencidas / hoy / pr\xF3ximos 7 d\xEDas) y los deals abiertos sin pr\xF3xima acci\xF3n o sin actividad reciente (>14 d\xEDas). Usa ?mine=true para filtrar follow-ups al usuario autenticado.",
        security: security25,
        querystring: FocusQuerySchema
      }
    },
    async (request) => {
      const userId = request.query.mine ? request.hubUser.sub : void 0;
      return ok(await getFocus(request.hubUser.portalId, userId));
    }
  );
}

// src/modules/reports/reports.schema.ts
import { z as z27 } from "zod";
var ReportsQuerySchema = z27.object({
  from: z27.string().datetime({ offset: true, message: "from debe ser ISO 8601" }).optional().transform((v) => v ? new Date(v) : void 0),
  to: z27.string().datetime({ offset: true, message: "to debe ser ISO 8601" }).optional().transform((v) => v ? new Date(v) : void 0)
});

// src/modules/reports/reports.service.ts
import { and as and29, asc as asc11, count as count4, eq as eq34, gte as gte5, inArray as inArray14, lte as lte5, sql as sql29 } from "drizzle-orm";
async function getReports(portalId, params) {
  const now = /* @__PURE__ */ new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultTo = endOfDay(now);
  const from = params?.from ? startOfDay2(params.from) : defaultFrom;
  const to = params?.to ? endOfDay(params.to) : defaultTo;
  const durationMs = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - durationMs - 1);
  const prevTo = new Date(from.getTime() - 1);
  const [dealsAtRisk, pipelineFunnel, conversionBySource, activityByUser, closedWon] = await Promise.all([
    fetchDealsAtRisk(portalId),
    fetchPipelineFunnel(portalId),
    fetchConversionBySource(portalId),
    fetchActivityByUser(portalId, from, to),
    fetchClosedWon(portalId, from, to, prevFrom, prevTo)
  ]);
  return { dealsAtRisk, pipelineFunnel, conversionBySource, activityByUser, closedWon };
}
async function fetchDealsAtRisk(portalId) {
  const attention = await getDealsNeedingAttention(portalId);
  return {
    count: attention.stale.length,
    deals: attention.stale
  };
}
async function fetchPipelineFunnel(portalId) {
  const stageRows = await db.select({
    stageId: pipelineStage.id,
    label: pipelineStage.label,
    displayOrder: pipelineStage.displayOrder,
    isClosed: pipelineStage.isClosed,
    isWon: pipelineStage.isWon,
    currentDeals: count4(deal.id),
    currentValue: sql29`coalesce(sum(${deal.amount}), 0)`
  }).from(pipelineStage).innerJoin(
    pipeline,
    and29(
      eq34(pipelineStage.pipelineId, pipeline.id),
      eq34(pipeline.portalId, portalId),
      eq34(pipeline.archived, false)
    )
  ).leftJoin(deal, and29(eq34(deal.stageId, pipelineStage.id), eq34(deal.archived, false))).where(eq34(pipelineStage.archived, false)).groupBy(
    pipelineStage.id,
    pipelineStage.label,
    pipelineStage.displayOrder,
    pipelineStage.isClosed,
    pipelineStage.isWon
  ).orderBy(asc11(pipelineStage.displayOrder));
  const [winRateRow] = await db.select({
    won: sql29`count(*) filter (where ${pipelineStage.isWon} = true)`,
    closed: sql29`count(*) filter (where ${pipelineStage.isClosed} = true)`
  }).from(deal).innerJoin(pipelineStage, eq34(deal.stageId, pipelineStage.id)).innerJoin(
    pipeline,
    and29(eq34(pipelineStage.pipelineId, pipeline.id), eq34(pipeline.portalId, portalId))
  ).where(and29(eq34(deal.portalId, portalId), eq34(deal.archived, false)));
  const won = Number(winRateRow?.won ?? 0);
  const closed = Number(winRateRow?.closed ?? 0);
  const winRate = closed > 0 ? Math.round(won / closed * 100) : null;
  return {
    stages: stageRows.map((r) => ({
      stageId: r.stageId,
      label: r.label,
      isWon: r.isWon,
      isClosed: r.isClosed,
      currentDeals: Number(r.currentDeals),
      currentValue: String(r.currentValue)
    })),
    winRate
  };
}
async function fetchConversionBySource(portalId) {
  const rows = await db.select({
    source: sql29`coalesce(nullif(trim(${contact.custom}->>'source'), ''), 'Sin fuente')`,
    total: count4(),
    customers: sql29`count(*) filter (where ${contact.lifecycleStage} = 'customer')`
  }).from(contact).where(and29(eq34(contact.portalId, portalId), eq34(contact.archived, false))).groupBy(sql29`coalesce(nullif(trim(${contact.custom}->>'source'), ''), 'Sin fuente')`).orderBy(sql29`count(*) desc`);
  return rows.map((r) => {
    const leads = Number(r.total);
    const customers = Number(r.customers);
    return {
      source: r.source,
      leads,
      customers,
      rate: leads > 0 ? Math.round(customers / leads * 100) : 0
    };
  });
}
async function fetchActivityByUser(portalId, from, to) {
  const users = await db.select({
    id: hubUser.id,
    firstName: hubUser.firstName,
    lastName: hubUser.lastName,
    email: hubUser.email
  }).from(hubUser).where(and29(eq34(hubUser.portalId, portalId), eq34(hubUser.isActive, true)));
  if (users.length === 0) return [];
  const userIds = users.map((u) => u.id);
  const [callRows, meetingRows, noteRows, taskCreatedRows, taskCompletedRows] = await Promise.all([
    // calls by createdBy
    db.select({ userId: call.createdBy, n: count4() }).from(call).where(
      and29(
        eq34(call.portalId, portalId),
        inArray14(call.createdBy, userIds),
        gte5(call.createdAt, from),
        lte5(call.createdAt, to)
      )
    ).groupBy(call.createdBy),
    // meetings by createdBy
    db.select({ userId: meeting.createdBy, n: count4() }).from(meeting).where(
      and29(
        eq34(meeting.portalId, portalId),
        inArray14(meeting.createdBy, userIds),
        gte5(meeting.createdAt, from),
        lte5(meeting.createdAt, to)
      )
    ).groupBy(meeting.createdBy),
    // notes by createdBy
    db.select({ userId: note.createdBy, n: count4() }).from(note).where(
      and29(
        eq34(note.portalId, portalId),
        inArray14(note.createdBy, userIds),
        gte5(note.createdAt, from),
        lte5(note.createdAt, to)
      )
    ).groupBy(note.createdBy),
    // tasks created by user
    db.select({ userId: task.createdBy, n: count4() }).from(task).where(
      and29(
        eq34(task.portalId, portalId),
        inArray14(task.createdBy, userIds),
        gte5(task.createdAt, from),
        lte5(task.createdAt, to)
      )
    ).groupBy(task.createdBy),
    // tasks completed by assignedTo (in period)
    db.select({ userId: task.assignedTo, n: count4() }).from(task).where(
      and29(
        eq34(task.portalId, portalId),
        inArray14(task.assignedTo, userIds),
        eq34(task.status, "completed"),
        gte5(task.completedAt, from),
        lte5(task.completedAt, to)
      )
    ).groupBy(task.assignedTo)
  ]);
  const callMap = new Map(callRows.map((r) => [r.userId, Number(r.n)]));
  const meetingMap = new Map(meetingRows.map((r) => [r.userId, Number(r.n)]));
  const noteMap = new Map(noteRows.map((r) => [r.userId, Number(r.n)]));
  const taskCreatedMap = new Map(taskCreatedRows.map((r) => [r.userId, Number(r.n)]));
  const taskCompletedMap = new Map(taskCompletedRows.map((r) => [r.userId, Number(r.n)]));
  return users.map((u) => ({
    userId: u.id,
    name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || `User #${u.id}`,
    calls: callMap.get(u.id) ?? 0,
    meetings: meetingMap.get(u.id) ?? 0,
    notes: noteMap.get(u.id) ?? 0,
    tasksCreated: taskCreatedMap.get(u.id) ?? 0,
    tasksCompleted: taskCompletedMap.get(u.id) ?? 0
  }));
}
async function fetchClosedWon(portalId, from, to, prevFrom, prevTo) {
  async function fetchPeriod(start, end) {
    const [row] = await db.select({
      n: count4(),
      value: sql29`coalesce(sum(${deal.amount}), 0)`
    }).from(deal).innerJoin(pipelineStage, eq34(deal.stageId, pipelineStage.id)).innerJoin(
      pipeline,
      and29(eq34(pipelineStage.pipelineId, pipeline.id), eq34(pipeline.portalId, portalId))
    ).where(
      and29(
        eq34(deal.portalId, portalId),
        eq34(pipelineStage.isWon, true),
        gte5(sql29`coalesce(${deal.closeDate}::timestamptz, ${deal.updatedAt})`, start),
        lte5(sql29`coalesce(${deal.closeDate}::timestamptz, ${deal.updatedAt})`, end)
      )
    );
    return { count: Number(row?.n ?? 0), value: String(row?.value ?? "0") };
  }
  const [thisPeriod, previousPeriod] = await Promise.all([
    fetchPeriod(from, to),
    fetchPeriod(prevFrom, prevTo)
  ]);
  return { thisPeriod, previousPeriod };
}

// src/modules/reports/reports.router.ts
var TAG27 = "Reportes";
var security26 = ADMIN_SECURITY;
async function reportsRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/",
    {
      schema: {
        tags: [TAG27],
        summary: "Reportes de gesti\xF3n \u2014 pilar de visibilidad del negocio",
        description: "Devuelve: embudo del pipeline (deals por etapa + win rate), deals en riesgo (sin actividad >14d), conversi\xF3n por fuente de leads, actividad del equipo por usuario y resumen de deals cerrados/ganados para el per\xEDodo actual vs el anterior. Los par\xE1metros `from`/`to` delimitan el per\xEDodo de actividad y cerrados (default: mes en curso). El embudo, riesgo y conversi\xF3n usan el estado actual.",
        security: security26,
        querystring: ReportsQuerySchema
      }
    },
    async (request) => {
      const { from, to } = request.query;
      return ok(await getReports(request.hubUser.portalId, { from, to }));
    }
  );
}

// src/modules/webhooks/webhooks.router.ts
import { z as z28 } from "zod";

// src/modules/webhooks/webhooks.service.ts
import { createHmac, timingSafeEqual } from "crypto";
import { eq as eq35, and as and30 } from "drizzle-orm";
function verifyFathomSignature(rawBody, signature) {
  if (!env.FATHOM_WEBHOOK_SECRET || !signature) return false;
  const bodyStr = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const expected = createHmac("sha256", env.FATHOM_WEBHOOK_SECRET).update(bodyStr).digest("hex");
  try {
    const expectedBuf = Buffer.from(expected, "hex");
    const sigHex = signature.startsWith("sha256=") ? signature.slice(7) : signature;
    const sigBuf = Buffer.from(sigHex, "hex");
    if (expectedBuf.length !== sigBuf.length) return false;
    return timingSafeEqual(expectedBuf, sigBuf);
  } catch {
    return false;
  }
}
async function resolvePortalId() {
  const [row] = await db.select({ id: portal.id }).from(portal).limit(1);
  return row?.id ?? null;
}
async function findContactByEmail(portalId, email) {
  const [row] = await db.select({ id: contact.id }).from(contact).where(and30(eq35(contact.portalId, portalId), eq35(contact.email, email))).limit(1);
  if (!row) return null;
  const [dealRow] = await db.select({ id: deal.id }).from(deal).where(
    and30(
      eq35(deal.portalId, portalId),
      eq35(deal.primaryContactId, row.id),
      eq35(deal.archived, false)
    )
  ).limit(1);
  return { id: row.id, primaryDealId: dealRow?.id ?? null };
}
async function handleFathomMeeting(portalId, payload) {
  const title = payload.title ?? "Reuni\xF3n (Fathom)";
  const startsAt = payload.starts_at ? new Date(payload.starts_at) : null;
  const endsAt = payload.ends_at ? new Date(payload.ends_at) : null;
  const fathomSummary = payload.summary ?? null;
  const fathomTranscriptUrl = payload.transcript_url ?? null;
  const fathomActionItems = payload.action_items ? payload.action_items : null;
  const fathomParticipants = payload.participants ? payload.participants : null;
  let contactId = null;
  let dealId = null;
  if (payload.participants && payload.participants.length > 0) {
    for (const p of payload.participants) {
      if (!p.email) continue;
      const found = await findContactByEmail(portalId, p.email);
      if (found) {
        contactId = found.id;
        dealId = found.primaryDealId;
        break;
      }
    }
  }
  if (fathomTranscriptUrl) {
    const [existing] = await db.select({ id: meeting.id }).from(meeting).where(
      and30(
        eq35(meeting.portalId, portalId),
        eq35(meeting.fathomTranscriptUrl, fathomTranscriptUrl)
      )
    ).limit(1);
    if (existing) {
      await db.update(meeting).set({
        title,
        startsAt: startsAt ?? void 0,
        endsAt: endsAt ?? void 0,
        fathomSummary,
        fathomActionItems,
        fathomParticipants,
        contactId: contactId ?? void 0,
        dealId: dealId ?? void 0
      }).where(eq35(meeting.id, existing.id));
      return;
    }
  }
  const [newMeeting] = await db.insert(meeting).values({
    portalId,
    title,
    startsAt: startsAt ?? void 0,
    endsAt: endsAt ?? void 0,
    fathomSummary,
    fathomTranscriptUrl,
    fathomActionItems,
    fathomParticipants,
    contactId: contactId ?? void 0,
    dealId: dealId ?? void 0
  }).returning({ id: meeting.id });
  if (contactId && newMeeting) {
    await createNotification({
      portalId,
      type: "meeting_recorded",
      title: `Reuni\xF3n grabada: ${title}`,
      entityType: dealId ? "deal" : "contact",
      entityId: dealId ?? contactId
    });
  }
}
async function handleFathomWebhook(payload) {
  const portalId = await resolvePortalId();
  if (portalId == null) return;
  await handleFathomMeeting(portalId, payload);
}

// src/modules/webhooks/webhooks.router.ts
var FathomWebhookSchema = z28.object({
  title: z28.string().optional(),
  starts_at: z28.string().optional(),
  ends_at: z28.string().optional(),
  summary: z28.string().optional(),
  transcript_url: z28.string().optional(),
  action_items: z28.array(z28.unknown()).optional(),
  participants: z28.array(
    z28.object({
      email: z28.string().optional(),
      name: z28.string().optional()
    })
  ).optional()
});
async function webhooksRoutes(app2) {
  app2.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body, done) => {
      req.rawBody = body;
      try {
        done(null, JSON.parse(body));
      } catch (err) {
        done(err, void 0);
      }
    }
  );
  const r = app2.withTypeProvider();
  async function fathomHandler(request, reply) {
    const signature = request.headers["x-fathom-signature"];
    const rawBody = request.rawBody ?? JSON.stringify(request.body);
    if (!verifyFathomSignature(rawBody, signature)) {
      await reply.code(401).send();
      return;
    }
    await handleFathomWebhook(request.body);
    await reply.code(200).send({ ok: true });
  }
  app2.post(
    "/fathom",
    {
      schema: {
        tags: ["Webhooks"],
        summary: "Webhook de Fathom",
        description: "Recibe eventos de Fathom (reuni\xF3n grabada + AI summary). Protegido por HMAC-SHA256 en el header X-Fathom-Signature. Responde 401 sin detalle si la firma no es v\xE1lida."
      }
    },
    fathomHandler
  );
}

// src/modules/email-tracking/email-tracking.router.ts
import { z as z29 } from "zod";
async function emailTrackingRoutes(app2) {
  const r = app2.withTypeProvider();
  r.get(
    "/open/:trackingId",
    {
      schema: {
        tags: ["Tracking"],
        summary: "Pixel de apertura de email",
        description: "Registra la apertura del email identificado por trackingId y devuelve un GIF transparente 1\xD71. Nunca devuelve error visible (dise\xF1ado para ser embebido en emails).",
        params: z29.object({ trackingId: z29.string().uuid() }),
        response: {}
      }
    },
    async (request, reply) => {
      const { trackingId } = request.params;
      const userAgent = request.headers["user-agent"];
      const ip = request.headers["x-forwarded-for"]?.split(",")[0]?.trim() ?? request.socket.remoteAddress;
      recordOpen(trackingId, userAgent, ip).catch(() => void 0);
      return reply.header("Content-Type", "image/gif").header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate").header("Pragma", "no-cache").header("Expires", "0").send(TRACKING_PIXEL_GIF);
    }
  );
  r.get(
    "/click/:trackingId",
    {
      schema: {
        tags: ["Tracking"],
        summary: "Redirect de click en email",
        description: "Registra el click en un link de email y redirige al destino (?url=...). Si la URL es inv\xE1lida o ausente, redirige a la base de la API.",
        params: z29.object({ trackingId: z29.string().uuid() }),
        querystring: z29.object({ url: z29.string().optional() }),
        response: {}
      }
    },
    async (request, reply) => {
      const { trackingId } = request.params;
      const { url } = request.query;
      const userAgent = request.headers["user-agent"];
      const ip = request.headers["x-forwarded-for"]?.split(",")[0]?.trim() ?? request.socket.remoteAddress;
      const destination = validateRedirectUrl(url);
      if (url) {
        recordClick(trackingId, destination, userAgent, ip).catch(() => void 0);
      }
      return reply.redirect(destination, 302);
    }
  );
}

// src/modules/documents/documents.schema.ts
import { z as z30 } from "zod";
var DocumentTypeEnum = z30.enum(["contract", "proposal", "invoice", "other"]);
var CreateDocumentSchema = z30.object({
  dealId: z30.string().min(1),
  crId: z30.string().min(1).optional(),
  name: z30.string().min(1, "El nombre es requerido"),
  type: DocumentTypeEnum,
  storageKey: z30.string().min(1).optional()
});
var ListDocumentsQuerySchema = z30.object({
  dealId: z30.string().min(1).optional()
});

// src/modules/documents/documents.router.ts
var TAG28 = "Documentos";
var security27 = ADMIN_SECURITY;
async function documentsRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/",
    {
      schema: {
        tags: [TAG28],
        summary: "Listar documentos",
        description: "Lista los documentos del portal, opcionalmente filtrados por deal.",
        security: security27,
        querystring: ListDocumentsQuerySchema
      }
    },
    async (request) => {
      const docs = await listDocuments(request.hubUser.portalId, request.query);
      return ok(docs);
    }
  );
  r.post(
    "/",
    {
      schema: {
        tags: [TAG28],
        summary: "Crear documento",
        security: security27,
        body: CreateDocumentSchema
      }
    },
    async (request, reply) => {
      const doc = await createDocument(
        request.hubUser.portalId,
        request.hubUser.sub,
        request.body
      );
      return reply.status(201).send(ok(doc));
    }
  );
  r.delete(
    "/:id",
    {
      schema: {
        tags: [TAG28],
        summary: "Eliminar documento",
        security: security27,
        params: IdParamSchema
      }
    },
    async (request, reply) => {
      await deleteDocument(request.hubUser.portalId, request.params.id);
      return reply.status(204).send();
    }
  );
}

// src/modules/setter/setter.router.ts
import { sql as sql30 } from "drizzle-orm";

// src/modules/setter/channels/evolution.client.ts
import axios from "axios";
var OPT_OUT_KEYWORDS = [
  "no me escribas mas",
  "no me escriban mas",
  "dejame de escribir",
  "dejenme de escribir",
  "no me contactes",
  "no quiero que me escriban",
  "bajame de la lista",
  "bajame",
  "desuscribir",
  "darme de baja",
  "stop",
  "unsubscribe"
];
function normalize(text30) {
  return text30.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}
var EvolutionProvider = class {
  http;
  constructor() {
    this.http = env.EVOLUTION_API_URL && env.EVOLUTION_API_KEY ? axios.create({
      baseURL: env.EVOLUTION_API_URL,
      headers: { apikey: env.EVOLUTION_API_KEY },
      timeout: 8e3
    }) : null;
  }
  /** ¿Están las tres env (URL + key + instance) presentes? */
  isConfigured() {
    return Boolean(env.EVOLUTION_API_URL && env.EVOLUTION_API_KEY && env.EVOLUTION_INSTANCE);
  }
  /**
   * Estado de la instancia de Evolution. Sin config → `not_configured`.
   * Con config pero inalcanzable → `unreachable` (no tira excepción: lo reporta).
   */
  async ping() {
    if (!this.http || !env.EVOLUTION_INSTANCE) {
      return { configured: false, status: "not_configured" };
    }
    try {
      const res = await this.http.get(`/instance/connectionState/${env.EVOLUTION_INSTANCE}`);
      const state = res.data?.instance?.state ?? res.data?.state ?? "unknown";
      return { configured: true, status: String(state), reachable: true };
    } catch {
      return { configured: true, status: "unreachable", reachable: false };
    }
  }
  /** Opt-out por keywords. El opt-out es no negociable (guardrail Sprint 0). */
  detectOptOut(text30) {
    const normalized = normalize(text30);
    return OPT_OUT_KEYWORDS.some((k) => normalized.includes(k));
  }
  // ── Envío (Fase 2) ───────────────────────────────────────────────────────
  /** Garantiza que el cliente está configurado o lanza con un mensaje claro. */
  requireHttp() {
    if (!this.http || !env.EVOLUTION_INSTANCE) {
      throw new Error("Evolution no configurado (EVOLUTION_API_URL/KEY/INSTANCE)");
    }
    return this.http;
  }
  /** Envía un único texto. `number` para Evolution = dígitos sin `+`. */
  async sendText(to, text30) {
    const http = this.requireHttp();
    const res = await http.post(`/message/sendText/${env.EVOLUTION_INSTANCE}`, {
      number: toNumber(to),
      text: text30
    });
    const channelMessageId = res.data?.key?.id ?? null;
    return { channelMessageId, ok: true };
  }
  /**
   * Envía una respuesta partida en burbujas con "escribiendo…" y delays
   * variables (~1.5–4s) entre cada una. Autenticidad humana + anti-ban.
   */
  async sendSplitMessages(to, parts) {
    const http = this.requireHttp();
    const number = toNumber(to);
    const results = [];
    for (const part of parts) {
      const delayMs = randomDelayMs();
      try {
        await http.post(`/chat/sendPresence/${env.EVOLUTION_INSTANCE}`, {
          number,
          presence: "composing",
          delay: delayMs
        });
      } catch {
      }
      await sleep(delayMs);
      results.push(await this.sendText(to, part));
    }
    return results;
  }
  /**
   * Estado de la ventana de servicio. En Baileys no existe la ventana paga de
   * Meta (no se cobra por mensaje), así que para el canal siempre está "abierta".
   * El control económico/temporal real vive en `setter_lead.windowExpiresAt`.
   */
  async getWindowState(_to) {
    return { open: true, expiresAt: null };
  }
  /** Marca como leído el último mensaje entrante (best-effort). */
  async markRead(to, channelMessageId) {
    const http = this.requireHttp();
    await http.post(`/chat/markMessageAsRead/${env.EVOLUTION_INSTANCE}`, {
      readMessages: [{ remoteJid: `${toNumber(to)}@s.whatsapp.net`, id: channelMessageId }]
    });
  }
};
function toNumber(to) {
  return to.replace(/\D/g, "");
}
function randomDelayMs() {
  return 1500 + Math.floor(Math.random() * 2500);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function splitIntoBubbles(text30, maxBubbles = 3) {
  const trimmed = text30.trim();
  if (!trimmed) return [];
  const byLines = trimmed.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const units = byLines.length > 1 ? byLines : trimmed.split(/(?<=[.?!])\s+/).filter(Boolean);
  if (units.length <= 1) return [trimmed];
  if (units.length <= maxBubbles) return units;
  const perBubble = Math.ceil(units.length / maxBubbles);
  const bubbles = [];
  for (let i = 0; i < units.length; i += perBubble) {
    bubbles.push(units.slice(i, i + perBubble).join(" "));
  }
  return bubbles;
}
var evolutionProvider = new EvolutionProvider();

// src/modules/setter/queue/setter.queue.ts
import { Queue, Worker } from "bullmq";

// src/jobs/connection.ts
function isRedisConfigured() {
  return !!env.REDIS_URL;
}
function getRedisConnectionOptions() {
  if (!env.REDIS_URL) {
    throw new Error("REDIS_URL is not configured \u2014 cannot build Redis connection options");
  }
  const url = new URL(env.REDIS_URL);
  const options = {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    // maxRetriesPerRequest must be null for BullMQ (required by the library)
    maxRetriesPerRequest: null
  };
  if (url.password) {
    ;
    options["password"] = decodeURIComponent(url.password);
  }
  if (url.username) {
    ;
    options["username"] = decodeURIComponent(url.username);
  }
  return options;
}

// src/modules/setter/agent/brain.ts
import { asc as asc13, eq as eq39 } from "drizzle-orm";

// src/modules/setter/agent/tools.ts
import { Type } from "@google/genai";
import { eq as eq36 } from "drizzle-orm";
var TOOL_DECLARATIONS = [
  {
    name: "check_availability",
    description: "Devuelve horarios libres reales para la call, en el timezone del lead. Usar SIEMPRE antes de proponer cualquier horario. \xDAnica fuente de slots.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        preferredRange: {
          type: Type.STRING,
          enum: ["morning", "afternoon", "this_week", "next_week"],
          description: "Preferencia de franja si el lead la mencion\xF3."
        }
      }
    }
  },
  {
    name: "book_appointment",
    description: "Agenda la call. \xDAnica tool que agenda. Llamar solo tras reconfirmar el horario exacto con el lead.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        startsAt: { type: Type.STRING, description: "Inicio en ISO 8601 (uno de los slots de check_availability)." },
        durationMin: { type: Type.INTEGER, description: "Duraci\xF3n en minutos (default 30)." },
        email: { type: Type.STRING, description: "Email del lead para la invitaci\xF3n, si lo dio." }
      },
      required: ["startsAt"]
    }
  },
  {
    name: "save_qualification",
    description: "Guarda datos de calificaci\xF3n capturados en la charla. Llamar cada vez que descubr\xEDs dolor, fit, autoridad o timing.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        pain: { type: Type.STRING },
        fit: { type: Type.STRING },
        authority: { type: Type.STRING },
        timing: { type: Type.STRING },
        score: { type: Type.INTEGER, description: "Score de calificaci\xF3n 0-15 si lo pod\xE9s estimar." },
        notes: { type: Type.STRING }
      }
    }
  },
  {
    name: "handoff_to_human",
    description: "Pasa la conversaci\xF3n a un humano (pedido expl\xEDcito, deal grande, fuera de scope, frustraci\xF3n).",
    parameters: {
      type: Type.OBJECT,
      properties: { reason: { type: Type.STRING } },
      required: ["reason"]
    }
  },
  {
    name: "mark_not_interested",
    description: "Marca al lead como no interesado / no fit, con cierre cordial.",
    parameters: {
      type: Type.OBJECT,
      properties: { reason: { type: Type.STRING } },
      required: ["reason"]
    }
  }
];
function formatSlot(d, tz) {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
    hour12: false
  }).format(d);
}
async function checkAvailability(_args, ctx) {
  const tz = ctx.tenant.timezone;
  const slot1 = /* @__PURE__ */ new Date();
  slot1.setDate(slot1.getDate() + 1);
  slot1.setHours(10, 0, 0, 0);
  const slot2 = /* @__PURE__ */ new Date();
  slot2.setDate(slot2.getDate() + 2);
  slot2.setHours(15, 0, 0, 0);
  return {
    mock: true,
    slots: [
      { label: formatSlot(slot1, tz), startsAt: slot1.toISOString() },
      { label: formatSlot(slot2, tz), startsAt: slot2.toISOString() }
    ]
  };
}
async function bookAppointment(args, ctx) {
  const startsAtRaw = args["startsAt"];
  const startsAt = typeof startsAtRaw === "string" ? new Date(startsAtRaw) : /* @__PURE__ */ new Date(NaN);
  if (Number.isNaN(startsAt.getTime())) {
    return { ok: false, error: "startsAt inv\xE1lido (se esperaba ISO 8601)" };
  }
  const durationMin = typeof args["durationMin"] === "number" ? args["durationMin"] : 30;
  const endsAt = new Date(startsAt.getTime() + durationMin * 6e4);
  const calendarRef = `mock-${createId()}`;
  await db.insert(setterAppointment).values({
    tenantId: ctx.tenant.id,
    leadId: ctx.leadId,
    startsAt,
    endsAt,
    calendarRef,
    status: "confirmed"
  }).onConflictDoUpdate({
    target: setterAppointment.leadId,
    set: { startsAt, endsAt, calendarRef, status: "confirmed" }
  });
  await db.update(setterLead).set({ status: "BOOKED" }).where(eq36(setterLead.id, ctx.leadId));
  return { ok: true, calendarRef, startsAt: startsAt.toISOString(), mock: true };
}
async function saveQualification(args, ctx) {
  const fields = {};
  for (const key of ["pain", "fit", "authority", "timing", "score", "notes"]) {
    if (args[key] !== void 0 && args[key] !== null) fields[key] = args[key];
  }
  const [lead] = await db.select({ qualification: setterLead.qualification, status: setterLead.status }).from(setterLead).where(eq36(setterLead.id, ctx.leadId)).limit(1);
  const merged = { ...lead?.qualification ?? {}, ...fields };
  const score = typeof fields["score"] === "number" ? fields["score"] : void 0;
  const terminal = ["BOOKED", "NOT_INTERESTED", "HANDED_OFF", "OPTED_OUT", "BOOKING"];
  let nextStatus = lead?.status;
  if (lead && !terminal.includes(lead.status)) {
    nextStatus = score !== void 0 && score >= 10 ? "QUALIFIED" : "QUALIFYING";
  }
  await db.update(setterLead).set({ qualification: merged, status: nextStatus }).where(eq36(setterLead.id, ctx.leadId));
  return { ok: true, status: nextStatus };
}
async function handoffToHuman(args, ctx) {
  await db.update(setterLead).set({ status: "HANDED_OFF" }).where(eq36(setterLead.id, ctx.leadId));
  return { ok: true, reason: args["reason"] ?? null };
}
async function markNotInterested(args, ctx) {
  await db.update(setterLead).set({ status: "NOT_INTERESTED" }).where(eq36(setterLead.id, ctx.leadId));
  return { ok: true, reason: args["reason"] ?? null };
}
var TOOLS = {
  check_availability: checkAvailability,
  book_appointment: bookAppointment,
  save_qualification: saveQualification,
  handoff_to_human: handoffToHuman,
  mark_not_interested: markNotInterested
};
async function executeTool(name, args, ctx) {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`Tool desconocida: ${name}`);
  return tool(args, ctx);
}

// src/modules/setter/agent/prompts.ts
function buildMasterPrompt(tenant) {
  return `Sos ${tenant.agentName}, del equipo de ${tenant.name}. Tu \xFAnico trabajo es: calificar al
lead y, si es buen fit, agendar una llamada con ${tenant.ownerName}. No sos un asistente
general; no respondas temas fuera de ${tenant.name}.

CONTEXTO DEL NEGOCIO:
${tenant.businessBrief}

QUI\xC9N SOS Y C\xD3MO HABL\xC1S:
- Espa\xF1ol rioplatense. Vos, nunca t\xFA. Profesional pero cercano, como un humano del
  equipo comercial argentino. Natural, directo, sin solemnidad corporativa.
- Mensajes CORTOS: 1 a 3 l\xEDneas. Una idea por mensaje. UNA sola pregunta por mensaje.
- M\xE1ximo 1 emoji por mensaje, y no siempre. Nada de signos de exclamaci\xF3n m\xFAltiples.
- PUNTUACI\xD3N: NO uses los signos de apertura "\xBF" ni "\xA1". Escrib\xED "Te queda mejor ma\xF1ana?"
  y "Buen\xEDsimo!". S\xCD manten\xE9 los de cierre "?" y "!". Esto vale para TODOS tus mensajes.
- Reflej\xE1 el lenguaje del lead. Si dice "facturaci\xF3n", no digas "revenue".

REGLAS DURAS:
- Si te preguntan si sos una IA/bot, dec\xED la verdad con naturalidad. Nunca lo niegues.
- Nunca inventes precios, horarios ni detalles que no est\xE9n en el contexto.
- Para proponer horarios us\xE1 SIEMPRE la tool check_availability. Para agendar,
  book_appointment. Nunca "confirmes" un turno por texto sin que la tool lo haya hecho.
- No prometas nada que ${tenant.name} no ofrezca. El setter NO cotiza: deriva el precio a la call.
- Si el lead se pone t\xE9cnico/dif\xEDcil, pide humano, o es un deal grande fuera de tu
  alcance -> us\xE1 handoff_to_human.
- Si claramente no es fit o es un curioso sin intenci\xF3n -> mark_not_interested, con un
  cierre cordial. No fuerces.
- Si el lead muestra se\xF1al clara de compra (quiere avanzar/agendar ya), DEJ\xC1 de calificar
  y pas\xE1 directo a proponer la call.

OBJETIVO DE CADA ETAPA (no es un script r\xEDgido, es una meta):
1. Apertura: referenci\xE1 lo concreto por lo que lleg\xF3. Baj\xE1 fricci\xF3n. UNA pregunta f\xE1cil.
2. Calificaci\xF3n: descubr\xED dolor, fit, autoridad y timing SIN parecer formulario. Guard\xE1
   lo que aprendas con save_qualification.
3. Cierre: si califica, propon\xE9 la call asumiendo el s\xED (doble opci\xF3n de horario), no
   preguntes "quer\xE9s agendar?". Reconfirm\xE1 el horario exacto antes de book_appointment.

NUNCA: mandes links sin contexto, suenes a vendedor desesperado, repitas "segu\xEDs ah\xED?",
escribas p\xE1rrafos largos, ni hagas m\xE1s de una pregunta por mensaje.`;
}
function guideForStatus(status) {
  switch (status) {
    case "NEW":
    case "CONTACTED":
      return `MOMENTO: APERTURA. Es de los primeros mensajes. Provoc\xE1 una respuesta, NO vendas.
Referenci\xE1 lo concreto por lo que lleg\xF3, presentate en pocas palabras y hac\xE9 UNA pregunta
abierta y f\xE1cil sobre su situaci\xF3n. C\xE1lido pero al toque.`;
    case "ENGAGED":
    case "QUALIFYING":
      return `MOMENTO: CALIFICACI\xD3N. Descubr\xED (una cosa por mensaje, construyendo sobre lo que
responde): el DOLOR concreto, el FIT con la oferta, si DECIDE, y el TIMING. No interrogues:
que parezca charla. Cuando captures un dato, llam\xE1 save_qualification. Si ya ten\xE9s dolor +
fit + timing claros y decide -> pas\xE1 a cierre (check_availability).`;
    case "QUALIFIED":
    case "BOOKING":
      return `MOMENTO: CIERRE. El lead califica. Propon\xE9 la call ASUMIENDO el s\xED: us\xE1
check_availability y ofrec\xE9 DOS horarios concretos (no "cu\xE1ndo pod\xE9s?"). Cuando elija,
RECONFIRM\xC1 el horario exacto en sus palabras y reci\xE9n ah\xED llam\xE1 book_appointment.`;
    case "BOOKED":
      return `MOMENTO: POST-BOOKING. Ya agendaste. Confirm\xE1 en una l\xEDnea, dej\xE1 claro qu\xE9/cu\xE1ndo,
y baj\xE1 la ansiedad. No vuelvas a vender.`;
    default:
      return `MOMENTO: CONVERSACI\xD3N. Segu\xED el framework del maestro. Una pregunta por mensaje.`;
  }
}
var FEW_SHOTS = `EJEMPLOS DE TONO (imit\xE1 los \u2705, evit\xE1 los \u274C):
\u2705 "Hola Mati, soy Tom de la agencia \u{1F44B} Vi que dejaste tus datos. Qu\xE9 es lo que m\xE1s te urge resolver hoy con eso?"
\u274C "\xA1Hola!! \u{1F600} Muchas gracias por tu inter\xE9s. Estamos encantados de ayudarte a alcanzar tus objetivos. \xBFEn qu\xE9 podemos asistirte?"
\u2705 "Te lo muestro sobre tu caso en 15 min, rinde m\xE1s que un PDF. Ma\xF1ana 10 o a la tarde?"
\u274C "Claro, te env\xEDo toda la informaci\xF3n a tu correo as\xED la revis\xE1s con calma."
\u2705 "Tengo jueves 10 o viernes 15, cu\xE1l te queda mejor?"
\u274C "\xBFTe gustar\xEDa agendar una llamada en alg\xFAn momento que te sea conveniente?"
\u2705 "S\xED, soy un asistente con IA del equipo. Igual lo que charlemos lo ve el due\xF1o y la call es con \xE9l. Te muestro horarios?"
\u274C "No, soy Tom, parte del equipo comercial \u{1F60A}"`;
function buildSystemInstruction(tenant, status) {
  return `${buildMasterPrompt(tenant)}

${guideForStatus(status)}

${FEW_SHOTS}`;
}
function deriveBeat(statusBefore, toolsCalled) {
  if (toolsCalled.includes("mark_not_interested")) return "cierre_no_fit";
  if (toolsCalled.includes("handoff_to_human")) return "handoff";
  if (toolsCalled.includes("book_appointment")) return "booking";
  if (toolsCalled.includes("check_availability")) return "cierre";
  if (toolsCalled.includes("save_qualification")) return "calificacion";
  if (statusBefore === "NEW" || statusBefore === "CONTACTED") return "apertura";
  return "conversacion";
}
function validateOutput(text30, checkAvailabilityCalled) {
  const mentionsTime = /\b\d{1,2}([:.]\d{2})?\s?(hs?|am|pm)\b/i.test(text30);
  if (mentionsTime && !checkAvailabilityCalled) {
    return { ok: false, reason: "menciona un horario sin haber llamado check_availability" };
  }
  const mentionsPrice = /(usd|u\$s|us\$|\$)\s?\d{2,}/i.test(text30);
  if (mentionsPrice) {
    return { ok: false, reason: "menciona un precio concreto (el setter no cotiza)" };
  }
  return { ok: true };
}

// src/modules/setter/agent/providers/gemini.provider.ts
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
var client = null;
function getClient() {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error("Gemini no configurado (GOOGLE_SERVICE_ACCOUNT_JSON)");
  }
  if (client) return client;
  const credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!credentials.project_id) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON sin project_id");
  client = new GoogleGenAI({
    vertexai: true,
    project: credentials.project_id,
    location: env.VERTEX_LOCATION,
    googleAuthOptions: { credentials }
  });
  return client;
}
var geminiGenerate = async (req) => {
  const ai = getClient();
  const res = await ai.models.generateContent({
    model: env.VERTEX_MODEL,
    contents: req.contents,
    config: {
      systemInstruction: req.systemInstruction,
      temperature: req.temperature,
      maxOutputTokens: req.maxOutputTokens,
      // Un setter ejecuta un framework, no razona profundo: thinking bajo =
      // más rápido, más barato y deja tokens para el mensaje.
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }]
    }
  });
  const functionCalls = (res.functionCalls ?? []).map((f) => ({
    id: f.id,
    name: f.name ?? "",
    args: f.args ?? {}
  }));
  return { functionCalls, text: res.text ?? "", modelContent: res.candidates?.[0]?.content };
};

// src/modules/setter/agent/providers/claude.provider.ts
import Anthropic from "@anthropic-ai/sdk";
var TYPE_MAP = {
  OBJECT: "object",
  STRING: "string",
  INTEGER: "integer",
  NUMBER: "number",
  BOOLEAN: "boolean",
  ARRAY: "array"
};
function convertSchema(s) {
  const out = {};
  if (s["type"]) out["type"] = TYPE_MAP[String(s["type"])] ?? "string";
  if (s["description"]) out["description"] = s["description"];
  if (s["enum"]) out["enum"] = s["enum"];
  if (s["properties"]) {
    const props = {};
    for (const [k, v] of Object.entries(s["properties"])) {
      props[k] = convertSchema(v);
    }
    out["properties"] = props;
  }
  if (s["required"]) out["required"] = s["required"];
  if (s["items"]) out["items"] = convertSchema(s["items"]);
  return out;
}
function toAnthropicTools() {
  return TOOL_DECLARATIONS.map((d) => ({
    name: d.name ?? "",
    description: d.description ?? "",
    input_schema: d.parameters ? convertSchema(d.parameters) : { type: "object", properties: {} }
  }));
}
function assistantParts(parts) {
  const blocks = [];
  for (const p of parts) {
    if (p.text) blocks.push({ type: "text", text: p.text });
    else if (p.functionCall) {
      blocks.push({
        type: "tool_use",
        id: p.functionCall.id ?? createId(),
        name: p.functionCall.name ?? "",
        input: p.functionCall.args ?? {}
      });
    }
  }
  return blocks;
}
function userContent(parts) {
  const toolResults = parts.filter((p) => p.functionResponse);
  if (toolResults.length > 0) {
    return toolResults.map((p) => ({
      type: "tool_result",
      tool_use_id: p.functionResponse.id ?? "",
      content: JSON.stringify(p.functionResponse.response ?? {})
    }));
  }
  return parts.map((p) => p.text ?? "").filter(Boolean).join("\n");
}
function translateToAnthropic(contents) {
  const msgs = [];
  for (const c of contents) {
    if (c.role === "model") {
      msgs.push({ role: "assistant", content: assistantParts(c.parts ?? []) });
    } else {
      msgs.push({ role: "user", content: userContent(c.parts ?? []) });
    }
  }
  const merged = [];
  for (const m of msgs) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role && typeof last.content === "string" && typeof m.content === "string") {
      last.content = `${last.content}
${m.content}`;
    } else {
      merged.push(m);
    }
  }
  return merged;
}
var client2 = null;
function getClient2() {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("Claude no configurado (ANTHROPIC_API_KEY)");
  }
  if (!client2) client2 = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client2;
}
var claudeGenerate = async (req) => {
  const ai = getClient2();
  const res = await ai.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: req.maxOutputTokens,
    temperature: req.temperature,
    system: req.systemInstruction,
    messages: translateToAnthropic(req.contents),
    tools: toAnthropicTools()
  });
  const functionCalls = [];
  const parts = [];
  let text30 = "";
  for (const block of res.content) {
    if (block.type === "text") {
      text30 += block.text;
      parts.push({ text: block.text });
    } else if (block.type === "tool_use") {
      functionCalls.push({ id: block.id, name: block.name, args: block.input });
      parts.push({ functionCall: { id: block.id, name: block.name, args: block.input } });
    }
  }
  return { functionCalls, text: text30, modelContent: { role: "model", parts } };
};

// src/modules/setter/agent/providers/index.ts
function getProvider(provider) {
  return provider === "claude" ? claudeGenerate : geminiGenerate;
}

// src/modules/setter/setter.crm-sync.service.ts
import { and as and32, asc as asc12, eq as eq38 } from "drizzle-orm";

// src/modules/setter/setter.events.service.ts
import { and as and31, desc as desc19, eq as eq37, gt as gt2 } from "drizzle-orm";

// src/modules/setter/setter.event-bus.ts
import { EventEmitter as EventEmitter2 } from "events";
var SetterEventBus = class extends EventEmitter2 {
};
var setterEventBus = new SetterEventBus();
setterEventBus.setMaxListeners(0);
function emitSetterEvent(event) {
  setterEventBus.emit("event", event);
}

// src/modules/setter/setter.events.service.ts
async function logSetterEvent(input) {
  if (env.NODE_ENV === "test") return;
  try {
    const [row] = await db.insert(setterEvent).values({
      tenantId: input.tenantId,
      level: input.level ?? "info",
      type: input.type,
      message: input.message,
      leadId: input.leadId ?? null,
      meta: input.meta
    }).returning({ id: setterEvent.id, createdAt: setterEvent.createdAt });
    if (row) {
      emitSetterEvent({
        id: row.id,
        tenantId: input.tenantId,
        level: input.level ?? "info",
        type: input.type,
        message: input.message,
        leadId: input.leadId ?? null,
        meta: input.meta ?? null,
        createdAt: row.createdAt.toISOString()
      });
    }
  } catch (err) {
    console.error("[setter] no se pudo registrar el evento:", err);
  }
}
async function listSetterEvents(portalId, opts) {
  const conds = [eq37(setterTenant.portalId, portalId)];
  if (opts?.since) conds.push(gt2(setterEvent.createdAt, opts.since));
  return db.select({
    id: setterEvent.id,
    level: setterEvent.level,
    type: setterEvent.type,
    message: setterEvent.message,
    leadId: setterEvent.leadId,
    meta: setterEvent.meta,
    createdAt: setterEvent.createdAt
  }).from(setterEvent).innerJoin(setterTenant, eq37(setterEvent.tenantId, setterTenant.id)).where(and31(...conds)).orderBy(desc19(setterEvent.createdAt)).limit(opts?.limit ?? 150);
}

// src/modules/setter/setter.crm-sync.service.ts
var STATUS_TO_LIFECYCLE = {
  ENGAGED: "lead",
  QUALIFYING: "mql",
  QUALIFIED: "sql",
  BOOKING: "opportunity",
  BOOKED: "opportunity",
  NOT_INTERESTED: "other",
  OPTED_OUT: "other"
};
var CREATE_CONTACT_STATUSES = /* @__PURE__ */ new Set([
  "ENGAGED",
  "QUALIFYING",
  "QUALIFIED",
  "BOOKING",
  "BOOKED",
  "HANDED_OFF"
]);
var CREATE_DEAL_STATUSES = /* @__PURE__ */ new Set(["QUALIFIED", "BOOKING", "BOOKED"]);
var LIFECYCLE_RANK = {
  lead: 1,
  mql: 2,
  sql: 3,
  opportunity: 4,
  customer: 5
};
function isDowngrade(current, next) {
  if (next === "other") return false;
  if (current === "customer") return true;
  return (LIFECYCLE_RANK[next] ?? 0) < (LIFECYCLE_RANK[current] ?? 0);
}
async function findOrCreateContact(tx, portalId, person, lifecycle, actorId) {
  if (person.phone) {
    const [existing] = await tx.select({ id: contact.id }).from(contact).where(
      and32(eq38(contact.portalId, portalId), eq38(contact.phone, person.phone), eq38(contact.archived, false))
    ).limit(1);
    if (existing) return existing.id;
  }
  const [created] = await tx.insert(contact).values({
    portalId,
    ownerId: actorId,
    firstName: person.name,
    phone: person.phone,
    lifecycleStage: lifecycle,
    custom: { source: "setter", setterPersonId: person.id }
  }).returning({ id: contact.id });
  if (actorId) {
    await writeAudit({
      tx,
      portalId,
      userId: actorId,
      entityType: "contact",
      entityId: created.id,
      action: "CREATE",
      payload: { source: "setter" }
    });
  }
  return created.id;
}
async function createSetterDeal(tx, portalId, contactId, person, tenantName, actorId) {
  let [pl] = await tx.select({ id: pipeline.id }).from(pipeline).where(and32(eq38(pipeline.portalId, portalId), eq38(pipeline.archived, false), eq38(pipeline.label, "Ventas"))).limit(1);
  if (!pl) {
    ;
    [pl] = await tx.select({ id: pipeline.id }).from(pipeline).where(and32(eq38(pipeline.portalId, portalId), eq38(pipeline.archived, false))).orderBy(asc12(pipeline.createdAt)).limit(1);
  }
  if (!pl) return null;
  const [stage] = await tx.select({ id: pipelineStage.id }).from(pipelineStage).where(and32(eq38(pipelineStage.pipelineId, pl.id), eq38(pipelineStage.archived, false))).orderBy(asc12(pipelineStage.displayOrder)).limit(1);
  if (!stage) return null;
  const [created] = await tx.insert(deal).values({
    portalId,
    ownerId: actorId,
    pipelineId: pl.id,
    stageId: stage.id,
    primaryContactId: contactId,
    name: `${person.name ?? "Lead"} \u2014 ${tenantName}`,
    currency: "USD",
    custom: { source: "setter" }
  }).returning({ id: deal.id });
  if (actorId) {
    await writeAudit({
      tx,
      portalId,
      userId: actorId,
      entityType: "deal",
      entityId: created.id,
      action: "CREATE",
      payload: { source: "setter" }
    });
  }
  return created.id;
}
async function advanceDealOnBooked(portalId, actorId, dealId) {
  const [d] = await db.select({ pipelineId: deal.pipelineId, stageId: deal.stageId }).from(deal).where(eq38(deal.id, dealId)).limit(1);
  if (!d) return;
  const stages = await db.select({ id: pipelineStage.id, isWon: pipelineStage.isWon, isClosed: pipelineStage.isClosed }).from(pipelineStage).where(eq38(pipelineStage.pipelineId, d.pipelineId)).orderBy(asc12(pipelineStage.displayOrder));
  const idx = stages.findIndex((s) => s.id === d.stageId);
  const next = idx >= 0 ? stages[idx + 1] : void 0;
  if (next && !next.isWon && !next.isClosed) {
    await changeStage(portalId, actorId, dealId, next.id);
  }
}
async function syncLeadToCrm(leadId) {
  const [lead] = await db.select().from(setterLead).where(eq38(setterLead.id, leadId)).limit(1);
  if (!lead) return;
  const [person] = await db.select().from(setterPerson).where(eq38(setterPerson.id, lead.personId)).limit(1);
  if (!person) return;
  const [tenant] = await db.select({ portalId: setterTenant.portalId, name: setterTenant.name }).from(setterTenant).where(eq38(setterTenant.id, lead.tenantId)).limit(1);
  if (!tenant) return;
  const portalId = tenant.portalId;
  const status = lead.status;
  const lifecycle = STATUS_TO_LIFECYCLE[status];
  const [owner] = await db.select({ id: hubUser.id }).from(hubUser).where(and32(eq38(hubUser.portalId, portalId), eq38(hubUser.role, "owner"))).limit(1) ?? [];
  const [anyUser] = owner ? [owner] : await db.select({ id: hubUser.id }).from(hubUser).where(eq38(hubUser.portalId, portalId)).limit(1);
  const actorId = anyUser?.id ?? null;
  let advanceDealId = null;
  let linkedContactId = null;
  let newDealId = null;
  await db.transaction(async (tx) => {
    let contactId = person.crmContactId;
    if (!contactId) {
      if (!CREATE_CONTACT_STATUSES.has(status)) return;
      contactId = await findOrCreateContact(tx, portalId, person, lifecycle ?? "lead", actorId);
      await tx.update(setterPerson).set({ crmContactId: contactId }).where(eq38(setterPerson.id, person.id));
      linkedContactId = contactId;
    }
    if (lifecycle) {
      const [c] = await tx.select({ lifecycleStage: contact.lifecycleStage }).from(contact).where(eq38(contact.id, contactId)).limit(1);
      if (c && c.lifecycleStage !== lifecycle && !isDowngrade(c.lifecycleStage, lifecycle)) {
        await tx.update(contact).set({ lifecycleStage: lifecycle, updatedAt: /* @__PURE__ */ new Date() }).where(eq38(contact.id, contactId));
        if (actorId) {
          await recordFieldChanges({
            tx,
            portalId,
            entityType: "contact",
            entityId: contactId,
            before: { lifecycleStage: c.lifecycleStage },
            after: { lifecycleStage: lifecycle },
            changedBy: actorId,
            sourceType: "setter"
          });
        }
      }
    }
    if (CREATE_DEAL_STATUSES.has(status) && !lead.crmDealId) {
      const dealId = await createSetterDeal(tx, portalId, contactId, person, tenant.name, actorId);
      if (dealId) {
        await tx.update(setterLead).set({ crmDealId: dealId }).where(eq38(setterLead.id, lead.id));
        newDealId = dealId;
        if (status === "BOOKED") advanceDealId = dealId;
      }
    } else if (status === "BOOKED" && lead.crmDealId) {
      advanceDealId = lead.crmDealId;
    }
  });
  if (advanceDealId && actorId) {
    await advanceDealOnBooked(portalId, actorId, advanceDealId);
  }
  if (linkedContactId) {
    void logSetterEvent({
      tenantId: lead.tenantId,
      level: "success",
      type: "sync",
      message: `Lead sincronizado al CRM como contacto (${lifecycle ?? "lead"})`,
      leadId
    });
  }
  if (newDealId) {
    void logSetterEvent({
      tenantId: lead.tenantId,
      level: "success",
      type: "sync",
      message: "Deal creado en el CRM",
      leadId
    });
  }
}

// src/modules/setter/agent/brain.ts
var MAX_HOPS = 3;
var MAX_OUTPUT_TOKENS = 2048;
function toContents(messages) {
  return messages.filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));
}
async function runAgentTurn(leadId, opts) {
  const [lead] = await db.select().from(setterLead).where(eq39(setterLead.id, leadId)).limit(1);
  if (!lead) throw new Error(`Lead no encontrado: ${leadId}`);
  const [person] = await db.select().from(setterPerson).where(eq39(setterPerson.id, lead.personId)).limit(1);
  if (person?.optedOut) return { draftId: null, beat: null, status: lead.status, skipped: "opted_out" };
  const [tenant] = await db.select().from(setterTenant).where(eq39(setterTenant.id, lead.tenantId)).limit(1);
  if (!tenant) throw new Error(`Tenant no encontrado: ${lead.tenantId}`);
  const generate = opts?.generate ?? getProvider(tenant.modelProvider);
  const [conversation] = await db.select().from(setterConversation).where(eq39(setterConversation.personId, lead.personId)).limit(1);
  if (!conversation) throw new Error(`Conversaci\xF3n no encontrada para person ${lead.personId}`);
  const messages = await db.select({ role: setterMessage.role, content: setterMessage.content }).from(setterMessage).where(eq39(setterMessage.conversationId, conversation.id)).orderBy(asc13(setterMessage.createdAt)).limit(40);
  const statusBefore = lead.status;
  if (statusBefore === "NEW" || statusBefore === "CONTACTED") {
    await db.update(setterLead).set({ status: "ENGAGED" }).where(eq39(setterLead.id, leadId));
  }
  const statusForGuide = statusBefore === "NEW" || statusBefore === "CONTACTED" ? "ENGAGED" : statusBefore;
  const systemInstruction = buildSystemInstruction(tenant, statusForGuide);
  const contents = toContents(messages);
  const ctx = { tenant, leadId };
  const toolsCalled = [];
  let checkAvailabilityCalled = false;
  let finalText = "";
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const res = await generate({
      systemInstruction,
      contents,
      temperature: 0.4,
      maxOutputTokens: MAX_OUTPUT_TOKENS
    });
    if (res.functionCalls.length > 0) {
      contents.push(
        res.modelContent ?? {
          role: "model",
          parts: res.functionCalls.map((fc) => ({
            functionCall: { id: fc.id, name: fc.name, args: fc.args }
          }))
        }
      );
      const responseParts = [];
      for (const fc of res.functionCalls) {
        toolsCalled.push(fc.name);
        if (fc.name === "check_availability") checkAvailabilityCalled = true;
        const result = await executeTool(fc.name, fc.args, ctx);
        responseParts.push({ functionResponse: { id: fc.id, name: fc.name, response: result } });
      }
      contents.push({ role: "user", parts: responseParts });
      if (res.text) finalText = res.text;
      continue;
    }
    finalText = res.text;
    break;
  }
  finalText = finalText.trim();
  let beat = deriveBeat(statusBefore, toolsCalled);
  const validation = validateOutput(finalText, checkAvailabilityCalled);
  const recordedTools = [...toolsCalled];
  if (!validation.ok || !finalText) {
    await executeTool(
      "handoff_to_human",
      { reason: `Validaci\xF3n de salida: ${validation.reason ?? "respuesta vac\xEDa"}` },
      ctx
    );
    recordedTools.push("handoff_to_human");
    beat = "handoff";
    finalText = finalText && validation.ok ? finalText : "Dejame que el due\xF1o te responda esto directamente, te escribe en un rato por ac\xE1 \u{1F44D}";
  }
  const [after] = await db.select({ status: setterLead.status }).from(setterLead).where(eq39(setterLead.id, leadId)).limit(1);
  const [draft] = await db.insert(setterDraft).values({
    tenantId: tenant.id,
    conversationId: conversation.id,
    leadId,
    content: finalText,
    beat,
    format: "text",
    status: "pending",
    toolCalls: { tools: recordedTools, checkAvailabilityCalled }
  }).returning({ id: setterDraft.id });
  if (tenant.portalId && beat !== "handoff" && draft?.id) {
    void notifyAdmins(tenant.portalId, {
      entityType: "setter_draft",
      entityId: draft.id,
      type: "setter_draft_pending",
      title: "El setter tiene un borrador esperando tu aprobaci\xF3n",
      body: person?.name ? `Para \xAB${person.name}\xBB` : null,
      actionUrl: "/admin/setter"
    });
  }
  void logSetterEvent({
    tenantId: tenant.id,
    level: beat === "handoff" ? "warn" : "success",
    type: beat === "handoff" ? "agent" : "draft",
    message: beat === "handoff" ? `Failsafe \u2192 handoff a humano (lead ${after.status})` : `Draft generado \xB7 ${beat} \xB7 lead ${after.status}`,
    leadId,
    meta: { beat, status: after.status, tools: recordedTools }
  });
  if (env.NODE_ENV !== "test") {
    try {
      await syncLeadToCrm(leadId);
    } catch (err) {
      console.error(`[setter] sync CRM fall\xF3 para lead ${leadId}:`, err);
    }
  }
  return { draftId: draft.id, beat, status: after.status };
}

// src/modules/setter/queue/setter.queue.ts
var SETTER_INBOUND_QUEUE = "setter-inbound";
var inboundQueue = null;
function getSetterInboundQueue() {
  if (!isRedisConfigured()) {
    throw new Error("REDIS_URL no configurado \u2014 la cola del setter no est\xE1 disponible");
  }
  if (!inboundQueue) {
    inboundQueue = new Queue(SETTER_INBOUND_QUEUE, { connection: getRedisConnectionOptions() });
  }
  return inboundQueue;
}
async function pingSetterQueue() {
  if (!isRedisConfigured()) {
    return "not_configured";
  }
  try {
    const queue = getSetterInboundQueue();
    await queue.waitUntilReady();
    return "ok";
  } catch {
    return "unreachable";
  }
}

// src/modules/setter/setter.router.ts
async function setterRoutes(app2) {
  app2.addHook("preHandler", authenticate);
  app2.get(
    "/health",
    {
      schema: {
        tags: ["Setter"],
        summary: "Estado del setter",
        security: [{ bearerAuth: [] }],
        description: "Reporta el estado de cada dependencia del setter: base de datos, cola BullMQ, Vertex (Gemini) y el canal Evolution. En Sprint 0 solo Vertex est\xE1 vivo; Evolution y el calendario quedan diferidos hasta cargar sus credenciales."
      }
    },
    async () => {
      const [dbStatus, bullmq, evolution] = await Promise.all([
        db.execute(sql30`select 1`).then(() => "ok").catch(() => "down"),
        pingSetterQueue(),
        evolutionProvider.ping()
      ]);
      const vertex = env.GOOGLE_SERVICE_ACCOUNT_JSON ? "configured" : "not_configured";
      return ok({
        db: dbStatus,
        bullmq,
        vertex,
        evolution,
        time: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  );
}

// src/modules/setter/setter.schema.ts
import { z as z31 } from "zod";
var DraftStatusSchema = z31.enum(["pending", "approved", "edited", "rejected", "sent"]);
var ListDraftsQuerySchema = z31.object({
  status: DraftStatusSchema.default("pending")
});
var EditDraftSchema = z31.object({
  content: z31.string().min(1, "El contenido no puede estar vac\xEDo").max(4096)
});
var ModelProviderSchema = z31.object({
  modelProvider: z31.enum(["gemini", "claude"])
});
var AutopilotSchema = z31.object({
  enabled: z31.boolean()
});
var ListEventsQuerySchema = z31.object({
  limit: z31.coerce.number().int().min(1).max(500).default(150),
  since: z31.string().datetime().optional()
});

// src/modules/setter/setter.approval.service.ts
import { and as and33, asc as asc14, eq as eq40 } from "drizzle-orm";
var DRAFT_COLUMNS = {
  id: setterDraft.id,
  tenantId: setterDraft.tenantId,
  content: setterDraft.content,
  editedContent: setterDraft.editedContent,
  beat: setterDraft.beat,
  format: setterDraft.format,
  status: setterDraft.status,
  toolCalls: setterDraft.toolCalls,
  createdAt: setterDraft.createdAt,
  leadId: setterDraft.leadId,
  leadStatus: setterLead.status,
  qualification: setterLead.qualification,
  conversationId: setterDraft.conversationId,
  channel: setterConversation.channel,
  personName: setterPerson.name,
  personPhone: setterPerson.phone,
  crmContactId: setterPerson.crmContactId,
  crmDealId: setterLead.crmDealId
};
function baseQuery() {
  return db.select(DRAFT_COLUMNS).from(setterDraft).innerJoin(setterTenant, eq40(setterDraft.tenantId, setterTenant.id)).innerJoin(setterLead, eq40(setterDraft.leadId, setterLead.id)).innerJoin(setterConversation, eq40(setterDraft.conversationId, setterConversation.id)).innerJoin(setterPerson, eq40(setterLead.personId, setterPerson.id)).$dynamic();
}
async function listDrafts(portalId, status) {
  return baseQuery().where(and33(eq40(setterTenant.portalId, portalId), eq40(setterDraft.status, status))).orderBy(asc14(setterDraft.createdAt));
}
async function getDraftDetail(portalId, id) {
  const [draft] = await baseQuery().where(
    and33(eq40(setterTenant.portalId, portalId), eq40(setterDraft.id, id))
  );
  if (!draft) throw Errors.notFound("Draft no encontrado");
  const messages = await db.select({
    role: setterMessage.role,
    content: setterMessage.content,
    beat: setterMessage.beat,
    createdAt: setterMessage.createdAt
  }).from(setterMessage).where(eq40(setterMessage.conversationId, draft.conversationId)).orderBy(asc14(setterMessage.createdAt));
  return { ...draft, messages };
}
async function loadDraft(portalId, id) {
  const [draft] = await baseQuery().where(
    and33(eq40(setterTenant.portalId, portalId), eq40(setterDraft.id, id))
  );
  if (!draft) throw Errors.notFound("Draft no encontrado");
  return draft;
}
async function sendAndFinalize(draft, finalContent, userId, edited) {
  if (draft.status !== "pending") {
    throw Errors.conflict(`El draft ya est\xE1 en estado "${draft.status}"`);
  }
  if (!draft.personPhone) {
    throw Errors.badRequest("La persona no tiene tel\xE9fono \u2014 no se puede enviar");
  }
  const [msg] = await db.insert(setterMessage).values({
    conversationId: draft.conversationId,
    role: "assistant",
    content: finalContent,
    beat: draft.beat
  }).returning({ id: setterMessage.id });
  let sent = false;
  if (evolutionProvider.isConfigured()) {
    try {
      await evolutionProvider.sendSplitMessages(draft.personPhone, splitIntoBubbles(finalContent));
      sent = true;
    } catch {
      sent = false;
    }
  }
  const status = sent ? edited ? "edited" : "sent" : "approved";
  await db.update(setterDraft).set({
    status,
    editedContent: edited ? finalContent : null,
    sentMessageId: msg.id,
    approvedBy: userId
  }).where(eq40(setterDraft.id, draft.id));
  void logSetterEvent({
    tenantId: draft.tenantId,
    level: "success",
    type: "approval",
    message: sent ? `${edited ? "Editado y enviado" : "Aprobado y enviado"} a ${draft.personPhone ?? "lead"}` : `${edited ? "Editado" : "Aprobado"} (env\xEDo pendiente: Evolution sin credenciales)`,
    leadId: draft.leadId
  });
  return { id: draft.id, status, sent, messageId: msg.id };
}
async function approveDraft(portalId, userId, id) {
  const draft = await loadDraft(portalId, id);
  const result = await sendAndFinalize(draft, draft.content, userId, false);
  const who = await actorName(portalId, userId);
  await notifyAdmins(
    portalId,
    {
      entityType: "setter_draft",
      entityId: id,
      type: "setter_draft_approved",
      title: `${who} aprob\xF3 un mensaje del setter`,
      body: draft.personName ? `Para \xAB${draft.personName}\xBB` : null,
      actionUrl: "/admin/setter"
    },
    { exceptUserId: userId }
  );
  return result;
}
async function editAndSendDraft(portalId, userId, id, content) {
  const draft = await loadDraft(portalId, id);
  const result = await sendAndFinalize(draft, content, userId, true);
  const who = await actorName(portalId, userId);
  await notifyAdmins(
    portalId,
    {
      entityType: "setter_draft",
      entityId: id,
      type: "setter_draft_edited",
      title: `${who} edit\xF3 y envi\xF3 un mensaje del setter`,
      body: draft.personName ? `Para \xAB${draft.personName}\xBB` : null,
      actionUrl: "/admin/setter"
    },
    { exceptUserId: userId }
  );
  return result;
}
async function rejectDraft(portalId, userId, id) {
  const draft = await loadDraft(portalId, id);
  if (draft.status !== "pending") {
    throw Errors.conflict(`El draft ya est\xE1 en estado "${draft.status}"`);
  }
  await db.update(setterDraft).set({ status: "rejected" }).where(eq40(setterDraft.id, id));
  void logSetterEvent({
    tenantId: draft.tenantId,
    type: "approval",
    message: "Draft rechazado",
    leadId: draft.leadId
  });
  const who = await actorName(portalId, userId);
  await notifyAdmins(
    portalId,
    {
      entityType: "setter_draft",
      entityId: id,
      type: "setter_draft_rejected",
      title: `${who} rechaz\xF3 un mensaje del setter`,
      body: draft.personName ? `Para \xAB${draft.personName}\xBB` : null,
      actionUrl: "/admin/setter"
    },
    { exceptUserId: userId }
  );
  return { id, status: "rejected" };
}
async function regenerateDraft(portalId, id) {
  const draft = await loadDraft(portalId, id);
  await db.update(setterDraft).set({ status: "rejected" }).where(eq40(setterDraft.id, id));
  const result = await runAgentTurn(draft.leadId);
  if (!result.draftId) {
    throw Errors.conflict("No se gener\xF3 un nuevo draft (lead en opt-out o sin texto)");
  }
  return getDraftDetail(portalId, result.draftId);
}

// src/modules/setter/setter.config.service.ts
import { eq as eq41 } from "drizzle-orm";
var setterConfigCols = {
  id: setterTenant.id,
  portalId: setterTenant.portalId,
  modelProvider: setterTenant.modelProvider,
  operationMode: setterTenant.operationMode,
  agentName: setterTenant.agentName,
  ownerName: setterTenant.ownerName,
  timezone: setterTenant.timezone,
  prospectingServices: setterTenant.prospectingServices,
  prospectingNiches: setterTenant.prospectingNiches,
  prospectingCities: setterTenant.prospectingCities,
  prospectingAutopilot: setterTenant.prospectingAutopilot
};
async function loadTenant(portalId) {
  const [tenant] = await db.select(setterConfigCols).from(setterTenant).where(eq41(setterTenant.portalId, portalId)).limit(1);
  if (!tenant) throw Errors.notFound("No hay setter configurado para este portal");
  return tenant;
}
function toConfig(tenant) {
  return {
    modelProvider: tenant.modelProvider,
    operationMode: tenant.operationMode,
    agentName: tenant.agentName,
    ownerName: tenant.ownerName,
    timezone: tenant.timezone,
    providers: {
      gemini: Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON),
      claude: Boolean(env.ANTHROPIC_API_KEY)
    },
    prospectingServices: tenant.prospectingServices,
    prospectingNiches: tenant.prospectingNiches,
    prospectingCities: tenant.prospectingCities,
    prospectingAutopilot: tenant.prospectingAutopilot
  };
}
async function getSetterConfig(portalId) {
  return toConfig(await loadTenant(portalId));
}
async function setModelProvider(portalId, provider) {
  const tenant = await loadTenant(portalId);
  await db.update(setterTenant).set({ modelProvider: provider }).where(eq41(setterTenant.id, tenant.id));
  return getSetterConfig(portalId);
}
async function setProspectingAutopilot(portalId, enabled) {
  const tenant = await loadTenant(portalId);
  await db.update(setterTenant).set({ prospectingAutopilot: enabled }).where(eq41(setterTenant.id, tenant.id));
  return getSetterConfig(portalId);
}

// src/modules/setter/setter.approval.router.ts
var TAG29 = "Setter";
var security28 = ADMIN_SECURITY;
async function setterApprovalRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/config",
    {
      schema: {
        tags: [TAG29],
        summary: "Config del setter (Model Switcher, etc.)",
        security: security28
      }
    },
    async (request) => ok(await getSetterConfig(request.hubUser.portalId))
  );
  r.patch(
    "/config/model-provider",
    {
      schema: {
        tags: [TAG29],
        summary: "Cambiar el LLM que genera los mensajes (Gemini \u21C4 Claude)",
        security: security28,
        body: ModelProviderSchema
      },
      preHandler: [authorize("owner")]
    },
    async (request) => {
      const config = await setModelProvider(request.hubUser.portalId, request.body.modelProvider);
      return ok(config);
    }
  );
  r.patch(
    "/config/autopilot",
    {
      schema: {
        tags: [TAG29],
        summary: "Encender/apagar el autopilot de prospecci\xF3n",
        security: security28,
        body: AutopilotSchema
      },
      preHandler: [authorize("owner")]
    },
    async (request) => {
      const config = await setProspectingAutopilot(request.hubUser.portalId, request.body.enabled);
      return ok(config);
    }
  );
  r.get(
    "/events",
    {
      schema: {
        tags: [TAG29],
        summary: "Consola: log de actividad del setter",
        security: security28,
        querystring: ListEventsQuerySchema
      }
    },
    async (request) => {
      const { limit, since } = request.query;
      const events = await listSetterEvents(request.hubUser.portalId, {
        limit,
        since: since ? new Date(since) : void 0
      });
      return ok(events);
    }
  );
  r.get(
    "/drafts",
    {
      schema: {
        tags: [TAG29],
        summary: "Listar drafts de la cola de aprobaci\xF3n",
        description: "Drafts del setter por estado (default pending), con contexto del lead.",
        security: security28,
        querystring: ListDraftsQuerySchema
      }
    },
    async (request) => {
      const items = await listDrafts(request.hubUser.portalId, request.query.status);
      return ok(items);
    }
  );
  r.get(
    "/drafts/:id",
    {
      schema: {
        tags: [TAG29],
        summary: "Detalle de un draft + conversaci\xF3n",
        security: security28,
        params: IdParamSchema
      }
    },
    async (request) => {
      const detail = await getDraftDetail(request.hubUser.portalId, request.params.id);
      return ok(detail);
    }
  );
  r.post(
    "/drafts/:id/approve",
    {
      schema: {
        tags: [TAG29],
        summary: "Aprobar y enviar el draft",
        description: "Persiste el mensaje saliente y lo env\xEDa por WhatsApp (si Evolution est\xE1 configurado).",
        security: security28,
        params: IdParamSchema
      },
      preHandler: [authorize("owner")]
    },
    async (request) => {
      const result = await approveDraft(request.hubUser.portalId, request.hubUser.sub, request.params.id);
      return ok(result);
    }
  );
  r.post(
    "/drafts/:id/edit",
    {
      schema: {
        tags: [TAG29],
        summary: "Editar y enviar el draft",
        security: security28,
        params: IdParamSchema,
        body: EditDraftSchema
      },
      preHandler: [authorize("owner")]
    },
    async (request) => {
      const result = await editAndSendDraft(
        request.hubUser.portalId,
        request.hubUser.sub,
        request.params.id,
        request.body.content
      );
      return ok(result);
    }
  );
  r.post(
    "/drafts/:id/reject",
    {
      schema: {
        tags: [TAG29],
        summary: "Rechazar el draft",
        security: security28,
        params: IdParamSchema
      }
    },
    async (request) => {
      const result = await rejectDraft(request.hubUser.portalId, request.hubUser.sub, request.params.id);
      return ok(result);
    }
  );
  r.post(
    "/drafts/:id/regenerate",
    {
      schema: {
        tags: [TAG29],
        summary: "Regenerar el draft (re-corre el cerebro)",
        security: security28,
        params: IdParamSchema
      },
      preHandler: [authorize("owner")]
    },
    async (request) => {
      const detail = await regenerateDraft(request.hubUser.portalId, request.params.id);
      return ok(detail);
    }
  );
}

// src/modules/setter/setter.ws.ts
import { eq as eq42 } from "drizzle-orm";
async function setterWsRoutes(app2) {
  app2.get("/ws/setter/events", { websocket: true }, async (socket, request) => {
    const token = request.query.token;
    let user;
    try {
      if (!token) throw new Error("no token");
      const clerkUserId = await verifyClerkToken(token);
      user = await resolveHubUser(clerkUserId);
    } catch {
      socket.close(1008, "unauthorized");
      return;
    }
    const tenants = await db.select({ id: setterTenant.id }).from(setterTenant).where(eq42(setterTenant.portalId, user.portalId));
    const tenantIds = new Set(tenants.map((t) => t.id));
    const handler2 = (event) => {
      if (!tenantIds.has(event.tenantId)) return;
      try {
        socket.send(JSON.stringify(event));
      } catch {
      }
    };
    setterEventBus.on("event", handler2);
    socket.send(JSON.stringify({ type: "connected" }));
    socket.on("close", () => setterEventBus.off("event", handler2));
  });
}

// src/modules/setter/webhooks/whatsapp.webhook.ts
import { timingSafeEqual as timingSafeEqual2 } from "crypto";

// src/modules/setter/setter.service.ts
import { and as and34, eq as eq43 } from "drizzle-orm";
var SERVICE_WINDOW_MS = 24 * 60 * 60 * 1e3;
async function getSetterTenantId() {
  const [tenant] = await db.select({ id: setterTenant.id }).from(setterTenant).limit(1);
  return tenant?.id ?? null;
}
async function handleInboundMessage(input) {
  const tenantId = await getSetterTenantId();
  if (!tenantId) {
    throw new Error("No hay setter_tenant. Corr\xE9: pnpm --filter api db:seed:setter");
  }
  const optedOutByKeyword = evolutionProvider.detectOptOut(input.text);
  const result = await db.transaction(async (tx) => {
    await tx.insert(setterPerson).values({ tenantId, name: input.name ?? null, phone: input.from }).onConflictDoNothing({ target: [setterPerson.tenantId, setterPerson.phone] });
    const [person] = await tx.select().from(setterPerson).where(and34(eq43(setterPerson.tenantId, tenantId), eq43(setterPerson.phone, input.from))).limit(1);
    if (person.optedOut) {
      return { status: "skipped_opted_out" };
    }
    await tx.insert(setterConversation).values({ tenantId, personId: person.id, channel: input.channel ?? "whatsapp" }).onConflictDoNothing({ target: setterConversation.personId });
    const [conversation] = await tx.select().from(setterConversation).where(eq43(setterConversation.personId, person.id)).limit(1);
    let [lead] = await tx.select().from(setterLead).where(eq43(setterLead.personId, person.id)).limit(1);
    if (!lead) {
      ;
      [lead] = await tx.insert(setterLead).values({ tenantId, personId: person.id, status: "NEW", source: input.channel ?? "whatsapp" }).returning();
    }
    const inserted = await tx.insert(setterMessage).values({
      conversationId: conversation.id,
      role: "user",
      content: input.text,
      messageId: input.messageId
    }).onConflictDoNothing({ target: setterMessage.messageId }).returning({ id: setterMessage.id });
    if (inserted.length === 0) {
      return { status: "duplicate" };
    }
    await tx.update(setterLead).set({ windowExpiresAt: new Date(Date.now() + SERVICE_WINDOW_MS) }).where(eq43(setterLead.id, lead.id));
    if (optedOutByKeyword) {
      await tx.update(setterPerson).set({ optedOut: true, optedOutAt: /* @__PURE__ */ new Date() }).where(eq43(setterPerson.id, person.id));
      await tx.update(setterLead).set({ status: "OPTED_OUT" }).where(eq43(setterLead.id, lead.id));
      return { status: "opted_out", leadId: lead.id };
    }
    return { status: "processed", leadId: lead.id, conversationId: conversation.id };
  });
  if (result.status === "processed") {
    void logSetterEvent({
      tenantId,
      type: "inbound",
      message: `Entr\xF3 mensaje de ${input.from}`,
      leadId: result.leadId,
      meta: { messageId: input.messageId }
    });
  } else if (result.status === "opted_out") {
    void logSetterEvent({
      tenantId,
      level: "warn",
      type: "optout",
      message: `Opt-out de ${input.from} \u2014 no se le genera ni env\xEDa nada m\xE1s`,
      leadId: result.leadId
    });
  }
  if (result.status === "processed" && isRedisConfigured() && env.NODE_ENV !== "test") {
    await getSetterInboundQueue().add(
      "handle-message",
      { leadId: result.leadId, conversationId: result.conversationId, messageId: input.messageId },
      { jobId: input.messageId, removeOnComplete: true, removeOnFail: 100 }
    );
  }
  if (result.status === "opted_out" && env.NODE_ENV !== "test") {
    try {
      await syncLeadToCrm(result.leadId);
    } catch (err) {
      console.error("[setter] sync CRM opt-out fall\xF3:", err);
    }
  }
  return result;
}

// src/modules/setter/webhooks/whatsapp.webhook.ts
function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual2(ab, bb);
}
function extractText(message) {
  if (!message) return null;
  const conv = message["conversation"];
  if (typeof conv === "string" && conv.trim()) return conv;
  const ext = message["extendedTextMessage"];
  if (ext?.text && ext.text.trim()) return ext.text;
  const ephemeral = message["ephemeralMessage"];
  const ephText = ephemeral?.message?.extendedTextMessage?.text ?? ephemeral?.message?.conversation;
  if (typeof ephText === "string" && ephText.trim()) return ephText;
  return null;
}
function parseEvolutionInbound(body) {
  const key = body.data?.key;
  if (!key?.remoteJid || !key.id) return null;
  if (key.fromMe) return null;
  if (key.remoteJid.endsWith("@g.us")) return null;
  const text30 = extractText(body.data?.message);
  if (!text30) return null;
  const digits = key.remoteJid.split("@")[0]?.replace(/\D/g, "");
  if (!digits) return null;
  return {
    from: `+${digits}`,
    name: body.data?.pushName ?? null,
    messageId: key.id,
    text: text30,
    channel: "whatsapp"
  };
}
async function setterWhatsappWebhookRoutes(app2) {
  app2.post(
    "/whatsapp",
    {
      schema: {
        tags: ["Setter"],
        summary: "Webhook de WhatsApp (Evolution)",
        description: "Recibe eventos de Evolution API. Responde 200 siempre y procesa de forma as\xEDncrona (dedup por message_id, ventana de 24h, opt-out, encola el turno del agente)."
      }
    },
    async (request, reply) => {
      const secret = env.EVOLUTION_WEBHOOK_SECRET;
      if (secret) {
        const headers = request.headers;
        const provided = request.query?.token ?? headers["apikey"] ?? headers["x-webhook-secret"];
        if (!provided || !safeEqual(provided, secret)) {
          return reply.code(401).send();
        }
      }
      reply.code(200).send({ ok: true });
      const inbound = parseEvolutionInbound(request.body);
      if (!inbound) return;
      handleInboundMessage(inbound).then((outcome) => {
        request.log.info(
          { personPhone: inbound.from, messageId: inbound.messageId, outcome: outcome.status },
          "[setter] mensaje entrante procesado"
        );
      }).catch((err) => {
        request.log.error(
          { err, messageId: inbound.messageId },
          "[setter] error procesando mensaje entrante"
        );
      });
    }
  );
}

// src/modules/prospecting/prospecting.schema.ts
import { z as z32 } from "zod";
var RunSearchSchema = z32.object({
  query: z32.string().min(3, "La b\xFAsqueda debe tener al menos 3 caracteres").max(200),
  limit: z32.coerce.number().int().min(1).max(20).default(5),
  ourServices: z32.string().max(500).optional()
});
var ListSearchesQuerySchema = z32.object({
  limit: z32.coerce.number().int().min(1).max(100).default(20),
  cursor: z32.string().optional()
});
var SuggestServicesSchema = z32.object({
  hint: z32.string().max(500).optional().default("")
});
var ListProspectsQuerySchema = z32.object({
  searchId: z32.string().min(1).optional(),
  status: z32.enum(["new", "imported", "discarded"]).optional()
});

// src/modules/prospecting/prospecting.service.ts
import { and as and35, desc as desc20, eq as eq44, inArray as inArray15 } from "drizzle-orm";

// src/modules/prospecting/places.client.ts
import axios2 from "axios";
var PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
var FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.types"
].join(",");
function isPlacesConfigured() {
  return Boolean(env.GOOGLE_MAPS_API_KEY);
}
async function searchBusinesses(query, limit) {
  if (!env.GOOGLE_MAPS_API_KEY) {
    throw Errors.badRequest("GOOGLE_MAPS_API_KEY no est\xE1 configurada en la API");
  }
  const maxResultCount = Math.min(Math.max(limit, 1), 20);
  try {
    const { data } = await axios2.post(
      PLACES_TEXT_SEARCH_URL,
      { textQuery: query, maxResultCount, languageCode: "es" },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY,
          "X-Goog-FieldMask": FIELD_MASK
        },
        timeout: 15e3
      }
    );
    const places = data.places ?? [];
    return places.slice(0, maxResultCount).map((p) => ({
      googlePlaceId: p.id ?? "",
      name: p.displayName?.text ?? "Sin nombre",
      address: p.formattedAddress ?? null,
      phone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? null,
      website: p.websiteUri ?? null,
      rating: typeof p.rating === "number" ? p.rating : null,
      userRatingsTotal: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
      types: Array.isArray(p.types) ? p.types : []
    }));
  } catch (err) {
    if (axios2.isAxiosError(err)) {
      const status = err.response?.status;
      const apiMsg = err.response?.data?.error?.message ?? err.message;
      if (status === 403 || status === 401) {
        throw Errors.badRequest(`Google Places rechaz\xF3 la key (${status}): ${apiMsg}`);
      }
      throw new AppError("PLACES_ERROR", `Error consultando Google Places: ${apiMsg}`, 502);
    }
    throw err;
  }
}

// src/modules/prospecting/email-scraper.ts
import axios3 from "axios";
var EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
var JUNK_PATTERNS = [
  /\.(png|jpe?g|gif|svg|webp|css|js)$/i,
  /@(2x|3x)\b/i,
  /(example|sentry|wixpress|godaddy|sentry\.io|domain)\./i,
  /^[0-9a-f]{16,}@/i
  // hashes
];
function isPlausible(email) {
  if (email.length > 60) return false;
  return !JUNK_PATTERNS.some((re) => re.test(email));
}
async function scrapeEmail(website) {
  try {
    const url = website.startsWith("http") ? website : `https://${website}`;
    const { data } = await axios3.get(url, {
      timeout: 8e3,
      maxContentLength: 2e6,
      responseType: "text",
      // Algunos sitios bloquean clients sin UA "de navegador".
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NOUSCRM/1.0; +https://nous.dev) prospecting-bot",
        Accept: "text/html"
      },
      // No queremos que un redirect a un esquema raro rompa todo.
      maxRedirects: 3
    });
    if (typeof data !== "string") return null;
    const matches = data.match(EMAIL_REGEX);
    if (!matches) return null;
    const candidate = matches.map((m) => m.toLowerCase()).find(isPlausible);
    return candidate ?? null;
  } catch {
    return null;
  }
}

// src/modules/prospecting/vertex.client.ts
import { GoogleGenAI as GoogleGenAI2, Type as Type2 } from "@google/genai";
var client3 = null;
function isVertexConfigured() {
  return Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON);
}
function getClient3() {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) return null;
  if (client3) return client3;
  let credentials;
  try {
    credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON no es un JSON v\xE1lido");
  }
  if (!credentials.project_id) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON no contiene project_id");
  }
  client3 = new GoogleGenAI2({
    vertexai: true,
    project: credentials.project_id,
    location: env.VERTEX_LOCATION,
    googleAuthOptions: { credentials }
  });
  return client3;
}
var RESPONSE_SCHEMA = {
  type: Type2.OBJECT,
  properties: {
    analysis: { type: Type2.STRING },
    opportunityScore: { type: Type2.INTEGER },
    proposalType: { type: Type2.STRING, enum: ["automation", "web_app", "both"] },
    painPoints: { type: Type2.ARRAY, items: { type: Type2.STRING } },
    solution: { type: Type2.STRING },
    mvpScope: { type: Type2.ARRAY, items: { type: Type2.STRING } },
    estimatedValueUsd: { type: Type2.INTEGER },
    sequence: {
      type: Type2.OBJECT,
      properties: {
        opener: { type: Type2.STRING },
        problemQuestions: { type: Type2.ARRAY, items: { type: Type2.STRING } },
        bookingMessage: { type: Type2.STRING },
        confirmationMessage: { type: Type2.STRING }
      },
      required: ["opener", "problemQuestions", "bookingMessage", "confirmationMessage"]
    },
    objections: {
      type: Type2.ARRAY,
      items: {
        type: Type2.OBJECT,
        properties: {
          objection: { type: Type2.STRING },
          response: { type: Type2.STRING }
        },
        required: ["objection", "response"]
      }
    }
  },
  required: [
    "analysis",
    "opportunityScore",
    "proposalType",
    "painPoints",
    "solution",
    "mvpScope",
    "estimatedValueUsd",
    "sequence",
    "objections"
  ]
};
var SYSTEM_INSTRUCTION = `Sos un consultor senior de una agencia de desarrollo web y automatizaci\xF3n Y un appointment setter experto que prospecta a negocios argentinos.
Tu trabajo es analizar un negocio y armar la secuencia de mensajes para iniciar una conversaci\xF3n que termine en una llamada agendada.

PRINCIPIOS DE SETTING (obligatorios, son la base de todo):
1. OPENER GENUINO: el primer mensaje arranca con algo espec\xEDfico y verdadero de ESE negocio (rubro, ubicaci\xF3n, reputaci\xF3n, que no tiene web). PROHIBIDO el halago gen\xE9rico tipo "felicitaciones por tu perfil".
2. RAZ\xD3N PARA RESPONDER: dale a la persona un motivo real para contestar. Lo m\xE1s natural es una pregunta genuina y relevante a su rubro (algo que de verdad querr\xEDas saber de su negocio), no "para conocerte mejor". Si encaja sin forzar, pod\xE9s mencionar algo \xFAtil que le podr\xEDas pasar, dicho casual, NUNCA como oferta de marketing. Si no encaja natural, no lo metas: la pregunta sola alcanza.
3. PRIMERO EL PROBLEMA, DESPU\xC9S EL LINK: el opener NO vende la soluci\xF3n ni pide la reuni\xF3n. Primero se saca a la luz el problema con preguntas; reci\xE9n despu\xE9s se invita a agendar.
4. NUNCA MOSTRAR NECESIDAD: no persigas ni sobreexpliques. Siempre dej\xE1 claro POR QU\xC9 pregunt\xE1s o propon\xE9s algo, desde el lugar de querer ayudar, no de querer venderle.
5. LENGUAJE SIMPLE Y CONCRETO (clave en Argentina): habl\xE1 derecho, sin inflar. Nada de "transformar tu negocio", "programa", "soluci\xF3n integral" ni promesas grandilocuentes: eso genera desconfianza, no deseo. En vez de "agilizar la recepci\xF3n de facturas" dec\xED "que no tengas que andar persiguiendo a los clientes por los comprobantes". Si una frase suena m\xE1s grande de lo que es, achicala.
6. OBJECIONES: valid\xE1 en una frase corta (sin frases hechas) y segu\xED con UNA pregunta o un reencuadre que abra la conversaci\xF3n, no con un argumento de venta ni con presi\xF3n. Si la persona dice que no en serio, se la deja ir sin insistir.
7. La invitaci\xF3n a agendar se enmarca en EL PROBLEMA y EL OBJETIVO puntual de la persona, y da la raz\xF3n concreta por la que vale la pena esa charla.

SON\xC1 HUMANO (lo m\xE1s importante de todo): los mensajes los lee una persona real. NO pueden parecer escritos por una IA ni por una plantilla. Si suenan a folleto o a vendedor, fallaste.
- Escrib\xED como le escribir\xEDas a un conocido por WhatsApp: frases CORTAS, directas, naturales. Nada de p\xE1rrafos largos ni perfectos.
- CERCANO PERO CON RESPETO, NO ZALAMERO: la calidez se gana, no se finge en el primer mensaje. Nada de apodos ("crack", "campe\xF3n", "genio") ni efusividad fingida. Un "Hola [Nombre], \xBFc\xF3mo va?" funciona mejor que cualquier apodo o emoji.
- PROHIBIDAS las muletillas de IA/vendedor: "Entiendo,", "Comprendo que", "L\xF3gico,", "Excelente,", "Por supuesto", "Es importante destacar", "En este sentido", "Espero que est\xE9s muy bien".
- PROHIBIDO el vocabulario corporativo/buzzword: "cuello de botella", "agilizar", "optimizar", "carga operativa", "soluci\xF3n integral", "plan de acci\xF3n", "diagn\xF3stico gratuito", "impecable", "potenciar", "maximizar", "de forma definitiva", "sinergia", "implementar una soluci\xF3n", "transformar tu negocio", "programa" (como eufemismo de servicio), "sesi\xF3n" (como eufemismo de llamada).
- Us\xE1 palabras simples y cotidianas.
- Natural NO es matero: no sobrecargues de lunfardo ("chusmear", "una charlita", "los re bancan"). Profesional relajado, no amigo del barrio.
- Est\xE1 bien transparentar que es prospecci\xF3n ("te escribo porque laburamos con [rubro] y se me ocurri\xF3 que..."). No disimules que es un mensaje de laburo.
- Est\xE1 bien sonar un poco informal e imperfecto. Mejor que suene a persona apurada que a copy de agencia.
- Menos es m\xE1s: no metas todos los beneficios en el primer mensaje. Si dud\xE1s, cort\xE1 la frase.
- No uses guiones largos (\u2014). Us\xE1 puntos o par\xE9ntesis. Nada de vi\xF1etas dentro de los mensajes.
- M\xE1ximo un emoji por mensaje, y solo si suma. Cero urgencia falsa ("\xFAltimos cupos", "solo por hoy").
- Vari\xE1 los arranques: NO empieces siempre con "Hola, estuve viendo...". Si todos arrancan igual, suena a plantilla.

Reglas de estilo: espa\xF1ol rioplatense (vos, ten\xE9s, quer\xE9s), sin erratas, sin jerga t\xE9cnica, sin promesas exageradas.`;
function buildPrompt(input) {
  const services = input.ourServices?.trim() ? input.ourServices.trim() : "desarrollo de web apps a medida y automatizaciones (chatbots, integraciones, dashboards, flujos internos)";
  return `Analiz\xE1 este negocio y arm\xE1 su secuencia de setting.

NEGOCIO:
- Nombre: ${input.name}
- Rubro/categor\xEDas: ${input.types.join(", ") || "desconocido"}
- Web: ${input.website ?? "no tiene sitio web detectado"}
- Rating Google: ${input.rating ?? "sin datos"}
- Direcci\xF3n: ${input.address ?? "sin datos"}

LO QUE OFRECEMOS NOSOTROS:
${services}

DEVOLV\xC9 (an\xE1lisis interno, NO se env\xEDa a nadie):
1. analysis: 2-3 frases sobre el negocio y por qu\xE9 podr\xEDa (o no) necesitarnos.
2. opportunityScore: del 1 al 10, qu\xE9 tan buena oportunidad es.
3. proposalType: "automation", "web_app" o "both".
4. painPoints: 2-4 problemas que probablemente tenga (hip\xF3tesis a confirmar en la charla).
5. solution: qu\xE9 le proponemos, 1-2 frases.
6. mvpScope: 3-5 features m\xEDnimas del MVP, acotado y entregable r\xE1pido.
7. estimatedValueUsd: precio estimado del MVP en USD (entero realista).

Y LA SECUENCIA DE SETTING (esto S\xCD se env\xEDa, aplic\xE1 los principios):
8. sequence.opener: PRIMER mensaje, CORTO (2-3 frases m\xE1ximo, como un WhatsApp real). Gancho genuino y espec\xEDfico de ESTE negocio + una pregunta real y relevante a su rubro que invite a contestar. PROHIBIDO: pitchear la soluci\xF3n, pedir la reuni\xF3n, halago gen\xE9rico, prometer cosas grandes, o sonar a plantilla.
9. sequence.problemQuestions: EXACTAMENTE 3 preguntas para sacar el problema a la luz, adaptadas a este negocio. Pensadas para enviarse de a una (conversacional, no interrogatorio). Estilo: "\xBFc\xF3mo te est\xE1 pegando [X]?", "\xBFa qu\xE9 te refer\xEDs cuando dec\xEDs [Y]?", "\xBFte acord\xE1s de alguna situaci\xF3n de la \xFAltima semana donde esto te complic\xF3?".
10. sequence.bookingMessage: la invitaci\xF3n a agendar, enmarcada en SU problema y SU objetivo, dando la raz\xF3n. Estilo: "Por lo que me cont\xE1s de [problema], creo que te puedo mostrar c\xF3mo lo resolver\xEDamos en tu caso. \xBFTe parece si lo charlamos 15 min con [nuestro especialista] y te tiramos un par de ideas concretas para [objetivo]?". Que suene a propuesta tranquila, no a cierre de venta.
11. sequence.confirmationMessage: mensaje breve para confirmar la asistencia. Ped\xEDs confirmaci\xF3n de forma natural, sin sonar desesperado pero tampoco arrogante. Dale una salida f\xE1cil por si tiene que reprogramar.
12. objections: 3-5 objeciones probables de ESTE negocio (ej: dinero, "lo tengo que consultar", "ya prob\xE9 algo similar", "lo tengo que pensar", "no tengo tiempo"). Para cada una, en "response" pon\xE9: una validaci\xF3n corta (sin frase hecha) + LA PREGUNTA o el reencuadre que abre la conversaci\xF3n. Nada de presi\xF3n ni de insistir.`;
}
async function suggestServices(hint) {
  const ai = getClient3();
  if (!ai) return null;
  const notes = hint.trim() ? `Basate en estas notas del usuario: "${hint.trim()}".` : "Asum\xED servicios t\xEDpicos de una agencia chica: web apps a medida, automatizaciones con IA, chatbots, integraciones y dashboards.";
  const prompt = `Sos parte de una agencia de desarrollo web y automatizaci\xF3n.
Escrib\xED en 1 o 2 frases, en espa\xF1ol rioplatense simple y concreto (sin jerga ni palabras infladas), qu\xE9 ofrece la agencia. Sirve como contexto para una IA que prospecta clientes.
${notes}
Devolv\xE9 SOLO el texto, sin comillas, sin encabezados, sin vi\xF1etas.`;
  const res = await ai.models.generateContent({
    model: env.VERTEX_MODEL,
    contents: prompt,
    config: { temperature: 0.7 }
  });
  return res.text?.trim() ?? null;
}
async function analyzeBusiness(input) {
  const ai = getClient3();
  if (!ai) return null;
  const res = await ai.models.generateContent({
    model: env.VERTEX_MODEL,
    contents: buildPrompt(input),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      // Bajado de 0.95: a 0.95 hay más deriva y se incumplen reglas de estilo.
      // 0.85 mantiene variedad en los arranques sin desmadrarse.
      temperature: 0.85
    }
  });
  const text30 = res.text;
  if (!text30) return null;
  try {
    return JSON.parse(text30);
  } catch {
    return null;
  }
}

// src/modules/prospecting/prospecting.service.ts
function toProspectDTO(row) {
  return {
    id: row.id,
    searchId: row.searchId,
    name: row.name,
    address: row.address,
    phone: row.phone,
    website: row.website,
    email: row.email,
    rating: row.rating != null ? Number(row.rating) : null,
    userRatingsTotal: row.userRatingsTotal,
    types: row.types ?? [],
    aiAnalysis: row.aiAnalysis,
    aiProposal: row.aiProposal ?? null,
    status: row.status,
    importedContactId: row.importedContactId,
    createdAt: row.createdAt.toISOString()
  };
}
function toSearchDTO(row) {
  return {
    id: row.id,
    query: row.query,
    ourServices: row.ourServices,
    requestedLimit: row.requestedLimit,
    resultCount: row.resultCount,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt.toISOString()
  };
}
function getProspectingCapabilities() {
  return { places: isPlacesConfigured(), ai: isVertexConfigured() };
}
async function suggestProspectingServices(hint) {
  if (!isVertexConfigured()) {
    throw new AppError("AI_NOT_CONFIGURED", "La sugerencia con IA requiere Vertex configurado.", 503);
  }
  const text30 = await suggestServices(hint);
  if (!text30) throw Errors.internal("La IA no devolvi\xF3 una sugerencia");
  return text30;
}
async function runProspectSearch(portalId, userId, input) {
  if (!isPlacesConfigured()) {
    throw new AppError(
      "PLACES_NOT_CONFIGURED",
      "La prospecci\xF3n requiere GOOGLE_MAPS_API_KEY configurada en la API.",
      503
    );
  }
  const [search] = await db.insert(prospectSearch).values({
    portalId,
    query: input.query,
    ourServices: input.ourServices ?? null,
    requestedLimit: input.limit,
    status: "running",
    createdBy: userId
  }).returning();
  if (!search) throw Errors.internal("No se pudo crear la b\xFAsqueda");
  try {
    const places = await searchBusinesses(input.query, input.limit);
    const placeIds = places.map((p) => p.googlePlaceId).filter((id) => Boolean(id));
    const alreadySeen = placeIds.length ? await db.select({ googlePlaceId: prospect.googlePlaceId }).from(prospect).where(and35(eq44(prospect.portalId, portalId), inArray15(prospect.googlePlaceId, placeIds))) : [];
    const seen = new Set(alreadySeen.map((r) => r.googlePlaceId));
    const batchSeen = /* @__PURE__ */ new Set();
    const fresh = places.filter((p) => {
      if (!p.googlePlaceId) return true;
      if (seen.has(p.googlePlaceId) || batchSeen.has(p.googlePlaceId)) return false;
      batchSeen.add(p.googlePlaceId);
      return true;
    });
    const enriched = await Promise.all(
      fresh.map(async (place) => {
        const [email, ai] = await Promise.all([
          place.website ? scrapeEmail(place.website) : Promise.resolve(null),
          analyzeBusiness({
            name: place.name,
            types: place.types,
            website: place.website,
            rating: place.rating,
            address: place.address,
            ourServices: input.ourServices ?? null
          }).catch(() => null)
        ]);
        return { place, email, ai };
      })
    );
    let prospects = [];
    if (enriched.length > 0) {
      const rows = await db.insert(prospect).values(
        enriched.map(({ place, email, ai }) => ({
          portalId,
          searchId: search.id,
          name: place.name,
          address: place.address,
          phone: place.phone,
          website: place.website,
          email,
          rating: place.rating != null ? String(place.rating) : null,
          userRatingsTotal: place.userRatingsTotal,
          googlePlaceId: place.googlePlaceId || null,
          types: place.types,
          aiAnalysis: ai?.analysis ?? null,
          aiProposal: ai ? ai : null
        }))
      ).returning();
      prospects = rows.map(toProspectDTO);
    }
    const [updated] = await db.update(prospectSearch).set({ status: "completed", resultCount: prospects.length }).where(eq44(prospectSearch.id, search.id)).returning();
    return { search: toSearchDTO(updated ?? search), prospects };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    await db.update(prospectSearch).set({ status: "failed", error: message }).where(eq44(prospectSearch.id, search.id));
    if (err instanceof AppError) throw err;
    throw new AppError("PROSPECTING_FAILED", `La prospecci\xF3n fall\xF3: ${message}`, 502);
  }
}
async function listSearches(portalId, query) {
  const cursor = decodeCursor(query.cursor);
  const rows = await db.select().from(prospectSearch).where(
    and35(
      eq44(prospectSearch.portalId, portalId),
      cursor ? cursorWhere(prospectSearch.createdAt, prospectSearch.id, cursor) : void 0
    )
  ).orderBy(desc20(prospectSearch.createdAt), desc20(prospectSearch.id)).limit(query.limit + 1);
  const page = paginateRows(rows, query.limit);
  return { items: page.items.map(toSearchDTO), nextCursor: page.nextCursor };
}
async function getSearchWithProspects(portalId, searchId) {
  const [row] = await db.select().from(prospectSearch).where(and35(eq44(prospectSearch.id, searchId), eq44(prospectSearch.portalId, portalId))).limit(1);
  if (!row) throw Errors.notFound("B\xFAsqueda no encontrada");
  const prospects = await db.select().from(prospect).where(and35(eq44(prospect.searchId, searchId), eq44(prospect.portalId, portalId))).orderBy(desc20(prospect.createdAt));
  return { search: toSearchDTO(row), prospects: prospects.map(toProspectDTO) };
}
async function listProspects(portalId, query) {
  const conditions = [eq44(prospect.portalId, portalId)];
  if (query.searchId) conditions.push(eq44(prospect.searchId, query.searchId));
  if (query.status) conditions.push(eq44(prospect.status, query.status));
  const rows = await db.select().from(prospect).where(and35(...conditions)).orderBy(desc20(prospect.createdAt)).limit(500);
  return rows.map(toProspectDTO);
}
async function findProspect(portalId, id) {
  const [row] = await db.select().from(prospect).where(and35(eq44(prospect.id, id), eq44(prospect.portalId, portalId))).limit(1);
  if (!row) throw Errors.notFound("Prospecto no encontrado");
  return row;
}
async function importProspect(portalId, userId, id) {
  const row = await findProspect(portalId, id);
  if (row.status === "imported" && row.importedContactId) {
    throw Errors.conflict("Este prospecto ya fue importado al CRM");
  }
  const result = await db.transaction(async (tx) => {
    const [newCompany] = await tx.insert(company).values({
      portalId,
      ownerId: userId,
      name: row.name,
      website: row.website,
      phone: row.phone,
      custom: { source: "prospecting", prospectId: row.id }
    }).returning({ id: company.id });
    if (!newCompany) throw Errors.internal("No se pudo crear la empresa");
    let newContact;
    try {
      ;
      [newContact] = await tx.insert(contact).values({
        portalId,
        ownerId: userId,
        companyId: newCompany.id,
        firstName: row.name,
        email: row.email,
        phone: row.phone,
        lifecycleStage: "lead",
        custom: { source: "prospecting", prospectId: row.id }
      }).returning({ id: contact.id });
    } catch {
      throw Errors.conflict("Ya existe un contacto con ese email en el CRM");
    }
    if (!newContact) throw Errors.internal("No se pudo crear el contacto");
    await tx.update(prospect).set({ status: "imported", importedContactId: newContact.id }).where(eq44(prospect.id, row.id));
    return { contactId: newContact.id, companyId: newCompany.id };
  });
  const who = await actorName(portalId, userId);
  await notifyAdmins(
    portalId,
    {
      entityType: "contact",
      entityId: result.contactId,
      type: "prospect_converted",
      title: `${who} convirti\xF3 \xAB${row.name}\xBB en lead`,
      actionUrl: `/admin/leads/${result.contactId}`
    },
    { exceptUserId: userId }
  );
  return result;
}
async function discardProspect(portalId, id) {
  await findProspect(portalId, id);
  const [updated] = await db.update(prospect).set({ status: "discarded" }).where(and35(eq44(prospect.id, id), eq44(prospect.portalId, portalId))).returning();
  if (!updated) throw Errors.internal("No se pudo descartar el prospecto");
  return toProspectDTO(updated);
}

// src/modules/prospecting/prospecting.router.ts
var TAG30 = "Prospecci\xF3n";
var security29 = ADMIN_SECURITY;
async function prospectingRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/capabilities",
    {
      schema: {
        tags: [TAG30],
        summary: "Estado de configuraci\xF3n (Places / IA)",
        description: "Indica si Google Places y Vertex AI est\xE1n configurados en la API.",
        security: security29
      }
    },
    async () => ok(getProspectingCapabilities())
  );
  r.post(
    "/suggest-services",
    {
      schema: {
        tags: [TAG30],
        summary: "Sugerir descripci\xF3n de servicios de la agencia",
        description: 'Redacta con IA el perfil de "qu\xE9 ofrecemos" a partir de notas opcionales.',
        security: security29,
        body: SuggestServicesSchema
      },
      preHandler: [authorize("owner", "member")]
    },
    async (request) => {
      const services = await suggestProspectingServices(request.body.hint);
      return ok({ services });
    }
  );
  r.post(
    "/search",
    {
      schema: {
        tags: [TAG30],
        summary: "Buscar y analizar prospectos",
        description: "Busca negocios en Google Places, extrae emails y genera una propuesta con IA. No env\xEDa nada.",
        security: security29,
        body: RunSearchSchema
      },
      preHandler: [authorize("owner", "member")]
    },
    async (request, reply) => {
      const result = await runProspectSearch(
        request.hubUser.portalId,
        request.hubUser.sub,
        request.body
      );
      return reply.status(201).send(ok(result));
    }
  );
  r.get(
    "/searches",
    {
      schema: {
        tags: [TAG30],
        summary: "Listar b\xFAsquedas de prospecci\xF3n",
        security: security29,
        querystring: ListSearchesQuerySchema
      }
    },
    async (request) => {
      const { items, nextCursor } = await listSearches(request.hubUser.portalId, request.query);
      return ok(items, { nextCursor });
    }
  );
  r.get(
    "/searches/:id",
    {
      schema: {
        tags: [TAG30],
        summary: "Detalle de una b\xFAsqueda + sus prospectos",
        security: security29,
        params: IdParamSchema
      }
    },
    async (request) => {
      const result = await getSearchWithProspects(request.hubUser.portalId, request.params.id);
      return ok(result);
    }
  );
  r.get(
    "/prospects",
    {
      schema: {
        tags: [TAG30],
        summary: "Listar prospectos",
        description: "Filtrable por b\xFAsqueda (searchId) y estado (new/imported/discarded).",
        security: security29,
        querystring: ListProspectsQuerySchema
      }
    },
    async (request) => {
      const items = await listProspects(request.hubUser.portalId, request.query);
      return ok(items);
    }
  );
  r.post(
    "/prospects/:id/import",
    {
      schema: {
        tags: [TAG30],
        summary: "Importar prospecto al CRM como Lead",
        description: "Crea una empresa + un contacto (lead) y marca el prospecto como importado.",
        security: security29,
        params: IdParamSchema
      },
      preHandler: [authorize("owner", "member")]
    },
    async (request, reply) => {
      const result = await importProspect(
        request.hubUser.portalId,
        request.hubUser.sub,
        request.params.id
      );
      return reply.status(201).send(ok(result));
    }
  );
  r.post(
    "/prospects/:id/discard",
    {
      schema: {
        tags: [TAG30],
        summary: "Descartar prospecto",
        security: security29,
        params: IdParamSchema
      },
      preHandler: [authorize("owner", "member")]
    },
    async (request) => {
      const result = await discardProspect(request.hubUser.portalId, request.params.id);
      return ok(result);
    }
  );
}

// src/modules/proposals/proposals.schema.ts
import { z as z33 } from "zod";
var ProposalScopeItemSchema = z33.object({
  title: z33.string().max(160),
  description: z33.string().max(1e3)
});
var ProposalPhaseSchema = z33.object({
  phase: z33.string().max(160),
  duration: z33.string().max(80),
  detail: z33.string().max(1e3)
});
var ProposalPricingItemSchema = z33.object({
  label: z33.string().max(200),
  amount: z33.number().nonnegative()
});
var ProposalPricingSchema = z33.object({
  items: z33.array(ProposalPricingItemSchema).max(30),
  total: z33.number().nonnegative(),
  currency: z33.string().min(1).max(3),
  note: z33.string().max(400).optional()
});
var ProposalContentSchema = z33.object({
  title: z33.string().max(200),
  clientName: z33.string().max(160),
  companyName: z33.string().max(160).optional(),
  logoUrl: z33.string().max(500).optional(),
  tagline: z33.string().max(200).optional(),
  summary: z33.string().max(2e3),
  understanding: z33.string().max(2e3),
  objectives: z33.array(z33.string().max(400)).max(12),
  solution: z33.string().max(3e3),
  scope: z33.array(ProposalScopeItemSchema).max(20),
  timeline: z33.array(ProposalPhaseSchema).max(12),
  pricing: ProposalPricingSchema,
  whyUs: z33.array(z33.string().max(400)).max(10),
  nextSteps: z33.string().max(2e3),
  terms: z33.string().max(3e3).optional()
});
var GenerateProposalSchema = z33.object({
  dealId: z33.string().min(1, "dealId requerido").max(60)
});
var UpdateProposalSchema = z33.object({
  title: z33.string().min(1).max(200).optional(),
  content: ProposalContentSchema.optional()
});
var ProposalTokenParamSchema = z33.object({
  token: z33.string().min(1).max(60)
});

// src/modules/proposals/proposals.service.ts
import { and as and36, desc as desc21, eq as eq45 } from "drizzle-orm";

// src/modules/proposals/proposals.ai.ts
var PROJECT_TYPE_LABEL = {
  webapp: "Web App / Plataforma a medida",
  crm: "CRM / Sistema de gesti\xF3n a medida",
  automatizacion: "Automatizaci\xF3n / Integraciones",
  portal: "Portal de clientes",
  otro: "Proyecto de software a medida"
};
var GOAL_LABEL = {
  operacion: "ordenar y automatizar la operaci\xF3n",
  escalar: "escalar el negocio",
  reemplazar: "reemplazar planillas/herramientas actuales",
  lanzar: "lanzar un producto"
};
var BUDGET_RANGE = {
  "<2000": "menos de USD 2.000",
  "2000-5000": "USD 2.000 a 5.000",
  "5000-10000": "USD 5.000 a 10.000",
  "10000+": "m\xE1s de USD 10.000"
};
var PRIORITY_LABEL = {
  precio: "el precio",
  velocidad: "la velocidad de entrega",
  calidad: "la calidad",
  escalabilidad: "la escalabilidad"
};
var SYSTEM_INSTRUCTION2 = `Sos el redactor comercial de NOUS, una agencia rioplatense de desarrollo de software a medida (web apps, CRMs, automatizaciones, portales). Escrib\xEDs propuestas claras, concretas y profesionales, en espa\xF1ol rioplatense (voseo), sin relleno ni buzzwords vac\xEDos. Habl\xE1s de valor de negocio, no de tecnolog\xEDa por la tecnolog\xEDa. Sos honesto y espec\xEDfico: nada de promesas gen\xE9ricas.

Devolv\xE9s SIEMPRE y \xDANICAMENTE un objeto JSON v\xE1lido (sin markdown, sin texto fuera del JSON) con esta forma exacta:
{
  "title": string,            // ej: "Propuesta \u2014 CRM a medida para Acme"
  "clientName": string,
  "companyName": string,      // "" si no hay
  "tagline": string,          // una l\xEDnea de gancho
  "summary": string,          // 1 p\xE1rrafo, resumen ejecutivo
  "understanding": string,    // qu\xE9 entendimos de su situaci\xF3n (2-4 frases)
  "objectives": string[],     // 3-5 objetivos del proyecto
  "solution": string,         // qu\xE9 vamos a construir (1-2 p\xE1rrafos)
  "scope": [{ "title": string, "description": string }],   // 4-6 entregables
  "timeline": [{ "phase": string, "duration": string, "detail": string }], // 3-5 fases
  "pricing": {
    "items": [{ "label": string, "amount": number }],      // desglose
    "total": number,          // total en USD, DENTRO del rango de presupuesto del cliente
    "currency": "USD",
    "note": string            // condiciones de pago, ej "50% al inicio, 50% a la entrega"
  },
  "whyUs": string[],          // 3-4 diferenciales de NOUS
  "nextSteps": string,        // cierre / pr\xF3ximos pasos
  "terms": string             // t\xE9rminos breves (validez, revisiones, etc.)
}`;
function buildPrompt2(input) {
  const lines = [];
  lines.push(`Cliente: ${input.contactName}${input.companyName ? ` (${input.companyName})` : ""}`);
  if (input.projectType) lines.push(`Tipo de proyecto: ${PROJECT_TYPE_LABEL[input.projectType] ?? input.projectType}`);
  if (input.mainGoal) lines.push(`Objetivo principal: ${GOAL_LABEL[input.mainGoal] ?? input.mainGoal}`);
  if (input.currentSolution) lines.push(`C\xF3mo lo resuelve hoy: ${input.currentSolution}`);
  if (input.currentCrm) lines.push(`Herramientas/CRM actual: ${input.currentCrm}`);
  if (input.toAutomate) lines.push(`Qu\xE9 quiere automatizar: ${input.toAutomate}`);
  if (input.priority) lines.push(`Lo que m\xE1s le importa: ${PRIORITY_LABEL[input.priority] ?? input.priority}`);
  if (input.budget) lines.push(`Presupuesto: ${BUDGET_RANGE[input.budget] ?? input.budget}`);
  if (input.startWhen) lines.push(`Cu\xE1ndo quiere empezar: ${input.startWhen}`);
  if (input.deadline) lines.push(`Fecha l\xEDmite: ${input.deadline}`);
  if (input.clarity) lines.push(`Nivel de claridad del cliente: ${input.clarity}`);
  return `Gener\xE1 una propuesta comercial para este lead. El total de la inversi\xF3n DEBE caer dentro de su rango de presupuesto. S\xE9 espec\xEDfico para SU caso (no gen\xE9rico).

DATOS DEL LEAD:
${lines.join("\n")}`;
}
function safeJsonParse(text30) {
  let t = text30.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(t);
  } catch {
    const first = t.indexOf("{");
    const last = t.lastIndexOf("}");
    if (first !== -1 && last !== -1 && last > first) {
      return JSON.parse(t.slice(first, last + 1));
    }
    throw new Error("La IA no devolvi\xF3 un JSON v\xE1lido");
  }
}
async function generateProposalContent(input, provider = "gemini") {
  const generate = getProvider(provider);
  const result = await generate({
    systemInstruction: SYSTEM_INSTRUCTION2,
    contents: [{ role: "user", parts: [{ text: buildPrompt2(input) }] }],
    temperature: 0.8,
    maxOutputTokens: 8192
  });
  const parsed2 = safeJsonParse(result.text);
  return {
    title: parsed2.title ?? `Propuesta para ${input.contactName}`,
    clientName: parsed2.clientName ?? input.contactName,
    companyName: parsed2.companyName || input.companyName,
    tagline: parsed2.tagline,
    summary: parsed2.summary ?? "",
    understanding: parsed2.understanding ?? "",
    objectives: parsed2.objectives ?? [],
    solution: parsed2.solution ?? "",
    scope: parsed2.scope ?? [],
    timeline: parsed2.timeline ?? [],
    pricing: {
      items: parsed2.pricing?.items ?? [],
      total: parsed2.pricing?.total ?? 0,
      currency: parsed2.pricing?.currency ?? "USD",
      note: parsed2.pricing?.note
    },
    whyUs: parsed2.whyUs ?? [],
    nextSteps: parsed2.nextSteps ?? "",
    terms: parsed2.terms
  };
}
function fallbackProposalContent(input) {
  const projectLabel = input.projectType ? PROJECT_TYPE_LABEL[input.projectType] ?? "Proyecto a medida" : "Proyecto a medida";
  return {
    title: `Propuesta \u2014 ${projectLabel}${input.companyName ? ` para ${input.companyName}` : ""}`,
    clientName: input.contactName,
    companyName: input.companyName,
    tagline: "Software a medida para tu negocio",
    summary: "Complet\xE1 este resumen con el enfoque propuesto para el cliente.",
    understanding: input.currentSolution ?? "",
    objectives: [],
    solution: "",
    scope: [],
    timeline: [],
    pricing: { items: [], total: 0, currency: "USD" },
    whyUs: [
      "Equipo chico y senior: habl\xE1s directo con quien construye.",
      "Software a medida, sin plantillas ni ataduras."
    ],
    nextSteps: "Coordinemos una llamada para repasar la propuesta y arrancar."
  };
}

// src/modules/proposals/proposals.pdf.ts
import PDFDocument from "pdfkit";
var INK = "#111111";
var MUTED = "#666666";
var HAIR = "#dddddd";
function formatMoney(amount, currency) {
  try {
    return new Intl.NumberFormat("es", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("es")}`;
  }
}
function buildProposalPdf(content) {
  const doc = new PDFDocument({ size: "A4", margin: 56 });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const eyebrow = (t) => {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED).text(t.toUpperCase(), left, doc.y, {
      characterSpacing: 1.5
    });
    doc.moveDown(0.3);
  };
  const heading = (t) => {
    if (doc.y > doc.page.height - 160) doc.addPage();
    doc.moveDown(1);
    doc.font("Helvetica-Bold").fontSize(16).fillColor(INK).text(t, left, doc.y);
    doc.moveDown(0.5);
  };
  const paragraph = (t) => {
    doc.font("Helvetica").fontSize(11).fillColor(INK).text(t, { width, lineGap: 3 });
  };
  const bullets = (items) => {
    doc.font("Helvetica").fontSize(11).fillColor(INK);
    for (const it of items) {
      doc.text(`\u2022  ${it}`, { width, lineGap: 2, indent: 2 });
      doc.moveDown(0.35);
    }
  };
  doc.font("Helvetica-Bold").fontSize(10).fillColor(MUTED).text("NOUS", { characterSpacing: 2 });
  doc.moveDown(2);
  doc.font("Helvetica-Bold").fontSize(28).fillColor(INK).text(content.title, { width });
  if (content.tagline) {
    doc.moveDown(0.6);
    doc.font("Helvetica").fontSize(13).fillColor(MUTED).text(content.tagline, { width });
  }
  doc.moveDown(1.2);
  doc.font("Helvetica").fontSize(11).fillColor(MUTED).text(`Preparada para ${content.companyName || content.clientName}`, { width });
  doc.moveDown(1);
  doc.strokeColor(HAIR).lineWidth(1).moveTo(left, doc.y).lineTo(left + width, doc.y).stroke();
  if (content.summary) {
    heading("Resumen");
    paragraph(content.summary);
  }
  if (content.understanding) {
    heading("Lo que entendimos");
    paragraph(content.understanding);
  }
  if (content.objectives.length) {
    heading("Objetivos");
    bullets(content.objectives);
  }
  if (content.solution) {
    heading("La soluci\xF3n");
    paragraph(content.solution);
  }
  if (content.scope.length) {
    heading("Alcance");
    for (const s of content.scope) {
      doc.font("Helvetica-Bold").fontSize(11.5).fillColor(INK).text(s.title, { width });
      doc.font("Helvetica").fontSize(10.5).fillColor(MUTED).text(s.description, { width, lineGap: 2 });
      doc.moveDown(0.5);
    }
  }
  if (content.timeline.length) {
    heading("Plan de trabajo");
    for (const t of content.timeline) {
      doc.font("Helvetica-Bold").fontSize(11.5).fillColor(INK).text(`${t.phase}  `, { continued: true }).font("Helvetica").fontSize(9.5).fillColor(MUTED).text(t.duration.toUpperCase());
      doc.font("Helvetica").fontSize(10.5).fillColor(MUTED).text(t.detail, { width, lineGap: 2 });
      doc.moveDown(0.5);
    }
  }
  heading("Inversi\xF3n");
  for (const it of content.pricing.items) {
    const y = doc.y;
    doc.font("Helvetica").fontSize(11).fillColor(INK).text(it.label, left, y, { width: width - 120 });
    doc.font("Helvetica").fontSize(11).fillColor(INK).text(formatMoney(it.amount, content.pricing.currency), left + width - 120, y, {
      width: 120,
      align: "right"
    });
    doc.moveDown(0.4);
  }
  doc.moveDown(0.2);
  doc.strokeColor(HAIR).lineWidth(1).moveTo(left, doc.y).lineTo(left + width, doc.y).stroke();
  doc.moveDown(0.4);
  const ty = doc.y;
  doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text("Total", left, ty, { width: width - 160 });
  doc.font("Helvetica-Bold").fontSize(15).fillColor(INK).text(formatMoney(content.pricing.total, content.pricing.currency), left + width - 160, ty, {
    width: 160,
    align: "right"
  });
  if (content.pricing.note) {
    doc.moveDown(0.6);
    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED).text(content.pricing.note, { width });
  }
  if (content.whyUs.length) {
    heading("Por qu\xE9 NOUS");
    bullets(content.whyUs);
  }
  if (content.nextSteps) {
    heading("Pr\xF3ximos pasos");
    paragraph(content.nextSteps);
  }
  if (content.terms) {
    heading("T\xE9rminos");
    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED).text(content.terms, { width, lineGap: 2 });
  }
  doc.end();
  return done;
}

// src/modules/proposals/proposals.service.ts
function money(total, currency) {
  if (!total) return "";
  return `${currency} ${Math.round(total).toLocaleString("es")}`;
}
function str(v) {
  return typeof v === "string" && v.trim() ? v : void 0;
}
function publicUrl(token) {
  const base = env.ADMIN_URL ?? "http://localhost:3000";
  return `${base}/p/${token}`;
}
async function getModelProvider(portalId) {
  const [t] = await db.select({ p: setterTenant.modelProvider }).from(setterTenant).where(eq45(setterTenant.portalId, portalId)).limit(1);
  return t?.p === "claude" ? "claude" : "gemini";
}
function toDTO2(row) {
  return {
    id: row.id,
    token: row.token,
    title: row.title,
    status: row.status,
    content: row.content,
    model: row.model,
    amount: row.amount,
    currency: row.currency,
    dealId: row.dealId,
    contactId: row.contactId,
    publicUrl: publicUrl(row.token),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    viewedAt: row.viewedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
async function generateProposal(portalId, dealId, actorId) {
  const [d] = await db.select({
    id: deal.id,
    primaryContactId: deal.primaryContactId,
    companyId: deal.companyId
  }).from(deal).where(and36(eq45(deal.id, dealId), eq45(deal.portalId, portalId), eq45(deal.archived, false))).limit(1);
  if (!d) throw Errors.notFound("Deal no encontrado");
  let contactName = "Cliente";
  if (d.primaryContactId) {
    const [c] = await db.select({ firstName: contact.firstName, lastName: contact.lastName }).from(contact).where(eq45(contact.id, d.primaryContactId)).limit(1);
    if (c) contactName = [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || contactName;
  }
  let companyName;
  if (d.companyId) {
    const [co] = await db.select({ name: company.name }).from(company).where(eq45(company.id, d.companyId)).limit(1);
    companyName = co?.name;
  }
  const [sub] = await db.select({ id: onboardingSubmission.id, answers: onboardingSubmission.answers }).from(onboardingSubmission).where(and36(eq45(onboardingSubmission.portalId, portalId), eq45(onboardingSubmission.dealId, dealId))).orderBy(desc21(onboardingSubmission.createdAt)).limit(1);
  const a = sub?.answers ?? {};
  const input = {
    contactName,
    companyName,
    projectType: str(a.projectType),
    mainGoal: str(a.mainGoal),
    currentSolution: str(a.currentSolution),
    clarity: str(a.clarity),
    budget: str(a.budget),
    startWhen: str(a.startWhen),
    deadline: str(a.deadline),
    currentCrm: str(a.currentCrm),
    toAutomate: str(a.toAutomate),
    priority: str(a.priority)
  };
  const provider = await getModelProvider(portalId);
  let content;
  let model;
  try {
    content = await generateProposalContent(input, provider);
    model = provider;
  } catch {
    content = fallbackProposalContent(input);
    model = "manual";
  }
  const [row] = await db.insert(proposal).values({
    portalId,
    dealId,
    contactId: d.primaryContactId ?? null,
    onboardingSubmissionId: sub?.id ?? null,
    title: content.title,
    status: "draft",
    content,
    model,
    amount: content.pricing.total ? String(content.pricing.total) : null,
    currency: content.pricing.currency || "USD"
  }).returning();
  if (!row) throw Errors.internal("No se pudo crear la propuesta");
  const who = await actorName(portalId, actorId);
  const amount = money(content.pricing.total, content.pricing.currency);
  await notifyAdmins(
    portalId,
    {
      entityType: "proposal",
      entityId: row.id,
      type: "proposal_generated",
      title: `${who} gener\xF3 una propuesta para \xAB${content.companyName || content.clientName}\xBB`,
      body: amount ? `Valor estimado: ${amount}` : null,
      actionUrl: `/admin/proposals/${row.id}`
    },
    { exceptUserId: actorId }
  );
  return toDTO2(row);
}
async function listProposals(portalId) {
  const rows = await db.select().from(proposal).where(eq45(proposal.portalId, portalId)).orderBy(desc21(proposal.createdAt)).limit(500);
  return rows.map(toDTO2);
}
async function getProposal(portalId, id) {
  const [row] = await db.select().from(proposal).where(and36(eq45(proposal.id, id), eq45(proposal.portalId, portalId))).limit(1);
  if (!row) throw Errors.notFound("Propuesta no encontrada");
  return toDTO2(row);
}
async function updateProposal(portalId, id, input) {
  const patch = {};
  if (input.title !== void 0) patch.title = input.title;
  if (input.content !== void 0) {
    patch.content = input.content;
    patch.amount = input.content.pricing.total ? String(input.content.pricing.total) : null;
    patch.currency = input.content.pricing.currency || "USD";
  }
  if (Object.keys(patch).length === 0) return getProposal(portalId, id);
  const [row] = await db.update(proposal).set(patch).where(and36(eq45(proposal.id, id), eq45(proposal.portalId, portalId))).returning();
  if (!row) throw Errors.notFound("Propuesta no encontrada");
  return toDTO2(row);
}
async function acceptProposal(portalId, id, actorId) {
  const [row] = await db.update(proposal).set({ status: "accepted", acceptedAt: /* @__PURE__ */ new Date() }).where(and36(eq45(proposal.id, id), eq45(proposal.portalId, portalId))).returning();
  if (!row) throw Errors.notFound("Propuesta no encontrada");
  const who = await actorName(portalId, actorId);
  await notifyAdmins(
    portalId,
    {
      entityType: "proposal",
      entityId: row.id,
      type: "proposal_accepted",
      title: `${who} aprob\xF3 la propuesta \xAB${row.title}\xBB`,
      body: "Lista para enviar al cliente.",
      actionUrl: `/admin/proposals/${row.id}`
    },
    { exceptUserId: actorId }
  );
  return toDTO2(row);
}
async function markProposalSent(portalId, id) {
  const [row] = await db.select().from(proposal).where(and36(eq45(proposal.id, id), eq45(proposal.portalId, portalId))).limit(1);
  if (!row) throw Errors.notFound("Propuesta no encontrada");
  if (!row.sentAt) {
    const [updated] = await db.update(proposal).set({ sentAt: /* @__PURE__ */ new Date(), status: row.status === "accepted" ? "sent" : row.status }).where(and36(eq45(proposal.id, id), eq45(proposal.portalId, portalId))).returning();
    if (updated) return toDTO2(updated);
  }
  return toDTO2(row);
}
async function markProposalCompleted(token) {
  const [row] = await db.select({ id: proposal.id, status: proposal.status, completedAt: proposal.completedAt }).from(proposal).where(eq45(proposal.token, token)).limit(1);
  if (!row || row.status === "draft") return;
  if (!row.completedAt) {
    await db.update(proposal).set({ completedAt: /* @__PURE__ */ new Date() }).where(eq45(proposal.id, row.id));
  }
}
async function getPublicProposal(token) {
  const [row] = await db.select().from(proposal).where(eq45(proposal.token, token)).limit(1);
  if (!row || row.status === "draft") throw Errors.notFound("Propuesta no encontrada");
  if (!row.viewedAt) {
    await db.update(proposal).set({ viewedAt: /* @__PURE__ */ new Date(), status: row.status === "accepted" || row.status === "sent" ? "viewed" : row.status }).where(eq45(proposal.id, row.id));
    const cliente = row.content.companyName || row.content.clientName;
    await notifyAdmins(row.portalId, {
      entityType: "proposal",
      entityId: row.id,
      type: "proposal_viewed",
      title: `\u{1F389} \xAB${cliente}\xBB abri\xF3 tu propuesta`,
      body: "Buen momento para hacer seguimiento.",
      actionUrl: `/admin/proposals/${row.id}`
    });
  }
  return {
    title: row.title,
    status: row.status,
    content: row.content,
    updatedAt: row.updatedAt.toISOString()
  };
}
function slugify3(s) {
  return s.normalize("NFD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "propuesta";
}
async function getPublicProposalPdf(token) {
  const [row] = await db.select().from(proposal).where(eq45(proposal.token, token)).limit(1);
  if (!row || row.status === "draft") throw Errors.notFound("Propuesta no encontrada");
  const buffer = await buildProposalPdf(row.content);
  return { filename: `${slugify3(row.title)}.pdf`, buffer };
}

// src/modules/proposals/proposals.router.ts
var TAG31 = "Proposals";
async function proposalPublicRoutes(app2) {
  const r = app2.withTypeProvider();
  r.get(
    "/:token",
    {
      schema: {
        tags: [TAG31],
        summary: "Ver una propuesta por su token (p\xFAblico)",
        params: ProposalTokenParamSchema
      }
    },
    async (request) => ok(await getPublicProposal(request.params.token))
  );
  r.get(
    "/:token/pdf",
    {
      schema: {
        tags: [TAG31],
        summary: "Descargar el PDF de una propuesta (p\xFAblico)",
        params: ProposalTokenParamSchema
      }
    },
    async (request, reply) => {
      const { filename, buffer } = await getPublicProposalPdf(request.params.token);
      return reply.header("Content-Type", "application/pdf").header("Content-Disposition", `attachment; filename="${filename}"`).send(buffer);
    }
  );
  r.post(
    "/:token/completed",
    {
      schema: {
        tags: [TAG31],
        summary: "Marcar que el cliente termin\xF3 la presentaci\xF3n (p\xFAblico)",
        params: ProposalTokenParamSchema
      }
    },
    async (request) => {
      await markProposalCompleted(request.params.token);
      return ok({ ok: true });
    }
  );
}
async function proposalAdminRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.post(
    "/generate",
    {
      schema: {
        tags: [TAG31],
        summary: "Generar una propuesta con IA desde un deal",
        security: ADMIN_SECURITY,
        body: GenerateProposalSchema
      },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request, reply) => {
      const result = await generateProposal(
        request.hubUser.portalId,
        request.body.dealId,
        request.hubUser.sub
      );
      return reply.status(201).send(ok(result));
    }
  );
  r.get(
    "/",
    { schema: { tags: [TAG31], summary: "Listar propuestas", security: ADMIN_SECURITY } },
    async (request) => ok(await listProposals(request.hubUser.portalId))
  );
  r.get(
    "/:id",
    { schema: { tags: [TAG31], summary: "Detalle de una propuesta", security: ADMIN_SECURITY, params: IdParamSchema } },
    async (request) => ok(await getProposal(request.hubUser.portalId, request.params.id))
  );
  r.patch(
    "/:id",
    {
      schema: {
        tags: [TAG31],
        summary: "Editar una propuesta",
        security: ADMIN_SECURITY,
        params: IdParamSchema,
        body: UpdateProposalSchema
      }
    },
    async (request) => ok(await updateProposal(request.hubUser.portalId, request.params.id, request.body))
  );
  r.post(
    "/:id/accept",
    {
      schema: {
        tags: [TAG31],
        summary: "Aprobar una propuesta",
        security: ADMIN_SECURITY,
        params: IdParamSchema
      },
      preHandler: [authorize("owner")]
    },
    async (request) => ok(await acceptProposal(request.hubUser.portalId, request.params.id, request.hubUser.sub))
  );
  r.post(
    "/:id/sent",
    {
      schema: {
        tags: [TAG31],
        summary: "Marcar una propuesta como enviada",
        security: ADMIN_SECURITY,
        params: IdParamSchema
      },
      preHandler: [authorize("owner", "member", "collaborator")]
    },
    async (request) => ok(await markProposalSent(request.hubUser.portalId, request.params.id))
  );
}

// src/modules/branding/branding.schema.ts
import { z as z34 } from "zod";
var SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
var HEX_RE = /^#[0-9a-fA-F]{6}$/;
var UpdateBrandingSchema = z34.object({
  brandSlug: z34.string().regex(SLUG_RE, "Slug inv\xE1lido (solo min\xFAsculas, n\xFAmeros y guiones)").max(40).nullable().optional(),
  brandName: z34.string().max(60).nullable().optional(),
  brandLogoKey: z34.string().max(200).nullable().optional(),
  brandPrimary: z34.string().regex(HEX_RE, "Color hex inv\xE1lido (#RRGGBB)").nullable().optional(),
  brandSecondary: z34.string().regex(HEX_RE, "Color hex inv\xE1lido (#RRGGBB)").nullable().optional()
});
var ClientUpdateBrandingSchema = z34.object({
  brandName: z34.string().max(60).nullable().optional(),
  brandLogoKey: z34.string().max(200).nullable().optional(),
  brandPrimary: z34.string().regex(HEX_RE, "Color hex inv\xE1lido (#RRGGBB)").nullable().optional(),
  brandSecondary: z34.string().regex(HEX_RE, "Color hex inv\xE1lido (#RRGGBB)").nullable().optional()
});
var SlugParamSchema = z34.object({
  slug: z34.string().min(1).max(40)
});

// src/modules/branding/branding.service.ts
import { and as and37, asc as asc15, eq as eq46 } from "drizzle-orm";
function logoUrl(key) {
  return key ? `${env.PUBLIC_API_URL}/api/files/${key}` : null;
}
var brandingCols = {
  id: clientAccount.id,
  email: clientAccount.email,
  brandSlug: clientAccount.brandSlug,
  brandName: clientAccount.brandName,
  brandLogoKey: clientAccount.brandLogoKey,
  brandPrimary: clientAccount.brandPrimary,
  brandSecondary: clientAccount.brandSecondary
};
async function getBrandingBySlug(slug) {
  const [row] = await db.select({
    brandName: clientAccount.brandName,
    brandLogoKey: clientAccount.brandLogoKey,
    brandPrimary: clientAccount.brandPrimary,
    brandSecondary: clientAccount.brandSecondary
  }).from(clientAccount).where(eq46(clientAccount.brandSlug, slug)).limit(1);
  if (!row) return null;
  return {
    brandName: row.brandName,
    logoUrl: logoUrl(row.brandLogoKey),
    primaryColor: row.brandPrimary,
    secondaryColor: row.brandSecondary
  };
}
async function listClientBranding(portalId) {
  const rows = await db.select(brandingCols).from(clientAccount).where(eq46(clientAccount.portalId, portalId)).orderBy(asc15(clientAccount.email));
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    brandSlug: r.brandSlug,
    brandName: r.brandName,
    brandLogoKey: r.brandLogoKey,
    logoUrl: logoUrl(r.brandLogoKey),
    brandPrimary: r.brandPrimary,
    brandSecondary: r.brandSecondary
  }));
}
async function updateClientBranding(portalId, accountId, input) {
  const [exists] = await db.select({ id: clientAccount.id }).from(clientAccount).where(and37(eq46(clientAccount.id, accountId), eq46(clientAccount.portalId, portalId))).limit(1);
  if (!exists) throw Errors.notFound("Cuenta de cliente no encontrada");
  let row;
  try {
    ;
    [row] = await db.update(clientAccount).set({
      brandSlug: input.brandSlug ?? null,
      brandName: input.brandName ?? null,
      brandLogoKey: input.brandLogoKey ?? null,
      brandPrimary: input.brandPrimary ?? null,
      brandSecondary: input.brandSecondary ?? null
    }).where(eq46(clientAccount.id, accountId)).returning(brandingCols);
  } catch {
    throw new AppError("SLUG_TAKEN", "Ese slug ya est\xE1 en uso por otro cliente", 409);
  }
  if (!row) throw Errors.internal("No se pudo actualizar el branding");
  return {
    id: row.id,
    email: row.email,
    brandSlug: row.brandSlug,
    brandName: row.brandName,
    brandLogoKey: row.brandLogoKey,
    logoUrl: logoUrl(row.brandLogoKey),
    brandPrimary: row.brandPrimary,
    brandSecondary: row.brandSecondary
  };
}
async function getOwnBranding(clientId) {
  const [row] = await db.select(brandingCols).from(clientAccount).where(eq46(clientAccount.id, clientId)).limit(1);
  if (!row) throw Errors.notFound("Cuenta no encontrada");
  return {
    id: row.id,
    email: row.email,
    brandSlug: row.brandSlug,
    brandName: row.brandName,
    brandLogoKey: row.brandLogoKey,
    logoUrl: logoUrl(row.brandLogoKey),
    brandPrimary: row.brandPrimary,
    brandSecondary: row.brandSecondary
  };
}
async function updateOwnBranding(clientId, input) {
  const [row] = await db.update(clientAccount).set({
    brandName: input.brandName ?? null,
    brandLogoKey: input.brandLogoKey ?? null,
    brandPrimary: input.brandPrimary ?? null,
    brandSecondary: input.brandSecondary ?? null
  }).where(eq46(clientAccount.id, clientId)).returning(brandingCols);
  if (!row) throw Errors.notFound("Cuenta no encontrada");
  return {
    id: row.id,
    email: row.email,
    brandSlug: row.brandSlug,
    brandName: row.brandName,
    brandLogoKey: row.brandLogoKey,
    logoUrl: logoUrl(row.brandLogoKey),
    brandPrimary: row.brandPrimary,
    brandSecondary: row.brandSecondary
  };
}

// src/modules/branding/branding.router.ts
var TAG32 = "White-Label";
async function brandingPublicRoutes(app2) {
  const r = app2.withTypeProvider();
  r.get(
    "/:slug",
    {
      schema: {
        tags: [TAG32],
        summary: "Branding por slug (p\xFAblico)",
        description: "Devuelve nombre, logo y colores de la marca asociada al slug. Para tematizar el portal antes de autenticar.",
        params: SlugParamSchema
      }
    },
    async (request) => ok(await getBrandingBySlug(request.params.slug))
  );
}
async function brandingAdminRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/clients",
    { schema: { tags: [TAG32], summary: "Listar branding por cliente", security: ADMIN_SECURITY } },
    async (request) => ok(await listClientBranding(request.hubUser.portalId))
  );
  r.patch(
    "/clients/:id",
    {
      schema: {
        tags: [TAG32],
        summary: "Actualizar branding de un cliente",
        security: ADMIN_SECURITY,
        params: IdParamSchema,
        body: UpdateBrandingSchema
      }
    },
    async (request) => ok(await updateClientBranding(request.hubUser.portalId, request.params.id, request.body))
  );
}
async function brandingClientRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticateClient);
  r.get(
    "/",
    { schema: { tags: ["Client Portal"], summary: "Mi marca", security: [{ bearerAuth: [] }] } },
    async (request) => ok(await getOwnBranding(request.clientAccount.sub))
  );
  r.patch(
    "/",
    {
      schema: {
        tags: ["Client Portal"],
        summary: "Guardar mi marca (logo, nombre, colores)",
        security: [{ bearerAuth: [] }],
        body: ClientUpdateBrandingSchema
      }
    },
    async (request) => ok(await updateOwnBranding(request.clientAccount.sub, request.body))
  );
}

// src/modules/onboarding/onboarding.service.ts
import { and as and38, desc as desc22, eq as eq47, inArray as inArray16, isNull as isNull4, sql as sql31 } from "drizzle-orm";

// src/modules/onboarding/onboarding.schema.ts
import { z as z35 } from "zod";
var ONBOARDING_STATUS = {
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed"
};
var OnboardingProgressSchema = z35.object({
  step: z35.number().int().min(1, "Paso inv\xE1lido").max(4, "Paso inv\xE1lido")
});
var OnboardingSignatureSchema = z35.object({
  fullName: z35.string({ required_error: "El nombre completo es requerido." }).min(3, "El nombre completo es requerido.").max(200, "Nombre demasiado largo."),
  accepted: z35.literal(true, { errorMap: () => ({ message: "Deb\xE9s aceptar los t\xE9rminos para firmar." }) })
});
var DELIVERY_CHANNELS = [
  "whatsapp",
  "notion",
  "drive",
  "skool",
  "circle",
  "hotmart",
  "kajabi",
  "otro"
];
var stripControl = (s) => s.split("").filter((c) => {
  const code = c.charCodeAt(0);
  return code > 31 && code !== 127;
}).join("");
var freeText = (max) => z35.string({ required_error: "Requerido" }).max(max, `M\xE1ximo ${max} caracteres.`).transform((s) => stripControl(s).trim()).pipe(z35.string().min(1, "Requerido"));
var freeTextOptional = (max) => z35.string().max(max, `M\xE1ximo ${max} caracteres.`).transform((s) => stripControl(s).trim()).optional();
var OnboardingBriefSchema = z35.object({
  businessProgram: freeText(2e3),
  // q1
  activeClients: freeText(500),
  // q2
  deliveryChannels: z35.array(z35.enum(DELIVERY_CHANNELS)).min(1, "Eleg\xED al menos un canal"),
  // q3
  deliveryChannelsOther: freeTextOptional(200),
  worstChannel: freeText(2e3),
  // q4
  weeklyTimeDrain: freeText(2e3),
  // q5
  sixMonthConcern: freeText(2e3),
  // q6
  idealDayToDay: freeText(2e3),
  // q7
  desiredStudentFeeling: freeText(2e3),
  // q8
  referenceApps: freeText(2e3),
  // q9
  teamRoles: freeText(2e3),
  // q10
  brandIdentity: freeText(500),
  // q11
  requiredIntegrations: freeText(2e3),
  // q12
  existingClientBase: freeText(2e3),
  // q13
  howFoundUs: freeText(2e3),
  // q14
  decisionTrigger: freeText(2e3),
  // q15
  doubtsBeforeBuying: freeText(2e3)
  // q16
});
var MaterialItemSchema = z35.object({
  done: z35.boolean(),
  assetIds: z35.array(z35.string().min(1)).max(50, "M\xE1ximo 50 archivos por categor\xEDa.").optional(),
  note: z35.string().max(500).optional()
});
var ONBOARDING_MATERIAL_CATEGORIES = [
  "logoBrand",
  "programContent",
  "clientBase",
  "toolAccess"
];
var OnboardingMaterialsSchema = z35.object({
  materials: z35.object({
    logoBrand: MaterialItemSchema,
    programContent: MaterialItemSchema,
    clientBase: MaterialItemSchema,
    toolAccess: MaterialItemSchema
  })
});
var OnboardingMaterialUploadQuerySchema = z35.object({
  category: z35.enum(ONBOARDING_MATERIAL_CATEGORIES, {
    errorMap: () => ({ message: "Categor\xEDa de material inv\xE1lida" })
  })
});

// src/modules/onboarding/onboarding.service.ts
var CATEGORY_TO_ASSET_TYPE = {
  logoBrand: "logo",
  programContent: "documento",
  clientBase: "documento",
  toolAccess: "acceso"
};
async function resolveActiveDeal(clientId) {
  const [row] = await db.select({ id: deal.id, portalId: deal.portalId }).from(clientDealAccess).innerJoin(deal, eq47(deal.id, clientDealAccess.dealId)).where(and38(eq47(clientDealAccess.clientId, clientId), eq47(deal.archived, false))).orderBy(desc22(deal.createdAt)).limit(1);
  if (!row) throw Errors.notFound("No hay un proyecto activo asociado a esta cuenta");
  return row;
}
async function getOrCreateOnboarding(dbOrTx, portalId, dealId, clientId) {
  const [existing] = await dbOrTx.select().from(clientOnboarding).where(eq47(clientOnboarding.dealId, dealId)).limit(1);
  if (existing) return existing;
  const [created] = await dbOrTx.insert(clientOnboarding).values({ portalId, dealId, clientId }).onConflictDoNothing({ target: clientOnboarding.dealId }).returning();
  if (created) return created;
  const [row] = await dbOrTx.select().from(clientOnboarding).where(eq47(clientOnboarding.dealId, dealId)).limit(1);
  if (!row) throw Errors.internal("No se pudo crear el onboarding");
  return row;
}
function assertNotCompleted(row) {
  if (row.status === ONBOARDING_STATUS.COMPLETED) throw Errors.conflict("El onboarding ya est\xE1 completo");
}
async function getOnboardingState(clientId) {
  const activeDeal = await resolveActiveDeal(clientId);
  const [onboarding, assets] = await Promise.all([
    getOrCreateOnboarding(db, activeDeal.portalId, activeDeal.id, clientId),
    db.select().from(clientAsset).where(and38(eq47(clientAsset.dealId, activeDeal.id), isNull4(clientAsset.intakeId))).orderBy(desc22(clientAsset.uploadedAt))
  ]);
  return { onboarding, assets };
}
async function markStepProgress(clientId, step) {
  const activeDeal = await resolveActiveDeal(clientId);
  const row = await getOrCreateOnboarding(db, activeDeal.portalId, activeDeal.id, clientId);
  assertNotCompleted(row);
  const stepsCompleted = { ...row.stepsCompleted, [String(step)]: (/* @__PURE__ */ new Date()).toISOString() };
  const [updated] = await db.update(clientOnboarding).set({
    stepsCompleted,
    currentStep: Math.max(row.currentStep, Math.min(step + 1, 8)),
    updatedAt: /* @__PURE__ */ new Date()
  }).where(eq47(clientOnboarding.id, row.id)).returning();
  if (!updated) throw Errors.internal("No se pudo actualizar el progreso");
  return updated;
}
async function submitSignature(clientId, fullName, ip) {
  const activeDeal = await resolveActiveDeal(clientId);
  const row = await getOrCreateOnboarding(db, activeDeal.portalId, activeDeal.id, clientId);
  assertNotCompleted(row);
  if (row.signatureAcceptedAt) throw Errors.conflict("El onboarding ya fue firmado");
  const stepsCompleted = { ...row.stepsCompleted, "5": (/* @__PURE__ */ new Date()).toISOString() };
  const [updated] = await db.update(clientOnboarding).set({
    signatureName: fullName,
    signatureAcceptedAt: /* @__PURE__ */ new Date(),
    signatureIp: ip,
    stepsCompleted,
    currentStep: Math.max(row.currentStep, 6),
    updatedAt: /* @__PURE__ */ new Date()
  }).where(eq47(clientOnboarding.id, row.id)).returning();
  if (!updated) throw Errors.internal("No se pudo guardar la firma");
  return updated;
}
async function submitBrief(clientId, answers) {
  const activeDeal = await resolveActiveDeal(clientId);
  const row = await getOrCreateOnboarding(db, activeDeal.portalId, activeDeal.id, clientId);
  assertNotCompleted(row);
  const stepsCompleted = { ...row.stepsCompleted, "6": (/* @__PURE__ */ new Date()).toISOString() };
  const [updated] = await db.update(clientOnboarding).set({
    briefAnswers: answers,
    stepsCompleted,
    currentStep: Math.max(row.currentStep, 7),
    updatedAt: /* @__PURE__ */ new Date()
  }).where(eq47(clientOnboarding.id, row.id)).returning();
  if (!updated) throw Errors.internal("No se pudo guardar el brief");
  return updated;
}
async function uploadMaterialAsset(clientId, category, saved) {
  const activeDeal = await resolveActiveDeal(clientId);
  const [row] = await db.insert(clientAsset).values({
    portalId: activeDeal.portalId,
    dealId: activeDeal.id,
    clientId,
    intakeId: null,
    fieldName: category,
    name: saved.name,
    type: CATEGORY_TO_ASSET_TYPE[category],
    mimeType: saved.mimeType,
    storageKey: saved.storageKey,
    sizeBytes: saved.sizeBytes
  }).returning();
  if (!row) throw Errors.internal("No se pudo guardar el archivo");
  return row;
}
async function submitMaterials(clientId, materials) {
  const activeDeal = await resolveActiveDeal(clientId);
  const row = await getOrCreateOnboarding(db, activeDeal.portalId, activeDeal.id, clientId);
  assertNotCompleted(row);
  const allAssetIds = Object.values(materials).flatMap((m) => m.assetIds ?? []);
  if (allAssetIds.length > 0) {
    const owned = await db.select({ id: clientAsset.id }).from(clientAsset).where(and38(eq47(clientAsset.dealId, activeDeal.id), inArray16(clientAsset.id, allAssetIds)));
    const ownedSet = new Set(owned.map((o) => o.id));
    const invalid = allAssetIds.filter((id) => !ownedSet.has(id));
    if (invalid.length > 0) {
      throw Errors.badRequest("Uno o m\xE1s archivos no pertenecen a este proyecto", { invalid });
    }
  }
  const stepsCompleted = { ...row.stepsCompleted, "7": (/* @__PURE__ */ new Date()).toISOString() };
  const [updated] = await db.update(clientOnboarding).set({
    materials,
    stepsCompleted,
    currentStep: Math.max(row.currentStep, 8),
    updatedAt: /* @__PURE__ */ new Date()
  }).where(eq47(clientOnboarding.id, row.id)).returning();
  if (!updated) throw Errors.internal("No se pudo guardar los materiales");
  return updated;
}
async function completeOnboarding(clientAccount2) {
  const clientId = clientAccount2.sub;
  const activeDeal = await resolveActiveDeal(clientId);
  const result = await db.transaction(async (tx) => {
    const row = await getOrCreateOnboarding(tx, activeDeal.portalId, activeDeal.id, clientId);
    assertNotCompleted(row);
    const missing = [];
    if (!row.stepsCompleted["5"]) missing.push("firma");
    if (!row.stepsCompleted["6"]) missing.push("brief");
    if (!row.stepsCompleted["7"]) missing.push("materiales");
    if (missing.length > 0) {
      throw Errors.badRequest(`Faltan completar pasos previos: ${missing.join(", ")}`, { missing });
    }
    const stepsCompleted = { ...row.stepsCompleted, "8": (/* @__PURE__ */ new Date()).toISOString() };
    const [updatedOnboarding] = await tx.update(clientOnboarding).set({ status: ONBOARDING_STATUS.COMPLETED, completedAt: /* @__PURE__ */ new Date(), stepsCompleted, currentStep: 8, updatedAt: /* @__PURE__ */ new Date() }).where(and38(eq47(clientOnboarding.id, row.id), eq47(clientOnboarding.status, ONBOARDING_STATUS.IN_PROGRESS))).returning();
    if (!updatedOnboarding) {
      throw Errors.conflict("El onboarding ya est\xE1 completo");
    }
    const move = await moveDealToProduction(tx, activeDeal.portalId, activeDeal.id, { clientId });
    return { onboarding: updatedOnboarding, ...move };
  });
  const notifyPayload = {
    entityType: "deal",
    entityId: activeDeal.id,
    type: "onboarding_completed",
    title: `Onboarding completado: "${result.dealName}" pas\xF3 a ${result.stageLabel}`
  };
  if (result.ownerId) {
    await createNotification({ portalId: activeDeal.portalId, userId: result.ownerId, ...notifyPayload });
  } else {
    await notifyAdmins(activeDeal.portalId, notifyPayload);
  }
  return result;
}
function toAdminListItem(onboarding, dealName, clientEmail) {
  return {
    dealId: onboarding.dealId,
    dealName,
    clientEmail,
    status: onboarding.status,
    currentStep: onboarding.currentStep,
    stepsCompleted: onboarding.stepsCompleted,
    completedAt: onboarding.completedAt?.toISOString() ?? null,
    updatedAt: onboarding.updatedAt.toISOString()
  };
}
async function listOnboardings(portalId) {
  const rows = await db.select({ onboarding: clientOnboarding, dealName: deal.name, clientEmail: clientAccount.email }).from(clientOnboarding).innerJoin(deal, and38(eq47(deal.id, clientOnboarding.dealId), eq47(deal.archived, false))).innerJoin(clientAccount, eq47(clientAccount.id, clientOnboarding.clientId)).where(eq47(clientOnboarding.portalId, portalId)).orderBy(sql31`CASE WHEN ${clientOnboarding.status} = ${ONBOARDING_STATUS.IN_PROGRESS} THEN 0 ELSE 1 END`, desc22(clientOnboarding.updatedAt));
  return rows.map(({ onboarding, dealName, clientEmail }) => toAdminListItem(onboarding, dealName, clientEmail));
}
async function getOnboardingByDeal(portalId, dealId) {
  const [[row], assets] = await Promise.all([
    db.select({ onboarding: clientOnboarding, dealName: deal.name, clientEmail: clientAccount.email }).from(clientOnboarding).innerJoin(deal, eq47(deal.id, clientOnboarding.dealId)).innerJoin(clientAccount, eq47(clientAccount.id, clientOnboarding.clientId)).where(and38(eq47(clientOnboarding.portalId, portalId), eq47(clientOnboarding.dealId, dealId))).limit(1),
    db.select().from(clientAsset).where(and38(eq47(clientAsset.dealId, dealId), isNull4(clientAsset.intakeId))).orderBy(desc22(clientAsset.uploadedAt))
  ]);
  if (!row) throw Errors.notFound("Onboarding no encontrado para este deal");
  return { onboarding: row.onboarding, assets, dealName: row.dealName, clientEmail: row.clientEmail };
}

// src/modules/onboarding/onboarding.router.ts
var TAG33 = "Onboarding";
async function onboardingAdminRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/",
    {
      schema: {
        tags: [TAG33],
        summary: "Listar onboardings del portal",
        description: "Progreso del onboarding post-venta de cada deal. Orden: in_progress primero, luego por actualizaci\xF3n m\xE1s reciente.",
        security: ADMIN_SECURITY
      }
    },
    async (request) => ok(await listOnboardings(request.hubUser.portalId))
  );
  r.get(
    "/deals/:id",
    {
      schema: {
        tags: [TAG33],
        summary: "Onboarding completo de un deal",
        security: ADMIN_SECURITY,
        params: IdParamSchema
      }
    },
    async (request) => ok(await getOnboardingByDeal(request.hubUser.portalId, request.params.id))
  );
}

// src/modules/onboarding/client-onboarding.router.ts
var TAG34 = "Client Portal";
async function clientOnboardingRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticateClient);
  r.get(
    "/",
    {
      schema: {
        tags: [TAG34],
        summary: "Estado del onboarding post-venta",
        description: "Lazy-create: si el cliente no tiene onboarding para su deal activo, se crea. Incluye los client_asset subidos en el paso de materiales.",
        security: CLIENT_SECURITY
      }
    },
    async (request) => ok(await getOnboardingState(request.clientAccount.sub))
  );
  r.patch(
    "/progress",
    {
      schema: {
        tags: [TAG34],
        summary: "Marcar un paso de orientaci\xF3n como completado (pasos 1-4)",
        security: CLIENT_SECURITY,
        body: OnboardingProgressSchema
      }
    },
    async (request) => ok(await markStepProgress(request.clientAccount.sub, request.body.step))
  );
  r.post(
    "/signature",
    {
      schema: {
        tags: [TAG34],
        summary: "Firmar el onboarding (paso 5)",
        description: "Checkbox de aceptaci\xF3n + nombre completo tipeado. Guarda timestamp + IP. No re-firmable (409 si ya est\xE1 firmado).",
        security: CLIENT_SECURITY,
        body: OnboardingSignatureSchema
      }
    },
    async (request) => ok(await submitSignature(request.clientAccount.sub, request.body.fullName, request.ip))
  );
  r.post(
    "/brief",
    {
      schema: {
        tags: [TAG34],
        summary: "Enviar el brief del proyecto (paso 6, 16 preguntas)",
        description: "Re-submit permitido mientras el onboarding no est\xE9 completo (sobreescribe).",
        security: CLIENT_SECURITY,
        body: OnboardingBriefSchema
      }
    },
    async (request) => ok(await submitBrief(request.clientAccount.sub, request.body))
  );
  r.post(
    "/materials",
    {
      schema: {
        tags: [TAG34],
        summary: "Registrar estado de materiales (paso 7)",
        description: "Los archivos se suben antes con POST /materials/upload; ac\xE1 solo se persisten los assetIds y el estado por categor\xEDa.",
        security: CLIENT_SECURITY,
        body: OnboardingMaterialsSchema
      }
    },
    async (request) => ok(await submitMaterials(request.clientAccount.sub, request.body.materials))
  );
  app2.post(
    "/materials/upload",
    {
      schema: {
        tags: [TAG34],
        summary: "Subir un archivo de materiales (paso 7)",
        security: CLIENT_SECURITY
      }
    },
    async (request, reply) => {
      const query = OnboardingMaterialUploadQuerySchema.safeParse(request.query);
      if (!query.success) throw Errors.badRequest("Categor\xEDa de material inv\xE1lida", query.error.flatten());
      const file = await request.file();
      if (!file) throw Errors.badRequest("No se envi\xF3 ning\xFAn archivo");
      const saved = await saveUpload(await file.toBuffer(), file.filename, file.mimetype);
      const asset = await uploadMaterialAsset(request.clientAccount.sub, query.data.category, saved);
      return reply.status(201).send(ok(asset));
    }
  );
  r.post(
    "/complete",
    {
      schema: {
        tags: [TAG34],
        summary: "Completar el onboarding (paso 8)",
        description: 'Gate: exige firma + brief + checklist de materiales enviado (400 con detalle si falta alguno). El checklist de materiales puede tener \xEDtems en `done: false` \u2014 el cliente puede no tener, p. ej., manual de marca a\xFAn; lo que exige el gate es haber ENVIADO el paso, no que todo est\xE9 "listo". Mueve el deal al pipeline Producci\xF3n / etapa Diagn\xF3stico y notifica al responsable asignado.',
        security: CLIENT_SECURITY
      }
    },
    async (request) => ok(await completeOnboarding(request.clientAccount))
  );
}

// src/modules/calendar/calendar.public.router.ts
import { z as z36 } from "zod";
var TAG35 = "Calendario P\xFAblico";
var ianaTimezone2 = z36.string().refine(
  (tz) => {
    try {
      Intl.DateTimeFormat(void 0, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: "Zona horaria IANA inv\xE1lida (ej. America/Bogota, Europe/Madrid)" }
);
var EventTypeParamsSchema = z36.object({
  portalId: z36.string().min(1, "portalId requerido"),
  eventSlug: z36.string().min(1, "eventSlug requerido")
});
async function calendarPublicRoutes(app2) {
  const r = app2.withTypeProvider();
  r.get(
    "/:portalId/:eventSlug",
    {
      schema: {
        tags: [TAG35],
        summary: "Metadata p\xFAblica de un event type (sin auth)",
        description: "Devuelve nombre, duraci\xF3n, locaciones, preguntas custom y configuraci\xF3n de un event type activo. Disponible sin autenticaci\xF3n para que el invitado pueda cargar la p\xE1gina de booking.",
        params: EventTypeParamsSchema
      },
      // Rate limit moderado: el frontend puede llamar esto al cargar la página
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } }
    },
    async (request) => {
      const { portalId, eventSlug } = request.params;
      return ok(await getPublicEventType(portalId, eventSlug));
    }
  );
  r.get(
    "/:portalId/:eventSlug/slots",
    {
      schema: {
        tags: [TAG35],
        summary: "Slots disponibles de un event type (sin auth)",
        description: "Calcula los slots libres del event type en el rango de fechas dado. Devuelve startUtc (UTC), endUtc (UTC) y startLocal (en la TZ del invitado).",
        params: EventTypeParamsSchema,
        querystring: z36.object({
          from: z36.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from debe ser YYYY-MM-DD"),
          to: z36.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to debe ser YYYY-MM-DD"),
          tz: ianaTimezone2
        })
      },
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const { portalId, eventSlug } = request.params;
      const { from, to, tz } = request.query;
      const fromMs = new Date(from).getTime();
      const toMs = new Date(to).getTime();
      const maxRangeMs = 90 * 24 * 60 * 60 * 1e3;
      if (toMs - fromMs > maxRangeMs) {
        return reply.status(400).send({
          error: {
            code: "BAD_REQUEST",
            message: "El rango m\xE1ximo de consulta es 90 d\xEDas"
          }
        });
      }
      const slots = await getPublicSlots(portalId, eventSlug, from, to, tz);
      return ok({ slots });
    }
  );
  r.post(
    "/:portalId/:eventSlug/book",
    {
      schema: {
        tags: [TAG35],
        summary: "Crear un booking (sin auth)",
        description: "Reserva un slot para el event type dado. Devuelve el booking creado con las URLs de cancelaci\xF3n y reprogramaci\xF3n para autoservicio. Si el slot ya fue tomado por concurrencia \u2192 409.",
        params: EventTypeParamsSchema,
        body: CreateBookingSchema
      },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const { portalId, eventSlug } = request.params;
      const protocol = request.headers["x-forwarded-proto"] ?? "http";
      const frontendHost = process.env["NEXT_PUBLIC_APP_URL"] ?? `${protocol}://${request.headers["x-forwarded-host"] ?? "localhost:3000"}`;
      const baseUrl = frontendHost.endsWith("/") ? frontendHost.slice(0, -1) : frontendHost;
      const result = await createPublicBooking(portalId, eventSlug, request.body, baseUrl);
      return reply.status(201).send(ok(result));
    }
  );
  r.post(
    "/booking/cancel",
    {
      schema: {
        tags: [TAG35],
        summary: "Cancelar un booking por token (sin auth)",
        description: "Cancela el booking asociado al token firmado de cancelaci\xF3n. El token va en el body (no en la URL). El slot queda libre autom\xE1ticamente (el constraint EXCLUDE solo aplica a status=confirmed).",
        body: CancelBookingSchema
      },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const { token } = request.body;
      const result = await cancelPublicBooking(token);
      return reply.status(200).send(ok(result));
    }
  );
  r.post(
    "/booking/reschedule",
    {
      schema: {
        tags: [TAG35],
        summary: "Reprogramar un booking por token (sin auth)",
        description: "Cancela el booking original y crea uno nuevo en el slot indicado. El token va en el body (no en la URL). Devuelve el nuevo booking con nuevas URLs de autoservicio.",
        body: RescheduleByTokenSchema
      },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
    },
    async (request, reply) => {
      const { token, ...rescheduleData } = request.body;
      const protocol = request.headers["x-forwarded-proto"] ?? "http";
      const frontendHost = process.env["NEXT_PUBLIC_APP_URL"] ?? `${protocol}://${request.headers["x-forwarded-host"] ?? "localhost:3000"}`;
      const baseUrl = frontendHost.endsWith("/") ? frontendHost.slice(0, -1) : frontendHost;
      const result = await reschedulePublicBooking(token, rescheduleData, baseUrl);
      return reply.status(201).send(ok(result));
    }
  );
}

// src/modules/calendar/calendar.admin.router.ts
var TAG36 = "Calendario Admin V2";
var security30 = ADMIN_SECURITY;
async function calendarAdminRoutes(app2) {
  const r = app2.withTypeProvider();
  r.addHook("preHandler", authenticate);
  r.get(
    "/schedules",
    {
      schema: {
        tags: [TAG36],
        summary: "Listar schedules de disponibilidad del portal",
        security: security30
      }
    },
    async (request) => ok(await listSchedules(request.hubUser.portalId))
  );
  r.get(
    "/schedules/:id",
    {
      schema: {
        tags: [TAG36],
        summary: "Obtener un schedule por ID",
        security: security30,
        params: IdParamSchema
      }
    },
    async (request) => ok(await getSchedule(request.hubUser.portalId, request.params.id))
  );
  r.post(
    "/schedules",
    {
      schema: {
        tags: [TAG36],
        summary: "Crear schedule de disponibilidad",
        security: security30,
        body: CreateScheduleSchema
      },
      preHandler: [authorize("owner", "member")]
    },
    async (request, reply) => {
      const created = await createSchedule(
        request.hubUser.portalId,
        request.hubUser.sub,
        request.body
      );
      return reply.status(201).send(ok(created));
    }
  );
  r.patch(
    "/schedules/:id",
    {
      schema: {
        tags: [TAG36],
        summary: "Actualizar schedule",
        security: security30,
        params: IdParamSchema,
        body: UpdateScheduleSchema
      },
      preHandler: [authorize("owner", "member")]
    },
    async (request) => ok(await updateSchedule(request.hubUser.portalId, request.params.id, request.body))
  );
  r.delete(
    "/schedules/:id",
    {
      schema: {
        tags: [TAG36],
        summary: "Eliminar schedule",
        security: security30,
        params: IdParamSchema
      },
      preHandler: [authorize("owner", "member")]
    },
    async (request) => {
      await deleteSchedule(request.hubUser.portalId, request.params.id);
      return ok({ success: true });
    }
  );
  r.post(
    "/schedules/:scheduleId/intervals",
    {
      schema: {
        tags: [TAG36],
        summary: "Agregar intervalo a un schedule",
        security: security30,
        params: ScheduleParamSchema,
        body: CreateIntervalSchema
      },
      preHandler: [authorize("owner", "member")]
    },
    async (request, reply) => {
      const created = await addScheduleInterval(
        request.hubUser.portalId,
        request.params.scheduleId,
        request.body
      );
      return reply.status(201).send(ok(created));
    }
  );
  r.patch(
    "/schedules/:scheduleId/intervals",
    {
      schema: {
        tags: [TAG36],
        summary: "Reemplazar todos los intervalos de un schedule (at\xF3mico)",
        security: security30,
        params: ScheduleParamSchema,
        body: ReplaceIntervalsSchema
      },
      preHandler: [authorize("owner", "member")]
    },
    async (request) => ok(
      await replaceScheduleIntervals(
        request.hubUser.portalId,
        request.params.scheduleId,
        request.body
      )
    )
  );
  r.delete(
    "/schedules/:scheduleId/intervals/:intervalId",
    {
      schema: {
        tags: [TAG36],
        summary: "Eliminar un intervalo de un schedule",
        security: security30,
        params: ScheduleIntervalParamSchema
      },
      preHandler: [authorize("owner", "member")]
    },
    async (request) => {
      await deleteScheduleInterval(
        request.hubUser.portalId,
        request.params.scheduleId,
        request.params.intervalId
      );
      return ok({ success: true });
    }
  );
  r.post(
    "/schedules/:scheduleId/overrides",
    {
      schema: {
        tags: [TAG36],
        summary: "Upsert de date override en un schedule",
        security: security30,
        params: ScheduleParamSchema,
        body: DateOverrideInputSchema
      },
      preHandler: [authorize("owner", "member")]
    },
    async (request) => ok(
      await upsertDateOverride(
        request.hubUser.portalId,
        request.params.scheduleId,
        request.body
      )
    )
  );
  r.delete(
    "/schedules/:scheduleId/overrides/:overrideId",
    {
      schema: {
        tags: [TAG36],
        summary: "Eliminar un date override de un schedule",
        security: security30,
        params: ScheduleOverrideParamSchema
      },
      preHandler: [authorize("owner", "member")]
    },
    async (request) => {
      await deleteDateOverride(
        request.hubUser.portalId,
        request.params.scheduleId,
        request.params.overrideId
      );
      return ok({ success: true });
    }
  );
  r.get(
    "/event-types",
    {
      schema: {
        tags: [TAG36],
        summary: "Listar event types V2 del portal",
        security: security30
      }
    },
    async (request) => ok(await listEventTypesV2(request.hubUser.portalId))
  );
  r.get(
    "/event-types/:id",
    {
      schema: {
        tags: [TAG36],
        summary: "Obtener event type V2 por ID",
        security: security30,
        params: IdParamSchema
      }
    },
    async (request) => ok(await getEventTypeV2(request.hubUser.portalId, request.params.id))
  );
  r.post(
    "/event-types",
    {
      schema: {
        tags: [TAG36],
        summary: "Crear event type V2",
        security: security30,
        body: CreateEventTypeV2Schema
      },
      preHandler: [authorize("owner", "member")]
    },
    async (request, reply) => {
      const created = await createEventTypeV2(
        request.hubUser.portalId,
        request.hubUser.sub,
        request.body
      );
      return reply.status(201).send(ok(created));
    }
  );
  r.patch(
    "/event-types/:id",
    {
      schema: {
        tags: [TAG36],
        summary: "Actualizar event type V2",
        security: security30,
        params: IdParamSchema,
        body: UpdateEventTypeV2Schema
      },
      preHandler: [authorize("owner", "member")]
    },
    async (request) => ok(await updateEventTypeV2(request.hubUser.portalId, request.params.id, request.body))
  );
  r.delete(
    "/event-types/:id",
    {
      schema: {
        tags: [TAG36],
        summary: "Eliminar event type V2",
        security: security30,
        params: IdParamSchema
      },
      preHandler: [authorize("owner", "member")]
    },
    async (request) => {
      await deleteEventTypeV2(request.hubUser.portalId, request.params.id);
      return ok({ success: true });
    }
  );
  r.get(
    "/bookings/week",
    {
      schema: {
        tags: [TAG36],
        summary: "Bookings del portal en rango de fechas (vista semanal admin)",
        security: security30,
        querystring: WeekBookingsQuerySchema
      }
    },
    async (request) => {
      const { from, to } = request.query;
      return ok(await listWeekBookings(request.hubUser.portalId, from, to));
    }
  );
  r.post(
    "/bookings/:id/cancel",
    {
      schema: {
        tags: [TAG36],
        summary: "Cancelar booking desde el admin",
        security: security30,
        params: IdParamSchema
      },
      preHandler: [authorize("owner", "member")]
    },
    async (request) => ok(await cancelAdminBooking(request.hubUser.portalId, request.params.id))
  );
}

// src/app.ts
function buildApp() {
  const app2 = Fastify({
    logger: env.NODE_ENV === "development" ? { transport: { target: "pino-pretty" } } : env.NODE_ENV === "test" ? false : true,
    // Detrás de un proxy (Vercel): sin esto, request.ip devuelve la IP del
    // proxy para TODOS los requests, no la del cliente real. Crítico para
    // onboarding.submitSignature, que persiste request.ip como parte del
    // rastro legal de la firma.
    trustProxy: true
  });
  app2.setValidatorCompiler(validatorCompiler);
  app2.setSerializerCompiler(serializerCompiler);
  const allowedOrigins = [
    env.ADMIN_URL,
    env.CLIENT_PORTAL_URL,
    "http://localhost:3000",
    "http://localhost:3002"
  ].filter((o) => Boolean(o));
  app2.register(cors, { origin: allowedOrigins, credentials: true });
  app2.register(cookie);
  app2.register(fastifyWebsocket);
  app2.register(fastifyMultipart, { limits: { fileSize: 25 * 1024 * 1024 } });
  app2.register(fastifySwagger, {
    openapi: {
      info: {
        title: "API CRM DevD\xFAo",
        description: "Documentaci\xF3n de la API del CRM interno de DevD\xFAo. Todos los endpoints (salvo autenticaci\xF3n y salud) requieren un Bearer token de hub_user. Las respuestas siguen el formato `{ data, meta? }` y los errores `{ error: { code, message } }`.",
        version: "1.0.0"
      },
      servers: [{ url: "http://localhost:3001", description: "Desarrollo local" }],
      tags: [
        { name: "Dashboard", description: "M\xE9tricas y resumen del portal" },
        { name: "Autenticaci\xF3n", description: "Login, refresh, logout y usuario actual" },
        { name: "Contactos", description: "CRUD de contactos" },
        { name: "Leads", description: "Contactos en etapa de prospecto + detalle" },
        { name: "Clientes", description: "Contactos convertidos en clientes + detalle" },
        { name: "Empresas", description: "CRUD de empresas" },
        { name: "Notas", description: "Notas asociadas a contactos/deals/empresas" },
        { name: "Tareas", description: "Tareas con responsable, vencimiento y estado" },
        { name: "Calendario", description: "Tipos de reuni\xF3n, disponibilidad y reuniones agendadas" },
        { name: "Usuarios", description: "Gesti\xF3n del equipo (hub_user)" },
        { name: "Configuraci\xF3n", description: "Ajustes del portal" },
        { name: "Entregables", description: "Entregables asociados a deals" },
        { name: "Client Portal", description: "Autenticaci\xF3n del portal de clientes (token separado)" },
        { name: "Intake Forms", description: "Plantillas de onboarding y asignaci\xF3n a deals" },
        { name: "Notificaciones", description: "Notificaciones del usuario (REST + WebSocket en /ws/notifications)" },
        { name: "Archivos", description: "Subida/descarga de archivos (almacenamiento local)" },
        { name: "Change Requests", description: "Solicitudes de cambio de alcance (admin + cliente)" },
        { name: "Biblioteca", description: "Documentos, SOPs, plantillas y recursos de la agencia" },
        { name: "Operaciones", description: "Bugs, mejoras, roadmap interno y procesos del equipo" },
        { name: "Finanzas", description: "Facturas, pagos y m\xE9tricas financieras del portal" },
        { name: "Deals", description: "CRUD de deals y cambios de etapa" },
        { name: "Pipelines", description: "Pipelines y sus etapas" },
        { name: "Salud", description: "Health checks de la API" },
        { name: "Actividades", description: "Timeline unificado: llamadas, reuniones, emails, notas, tareas e historial" },
        { name: "Seguimientos", description: "Follow-ups (tareas vencidas/hoy/pr\xF3ximos 7 d\xEDas) y deals sin pr\xF3xima acci\xF3n o sin actividad reciente" },
        { name: "Reportes", description: "Reportes de gesti\xF3n: embudo, riesgo, conversi\xF3n, actividad y cerrados/ganados" },
        { name: "Webhooks", description: "Webhooks de integraciones externas (Fathom)" },
        { name: "Tracking", description: "Pixel de apertura y redirect de click para email tracking" },
        { name: "Documentos", description: "Documentos asociados a deals (contratos, propuestas, facturas)" }
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" }
        }
      }
    },
    transform: jsonSchemaTransform
  });
  app2.register(fastifySwaggerUI, { routePrefix: "/docs" });
  app2.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details }
      });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Datos inv\xE1lidos", details: error.flatten() }
      });
    }
    if (error.validation) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: error.message, details: error.validation }
      });
    }
    request.log.error(error);
    return reply.status(error.statusCode ?? 500).send({
      error: { code: "INTERNAL", message: "Error interno del servidor" }
    });
  });
  app2.register(healthRoutes);
  app2.register(authRoutes, { prefix: "/api/auth" });
  app2.register(dashboardRoutes, { prefix: "/api/dashboard" });
  app2.register(contactsRoutes, { prefix: "/api/contacts" });
  app2.register(leadsRoutes, { prefix: "/api/leads" });
  app2.register(clientsRoutes, { prefix: "/api/clients" });
  app2.register(companiesRoutes, { prefix: "/api/companies" });
  app2.register(notesRoutes, { prefix: "/api/notes" });
  app2.register(tasksRoutes, { prefix: "/api/tasks" });
  app2.register(dealsRoutes, { prefix: "/api/deals" });
  app2.register(pipelinesRoutes, { prefix: "/api/pipelines" });
  app2.register(calendarRoutes, { prefix: "/api/calendar" });
  app2.register(calendarAdminRoutes, { prefix: "/api/calendar" });
  app2.register(usersRoutes, { prefix: "/api/users" });
  app2.register(settingsRoutes, { prefix: "/api/settings" });
  app2.register(deliverablesRoutes, { prefix: "/api/deliverables" });
  app2.register(clientAuthRoutes, { prefix: "/api/client-auth" });
  app2.register(clientRoutes, { prefix: "/api/client" });
  app2.register(intakeRoutes, { prefix: "/api/intake" });
  app2.register(clientIntakeRoutes, { prefix: "/api/client/intakes" });
  app2.register(notificationsRoutes, { prefix: "/api/notifications" });
  app2.register(notificationsWsRoutes);
  app2.register(filesRoutes, { prefix: "/api/files" });
  app2.register(clientFilesRoutes, { prefix: "/api/client/files" });
  app2.register(crRoutes, { prefix: "/api/change-requests" });
  app2.register(clientCrRoutes, { prefix: "/api/client/change-requests" });
  app2.register(libraryRoutes, { prefix: "/api/library" });
  app2.register(workItemsRoutes, { prefix: "/api/work-items" });
  app2.register(financeRoutes, { prefix: "/api/finance" });
  app2.register(notificationPrefsRoutes, { prefix: "/api/notification-prefs" });
  app2.register(customFieldsRoutes, { prefix: "/api/custom-fields" });
  app2.register(timelineRoutes, { prefix: "/api/timeline" });
  app2.register(focusRoutes, { prefix: "/api/focus" });
  app2.register(reportsRoutes, { prefix: "/api/reports" });
  app2.register(webhooksRoutes, { prefix: "/webhooks" });
  app2.register(emailTrackingRoutes, { prefix: "/track" });
  app2.register(documentsRoutes, { prefix: "/api/documents" });
  app2.register(setterRoutes, { prefix: "/api/setter" });
  app2.register(setterApprovalRoutes, { prefix: "/api/setter" });
  app2.register(setterWsRoutes);
  app2.register(setterWhatsappWebhookRoutes, { prefix: "/webhooks" });
  app2.register(prospectingRoutes, { prefix: "/api/prospecting" });
  app2.register(proposalPublicRoutes, { prefix: "/api/public/proposals" });
  app2.register(proposalAdminRoutes, { prefix: "/api/proposals" });
  app2.register(brandingAdminRoutes, { prefix: "/api/branding" });
  app2.register(brandingClientRoutes, { prefix: "/api/client/branding" });
  app2.register(brandingPublicRoutes, { prefix: "/api/public/branding" });
  app2.register(onboardingAdminRoutes, { prefix: "/api/onboarding" });
  app2.register(clientOnboardingRoutes, { prefix: "/api/client/onboarding" });
  app2.register(calendarPublicRoutes, { prefix: "/api/public/calendar" });
  return app2;
}

// serverless/index.ts
var app;
async function getApp() {
  if (!app) {
    app = buildApp();
    await app.ready();
  }
  return app;
}
async function handler(req, res) {
  const instance2 = await getApp();
  instance2.server.emit("request", req, res);
}
export {
  handler as default
};
