import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { meetingType, portal } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { computeSlots, toInviteeDisplay } from './slots.service'
import { toEventTypeConfig, getSchedulesForMeetingType, getBusyBookings } from './availability-engine'

// ── Funciones públicas (sin autenticación hub_user) ───────────────────────────

/**
 * Devuelve la metadata pública de un event type (meeting_type) activo.
 *
 * Los event types con secret=true responden igualmente — el invitado llega
 * por URL directa, no por listado público. Si el event type no existe o está
 * inactivo → 404.
 *
 * @param portalId  ID del portal que contiene el event type
 * @param eventSlug Slug del event type
 */
/**
 * Resuelve el segmento de portal de una URL pública de reservas a su `portal.id`.
 *
 * Acepta las DOS formas a propósito:
 *  - el `slug` legible (`/book/synous/...`) — la forma nueva y la que se le
 *    manda a un lead;
 *  - el `id` crudo (`/book/clx7a.../...`) — porque los links que ya salieron
 *    llevan el cuid y romperlos sería peor que la URL fea.
 *
 * Busca primero por slug: es el caso esperado, y un slug jamás va a coincidir
 * con un id (los ids son cuids, no strings elegidos por una persona).
 */
export async function resolvePortalRef(ref: string): Promise<string> {
  const [bySlug] = await db.select({ id: portal.id }).from(portal).where(eq(portal.slug, ref)).limit(1)
  if (bySlug) return bySlug.id

  const [byId] = await db.select({ id: portal.id }).from(portal).where(eq(portal.id, ref)).limit(1)
  if (byId) return byId.id

  throw Errors.notFound('Portal no encontrado')
}

export async function getPublicEventType(portalRef: string, eventSlug: string) {
  const portalId = await resolvePortalRef(portalRef)
  const [mt] = await db
    .select()
    .from(meetingType)
    .where(
      and(
        eq(meetingType.portalId, portalId),
        eq(meetingType.slug, eventSlug),
        eq(meetingType.isActive, true),
      ),
    )
    .limit(1)

  if (!mt) throw Errors.notFound('Tipo de reunión no encontrado o inactivo')

  // Devolver solo los campos públicos necesarios para renderizar la página de booking.
  // No se expone ownerId ni availability_schedule_id (datos internos del portal).
  return {
    id: mt.id,
    slug: mt.slug,
    name: mt.name,
    description: mt.description,
    durationMin: mt.durationMin,
    locations: mt.locations,
    customQuestions: mt.customQuestions,
    color: mt.color,
    kind: mt.kind,
    maxInvitees: mt.maxInvitees,
  }
}

/**
 * Calcula y devuelve los slots disponibles para un event type en un rango de fechas.
 *
 * Flujo:
 *  1. Carga el meeting_type y valida que está activo.
 *  2. Carga el schedule de disponibilidad del owner (o de los hosts si es grupal).
 *  3. Carga los bookings confirmados actuales para excluirlos como ocupados.
 *  4. Delega el cálculo al motor puro `computeSlots` (sin efectos secundarios).
 *
 * @param portalId   ID del portal
 * @param eventSlug  Slug del event type
 * @param from       Fecha de inicio 'YYYY-MM-DD'
 * @param to         Fecha de fin 'YYYY-MM-DD'
 * @param tz         Zona horaria IANA del invitado (para display)
 */
export async function getPublicSlots(
  portalRef: string,
  eventSlug: string,
  from: string,
  to: string,
  tz: string,
) {
  const portalId = await resolvePortalRef(portalRef)
  // Verificar que el event type existe y está activo
  const [mt] = await db
    .select()
    .from(meetingType)
    .where(
      and(
        eq(meetingType.portalId, portalId),
        eq(meetingType.slug, eventSlug),
        eq(meetingType.isActive, true),
      ),
    )
    .limit(1)

  if (!mt) throw Errors.notFound('Tipo de reunión no encontrado o inactivo')

  // Cargar schedules de todos los hosts relevantes (solo u group)
  const { schedules, hostIds } = await getSchedulesForMeetingType(mt)
  if (schedules.length === 0) {
    // Sin hosts/schedule configurado → sin slots disponibles
    return []
  }

  // Bookings confirmados que bloquean tiempo: por host (owner o co-host de un grupal), no
  // por meeting_type, para que los slots mostrados coincidan con lo que la reserva acepta.
  const existingBookings = await getBusyBookings(hostIds)

  // Delegar el cálculo al motor puro de slots
  const slots = computeSlots({
    eventType: toEventTypeConfig(mt),
    schedules,
    existingBookings,
    fromDate: from,
    toDate: to,
    inviteeTimezone: tz,
    now: new Date(),
  })

  // Enriquecer cada slot con el display en la TZ del invitado
  return slots.map((s) => ({
    startUtc: s.startUtc,
    endUtc: s.endUtc,
    startLocal: toInviteeDisplay(s.startUtc, tz, 'yyyy-MM-dd HH:mm'),
  }))
}
