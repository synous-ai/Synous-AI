import { z } from 'zod'

/**
 * Validación del wizard de onboarding (endpoint PÚBLICO, sin auth).
 *
 * Por ser público, el saneo es estricto (defensa en profundidad):
 *  - Tipos y formatos correctos: email, URL http/https, enums cerrados.
 *  - Límite de longitud en TODOS los campos (anti-DoS por payloads enormes).
 *  - Strip de caracteres de control y rechazo de `< >` en campos cortos
 *    (mitiga inyección/XSS aguas abajo: emails, PDF de la propuesta, etc.).
 *  - Zod descarta claves desconocidas por defecto (anti mass-assignment).
 *  - Mensajes de error en español, claros para el usuario final.
 *
 * Vinculación con el CRM (dos caminos):
 *  - CON `token`: el lead YA existe (le mandamos el link tras el primer
 *    contacto). La submission se asocia a ese contacto/deal.
 *  - SIN `token` (fallback): funnel frío; el contacto se busca/crea por email.
 */

// ── Helpers de saneo reutilizables ───────────────────────────────────────────

/** Saca caracteres de control (incl. NUL) que no deberían viajar en texto. */
const stripControl = (s: string): string =>
  s
    .split('')
    .filter((c) => {
      const code = c.charCodeAt(0)
      return code > 31 && code !== 127 // descarta control chars (0-31) y DEL (127)
    })
    .join('')

/** Texto libre OPCIONAL: limita longitud, saca control chars y recorta. */
const freeText = (max: number) =>
  z
    .string()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((s) => stripControl(s).trim())
    .optional()

/** Texto corto sin HTML (empresa): recorta, limita y rechaza `< >`. */
const shortSafe = (max: number, label: string) =>
  z
    .string()
    .max(max, `${label}: máximo ${max} caracteres.`)
    .transform((s) => stripControl(s).trim())
    .refine((s) => !/[<>]/.test(s), `${label}: contiene caracteres no permitidos.`)

/** Nombre/Apellido: solo letras (con acentos), espacios, puntos y guiones. */
const personName = (label: string) =>
  z
    .string({ required_error: `Tu ${label.toLowerCase()} es requerido.` })
    .transform((s) => stripControl(s).trim())
    .pipe(
      z
        .string()
        .min(2, `Ingresá tu ${label.toLowerCase()}.`)
        .max(60, `${label}: máximo 60 caracteres.`)
        .regex(
          /^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]*$/u,
          `${label}: solo letras, espacios y guiones.`,
        ),
    )

/** Enum cerrado con mensaje en español ante valor inválido o ausente. */
const choice = <T extends readonly [string, ...string[]]>(values: T, label: string) =>
  z.enum(values, { errorMap: () => ({ message: `Elegí una opción válida en ${label}.` }) })

export const OnboardingSubmitSchema = z.object({
  // Token de invitación (opcional). JWT firmado; acotamos longitud por las dudas.
  token: z.string().max(2048).optional(),

  // 1 · Información básica — Nombre y Apellido SEPARADOS.
  firstName: personName('Nombre'),
  lastName: personName('Apellido'),
  email: z
    .string({ required_error: 'Tu email es requerido.' })
    .transform((s) => s.trim().toLowerCase())
    .pipe(
      z
        .string()
        .min(5, 'Email inválido.')
        .max(254, 'Email demasiado largo.')
        .email('Ingresá un email válido.'),
    ),
  company: shortSafe(160, 'Empresa').optional(),
  // URL opcional: si no trae protocolo le anteponemos https://; solo http/https.
  website: z.preprocess(
    (v) => {
      if (typeof v !== 'string') return v
      const t = v.trim()
      if (!t) return undefined
      return /^https?:\/\//i.test(t) ? t : `https://${t}`
    },
    z.string().url('Ingresá una URL válida (https://…).').max(200, 'URL demasiado larga.').optional(),
  ),
  // `source` (cómo nos conoció) quedó OBSOLETO: la fuente se setea al crear el
  // lead en su canal de origen. Opcional solo por compatibilidad; el wizard ya
  // no lo envía.
  source: freeText(160),

  // 2 · El proyecto. La oferta de NOUS es SOFTWARE A MEDIDA (web apps, CRMs,
  // automatizaciones, portales) — no landings ni sitios de marketing.
  projectType: choice(['webapp', 'crm', 'automatizacion', 'portal', 'otro'] as const, 'tipo de proyecto'),
  mainGoal: choice(['operacion', 'escalar', 'reemplazar', 'lanzar'] as const, 'objetivo principal'),
  // Descripción breve: "¿cómo lo resolvés hoy / qué querés construir?". Es la
  // materia prima para que la IA arme la propuesta.
  currentSolution: freeText(600),

  // NOTA: el "Alcance" detallado (disciplinas, contenido listo, referencias) NO
  // se pregunta acá. Es parte del INTAKE post-cierre, una vez aceptada la
  // propuesta. El onboarding es solo el calificador pre-venta.

  // 3 · Claridad
  clarity: choice(['muy_claro', 'mas_o_menos', 'necesito_ayuda'] as const, 'claridad'),

  // 4 · Presupuesto (filtro fuerte) — rangos de software a medida (USD).
  budget: choice(['<2000', '2000-5000', '5000-10000', '10000+'] as const, 'presupuesto'),

  // 5 · Timing
  startWhen: freeText(160),
  deadline: freeText(160),

  // 6 · Automatización / herramientas actuales (contexto para la propuesta).
  currentCrm: freeText(160),
  toAutomate: freeText(600),

  // 7 · Prioridad
  priority: choice(['precio', 'velocidad', 'calidad', 'escalabilidad'] as const, 'prioridad'),

  // 8 · Preferencia final
  preference: choice(['propuesta', 'llamada'] as const, 'preferencia'),
})

export type OnboardingSubmitDTO = z.infer<typeof OnboardingSubmitSchema>

/**
 * Querystring del endpoint público que resuelve un link de onboarding.
 * `t` es el token firmado; con él pre-cargamos el wizard con los datos del lead.
 */
export const OnboardingResolveQuerySchema = z.object({
  t: z.string().min(1, 'Falta el token').max(2048),
})
export type OnboardingResolveQueryDTO = z.infer<typeof OnboardingResolveQuerySchema>

/**
 * Body del endpoint admin que genera una invitación de onboarding para un lead.
 * Devuelve el link tokenizado listo para enviarle al contacto.
 */
export const OnboardingInviteSchema = z.object({
  contactId: z.string().min(1, 'contactId requerido').max(60),
})
export type OnboardingInviteDTO = z.infer<typeof OnboardingInviteSchema>
