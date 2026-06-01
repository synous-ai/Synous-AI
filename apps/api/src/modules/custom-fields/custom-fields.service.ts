import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { customField } from '../../db/schema'
import { Errors } from '../../lib/errors'
import type {
  CreateCustomFieldDTO,
  UpdateCustomFieldDTO,
  ListCustomFieldsQueryType,
} from './custom-fields.schema'

type CustomFieldRow = typeof customField.$inferSelect

/**
 * Verifica que el campo custom exista, pertenezca al portal y no esté archivado.
 * Lanza Errors.notFound si no cumple.
 */
async function requireFieldInPortal(portalId: string, id: string): Promise<CustomFieldRow> {
  const [row] = await db
    .select()
    .from(customField)
    .where(
      and(
        eq(customField.id, id),
        eq(customField.portalId, portalId),
        eq(customField.archived, false),
      ),
    )
    .limit(1)
  if (!row) throw Errors.notFound('Campo personalizado no encontrado')
  return row
}

export async function listCustomFields(
  portalId: string,
  query: ListCustomFieldsQueryType,
): Promise<CustomFieldRow[]> {
  const conditions = [
    eq(customField.portalId, portalId),
    eq(customField.archived, false),
    ...(query.entityType ? [eq(customField.entityType, query.entityType)] : []),
  ]
  return db
    .select()
    .from(customField)
    .where(and(...conditions))
    .orderBy(asc(customField.displayOrder), asc(customField.createdAt))
}

export async function createCustomField(
  portalId: string,
  input: CreateCustomFieldDTO,
): Promise<CustomFieldRow> {
  // Check for duplicate key in same portal+entityType
  const [existing] = await db
    .select({ id: customField.id })
    .from(customField)
    .where(
      and(
        eq(customField.portalId, portalId),
        eq(customField.entityType, input.entityType),
        eq(customField.key, input.key),
        eq(customField.archived, false),
      ),
    )
    .limit(1)

  if (existing) {
    throw Errors.badRequest(
      `Ya existe un campo con la clave "${input.key}" para la entidad ${input.entityType}`,
    )
  }

  try {
    const [row] = await db
      .insert(customField)
      .values({
        portalId,
        entityType: input.entityType,
        key: input.key,
        label: input.label,
        fieldType: input.fieldType,
        options: input.options ?? null,
        displayOrder: input.displayOrder ?? 0,
      })
      .returning()

    if (!row) throw Errors.internal('No se pudo crear el campo personalizado')
    return row
  } catch (err: unknown) {
    // Catch DB-level unique constraint violation as fallback
    if (err instanceof Error && err.message.includes('custom_field_portal_entity_key_unique')) {
      throw Errors.badRequest(
        `Ya existe un campo con la clave "${input.key}" para la entidad ${input.entityType}`,
      )
    }
    throw err
  }
}

export async function updateCustomField(
  portalId: string,
  id: string,
  input: UpdateCustomFieldDTO,
): Promise<CustomFieldRow> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: customField.id })
      .from(customField)
      .where(
        and(
          eq(customField.id, id),
          eq(customField.portalId, portalId),
          eq(customField.archived, false),
        ),
      )
      .limit(1)

    if (!existing) throw Errors.notFound('Campo personalizado no encontrado')

    const [updated] = await tx
      .update(customField)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(customField.id, id))
      .returning()

    if (!updated) throw Errors.internal('No se pudo actualizar el campo personalizado')
    return updated
  })
}

export async function archiveCustomField(portalId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: customField.id })
      .from(customField)
      .where(
        and(
          eq(customField.id, id),
          eq(customField.portalId, portalId),
          eq(customField.archived, false),
        ),
      )
      .limit(1)

    if (!row) throw Errors.notFound('Campo personalizado no encontrado')

    await tx
      .update(customField)
      .set({ archived: true, archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(customField.id, id))
  })
}

// Re-export row type so router can reference it without re-importing drizzle
export type { CustomFieldRow }
