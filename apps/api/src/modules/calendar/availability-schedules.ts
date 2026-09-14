import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '../../db'
import { availabilitySchedule, availabilityInterval, dateOverride } from '../../db/schema'
import { Errors } from '../../lib/errors'
import type {
  CreateScheduleDTO,
  UpdateScheduleDTO,
  CreateIntervalDTO,
  ReplaceIntervalsDTO,
  DateOverrideInputDTO,
} from './calendar.schema'

// ── Admin V2: Availability Schedules ───────────────────────────────────────────

/**
 * Lista todos los schedules de disponibilidad de un portal con sus intervalos y overrides.
 * El frontend espera objetos AvailabilitySchedule con arrays embebidos.
 */
export async function listSchedules(portalId: string) {
  // Obtener todos los schedules del portal
  const schedules = await db
    .select()
    .from(availabilitySchedule)
    .where(eq(availabilitySchedule.portalId, portalId))
    .orderBy(asc(availabilitySchedule.name))

  if (schedules.length === 0) return []

  const scheduleIds = schedules.map((s) => s.id)

  // Cargar intervalos y overrides de todos los schedules en 2 queries (no N+1)
  const [intervals, overrides] = await Promise.all([
    db
      .select()
      .from(availabilityInterval)
      .where(inArray(availabilityInterval.scheduleId, scheduleIds))
      .orderBy(asc(availabilityInterval.dayOfWeek), asc(availabilityInterval.startTime)),
    db
      .select()
      .from(dateOverride)
      .where(inArray(dateOverride.scheduleId, scheduleIds)),
  ])

  // Agrupar por scheduleId
  return schedules.map((s) => ({
    ...s,
    intervals: intervals.filter((i) => i.scheduleId === s.id),
    dateOverrides: overrides.filter((o) => o.scheduleId === s.id),
  }))
}

/**
 * Obtiene un schedule específico del portal con sus intervalos y overrides.
 * Lanza 404 si no existe o no pertenece al portal.
 */
export async function getSchedule(portalId: string, scheduleId: string) {
  const [schedule] = await db
    .select()
    .from(availabilitySchedule)
    .where(and(eq(availabilitySchedule.id, scheduleId), eq(availabilitySchedule.portalId, portalId)))
    .limit(1)

  if (!schedule) throw Errors.notFound('Schedule no encontrado')

  const [intervals, overrides] = await Promise.all([
    db
      .select()
      .from(availabilityInterval)
      .where(eq(availabilityInterval.scheduleId, scheduleId))
      .orderBy(asc(availabilityInterval.dayOfWeek), asc(availabilityInterval.startTime)),
    db
      .select()
      .from(dateOverride)
      .where(eq(dateOverride.scheduleId, scheduleId)),
  ])

  return { ...schedule, intervals, dateOverrides: overrides }
}

/**
 * Crea un nuevo schedule de disponibilidad.
 * Si es el primero del owner, o si isDefault=true, lo marca como default
 * y desactiva el default anterior (en transacción).
 */
export async function createSchedule(portalId: string, ownerId: string, input: CreateScheduleDTO) {
  return db.transaction(async (tx) => {
    // Verificar si ya existe algún schedule del owner
    const existing = await tx
      .select({ id: availabilitySchedule.id })
      .from(availabilitySchedule)
      .where(
        and(eq(availabilitySchedule.portalId, portalId), eq(availabilitySchedule.ownerId, ownerId)),
      )

    // Es default si se pide explícitamente, o si no hay ningún schedule del owner todavía
    const makeDefault = input.isDefault === true || existing.length === 0

    if (makeDefault && existing.length > 0) {
      // Desactivar el default anterior del owner
      await tx
        .update(availabilitySchedule)
        .set({ isDefault: false })
        .where(
          and(
            eq(availabilitySchedule.portalId, portalId),
            eq(availabilitySchedule.ownerId, ownerId),
          ),
        )
    }

    const [row] = await tx
      .insert(availabilitySchedule)
      .values({ portalId, ownerId, name: input.name, timeZone: input.timeZone, isDefault: makeDefault })
      .returning()

    if (!row) throw Errors.internal('No se pudo crear el schedule')
    return { ...row, intervals: [], dateOverrides: [] }
  })
}

