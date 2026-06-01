import { z } from 'zod'

export const EntityTypeEnum = z.enum(['contact', 'deal', 'company'])
export type EntityType = z.infer<typeof EntityTypeEnum>

export const FieldTypeEnum = z.enum(['text', 'number', 'date', 'select', 'boolean'])
export type FieldType = z.infer<typeof FieldTypeEnum>

/** key must be a valid slug: starts with lowercase letter, contains only a-z, 0-9, _ */
const keySchema = z.string().regex(/^[a-z][a-z0-9_]*$/, {
  message: 'La clave debe comenzar con una letra minúscula y contener solo letras, números y guion bajo',
})

export const CreateCustomFieldSchema = z.object({
  entityType: EntityTypeEnum,
  key: keySchema,
  label: z.string().min(1),
  fieldType: FieldTypeEnum,
  options: z.array(z.string().min(1)).optional(),
  displayOrder: z.number().int().min(0).optional(),
})
export type CreateCustomFieldDTO = z.infer<typeof CreateCustomFieldSchema>

export const UpdateCustomFieldSchema = z
  .object({
    label: z.string().min(1),
    fieldType: FieldTypeEnum,
    options: z.array(z.string().min(1)).nullable(),
    displayOrder: z.number().int().min(0),
  })
  .partial()
export type UpdateCustomFieldDTO = z.infer<typeof UpdateCustomFieldSchema>

export const ListCustomFieldsQuerySchema = z.object({
  entityType: EntityTypeEnum.optional(),
})
export type ListCustomFieldsQueryType = z.infer<typeof ListCustomFieldsQuerySchema>
