import { z } from 'zod'
import { ListQuerySchema } from '../../lib/crm-schemas'

export const DocumentTypeEnum = z.enum(['contract', 'proposal', 'invoice', 'other'])
export type DocumentType = z.infer<typeof DocumentTypeEnum>

export const CreateDocumentSchema = z.object({
  dealId: z.string().min(1),
  crId: z.string().min(1).optional(),
  folderId: z.string().min(1).optional(),
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

/** Body de PATCH /api/documents/:id — renombrar y/o mover cualquier documento del deal. */
export const UpdateDocumentSchema = z
  .object({
    name: z.string().min(1, 'El nombre es requerido').optional(),
    folderId: z.string().min(1).nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.folderId !== undefined, { message: 'Nada para actualizar' })
export type UpdateDocumentDTO = z.infer<typeof UpdateDocumentSchema>

// ─── Carpetas del admin ─────────────────────────────────────────────────────
// `.trim()` en los nombres: mismo motivo que las carpetas del cliente — el
// CHECK de `document_folder` valida char_length(btrim(name)).

export const CreateDocumentFolderSchema = z.object({
  dealId: z.string().min(1),
  name: z.string().trim().min(1, 'El nombre es requerido').max(120),
})
export type CreateDocumentFolderDTO = z.infer<typeof CreateDocumentFolderSchema>

export const RenameDocumentFolderSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es requerido').max(120),
})
export type RenameDocumentFolderDTO = z.infer<typeof RenameDocumentFolderSchema>

export const ListDocumentFoldersQuerySchema = z.object({
  dealId: z.string().min(1),
})
export type ListDocumentFoldersQueryDTO = z.infer<typeof ListDocumentFoldersQuerySchema>

export const ListDocumentsQuerySchema = z.object({
  dealId: z.string().min(1).optional(),
}).merge(ListQuerySchema)

export type ListDocumentsQueryDTO = z.infer<typeof ListDocumentsQuerySchema>

/** Body de POST /api/documents/deals/:id/send-for-signature */
export const SendForSignatureSchema = z.object({
  /** ID numérico del template en DocuSeal. */
  templateId: z.number().int().positive(),
  documentType: z.enum(['contract', 'proposal']),
  name: z.string().min(1).max(200).optional(),
})
export type SendForSignatureDTO = z.infer<typeof SendForSignatureSchema>

// ─── Carpetas y documentos del cliente (portal) ────────────────────────────
// `.trim()` en los nombres: el CHECK de `document_folder` valida
// char_length(btrim(name)) — sin el trim acá, un nombre de solo espacios pasa
// el `min(1)` de Zod y revienta como un 500 de constraint en vez de un 400 legible.

export const ClientCreateDocumentFolderSchema = z.object({
  dealId: z.string().min(1),
  name: z.string().trim().min(1, 'El nombre es requerido').max(120),
})
export type ClientCreateDocumentFolderDTO = z.infer<typeof ClientCreateDocumentFolderSchema>

export const ClientRenameDocumentFolderSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es requerido').max(120),
})
export type ClientRenameDocumentFolderDTO = z.infer<typeof ClientRenameDocumentFolderSchema>

export const ClientListDocumentFoldersQuerySchema = z.object({
  dealId: z.string().min(1),
})
export type ClientListDocumentFoldersQueryDTO = z.infer<typeof ClientListDocumentFoldersQuerySchema>

export const ClientCreateDocumentSchema = z.object({
  dealId: z.string().min(1),
  folderId: z.string().min(1).optional(),
  name: z.string().min(1, 'El nombre es requerido'),
  storageKey: z.string().min(1),
})
export type ClientCreateDocumentDTO = z.infer<typeof ClientCreateDocumentSchema>

export const ClientUpdateDocumentSchema = z
  .object({
    name: z.string().min(1, 'El nombre es requerido').optional(),
    folderId: z.string().min(1).nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.folderId !== undefined, { message: 'Nada para actualizar' })
export type ClientUpdateDocumentDTO = z.infer<typeof ClientUpdateDocumentSchema>
