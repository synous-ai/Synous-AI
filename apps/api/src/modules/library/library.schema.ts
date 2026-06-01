import { z } from 'zod'

export const LibraryItemTypeEnum = z.enum([
  'document',
  'sop',
  'template',
  'contract_base',
  'proposal_base',
  'checklist',
  'tech_doc',
])
export type LibraryItemType = z.infer<typeof LibraryItemTypeEnum>

export const CreateLibraryItemSchema = z.object({
  type: LibraryItemTypeEnum,
  name: z.string().min(1),
  category: z.string().optional(),
  description: z.string().optional(),
  storageKey: z.string().optional(),
  url: z.string().url().optional(),
})
export type CreateLibraryItemDTO = z.infer<typeof CreateLibraryItemSchema>

export const UpdateLibraryItemSchema = z
  .object({
    type: LibraryItemTypeEnum,
    name: z.string().min(1),
    category: z.string(),
    description: z.string(),
    storageKey: z.string(),
    url: z.string().url(),
  })
  .partial()
export type UpdateLibraryItemDTO = z.infer<typeof UpdateLibraryItemSchema>

export const ListLibraryQuerySchema = z.object({
  type: LibraryItemTypeEnum.optional(),
})
export type ListLibraryQueryType = z.infer<typeof ListLibraryQuerySchema>
