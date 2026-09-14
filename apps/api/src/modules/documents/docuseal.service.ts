/**
 * docuseal.service.ts — Firma de documentos con DocuSeal.
 *
 * Reglas de negocio que NO se pueden saltear (CLAUDE.md):
 *  1. NUNCA se guarda la URL del PDF firmado: expira a los 40 minutos. Se guarda
 *     el `docuseal_submission_id` y la URL se pide fresca cuando hace falta.
 *  2. Al llegar `form.completed` de un CONTRATO, se activa el Client Portal.
 *  3. Cada cambio de `docuseal_status` se registra en `record_history` con
 *     `source_type = 'DOCUSEAL'`.
 */
import { and, eq, isNull, ne, or } from 'drizzle-orm'
import { db } from '../../db'
import { document, deal, contact } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { recordFieldChanges } from '../../lib/audit'
import { sendEmail } from '../../lib/mailer'
import { clientDealIds } from '../../lib/portal-access'
import { activateClientPortal, completeClientPortalActivation } from '../deals/stage.service'
import {
  createSubmission,
  fetchSubmissionDocuments,
  isDocusealConfigured,
  signingUrl,
  type DocusealDocument,
} from './docuseal.client'
import { signatureRequestHtml, signatureRequestSubject } from './emails/signature-request'
import { notifyAdmins } from '../notifications/notify'

const ENTITY = 'document'

export interface SendForSignatureInput {
  templateId: number
  documentType: 'contract' | 'proposal'
  /** Nombre del documento en el CRM. Si falta, se deriva del tipo. */
  name?: string
}

export interface SendForSignatureResult {
  documentId: string
  submissionId: number
  /** URL donde el firmante completa el documento. */
  signingUrl: string
}

/**
 * Crea la submission en DocuSeal para el contacto principal del deal y deja el
 * `document` en estado `pending`.
 *
 * El email al firmante lo manda el CRM (marca propia), no DocuSeal — por eso el
 * cliente crea la submission con `send_email: false`.
 */
export async function sendForSignature(
  portalId: string,
  dealId: string,
  userId: string,
  input: SendForSignatureInput,
): Promise<SendForSignatureResult> {
  if (!isDocusealConfigured()) {
    throw Errors.badRequest('DocuSeal no está configurado (falta DOCUSEAL_API_KEY)')
  }

  const [d] = await db
    .select({ id: deal.id, name: deal.name, primaryContactId: deal.primaryContactId })
    .from(deal)
    .where(and(eq(deal.id, dealId), eq(deal.portalId, portalId), eq(deal.archived, false)))
    .limit(1)
  if (!d) throw Errors.notFound('Deal no encontrado')
  if (!d.primaryContactId) throw Errors.badRequest('El deal no tiene contacto principal a quién enviarle el documento')

  const [c] = await db
    .select({ email: contact.email, firstName: contact.firstName, lastName: contact.lastName })
    .from(contact)
    .where(eq(contact.id, d.primaryContactId))
    .limit(1)
  if (!c?.email) throw Errors.badRequest('El contacto principal no tiene email')

  const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || undefined

  const submitters = await createSubmission(input.templateId, [{ email: c.email, name: fullName }])
  const first = submitters[0]
  if (!first) throw Errors.internal('DocuSeal no devolvió ningún submitter')

  const name = input.name ?? (input.documentType === 'contract' ? `Contrato — ${d.name}` : `Propuesta — ${d.name}`)

  const [row] = await db
    .insert(document)
    .values({
      portalId,
      dealId,
      name,
      type: input.documentType,
      source: 'docuseal',
      docusealSubmissionId: first.submission_id,
      docusealTemplateId: input.templateId,
      docusealStatus: 'pending',
      // `slug` del submitter: es lo que identifica al firmante en el webhook.
      docusealExternalId: first.slug,
      createdBy: userId,
    })
    .returning()
  if (!row) throw Errors.internal('No se pudo crear el documento')

  const url = signingUrl(first.slug)

  // Email al firmante — best-effort, no rompe el envío si falla.
  try {
    await sendEmail({
      to: c.email,
      subject: signatureRequestSubject(name),
      html: signatureRequestHtml({ firstName: c.firstName, documentName: name, signingUrl: url }),
    })
  } catch (err) {
    console.error('[docuseal.service] No se pudo enviar el email de firma', {
      documentId: row.id,
      error: (err as Error)?.message ?? err,
    })
  }

  return { documentId: row.id, submissionId: first.submission_id, signingUrl: url }
}

