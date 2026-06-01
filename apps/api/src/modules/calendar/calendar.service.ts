import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { meetingType, availabilityRule, booking } from '../../db/schema'
import { Errors } from '../../lib/errors'
import type { CreateMeetingTypeDTO, UpdateMeetingTypeDTO, CreateAvailabilityRuleDTO } from './calendar.schema'

type MeetingTypeRow = typeof meetingType.$inferSelect
type AvailabilityRow = typeof availabilityRule.$inferSelect

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ── Tipos de reunión ───────────────────────────────────
export async function listMeetingTypes(portalId: string): Promise<MeetingTypeRow[]> {
  return db.select().from(meetingType).where(eq(meetingType.portalId, portalId)).orderBy(asc(meetingType.name))
}

export async function createMeetingType(portalId: string, ownerId: string, input: CreateMeetingTypeDTO): Promise<MeetingTypeRow> {
  const [row] = await db
    .insert(meetingType)
    .values({
      portalId,
      ownerId,
      slug: input.slug ? slugify(input.slug) : slugify(input.name),
      name: input.name,
      durationMin: input.durationMin,
      bufferMin: input.bufferMin ?? 10,
      location: input.location,
      description: input.description,
      isActive: input.isActive ?? true,
    })
    .returning()
  if (!row) throw Errors.internal('No se pudo crear el tipo de reunión')
  return row
}

export async function updateMeetingType(portalId: string, id: string, input: UpdateMeetingTypeDTO): Promise<MeetingTypeRow> {
  const [existing] = await db
    .select()
    .from(meetingType)
    .where(and(eq(meetingType.portalId, portalId), eq(meetingType.id, id)))
    .limit(1)
  if (!existing) throw Errors.notFound('Tipo de reunión no encontrado')
  const [row] = await db
    .update(meetingType)
    .set({ ...input, slug: input.slug ? slugify(input.slug) : undefined })
    .where(eq(meetingType.id, id))
    .returning()
  return row!
}

export async function deleteMeetingType(portalId: string, id: string): Promise<void> {
  const res = await db
    .delete(meetingType)
    .where(and(eq(meetingType.portalId, portalId), eq(meetingType.id, id)))
    .returning({ id: meetingType.id })
  if (res.length === 0) throw Errors.notFound('Tipo de reunión no encontrado')
}

// ── Disponibilidad (por usuario) ───────────────────────
export async function listAvailabilityRules(ownerId: string): Promise<AvailabilityRow[]> {
  return db
    .select()
    .from(availabilityRule)
    .where(eq(availabilityRule.ownerId, ownerId))
    .orderBy(asc(availabilityRule.dayOfWeek), asc(availabilityRule.startTime))
}

export async function createAvailabilityRule(ownerId: string, input: CreateAvailabilityRuleDTO): Promise<AvailabilityRow> {
  if (input.endTime <= input.startTime) throw Errors.badRequest('La hora de fin debe ser posterior a la de inicio')
  const [row] = await db
    .insert(availabilityRule)
    .values({
      ownerId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      timeZone: input.timeZone ?? 'America/Bogota',
    })
    .returning()
  if (!row) throw Errors.internal('No se pudo crear la regla')
  return row
}

export async function deleteAvailabilityRule(ownerId: string, id: string): Promise<void> {
  const res = await db
    .delete(availabilityRule)
    .where(and(eq(availabilityRule.ownerId, ownerId), eq(availabilityRule.id, id)))
    .returning({ id: availabilityRule.id })
  if (res.length === 0) throw Errors.notFound('Regla no encontrada')
}

// ── Bookings (reuniones agendadas) ─────────────────────
export async function listBookings(portalId: string) {
  return db
    .select({
      id: booking.id,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      status: booking.status,
      meetLink: booking.meetLink,
      meetingTypeName: meetingType.name,
    })
    .from(booking)
    .innerJoin(meetingType, eq(booking.meetingTypeId, meetingType.id))
    .where(eq(meetingType.portalId, portalId))
    .orderBy(asc(booking.startsAt))
    .limit(100)
}
