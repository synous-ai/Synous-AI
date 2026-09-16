import { z } from 'zod'
import {
  CHANGE_REQUEST_STATUSES,
  CHANGE_REQUEST_PRIORITIES,
  CR_REJECTION_REASONS,
  CR_ADJUSTMENT_AREAS,
  type ChangeRequestStatus,
} from '@synous/shared'
import { ListQuerySchema } from '../../lib/crm-schemas'

const StatusEnum = z.enum(CHANGE_REQUEST_STATUSES)
const PriorityEnum = z.enum(CHANGE_REQUEST_PRIORITIES)
const BucketEnum = z.enum(['needs_action', 'in_review', 'resolved'])
const CurrencyEnum = z.enum(['USD', 'ARS'])

const ItemSchema = z.object({
  description: z.string().min(1),
  hours: z.number().nonnegative().optional(),
  unitPrice: z.number().nonnegative(),
  quantity: z.number().positive().optional(),
})

/**
 * Referencia a un archivo YA subido. Solo viaja la key: nombre, tipo y tamaño
 * salen del ledger (`file_upload`) al reclamarla, nunca de lo que declare el
 * cliente — un nombre o un MIME inventado en el body se ignoraría igual.
 */
const UploadRefSchema = z.object({ storageKey: z.string().min(1).max(500) })
export type UploadRefDTO = z.infer<typeof UploadRefSchema>

const UploadsSchema = z.array(UploadRefSchema).min(1).max(10)

// ── Admin ────────────────────────────────────────────────────────────────────

export const CreateCRSchema = z.object({
  dealId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  context: z.string().max(5000).optional(),
  priority: PriorityEnum.optional(),
  originalScopeRef: z.string().optional(),
  origin: z.enum(['client', 'agency']).optional(),
  totalAmount: z.number().nonnegative().optional(),
  currency: CurrencyEnum.optional(),
  timelineImpactDays: z.number().int().optional(),
  items: z.array(ItemSchema).optional(),
})
export type CreateCRDTO = z.infer<typeof CreateCRSchema>

export const UpdateCRSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    context: z.string().max(5000),
    priority: PriorityEnum,
    originalScopeRef: z.string(),
    totalAmount: z.number().nonnegative(),
    currency: CurrencyEnum,
    timelineImpactDays: z.number().int(),
  })
  .partial()
export type UpdateCRDTO = z.infer<typeof UpdateCRSchema>

export const AddItemSchema = ItemSchema
export type AddItemDTO = z.infer<typeof AddItemSchema>

/**
 * `status` acepta CSV (`?status=sent,negotiating`) o repetido
 * (`?status=sent&status=negotiating`): Fastify entrega un string en el primer
 * caso y un array en el segundo, y el front usa las dos formas.
 */
const StatusFilterSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value): string[] | undefined => {
    if (value === undefined) return undefined
    const parsed = (Array.isArray(value) ? value : [value])
      .flatMap((v) => v.split(','))
      .map((v) => v.trim())
      .filter(Boolean)
    return parsed.length > 0 ? parsed : undefined
  })
  .pipe(z.array(StatusEnum).nonempty().optional())

export const CRListQuerySchema = z
  .object({
    dealId: z.string().min(1).optional(),
    status: StatusFilterSchema,
    bucket: BucketEnum.optional(),
    origin: z.enum(['client', 'agency']).optional(),
    /** Búsqueda libre sobre título y descripción. */
    q: z.string().min(1).max(200).optional(),
  })
  .merge(ListQuerySchema)
export type CRListQuery = z.infer<typeof CRListQuerySchema>

export const CRSummaryQuerySchema = z.object({ dealId: z.string().min(1).optional() })
export type CRSummaryQuery = z.infer<typeof CRSummaryQuerySchema>

export const TransitionSchema = z.object({ status: StatusEnum, comment: z.string().max(5000).optional() })
export type TransitionDTO = z.infer<typeof TransitionSchema>

export const CommentSchema = z.object({ body: z.string().min(1).max(5000), uploads: UploadsSchema.optional() })
export type CommentDTO = z.infer<typeof CommentSchema>

