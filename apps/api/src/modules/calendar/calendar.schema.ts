import { z } from 'zod'

export const CreateMeetingTypeSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  durationMin: z.number().int().positive(),
  bufferMin: z.number().int().min(0).optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
})
export type CreateMeetingTypeDTO = z.infer<typeof CreateMeetingTypeSchema>

export const UpdateMeetingTypeSchema = CreateMeetingTypeSchema.partial()
export type UpdateMeetingTypeDTO = z.infer<typeof UpdateMeetingTypeSchema>

export const CreateAvailabilityRuleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  timeZone: z.string().optional(),
})
export type CreateAvailabilityRuleDTO = z.infer<typeof CreateAvailabilityRuleSchema>