/**
 * Actualiza nombre, timezone o isDefault de un schedule.
 * Si isDefault=true, desactiva el default anterior del owner en transacción.
 * Verifica que el schedule pertenece al portal antes de modificar.
 */
export async function updateSchedule(portalId: string, scheduleId: string, input: UpdateScheduleDTO) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(availabilitySchedule)
      .where(and(eq(availabilitySchedule.id, scheduleId), eq(availabilitySchedule.portalId, portalId)))
      .limit(1)

    if (!existing) throw Errors.notFound('Schedule no encontrado')

    // Si se está marcando como default, desactivar el anterior del mismo owner
    if (input.isDefault === true && !existing.isDefault) {
      await tx
        .update(availabilitySchedule)
        .set({ isDefault: false })
        .where(
          and(
            eq(availabilitySchedule.portalId, portalId),
            eq(availabilitySchedule.ownerId, existing.ownerId),
          ),
        )
    }

    const updateData: Partial<typeof availabilitySchedule.$inferInsert> = {}
    if (input.name !== undefined) updateData.name = input.name
    if (input.timeZone !== undefined) updateData.timeZone = input.timeZone
    if (input.isDefault !== undefined) updateData.isDefault = input.isDefault

    const [updated] = await tx
      .update(availabilitySchedule)
      .set(updateData)
      .where(eq(availabilitySchedule.id, scheduleId))
      .returning()

    if (!updated) throw Errors.internal('No se pudo actualizar el schedule')

    // Devolver con arrays embebidos
    const [intervals, overrides] = await Promise.all([
      tx
        .select()
        .from(availabilityInterval)
        .where(eq(availabilityInterval.scheduleId, scheduleId))
        .orderBy(asc(availabilityInterval.dayOfWeek), asc(availabilityInterval.startTime)),
      tx.select().from(dateOverride).where(eq(dateOverride.scheduleId, scheduleId)),
    ])

    return { ...updated, intervals, dateOverrides: overrides }
  })
}

/**
 * Elimina un schedule del portal.
 * Los intervalos y overrides se eliminan por CASCADE (onDelete: 'cascade' en el schema).
 */
export async function deleteSchedule(portalId: string, scheduleId: string): Promise<void> {
  const res = await db
    .delete(availabilitySchedule)
    .where(and(eq(availabilitySchedule.id, scheduleId), eq(availabilitySchedule.portalId, portalId)))
    .returning({ id: availabilitySchedule.id })

  if (res.length === 0) throw Errors.notFound('Schedule no encontrado')
}

/**
 * Verifica que un schedule pertenece al portal.
 * Util helper interno para validar permisos antes de tocar hijos del schedule.
 */
async function assertScheduleOwnership(portalId: string, scheduleId: string): Promise<void> {
  const [s] = await db
    .select({ id: availabilitySchedule.id })
    .from(availabilitySchedule)
    .where(and(eq(availabilitySchedule.id, scheduleId), eq(availabilitySchedule.portalId, portalId)))
    .limit(1)

  if (!s) throw Errors.notFound('Schedule no encontrado')
}

/**
 * Agrega un intervalo semanal a un schedule.
 * Valida que endTime > startTime y que el schedule pertenece al portal.
 */
export async function addScheduleInterval(
  portalId: string,
  scheduleId: string,
  input: CreateIntervalDTO,
) {
  // Verificar que el schedule pertenece al portal
  await assertScheduleOwnership(portalId, scheduleId)

  // Validar que endTime > startTime (la DB también lo enforce vía CHECK)
  if (input.endTime <= input.startTime) {
    throw Errors.badRequest('La hora de fin debe ser posterior a la de inicio')
  }

  const [row] = await db
    .insert(availabilityInterval)
    .values({
      scheduleId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
    })
    .returning()

  if (!row) throw Errors.internal('No se pudo agregar el intervalo')
  return row
}

