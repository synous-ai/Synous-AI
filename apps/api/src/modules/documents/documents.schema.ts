import { z } from 'zod'

export const DocumentTypeEnum = z.enum(['contract', 'proposal', 'invoice', 'other'])
export type DocumentType = z.infer<typeof DocumentTypeEnum>

export const CreateDocumentSchema = z.object({
  dealId: z.string().min(1),
  crId: z.string().min(1).optional(),
  name: z.string().min(1, 'El nombre es requerido'),
  type: DocumentTypeEnum,
  storageKey: z.string().min(1).optional(),
  /**
   * ¿Se muestra en el Portal del cliente? Default true, para no cambiar lo que
   * los clientes ya veían (contratos, propuestas, facturas). Se manda false
   * para documentos internos del proceso de entrega.
   */
  visibleToClient: z.boolean().optional(),
})

export type CreateDocumentDTO = z.infer<typeof CreateDocumentSchema>

export const ListDocumentsQuerySchema = z.object({
  dealId: z.string().min(1).optional(),
})

export type ListDocumentsQueryDTO = z.infer<typeof ListDocumentsQuerySchema>

/** Body de POST /api/documents/deals/:id/send-for-signature */
export const SendForSignatureSchema = z.object({
  /** ID numérico del template en DocuSeal. */
  templateId: z.number().int().positive(),
  documentType: z.enum(['contract', 'proposal']),
  name: z.string().min(1).max(200).optional(),
})
export type SendForSignatureDTO = z.infer<typeof SendForSignatureSchema>
