import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '../../db'
import { meetingType, availabilitySchedule, eventMembership } from '../../db/schema'
import { Errors } from '../../lib/errors'
import type { Tx } from '../../lib/audit'
import { assertHubUsersInPortal } from '../../lib/portal-access'
import { slugify } from '../../lib/slug'
import type { CreateEventTypeV2DTO, UpdateEventTypeV2DTO } from './calendar.schema'

// ── Admin V2: Event Types (meetingType completo) ────────────────────────────────

/**
 * Mapea una fila de meetingType + hostIds al shape EventTypeV2 que espera el frontend.
 */
function toEventTypeV2(mt: typeof meetingType.$inferSelect, hosts: string[]) {
  return {
    id: mt.id,
    portalId: mt.portalId,
    ownerId: mt.ownerId,
    slug: mt.slug,
    name: mt.name,
    durationMin: mt.durationMin,
    kind: mt.kind,
    poolingType: mt.poolingType,
    color: mt.color,
    secret: mt.secret,
    description: mt.description,
    isActive: mt.isActive,
    locations: mt.locations,
    customQuestions: mt.customQuestions,
    startTimeIncrementMin: mt.startTimeIncrementMin,
    minBookingNoticeMin: mt.minBookingNoticeMin,
    bookingWindowType: mt.bookingWindowType,
    bookingWindowDays: mt.bookingWindowDays,
    bookingWindowStart: mt.bookingWindowStart,
    bookingWindowEnd: mt.bookingWindowEnd,
    bufferBeforeMin: mt.bufferBeforeMin,
    bufferAfterMin: mt.bufferAfterMin,
    dailyLimit: mt.dailyLimit,
    maxInvitees: mt.maxInvitees,
    availabilityScheduleId: mt.availabilityScheduleId,
    hosts,
  }
}

/**
 * Lista todos los event types del portal (activos e inactivos) con sus hosts.
 */
export async function listEventTypesV2(portalId: string) {
  const types = await db
    .select()
    .from(meetingType)
    .where(eq(meetingType.portalId, portalId))
    .orderBy(asc(meetingType.name))

  if (types.length === 0) return []

  const typeIds = types.map((t) => t.id)

  // Cargar memberships en un solo query (evitar N+1)
  const memberships = await db
    .select({ meetingTypeId: eventMembership.meetingTypeId, hostId: eventMembership.hostId })
    .from(eventMembership)
    .where(inArray(eventMembership.meetingTypeId, typeIds))

  return types.map((t) => {
    const hosts = memberships.filter((m) => m.meetingTypeId === t.id).map((m) => m.hostId)
    return toEventTypeV2(t, hosts)
  })
}

/**
 * Obtiene un event type del portal por ID con sus hosts.
 * Lanza 404 si no existe o no pertenece al portal.
 */
export async function getEventTypeV2(portalId: string, id: string) {
  const [mt] = await db
    .select()
    .from(meetingType)
    .where(and(eq(meetingType.id, id), eq(meetingType.portalId, portalId)))
    .limit(1)

  if (!mt) throw Errors.notFound('Event type no encontrado')

  const memberships = await db
    .select({ hostId: eventMembership.hostId })
    .from(eventMembership)
    .where(eq(eventMembership.meetingTypeId, id))

  return toEventTypeV2(mt, memberships.map((m) => m.hostId))
}

/**
 * `hostIds` y `availabilityScheduleId` llegan en el body. Sin validarlos contra el
 * portal, un event type podía apuntar al schedule o a los hosts de otro tenant y
 * la página pública de reservas exponía la ocupación de esa agenda ajena.
 */
async function assertEventTypeRefsInPortal(
  tx: Tx,
  portalId: string,
  input: { hostIds?: string[]; availabilityScheduleId?: string | null },
): Promise<void> {
  await assertHubUsersInPortal(portalId, input.hostIds ?? [], tx)
  if (!input.availabilityScheduleId) return
  const [schedule] = await tx
    .select({ id: availabilitySchedule.id })
    .from(availabilitySchedule)
    .where(and(eq(availabilitySchedule.id, input.availabilityScheduleId), eq(availabilitySchedule.portalId, portalId)))
    .limit(1)
  if (!schedule) throw Errors.badRequest('Schedule inexistente')
}

/**
 * Crea un event type V2 con todos los campos.
 * Para kind='group' inserta también las event_membership (hostIds) en transacción.
 */
