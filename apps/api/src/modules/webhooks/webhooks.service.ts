/**
 * webhooks.service.ts
 *
 * Lógica de negocio para webhooks externos (Fathom, etc.).
 *
 * Decisión de portal (MVP):
 *   Fathom no envía ningún identificador de portal en su payload.
 *   En esta instalación single-tenant se resuelve el portal tomando el primero
 *   disponible en la base de datos (1 portal = 1 agencia).
 *   Para multi-tenant futuro: rotatar un secret por portal y derivar portalId
 *   del header o del path de la ruta.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { eq, and } from 'drizzle-orm'
import { db } from '../../db'
import { meeting, contact, deal, portal } from '../../db/schema'
import { env } from '../../config/env'
import { createNotification } from '../notifications/notifications.service'

// ── HMAC ─────────────────────────────────────────────────────────────────────

/**
 * Verifica la firma HMAC-SHA256 del body crudo contra FATHOM_WEBHOOK_SECRET.
 *
 * Seguridad:
 *  - Usa `timingSafeEqual` para evitar timing-attacks.
 *  - Si el secret NO está configurado → siempre devuelve false (401 en el router).
 *  - NUNCA loguear el secret, la firma recibida ni el payload.
 */
export function verifyFathomSignature(
  rawBody: string | Buffer,
  signature: string | undefined,
): boolean {
  if (!env.FATHOM_WEBHOOK_SECRET || !signature) return false

  const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')
  const expected = createHmac('sha256', env.FATHOM_WEBHOOK_SECRET)
    .update(bodyStr)
    .digest('hex')

  // Fastify da strings; normalizar ambos a Buffer de igual longitud
  try {
    const expectedBuf = Buffer.from(expected, 'hex')
    // El header puede venir como "sha256=<hex>" o directamente como "<hex>"
    const sigHex = signature.startsWith('sha256=') ? signature.slice(7) : signature
    const sigBuf = Buffer.from(sigHex, 'hex')
    if (expectedBuf.length !== sigBuf.length) return false
    return timingSafeEqual(expectedBuf, sigBuf)
  } catch {
    return false
  }
}

// ── Fathom payload type ───────────────────────────────────────────────────────

export interface FathomParticipant {
  email?: string
  name?: string
}

export interface FathomMeetingPayload {
  /** Título de la reunión (requerido para insertar en meeting.title) */
  title?: string
  /** ISO-8601 */
  starts_at?: string
  ends_at?: string
  /** Texto libre del resumen */
  summary?: string
  /** URL de la transcripción */
  transcript_url?: string
  /** Ítems de acción (array abierto) */
  action_items?: unknown[]
  /** Participantes */
  participants?: FathomParticipant[]
}

// ── Portal resolver ───────────────────────────────────────────────────────────

async function resolvePortalId(): Promise<string | null> {
  const [row] = await db.select({ id: portal.id }).from(portal).limit(1)
  return row?.id ?? null
}

// ── Contact + deal resolver ───────────────────────────────────────────────────

/**
 * Busca un contacto por email dentro del portal.
 * Devuelve null si no se encuentra.
 */
async function findContactByEmail(
  portalId: string,
  email: string,
): Promise<{ id: string; primaryDealId: string | null } | null> {
  const [row] = await db
    .select({ id: contact.id })
    .from(contact)
    .where(and(eq(contact.portalId, portalId), eq(contact.email, email)))
    .limit(1)
  if (!row) return null

  // Buscar el deal más reciente donde este contacto sea primaryContactId
  const [dealRow] = await db
    .select({ id: deal.id })
    .from(deal)
    .where(
      and(
        eq(deal.portalId, portalId),
        eq(deal.primaryContactId, row.id),
        eq(deal.archived, false),
      ),
    )
    .limit(1)

  return { id: row.id, primaryDealId: dealRow?.id ?? null }
}

// ── handleFathomMeeting ───────────────────────────────────────────────────────

/**
 * Procesa el payload de Fathom y enriquece/crea una `meeting` con datos de IA.
 *
 * Idempotencia:
 *   Si ya existe una fila con el mismo fathomTranscriptUrl, la actualizamos en
 *   lugar de insertar un duplicado.
 *   Si el payload no trae transcript_url no hay forma de deduplicar — se inserta
 *   una fila nueva (comportamiento conservador; un operador puede limpiar
 *   manualmente si Fathom re-entrega sin transcript_url).
 */
export async function handleFathomMeeting(
  portalId: string,
  payload: FathomMeetingPayload,
): Promise<void> {
  const title = payload.title ?? 'Reunión (Fathom)'
  const startsAt = payload.starts_at ? new Date(payload.starts_at) : null
  const endsAt = payload.ends_at ? new Date(payload.ends_at) : null
  const fathomSummary = payload.summary ?? null
  const fathomTranscriptUrl = payload.transcript_url ?? null
  const fathomActionItems = payload.action_items ? (payload.action_items as unknown[]) : null
  const fathomParticipants = payload.participants ? (payload.participants as unknown[]) : null

  // ── Resolución de contacto/deal ───────────────────────────────────────────
  let contactId: string | null = null
  let dealId: string | null = null

  if (payload.participants && payload.participants.length > 0) {
    for (const p of payload.participants) {
      if (!p.email) continue
      const found = await findContactByEmail(portalId, p.email)
      if (found) {
        contactId = found.id
        dealId = found.primaryDealId
        break // primer match gana
      }
    }
  }

  // ── Deduplicación por transcript_url ─────────────────────────────────────
  if (fathomTranscriptUrl) {
    const [existing] = await db
      .select({ id: meeting.id })
      .from(meeting)
      .where(
        and(
          eq(meeting.portalId, portalId),
          eq(meeting.fathomTranscriptUrl, fathomTranscriptUrl),
        ),
      )
      .limit(1)

    if (existing) {
      await db
        .update(meeting)
        .set({
          title,
          startsAt: startsAt ?? undefined,
          endsAt: endsAt ?? undefined,
          fathomSummary,
          fathomActionItems,
          fathomParticipants,
          contactId: contactId ?? undefined,
          dealId: dealId ?? undefined,
        })
        .where(eq(meeting.id, existing.id))
      return
    }
  }

  // ── Insert nuevo ─────────────────────────────────────────────────────────
  const [newMeeting] = await db
    .insert(meeting)
    .values({
      portalId,
      title,
      startsAt: startsAt ?? undefined,
      endsAt: endsAt ?? undefined,
      fathomSummary,
      fathomTranscriptUrl,
      fathomActionItems,
      fathomParticipants,
      contactId: contactId ?? undefined,
      dealId: dealId ?? undefined,
    })
    .returning({ id: meeting.id })

  // ── Notificación si matcheó un contacto/deal ──────────────────────────────
  if (contactId && newMeeting) {
    await createNotification({
      portalId,
      type: 'meeting_recorded',
      title: `Reunión grabada: ${title}`,
      entityType: dealId ? 'deal' : 'contact',
      entityId: dealId ?? contactId,
    })
  }
}

// ── handleFathomWebhook ───────────────────────────────────────────────────────

/**
 * Entry point del router.
 * Resuelve el portal (MVP: único portal) y despacha al handler correcto.
 */
export async function handleFathomWebhook(payload: FathomMeetingPayload): Promise<void> {
  const portalId = await resolvePortalId()
  if (portalId == null) return // sin portal configurado, ignorar silenciosamente
  await handleFathomMeeting(portalId, payload)
}
