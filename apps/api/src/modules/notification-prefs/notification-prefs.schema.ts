import { z } from 'zod'

export const KNOWN_EVENT_TYPES = [
  'deal_stage_changed',
  'cr_approved',
  'cr_rejected',
  'task_due',
  'deal_stale',
  'client_message',
] as const

export type EventType = (typeof KNOWN_EVENT_TYPES)[number]

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
