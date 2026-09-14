/**
 * calendar.service.ts — Barrel del módulo de Calendario del CRM Synous.
 *
 * La lógica vive repartida en archivos cohesivos por responsabilidad; este
 * archivo solo re-exporta lo que antes exportaba directamente, para que
 * ningún importer (routers, tests, otros módulos) tenga que cambiar.
 *
 * - legacy-meeting-types.ts → tipos de reunión legacy + availability_rule
 * - availability-engine.ts  → motor de disponibilidad (interno, no se re-exporta)
 * - booking-tokens.ts       → firma/verificación de tokens de booking (interno, no se re-exporta)
 * - public-event-types.ts   → resolución de portal + event type/slots públicos
 * - bookings.ts             → bookings públicos (crear/cancelar/reprogramar) y admin
 * - availability-schedules.ts → schedules + intervalos + date overrides
 * - event-types-v2.ts       → event types V2 + memberships
 */
export * from './legacy-meeting-types'
export * from './public-event-types'
export * from './bookings'
export * from './availability-schedules'
export * from './event-types-v2'