export const AttachmentsSchema = z.object({ uploads: UploadsSchema })
export type AttachmentsDTO = z.infer<typeof AttachmentsSchema>

// ── Propuestas (admin) ───────────────────────────────────────────────────────

/** `YYYY-MM-DD`: la columna es `date`, mandarle un ISO completo la corre de día. */
const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado: YYYY-MM-DD')

export const CreateProposalSchema = z.object({
  scope: z.string().max(10000).optional(),
  amount: z.number().nonnegative().optional(),
  currency: CurrencyEnum.optional(),
  timelineImpactDays: z.number().int().optional(),
  newDeliveryDate: IsoDateSchema.optional(),
  note: z.string().max(5000).optional(),
  items: z.array(ItemSchema).optional(),
  /** Por defecto se envía: una propuesta que no sale del CRM no sirve de nada. */
  send: z.boolean().optional(),
})
export type CreateProposalDTO = z.infer<typeof CreateProposalSchema>

export const UpdateProposalSchema = CreateProposalSchema.omit({ send: true }).partial()
export type UpdateProposalDTO = z.infer<typeof UpdateProposalSchema>

export const ProposalParamSchema = z.object({ id: z.string().min(1), proposalId: z.string().min(1) })

// ── Cliente ──────────────────────────────────────────────────────────────────

export const ClientListQuerySchema = z
  .object({
    status: StatusFilterSchema,
    bucket: BucketEnum.optional(),
  })
  .merge(ListQuerySchema)
export type ClientListQuery = z.infer<typeof ClientListQuerySchema>

/**
 * Alta de solicitud desde el portal.
 *
 * NO declara precio, días, fecha ni estado a propósito: `z.object` descarta las
 * props que no están en el schema, así que aunque el cliente las mande nunca
 * llegan al service. El precio y el plazo los fija el equipo en una propuesta.
 */
export const ClientCreateCRSchema = z.object({
  dealId: z.string().min(1).optional(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(10000),
  context: z.string().max(5000).optional(),
  priority: PriorityEnum.optional(),
  /** Idempotencia anti double-submit: el portal lo genera antes de enviar. */
  clientRequestId: z.string().min(1).max(64).optional(),
  uploads: UploadsSchema.optional(),
})
export type ClientCreateCRDTO = z.infer<typeof ClientCreateCRSchema>

/**
 * Decisión del cliente sobre una CR. El comentario es opcional — y el body
 * ENTERO también.
 *
 * El portal aprueba sin comentario, y en ese caso el api-client compartido no
 * manda body ni Content-Type (ver packages/api-client/src/index.ts), con lo
 * que Fastify deja `request.body` en `null`. Un `z.object()` pelado RECHAZA
 * null por más que todas sus props sean opcionales, así que la validación
 * fallaba con 400 antes de llegar al handler: el botón "Aprobar" del portal
 * nunca funcionó. Por eso el `.nullish()`.
 */
export const ClientApproveSchema = z.object({ comment: z.string().max(5000).optional() }).nullish()
export type ClientApproveDTO = z.infer<typeof ClientApproveSchema>

export const ClientRejectSchema = z
  .object({ reason: z.enum(CR_REJECTION_REASONS).optional(), comment: z.string().max(5000).optional() })
  .nullish()
export type ClientRejectDTO = z.infer<typeof ClientRejectSchema>

export const ClientCancelSchema = z.object({ comment: z.string().max(5000).optional() }).nullish()
export type ClientCancelDTO = z.infer<typeof ClientCancelSchema>

/** El comentario acá NO es opcional: un "pedí un ajuste" sin decir qué no se puede trabajar. */
export const ClientAdjustmentSchema = z.object({
  area: z.enum(CR_ADJUSTMENT_AREAS),
  comment: z.string().min(5).max(5000),
})
export type ClientAdjustmentDTO = z.infer<typeof ClientAdjustmentSchema>

export const ClientCommentSchema = z.object({
  body: z.string().min(1).max(5000),
  uploads: UploadsSchema.optional(),
})
export type ClientCommentDTO = z.infer<typeof ClientCommentSchema>

export type { ChangeRequestStatus }
