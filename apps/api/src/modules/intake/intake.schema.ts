import { z } from 'zod'

const FieldSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'textarea', 'email', 'number', 'date', 'file']).default('text'),
})

export const CreateIntakeFormSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  slug: z.string().optional(),
  fields: z.array(FieldSchema).default([]),
})
export type CreateIntakeFormDTO = z.infer<typeof CreateIntakeFormSchema>

export const AssignIntakeSchema = z.object({
  dealId: z.string().min(1),
  formId: z.string().min(1),
  title: z.string().optional(),
  dueDate: z.string().datetime().optional(),
})
export type AssignIntakeDTO = z.infer<typeof AssignIntakeSchema>

export const DealIntakeQuerySchema = z.object({
  dealId: z.string().min(1),
})

export const RespondIntakeSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
})
export type RespondIntakeDTO = z.infer<typeof RespondIntakeSchema>
