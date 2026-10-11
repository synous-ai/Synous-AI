/**
 * Propósitos de subida. Vive aparte de `policy.ts` (sin imports) porque lo
 * consume también el schema de Drizzle para el CHECK de `file_upload.purpose`,
 * y drizzle-kit carga el schema fuera del runtime de la API.
 */
export const FILE_PURPOSES = [
  'deal_document',
  'library_item',
  'expense_receipt',
  'proposal_logo',
  'brand_logo',
  'onboarding_material',
  'cr_attachment',
] as const

export type FilePurpose = (typeof FILE_PURPOSES)[number]

export const FILE_UPLOAD_STATUSES = ['pending', 'attached'] as const
export type FileUploadStatus = (typeof FILE_UPLOAD_STATUSES)[number]
