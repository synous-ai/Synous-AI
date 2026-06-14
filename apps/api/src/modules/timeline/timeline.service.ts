import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../../db'
import { call, meeting, emailSend, emailEvent, note, task, recordHistory } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { injectTrackingPixel } from '../email-tracking/email-tracking.service'
import type { LogCallDTO, LogMeetingDTO, LogEmailDTO, TimelineQuery } from './timeline.schema'

// ── Return types ─────────────────────────────────────────────────────────────

type CallRow = typeof call.$inferSelect
type MeetingRow = typeof meeting.$inferSelect
type EmailSendRow = typeof emailSend.$inferSelect

export interface TimelineItem {
  kind: 'call' | 'meeting' | 'email' | 'note' | 'task' | 'history'
  id: string
  title: string
  body: string | null
  occurredAt: string
  meta?: Record<string, unknown>
}

// ── Inserts ──────────────────────────────────────────────────────────────────

export async function logCall(
  portalId: string,
  userId: string,
  input: LogCallDTO,
): Promise<CallRow> {
  const [row] = await db
    .insert(call)
    .values({
      portalId,
      createdBy: userId,
      title: input.title ?? null,
      body: input.body ?? null,
      direction: input.direction ?? null,
      durationSec: input.durationSec ?? null,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      dealId: input.dealId ?? null,
      contactId: input.contactId ?? null,
    })
    .returning()
  if (!row) throw Errors.internal('No se pudo registrar la llamada')
  return row
}

export async function logMeeting(
  portalId: string,
  userId: string,
  input: LogMeetingDTO,
): Promise<MeetingRow> {
  const [row] = await db
    .insert(meeting)
    .values({
      portalId,
      createdBy: userId,
      title: input.title,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      location: input.location ?? null,
      dealId: input.dealId ?? null,
      contactId: input.contactId ?? null,
    })
    .returning()
  if (!row) throw Errors.internal('No se pudo registrar la reunión')
  return row
}

export async function logEmail(
  portalId: string,
  _userId: string,
  input: LogEmailDTO,
): Promise<EmailSendRow> {
  // Insertar sin bodyHtml primero para obtener el trackingId generado por la DB
  const [row] = await db
    .insert(emailSend)
    .values({
      portalId,
      fromEmail: input.fromEmail,
      toEmail: input.toEmail,
      subject: input.subject,
      bodyHtml: input.bodyHtml ?? null,
      dealId: input.dealId ?? null,
      contactId: input.contactId ?? null,
    })
    .returning()
  if (!row) throw Errors.internal('No se pudo registrar el email')

  // Si hay bodyHtml, inyectar el pixel de tracking y actualizar
  if (input.bodyHtml) {
    const htmlWithPixel = injectTrackingPixel(input.bodyHtml, row.trackingId)
    const [updated] = await db
      .update(emailSend)
      .set({ bodyHtml: htmlWithPixel })
      .where(eq(emailSend.id, row.id))
      .returning()
    if (updated) return updated
  }

  return row
}

// ── Timeline query ───────────────────────────────────────────────────────────