/**
 * Devuelve las URLs FRESCAS del documento firmado.
 *
 * Se pide a DocuSeal en cada llamada a propósito: las URLs viven 40 minutos, así
 * que cachearlas o guardarlas en la fila produce links rotos.
 */
export async function getSignedDocuments(portalId: string, documentId: string): Promise<DocusealDocument[]> {
  const [row] = await db
    .select({ submissionId: document.docusealSubmissionId, status: document.docusealStatus })
    .from(document)
    .where(and(eq(document.id, documentId), eq(document.portalId, portalId), eq(document.archived, false)))
    .limit(1)
  if (!row) throw Errors.notFound('Documento no encontrado')
  if (!row.submissionId) throw Errors.badRequest('El documento no tiene una submission de DocuSeal asociada')
  if (row.status !== 'completed') throw Errors.badRequest('El documento todavía no está firmado')

  return fetchSubmissionDocuments(row.submissionId)
}

/**
 * Igual que `getSignedDocuments`, pero para el portal de cliente: en vez de
 * scopear por portalId (admin), valida que el documento pertenezca a un deal
 * del cliente Y sea `visibleToClient`. Reutiliza `fetchSubmissionDocuments`
 * para no duplicar la llamada a DocuSeal.
 *
 * Se responde 404 (no 403) cuando el documento no es del cliente o no es
 * visible — mismo criterio que `assertClientDeliverable` (client.service.ts):
 * no confirmar que el documento existe si no le corresponde.
 *
 * Misma regla de negocio que `getSignedDocuments`: la URL del PDF firmado
 * NUNCA se persiste (caduca a los 40 minutos), así que se pide fresca acá.
 */
export async function getClientSignedDocuments(
  clientId: string,
  documentId: string,
): Promise<DocusealDocument[]> {
  const [row] = await db
    .select({
      dealId: document.dealId,
      visibleToClient: document.visibleToClient,
      submissionId: document.docusealSubmissionId,
      status: document.docusealStatus,
    })
    .from(document)
    .where(and(eq(document.id, documentId), eq(document.archived, false)))
    .limit(1)
  if (!row) throw Errors.notFound('Documento no encontrado')

  const dealIds = await clientDealIds(clientId)
  if (!row.dealId || !row.visibleToClient || !dealIds.includes(row.dealId)) {
    throw Errors.notFound('Documento no encontrado')
  }

  if (!row.submissionId) throw Errors.badRequest('El documento no tiene una submission de DocuSeal asociada')
  if (row.status !== 'completed') throw Errors.badRequest('El documento todavía no está firmado')

  return fetchSubmissionDocuments(row.submissionId)
}

// ── Webhook ──────────────────────────────────────────────────────────────────

/** Eventos de DocuSeal que nos interesan. El resto se ignora con 200. */
const HANDLED_EVENTS = new Set(['form.completed', 'form.declined'])

export interface DocusealWebhookPayload {
  event_type?: string | null
  data?: {
    /** slug del submitter — es lo que guardamos en docuseal_external_id. */
    slug?: string | null
    submission_id?: number | null
    status?: string | null
  } | null
}

/**
 * Procesa un evento de DocuSeal.
 *
 * Idempotente: si el documento ya está en el estado que trae el evento, no
 * vuelve a escribir historial ni a reactivar el portal. DocuSeal reintenta los
 * webhooks, así que esto no es teórico.
 */
