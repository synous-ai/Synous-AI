import { z } from 'zod'

// ── Schemas de creación ─────────────────────────────────────────────────────

export const LogCallSchema = z
  .object({
    title: z.string().min(1).optional(),
    body: z.string().optional(),
    direction: z.enum(['inbound', 'outbound']).optional(),
    durationSec: z.number().int().nonnegative().optional(),
    occurredAt: z.string().datetime().optional(),
    dealId: z.string().min(1).optional(),
    contactId: z.string().min(1).optional(),
  })
  .refine((v) => v.dealId != null || v.contactId != null, {
    message: 'Se requiere al menos dealId o contactId',
  })
export type LogCallDTO = z.infer<typeof LogCallSchema>

export const LogMeetingSchema = z
  .object({
    title: z.string().min(1),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    location: z.string().optional(),
    dealId: z.string().min(1).optional(),
    contactId: z.string().min(1).optional(),
  })
  .refine((v) => v.dealId != null || v.contactId != null, {
    message: 'Se requiere al menos dealId o contactId',
  })
export type LogMeetingDTO = z.infer<typeof LogMeetingSchema>

export const LogEmailSchema = z
  .object({
    fromEmail: z.string().email(),
    toEmail: z.string().email(),
    subject: z.string().min(1),
    bodyHtml: z.string().optional(),
    dealId: z.string().min(1).optional(),
    contactId: z.string().min(1).optional(),
  })
  .refine((v) => v.dealId != null || v.contactId != null, {
    message: 'Se requiere al menos dealId o contactId',
  })
export type LogEmailDTO = z.infer<typeof LogEmailSchema>

// ── Query ────────────────────────────────────────────────────────────────────

export const TimelineQuerySchema = z
  .object({
    dealId: z.string().min(1).optional(),
    contactId: z.string().min(1).optional(),
    companyId: z.string().min(1).optional(),
  })
  .refine((v) => [v.dealId, v.contactId, v.companyId].filter(Boolean).length === 1, {
    message: 'Se requiere exactamente uno de: dealId, contactId, companyId',
  })
export type TimelineQuery = z.infer<typeof TimelineQuerySchema>