/**
 * Reemplaza ATÓMICAMENTE todos los intervalos de un schedule.
 * En una sola transacción: borra todos los existentes e inserta los nuevos.
 * Útil para el guardado masivo del editor de horario semanal.
 */
export async function replaceScheduleIntervals(
  portalId: string,
  scheduleId: string,
  input: ReplaceIntervalsDTO,
) {
  await assertScheduleOwnership(portalId, scheduleId)

  // Validar cada intervalo antes de tocar la DB
  for (const interval of input.intervals) {
    if (interval.endTime <= interval.startTime) {
      throw Errors.badRequest(
        `Intervalo del día ${interval.dayOfWeek}: la hora de fin debe ser posterior a la de inicio`,
      )
    }
  }

  return db.transaction(async (tx) => {
    // Borrar todos los intervalos existentes del schedule
    await tx
      .delete(availabilityInterval)
      .where(eq(availabilityInterval.scheduleId, scheduleId))

    if (input.intervals.length === 0) return []

    // Insertar los nuevos intervalos
    const rows = await tx
      .insert(availabilityInterval)
      .values(
        input.intervals.map((i) => ({
          scheduleId,
          dayOfWeek: i.dayOfWeek,
          startTime: i.startTime,
          endTime: i.endTime,
        })),
      )
      .returning()

    return rows
  })
}

/**
 * Elimina un intervalo individual de un schedule.
 * Verifica que el schedule pertenece al portal y que el intervalo existe.
 */
export async function deleteScheduleInterval(
  portalId: string,
  scheduleId: string,
  intervalId: string,
): Promise<void> {
  await assertScheduleOwnership(portalId, scheduleId)

  const res = await db
    .delete(availabilityInterval)
    .where(
      and(eq(availabilityInterval.id, intervalId), eq(availabilityInterval.scheduleId, scheduleId)),
    )
    .returning({ id: availabilityInterval.id })

  if (res.length === 0) throw Errors.notFound('Intervalo no encontrado')
}

/**
 * Upsert de un date override para una fecha específica de un schedule.
 * intervals=[] significa que el día está bloqueado.
 * La constraint unique(scheduleId, date) garantiza que solo existe uno por fecha.
 */
export async function upsertDateOverride(
  portalId: string,
  scheduleId: string,
  input: DateOverrideInputDTO,
) {
  await assertScheduleOwnership(portalId, scheduleId)

  // Buscar si ya existe un override para esa fecha en el schedule
  const [existing] = await db
    .select()
    .from(dateOverride)
    .where(and(eq(dateOverride.scheduleId, scheduleId), eq(dateOverride.date, input.date)))
    .limit(1)

  if (existing) {
    // Actualizar el override existente
    const [updated] = await db
      .update(dateOverride)
      .set({ intervals: input.intervals })
      .where(eq(dateOverride.id, existing.id))
      .returning()

    return updated!
  }

  // Crear un nuevo override
  const [row] = await db
    .insert(dateOverride)
    .values({ scheduleId, date: input.date, intervals: input.intervals })
    .returning()

  if (!row) throw Errors.internal('No se pudo crear el override')
  return row
}

/**
 * Elimina un date override de un schedule.
 * Verifica que el schedule pertenece al portal y que el override existe.
 */
export async function deleteDateOverride(
  portalId: string,
  scheduleId: string,
  overrideId: string,
): Promise<void> {
  await assertScheduleOwnership(portalId, scheduleId)

  const res = await db
    .delete(dateOverride)
    .where(and(eq(dateOverride.id, overrideId), eq(dateOverride.scheduleId, scheduleId)))
    .returning({ id: dateOverride.id })

  if (res.length === 0) throw Errors.notFound('Override no encontrado')
}