export async function handleDocusealWebhook(payload: DocusealWebhookPayload): Promise<void> {
  const eventType = payload.event_type
  if (!eventType || !HANDLED_EVENTS.has(eventType)) return

  const slug = payload.data?.slug
  if (!slug) {
    console.error('[docuseal] Evento sin slug de submitter — no se puede resolver el documento', { eventType })
    return
  }

  const [row] = await db
    .select({
      id: document.id,
      portalId: document.portalId,
      dealId: document.dealId,
      type: document.type,
      status: document.docusealStatus,
    })
    .from(document)
    .where(eq(document.docusealExternalId, slug))
    .limit(1)
  if (!row) {
    console.error('[docuseal] No hay documento para el slug recibido', { slug, eventType })
    return
  }

  const newStatus = eventType === 'form.completed' ? 'completed' : 'declined'
  if (row.status === newStatus) return // reintento de DocuSeal: ya procesado

  // Activar el portal solo si es un CONTRATO completado y el deal existe.
  const shouldActivate = newStatus === 'completed' && row.type === 'contract' && Boolean(row.dealId)

  const outcome = await db.transaction(async (tx) => {
    // El UPDATE condicionado es el verdadero guard de idempotencia: el chequeo
    // de arriba se lee fuera de la transacción, y dos entregas concurrentes del
    // mismo evento lo pasaban las dos. Acá la segunda espera el lock de la fila,
    // no matchea y no vuelve a activar el portal.
    const [updated] = await tx
      .update(document)
      .set({
        docusealStatus: newStatus,
        signedAt: newStatus === 'completed' ? new Date() : null,
      })
      .where(and(eq(document.id, row.id), or(isNull(document.docusealStatus), ne(document.docusealStatus, newStatus))))
      .returning({ id: document.id })
    if (!updated) return { processed: false, activation: null }

    await recordFieldChanges({
      tx,
      portalId: row.portalId,
      entityType: ENTITY,
      entityId: row.id,
      before: { docusealStatus: row.status },
      after: { docusealStatus: newStatus },
      // El cambio lo origina DocuSeal, no un hub_user: `changed_by` va null.
      changedBy: null,
      sourceType: 'DOCUSEAL',
    })

    const activation = shouldActivate ? await activateClientPortal(tx, row.portalId, row.dealId!) : null
    return { processed: true, activation }
  })
  if (!outcome.processed) return

  // Clerk + invitación al portal FUERA de la transacción, igual que en
  // changeStage: si la transacción hiciera rollback, no deben haber ocurrido.
  if (outcome.activation) await completeClientPortalActivation(outcome.activation)

  // Aviso al equipo. Es el hito de venta más importante del sistema y hasta
  // ahora no lo comunicaba a nadie: el webhook activaba el portal y mandaba el
  // email al cliente, pero el equipo no se enteraba de que el contrato estaba
  // firmado (ni de que lo habían rechazado).
  //
  // DocuSeal reintenta los webhooks. El corte por `row.status === newStatus`
  // de arriba ya absorbe el reintento, pero la dedupeKey lo cubre igual por si
  // dos entregas llegan concurrentes y las dos leen el estado viejo.
  if (row.dealId) {
    const [d] = await db.select({ name: deal.name }).from(deal).where(eq(deal.id, row.dealId)).limit(1)
    const dealName = d?.name ?? 'el proyecto'
    if (newStatus === 'completed') {
      // El payload tipado de DocuSeal no expone el nombre del firmante, así
      // que se omite en vez de castear el webhook a `any` para leerlo.
      await notifyAdmins(row.portalId, 'contract_signed', {
        dealId: row.dealId,
        dealName,
        signerName: null,
      }, { entity: { type: 'document', id: row.id }, dedupeKey: `contract_signed:${row.id}` })
    } else {
      await notifyAdmins(row.portalId, 'contract_declined', { dealId: row.dealId, dealName }, {
        entity: { type: 'document', id: row.id },
        dedupeKey: `contract_declined:${row.id}`,
      })
    }
  }
}
