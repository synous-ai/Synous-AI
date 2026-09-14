import { z } from 'zod'
import { FILE_PURPOSES } from '../../lib/storage'

/**
 * Tipo y tamaño NO se restringen acá con un enum: la política por propósito
 * (lib/storage/policy.ts) los valida y responde con los códigos del contrato
 * (FILE_TYPE_NOT_ALLOWED / FILE_TOO_LARGE) en vez de un VALIDATION_ERROR genérico.
 */
export const CreateUploadIntentSchema = z.object({
  purpose: z.enum(FILE_PURPOSES),
  fileName: z.string().min(1).max(500),
  contentType: z.string().min(1).max(200),
  sizeBytes: z.number().int().positive(),
})
export type CreateUploadIntentDTO = z.infer<typeof CreateUploadIntentSchema>

export const UploadIdParamSchema = z.object({
  uploadId: z.string().min(1).max(64),
})

/**
 * Único evento que aceptan las rutas blob-token: pedir la URL presignada.
 * `blob.upload-completed` queda afuera a propósito — el estado en DB nunca
 * depende de ese callback (no llega a localhost y Vercel lo reintenta).
 */
export const BlobTokenRequestSchema = z.object({
  type: z.literal('blob.generate-presigned-url'),
  payload: z.object({
    pathname: z.string().min(1).max(500),
    clientPayload: z.string().max(1000).nullish(),
    multipart: z.boolean().optional(),
  }),
})
export type BlobTokenRequestDTO = z.infer<typeof BlobTokenRequestSchema>
