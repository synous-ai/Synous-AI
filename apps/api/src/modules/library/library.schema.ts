import { z } from 'zod'

// ── Enums ────────────────────────────────────────────────────────────────────

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

/**
 * kind discrimina el subtipo de un ítem operativo (type='sop').
 *
 * - 'procedure': pasos ordenados y numerados (SOP clásico).
 * - 'checklist': ítems de verificación con bullet estático (sin estado de ejecución).
 *
 * Para los demás types, kind es null. El DB check lo garantiza.
 */
export const LibraryKindEnum = z.enum(['procedure', 'checklist'])
export type LibraryKind = z.infer<typeof LibraryKindEnum>

// ── Step ─────────────────────────────────────────────────────────────────────

/**
 * Un paso dentro de un SOP o procedimiento de referencia.
 *
 * GUARDRAIL: sin campos de estado (done, checked, completedAt, etc.).
 * Los pasos son CONTENIDO DE REFERENCIA, no un tracker de ejecución.
 * El tracking de ejecución es responsabilidad del módulo de Proyectos/Tareas.
 */
export const LibraryStepSchema = z.object({
  title: z.string().min(1, 'El título del paso es requerido'),
  body: z.string().optional(),
})
export type LibraryStepDTO = z.infer<typeof LibraryStepSchema>

// ── Create ────────────────────────────────────────────────────────────────────

export const CreateLibraryItemSchema = z.object({
  type: LibraryItemTypeEnum,
  name: z.string().min(1),
  category: z.string().optional(),
  description: z.string().optional(),
  storageKey: z.string().optional(),
  url: z.string().url().optional(),
  /**
   * Pasos del SOP/procedimiento. Solo aplica cuando type='sop'.
   * Máx 200 pasos por ítem (límite razonable para un SOP operativo).
   * Se REEMPLAZA completo en updates — no hay merge parcial.
   */
  steps: z.array(LibraryStepSchema).max(200).optional(),
  /**
   * Variante operativa: 'procedure' o 'checklist'.
   * Solo aplica cuando type='sop'. Null para los demás types.
   */
  kind: LibraryKindEnum.nullable().optional(),
  /**
   * ID del hub_user responsable del contenido (owner).
   * Solo aplica a ítems operativos (type='sop').
   * Null = sin responsable asignado.
   */
  ownerId: z.string().min(1).nullable().optional(),
})
export type CreateLibraryItemDTO = z.infer<typeof CreateLibraryItemSchema>

// ── Update ────────────────────────────────────────────────────────────────────

export const UpdateLibraryItemSchema = z
  .object({
    type: LibraryItemTypeEnum,
    name: z.string().min(1),
    category: z.string(),
    description: z.string(),
    storageKey: z.string(),
    url: z.string().url(),
    /**
     * Lista completa de pasos. Se REEMPLAZA — nunca se hace merge con `||`.
     * El front envía siempre la lista completa reordenada/editada.
     */
    steps: z.array(LibraryStepSchema).max(200),
    kind: LibraryKindEnum.nullable(),
    ownerId: z.string().min(1).nullable(),
  })
  .partial()
export type UpdateLibraryItemDTO = z.infer<typeof UpdateLibraryItemSchema>

// ── List query ────────────────────────────────────────────────────────────────

export const ListLibraryQuerySchema = z.object({
  type: LibraryItemTypeEnum.optional(),
  /**
   * Filtro por kind. Aplica solo cuando type='sop'.
   * El frontend hace el filtrado client-side para /library/sops,
   * pero este parámetro permite que el server también lo filtre si se pide.
   */
  kind: LibraryKindEnum.optional(),
})
export type ListLibraryQueryType = z.infer<typeof ListLibraryQuerySchema>
