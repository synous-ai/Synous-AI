import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../db'
import { portal } from '../../db/schema'
import { Errors } from '../../lib/errors'

export const UpdatePortalSchema = z.object({
  name: z.string().min(1).optional(),
  timeZone: z.string().optional(),
  currency: z.string().length(3).optional(),
})
export type UpdatePortalDTO = z.infer<typeof UpdatePortalSchema>

type PortalRow = typeof portal.$inferSelect

export async function getPortal(portalId: string): Promise<PortalRow> {
  const [row] = await db.select().from(portal).where(eq(portal.id, portalId)).limit(1)
  if (!row) throw Errors.notFound('Portal no encontrado')
  return row
}

export async function updatePortal(portalId: string, input: UpdatePortalDTO): Promise<PortalRow> {
  const [row] = await db
    .update(portal)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(portal.id, portalId))
    .returning()
  if (!row) throw Errors.notFound('Portal no encontrado')
  return row
}
