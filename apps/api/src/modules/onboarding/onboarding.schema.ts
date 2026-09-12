import { z } from 'zod'

/**
 * Validación del onboarding POST-VENTA (wizard de 8 pasos, cliente autenticado
 * en el Client Portal). Ver client-onboarding.router.ts.
 */

// ── Status de client_onboarding (mismo check constraint que la tabla) ───────
export const ONBOARDING_STATUS = {
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
} as const
export type OnboardingStatusDTO = (typeof ONBOARDING_STATUS)[keyof typeof ONBOARDING_STATUS]

// ── Parte 1 — Orientación (pasos 1-4): PATCH /progress ──────────────────────
export const OnboardingProgressSchema = z.object({
  step: z.number().int().min(1, 'Paso inválido').max(4, 'Paso inválido'),
})
export type OnboardingProgressDTO = z.infer<typeof OnboardingProgressSchema>

// ── Paso 5 — Firma: POST /signature ──────────────────────────────────────────
// Firma = checkbox de aceptación + nombre completo tipeado + timestamp + IP
// (guardados en DB). NO DocuSeal — decisión de negocio explícita.
export const OnboardingSignatureSchema = z.object({
  fullName: z
    .string({ required_error: 'El nombre completo es requerido.' })
    .min(3, 'El nombre completo es requerido.')
    .max(200, 'Nombre demasiado largo.'),
  accepted: z.literal(true, { errorMap: () => ({ message: 'Debés aceptar los términos para firmar.' }) }),
})
export type OnboardingSignatureDTO = z.infer<typeof OnboardingSignatureSchema>

// ── Paso 6 — Brief del proyecto (16 preguntas): POST /brief ─────────────────
const DELIVERY_CHANNELS = [
  'whatsapp',
  'notion',
  'drive',
  'skool',
  'circle',
  'hotmart',
  'kajabi',
  'otro',
] as const

// ── Helpers de saneo reutilizables (mismo espíritu que los `freeText`/
// `shortSafe` del viejo wizard pre-venta público — límite de longitud en
// TODO campo de texto libre, anti-DoS por payloads enormes, + strip de
// caracteres de control). Este endpoint requiere auth de cliente, pero el
// saneo se mantiene por defensa en profundidad. ──────────────────────────────

/** Saca caracteres de control (incl. NUL) que no deberían viajar en texto. */
const stripControl = (s: string): string =>
  s
    .split('')
    .filter((c) => {
      const code = c.charCodeAt(0)
      return code > 31 && code !== 127 // descarta control chars (0-31) y DEL (127)
    })
    .join('')

/** Texto libre REQUERIDO: limita longitud (anti-DoS), saca control chars y recorta. */
const freeText = (max: number) =>
  z
    .string({ required_error: 'Requerido' })
    .max(max, `Máximo ${max} caracteres.`)
    .transform((s) => stripControl(s).trim())
    .pipe(z.string().min(1, 'Requerido'))

/** Texto libre OPCIONAL: mismo saneo, pero permite vacío/ausente. */
const freeTextOptional = (max: number) =>
  z
    .string()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((s) => stripControl(s).trim())
    .optional()

/**
 * Si el cliente eligió el canal "otro", tiene que decir cuál — si no, la
 * respuesta q3 queda sin información útil. Se aplica igual acá y en el
 * frontend (portal-lib/components/onboarding/steps/step-6-brief.tsx).
 */
const requireOtherChannelDetail = (
  value: { deliveryChannels: readonly string[]; deliveryChannelsOther?: string },
  ctx: z.RefinementCtx,
): void => {
  if (value.deliveryChannels.includes('otro') && !value.deliveryChannelsOther) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['deliveryChannelsOther'],
      message: 'Contanos cuál es el otro canal.',
    })
  }
}

const BriefFieldsSchema = z.object({
  businessProgram: freeText(2000), // q1
  activeClients: freeText(500), // q2
  deliveryChannels: z.array(z.enum(DELIVERY_CHANNELS)).min(1, 'Elegí al menos un canal'), // q3
  deliveryChannelsOther: freeTextOptional(200),
  worstChannel: freeText(2000), // q4
  weeklyTimeDrain: freeText(2000), // q5
  sixMonthConcern: freeText(2000), // q6
  idealDayToDay: freeText(2000), // q7
  desiredStudentFeeling: freeText(2000), // q8
  referenceApps: freeText(2000), // q9
  teamRoles: freeText(2000), // q10
  brandIdentity: freeText(500), // q11
  requiredIntegrations: freeText(2000), // q12
  existingClientBase: freeText(2000), // q13
  howFoundUs: freeText(2000), // q14
  decisionTrigger: freeText(2000), // q15
  doubtsBeforeBuying: freeText(2000), // q16
})