export async function createEventTypeV2(
  portalId: string,
  ownerId: string,
  input: CreateEventTypeV2DTO,
) {
  return db.transaction(async (tx) => {
    await assertEventTypeRefsInPortal(tx, portalId, input)
    const [row] = await tx
      .insert(meetingType)
      .values({
        portalId,
        ownerId,
        slug: input.slug ? slugify(input.slug) : slugify(input.name),
        name: input.name,
        durationMin: input.durationMin,
        kind: input.kind ?? 'solo',
        poolingType: input.poolingType ?? null,
        color: input.color ?? '#3b82f6',
        secret: input.secret ?? false,
        description: input.description ?? null,
        isActive: input.isActive ?? true,
        locations: input.locations ?? [],
        customQuestions: input.customQuestions ?? [],
        startTimeIncrementMin: input.startTimeIncrementMin ?? 30,
        minBookingNoticeMin: input.minBookingNoticeMin ?? 240,
        bookingWindowType: input.bookingWindowType ?? 'rolling',
        bookingWindowDays: input.bookingWindowDays ?? null,
        bookingWindowStart: input.bookingWindowStart ?? null,
        bookingWindowEnd: input.bookingWindowEnd ?? null,
        bufferBeforeMin: input.bufferBeforeMin ?? 0,
        bufferAfterMin: input.bufferAfterMin ?? 0,
        dailyLimit: input.dailyLimit ?? null,
        maxInvitees: input.maxInvitees ?? 1,
        availabilityScheduleId: input.availabilityScheduleId ?? null,
        // bufferMin se mantiene para compatibilidad con el schema legacy
        bufferMin: 0,
      })
      .returning()

    if (!row) throw Errors.internal('No se pudo crear el event type')

    // Para meetings grupales, insertar las memberships
    const hostIds = input.hostIds ?? []
    if (hostIds.length > 0) {
      await tx
        .insert(eventMembership)
        .values(hostIds.map((hostId) => ({ meetingTypeId: row.id, hostId })))
    }

    return toEventTypeV2(row, hostIds)
  })
}

/**
 * Actualiza parcialmente un event type V2.
 * Si vienen hostIds y el kind es group, reemplaza las memberships en transacción.
 */
export async function updateEventTypeV2(
  portalId: string,
  id: string,
  input: UpdateEventTypeV2DTO,
) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(meetingType)
      .where(and(eq(meetingType.id, id), eq(meetingType.portalId, portalId)))
      .limit(1)

    if (!existing) throw Errors.notFound('Event type no encontrado')
    await assertEventTypeRefsInPortal(tx, portalId, input)

    // Construir el objeto de actualización solo con los campos presentes
    const updateData: Partial<typeof meetingType.$inferInsert> = {}
    if (input.name !== undefined) updateData.name = input.name
    if (input.slug !== undefined) updateData.slug = slugify(input.slug)
    if (input.durationMin !== undefined) updateData.durationMin = input.durationMin
    if (input.kind !== undefined) updateData.kind = input.kind
    if (input.poolingType !== undefined) updateData.poolingType = input.poolingType ?? null
    if (input.color !== undefined) updateData.color = input.color
    if (input.secret !== undefined) updateData.secret = input.secret
    if (input.description !== undefined) updateData.description = input.description
    if (input.isActive !== undefined) updateData.isActive = input.isActive
    if (input.locations !== undefined) updateData.locations = input.locations
    if (input.customQuestions !== undefined) updateData.customQuestions = input.customQuestions
    if (input.startTimeIncrementMin !== undefined) updateData.startTimeIncrementMin = input.startTimeIncrementMin
    if (input.minBookingNoticeMin !== undefined) updateData.minBookingNoticeMin = input.minBookingNoticeMin
    if (input.bookingWindowType !== undefined) updateData.bookingWindowType = input.bookingWindowType
    if (input.bookingWindowDays !== undefined) updateData.bookingWindowDays = input.bookingWindowDays
    if (input.bookingWindowStart !== undefined) updateData.bookingWindowStart = input.bookingWindowStart
    if (input.bookingWindowEnd !== undefined) updateData.bookingWindowEnd = input.bookingWindowEnd
    if (input.bufferBeforeMin !== undefined) updateData.bufferBeforeMin = input.bufferBeforeMin
    if (input.bufferAfterMin !== undefined) updateData.bufferAfterMin = input.bufferAfterMin
    if (input.dailyLimit !== undefined) updateData.dailyLimit = input.dailyLimit
    if (input.maxInvitees !== undefined) updateData.maxInvitees = input.maxInvitees
    if (input.availabilityScheduleId !== undefined) updateData.availabilityScheduleId = input.availabilityScheduleId

    const [updated] = await tx
      .update(meetingType)
      .set(updateData)
      .where(eq(meetingType.id, id))
      .returning()

    if (!updated) throw Errors.internal('No se pudo actualizar el event type')

    // Si vienen hostIds, reemplazar las memberships en la misma transacción
    let hostIds: string[]
    if (input.hostIds !== undefined) {
      await tx.delete(eventMembership).where(eq(eventMembership.meetingTypeId, id))

      if (input.hostIds.length > 0) {
        await tx
          .insert(eventMembership)
          .values(input.hostIds.map((hostId) => ({ meetingTypeId: id, hostId })))
      }

      hostIds = input.hostIds
    } else {
      // Mantener los hosts actuales
      const memberships = await tx
        .select({ hostId: eventMembership.hostId })
        .from(eventMembership)
        .where(eq(eventMembership.meetingTypeId, id))

      hostIds = memberships.map((m) => m.hostId)
    }

    return toEventTypeV2(updated, hostIds)
  })
}

/**
 * Elimina un event type del portal.
 * Lanza 404 si no existe o no pertenece al portal.
 */
export async function deleteEventTypeV2(portalId: string, id: string): Promise<void> {
  const res = await db
    .delete(meetingType)
    .where(and(eq(meetingType.id, id), eq(meetingType.portalId, portalId)))
    .returning({ id: meetingType.id })

  if (res.length === 0) throw Errors.notFound('Event type no encontrado')
}
