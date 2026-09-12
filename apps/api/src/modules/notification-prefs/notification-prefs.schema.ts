import { z } from 'zod'

import { ADMIN_EVENT_TYPES, type NotificationEventType } from '../notifications/notification-events'

/**
 * Tipos configurables: se DERIVAN del catálogo de eventos, no se listan a mano.
 *
 * La lista escrita a mano se había desincronizado: declaraba `client_message`,
 * que nadie emitía, y le faltaban 5 tipos que sí se emitían en producción
 * (meeting_recorded, onboarding_completed y los tres de proposals), por lo que
 * esos no se podían desactivar desde ningún lado.
 *
 * Solo los de audiencia `admin`: las preferencias viven en `notification_pref`,
 * que referencia `hub_user`. Las del cliente son otra tabla y otra etapa.
 */
export const KNOWN_EVENT_TYPES = ADMIN_EVENT_TYPES

export type EventType = NotificationEventType

export const UpsertPrefSchema = z.object({
  eventType: z.string().min(1),
  inApp: z.boolean(),
  email: z.boolean(),
})
export type UpsertPrefDTO = z.infer<typeof UpsertPrefSchema>

export const BulkUpsertPrefSchema = z.object({
  prefs: z.array(UpsertPrefSchema).min(1),
})
export type BulkUpsertPrefDTO = z.infer<typeof BulkUpsertPrefSchema>