export async function getTimeline(
  portalId: string,
  query: TimelineQuery,
): Promise<TimelineItem[]> {
  const { dealId, contactId, companyId } = query
  const items: TimelineItem[] = []

  // ── Calls (dealId or contactId, no companyId) ───────────────────────────
  if (dealId != null || contactId != null) {
    const callConds = [eq(call.portalId, portalId)]
    if (dealId != null) callConds.push(eq(call.dealId, dealId))
    else if (contactId != null) callConds.push(eq(call.contactId, contactId))

    const calls = await db
      .select()
      .from(call)
      .where(and(...callConds))
      .orderBy(desc(call.occurredAt))
      .limit(100)

    for (const c of calls) {
      items.push({
        kind: 'call',
        id: c.id,
        title: c.title ?? 'Llamada',
        body: c.body ?? null,
        occurredAt: c.occurredAt.toISOString(),
        meta: {
          direction: c.direction ?? null,
          durationSec: c.durationSec ?? null,
        },
      })
    }
  }

  // ── Meetings (dealId or contactId, no companyId) ────────────────────────
  if (dealId != null || contactId != null) {
    const meetConds = [eq(meeting.portalId, portalId)]
    if (dealId != null) meetConds.push(eq(meeting.dealId, dealId))
    else if (contactId != null) meetConds.push(eq(meeting.contactId, contactId))

    const meetings = await db
      .select()
      .from(meeting)
      .where(and(...meetConds))
      .orderBy(desc(meeting.createdAt))
      .limit(100)

    for (const m of meetings) {
      items.push({
        kind: 'meeting',
        id: m.id,
        title: m.title,
        body: null,
        occurredAt: (m.startsAt ?? m.createdAt).toISOString(),
        meta: {
          endsAt: m.endsAt?.toISOString() ?? null,
          location: m.location ?? null,
          fathomSummary: m.fathomSummary ?? null,
        },
      })
    }
  }

  // ── Emails (dealId or contactId, no companyId) ──────────────────────────
  if (dealId != null || contactId != null) {
    const emailConds = [eq(emailSend.portalId, portalId)]
    if (dealId != null) emailConds.push(eq(emailSend.dealId, dealId))
    else if (contactId != null) emailConds.push(eq(emailSend.contactId, contactId))

    const emails = await db
      .select()
      .from(emailSend)
      .where(and(...emailConds))
      .orderBy(desc(emailSend.sentAt))
      .limit(100)

    // Eventos de apertura/click de TODOS los emails en UNA sola query (evita N+1).
    const emailIds = emails.map((e) => e.id)
    const eventRows = emailIds.length
      ? await db
          .select({ emailId: emailEvent.emailId, type: emailEvent.type })
          .from(emailEvent)
          .where(inArray(emailEvent.emailId, emailIds))
      : []
    const openedSet = new Set<string>()
    const clickedSet = new Set<string>()
    for (const ev of eventRows) {
      if (ev.type === 'opened') openedSet.add(ev.emailId)
      else if (ev.type === 'clicked') clickedSet.add(ev.emailId)
    }

    for (const e of emails) {
      const opened = openedSet.has(e.id)
      const clicked = clickedSet.has(e.id)

      items.push({
        kind: 'email',
        id: e.id,
        title: e.subject,
        body: e.bodyHtml ?? null,
        occurredAt: e.sentAt.toISOString(),
        meta: {
          fromEmail: e.fromEmail,
          toEmail: e.toEmail,
          opened,
          clicked,
        },
      })
    }
  }

  // ── Notes (dealId, contactId, or companyId) ─────────────────────────────
  {
    const noteConds = [eq(note.portalId, portalId)]
    if (dealId != null) noteConds.push(eq(note.dealId, dealId))
    else if (contactId != null) noteConds.push(eq(note.contactId, contactId))
    else if (companyId != null) noteConds.push(eq(note.companyId, companyId))

    const notes = await db
      .select()
      .from(note)
      .where(and(...noteConds))
      .orderBy(desc(note.createdAt))
      .limit(100)

    for (const n of notes) {
      items.push({
        kind: 'note',
        id: n.id,
        title: 'Nota',
        body: n.body,
        occurredAt: n.createdAt.toISOString(),
      })
    }
  }

  // ── Tasks (dealId, contactId, or companyId) ─────────────────────────────
  {
    const taskConds = [eq(task.portalId, portalId)]
    if (dealId != null) taskConds.push(eq(task.dealId, dealId))
    else if (contactId != null) taskConds.push(eq(task.contactId, contactId))
    else if (companyId != null) taskConds.push(eq(task.companyId, companyId))

    const tasks = await db
      .select()
      .from(task)
      .where(and(...taskConds))
      .orderBy(desc(task.createdAt))
      .limit(100)

    for (const t of tasks) {
      items.push({
        kind: 'task',
        id: t.id,
        title: t.title,
        body: t.body ?? null,
        occurredAt: (t.dueDate ?? t.createdAt).toISOString(),
        meta: {
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate?.toISOString() ?? null,
          completedAt: t.completedAt?.toISOString() ?? null,
        },
      })
    }
  }

  // ── Record history ───────────────────────────────────────────────────────
  {
    let entityType: string
    let entityId: string

    if (dealId != null) {
      entityType = 'deal'
      entityId = dealId
    } else if (contactId != null) {
      entityType = 'contact'
      entityId = contactId
    } else {
      entityType = 'company'
      entityId = companyId!
    }

    const history = await db
      .select()
      .from(recordHistory)
      .where(
        and(
          eq(recordHistory.portalId, portalId),
          eq(recordHistory.entityType, entityType),
          eq(recordHistory.entityId, entityId),
        ),
      )
      .orderBy(desc(recordHistory.changedAt))
      .limit(100)

    for (const h of history) {
      items.push({
        kind: 'history',
        id: h.id,
        title: h.fieldName,
        body: `${h.oldValue ?? '—'} → ${h.newValue ?? '—'}`,
        occurredAt: h.changedAt.toISOString(),
      })
    }
  }

  // Sort all items by date DESC
  return items.sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  )
}
