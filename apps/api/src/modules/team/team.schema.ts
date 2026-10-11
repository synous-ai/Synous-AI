import { z } from 'zod'

export const WORK_STATUSES = ['available', 'working', 'blocked', 'waiting_approval'] as const
export const WorkStatusSchema = z.enum(WORK_STATUSES)

export const TeamUserParamSchema = z.object({ userId: z.string().min(1) })

const longText = z.string().trim().max(4000).nullable()

/**
 * Upsert parcial del perfil. Un campo ausente no se toca; `null` o '' lo limpia.
 * Los permisos (owner vs. cada persona sobre su propio workStatus) los resuelve el service.
 */
export const UpdateTeamProfileSchema = z
  .object({
    jobTitle: z.string().trim().max(120).nullable().optional(),
    responsibilities: longText.optional(),
    autonomousDecisions: longText.optional(),
    approvalRequired: longText.optional(),
    workStatus: WorkStatusSchema.nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nada para actualizar' })
export type UpdateTeamProfileDTO = z.infer<typeof UpdateTeamProfileSchema>
