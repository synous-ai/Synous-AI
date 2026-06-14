import { z } from 'zod'

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const HEX_RE = /^#[0-9a-fA-F]{6}$/

/** Actualiza el branding white-label de un client_account. */
export const UpdateBrandingSchema = z.object({
  brandSlug: z
    .string()
    .regex(SLUG_RE, 'Slug inválido (solo minúsculas, números y guiones)')
    .max(40)
    .nullable()
    .optional(),
  brandName: z.string().max(60).nullable().optional(),
  brandLogoKey: z.string().max(200).nullable().optional(),
  brandPrimary: z.string().regex(HEX_RE, 'Color hex inválido (#RRGGBB)').nullable().optional(),
  brandSecondary: z.string().regex(HEX_RE, 'Color hex inválido (#RRGGBB)').nullable().optional(),
})
export type UpdateBrandingDTO = z.infer<typeof UpdateBrandingSchema>

/** El cliente edita su propio branding (NO el slug, que controla la agencia). */
export const ClientUpdateBrandingSchema = z.object({
  brandName: z.string().max(60).nullable().optional(),
  brandLogoKey: z.string().max(200).nullable().optional(),
  brandPrimary: z.string().regex(HEX_RE, 'Color hex inválido (#RRGGBB)').nullable().optional(),
  brandSecondary: z.string().regex(HEX_RE, 'Color hex inválido (#RRGGBB)').nullable().optional(),
})
export type ClientUpdateBrandingDTO = z.infer<typeof ClientUpdateBrandingSchema>

/** Param :slug del endpoint público. */
export const SlugParamSchema = z.object({
  slug: z.string().min(1).max(40),
})