export const OnboardingBriefSchema = BriefFieldsSchema.superRefine(requireOtherChannelDetail)
export type OnboardingBriefDTO = z.infer<typeof OnboardingBriefSchema>

/**
 * Borrador PARCIAL del brief (PATCH /brief/draft, se manda al avanzar cada uno
 * de los 5 bloques del paso 6). Mismos límites de longitud y saneo que el
 * submit final — pero TODO opcional y sin exigir contenido: es lo que el
 * cliente lleva tipeado, no una respuesta terminada.
 *
 * `.strict()`: el merge va directo a una columna jsonb, así que no se aceptan
 * claves fuera de las 16 conocidas (nadie infla la fila con basura arbitraria).
 * Se exige al menos una clave para que un PATCH vacío no cuente como guardado.
 */
export const OnboardingBriefDraftSchema = BriefFieldsSchema.partial()
  .extend({
    businessProgram: freeTextOptional(2000),
    activeClients: freeTextOptional(500),
    worstChannel: freeTextOptional(2000),
    weeklyTimeDrain: freeTextOptional(2000),
    sixMonthConcern: freeTextOptional(2000),
    idealDayToDay: freeTextOptional(2000),
    desiredStudentFeeling: freeTextOptional(2000),
    referenceApps: freeTextOptional(2000),
    teamRoles: freeTextOptional(2000),
    brandIdentity: freeTextOptional(500),
    requiredIntegrations: freeTextOptional(2000),
    existingClientBase: freeTextOptional(2000),
    howFoundUs: freeTextOptional(2000),
    decisionTrigger: freeTextOptional(2000),
    doubtsBeforeBuying: freeTextOptional(2000),
    // Sin el `.min(1)` del submit final: un borrador puede tener el selector
    // de canales todavía vacío.
    deliveryChannels: z.array(z.enum(DELIVERY_CHANNELS)).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'El borrador no puede estar vacío.' })
export type OnboardingBriefDraftDTO = z.infer<typeof OnboardingBriefDraftSchema>

// ── Paso 7 — Materiales: POST /materials + POST /materials/upload ───────────
const MaterialItemSchema = z.object({
  done: z.boolean(),
  assetIds: z.array(z.string().min(1)).max(50, 'Máximo 50 archivos por categoría.').optional(),
  note: z.string().max(500).optional(),
})

export const ONBOARDING_MATERIAL_CATEGORIES = [
  'logoBrand',
  'programContent',
  'clientBase',
  'toolAccess',
] as const
export type OnboardingMaterialCategory = (typeof ONBOARDING_MATERIAL_CATEGORIES)[number]

export const OnboardingMaterialsSchema = z.object({
  materials: z.object({
    logoBrand: MaterialItemSchema,
    programContent: MaterialItemSchema,
    clientBase: MaterialItemSchema,
    toolAccess: MaterialItemSchema,
  }),
})
export type OnboardingMaterialsDTO = z.infer<typeof OnboardingMaterialsSchema>

/**
 * Borrador PARCIAL del checklist de materiales (PATCH /materials/draft). A
 * diferencia del submit final, no exige las 4 categorías: el wizard manda solo
 * la que cambió (tildar "listo", escribir una nota, terminar una subida) para
 * que ese estado no viva solo en memoria hasta apretar "Continuar".
 *
 * `.strict()` + al menos una categoría: el merge va a una columna jsonb, así
 * que no se aceptan claves desconocidas ni un PATCH vacío.
 */
export const OnboardingMaterialsDraftSchema = z.object({
  materials: z
    .object({
      logoBrand: MaterialItemSchema.optional(),
      programContent: MaterialItemSchema.optional(),
      clientBase: MaterialItemSchema.optional(),
      toolAccess: MaterialItemSchema.optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0, { message: 'No hay materiales para guardar.' }),
})
export type OnboardingMaterialsDraftDTO = z.infer<typeof OnboardingMaterialsDraftSchema>

/** Querystring del upload de un material (multipart): a qué categoría pertenece el archivo. */
export const OnboardingMaterialUploadQuerySchema = z.object({
  category: z.enum(ONBOARDING_MATERIAL_CATEGORIES, {
    errorMap: () => ({ message: 'Categoría de material inválida' }),
  }),
})
export type OnboardingMaterialUploadQueryDTO = z.infer<typeof OnboardingMaterialUploadQuerySchema>
