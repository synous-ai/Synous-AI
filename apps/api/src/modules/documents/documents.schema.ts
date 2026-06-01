import { z } from 'zod'

export const DocumentTypeEnum = z.enum(['contract', 'proposal', 'invoice', 'other'])
export type DocumentType = z.infer<typeof DocumentTypeEnum>

export const CreateDocumentSchema = z.object({
  dealId: z.string().min(1),
  crId: z.string().min(1).optional(),
  name: z.string().min(1, 'El nombre es requerido'),
  type: DocumentTypeEnum,
  storageKey: z.string().min(1).optional(),
})

export type CreateDocumentDTO = z.infer<typeof CreateDocumentSchema>

export const ListDocumentsQuerySchema = z.object({
  dealId: z.string().min(1).optional(),
})

export type ListDocumentsQueryDTO = z.infer<typeof ListDocumentsQuerySchema>
