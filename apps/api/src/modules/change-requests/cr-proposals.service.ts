import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../../db'
import { changeRequest, changeRequestItem, changeRequestProposal } from '../../db/schema'
import { writeAudit, type Tx } from '../../lib/audit'
import { Errors } from '../../lib/errors'
import { toDecimal } from '../../lib/money'
import { notifyDealClients } from '../notifications/notify'
import type { CRProposalDTO, CRProposalRow, CRRow } from './cr-detail'
import { recordCREvent } from './cr-events'
import { assertAdminTransition, getCRInPortal } from './cr.service'
import type { CreateProposalDTO, UpdateProposalDTO } from './cr.schema'

async function itemsOf(proposalId: string): Promise<CRProposalDTO['items']> {
  return db.select().from(changeRequestItem).where(eq(changeRequestItem.proposalId, proposalId))
}

async function withItems(proposal: CRProposalRow): Promise<CRProposalDTO> {
  return { ...proposal, items: await itemsOf(proposal.id) }
}

async function insertProposalItems(tx: Tx, crId: string, proposalId: string, items: CreateProposalDTO['items']): Promise<void> {
  if (!items?.length) return
  await tx.insert(changeRequestItem).values(
    items.map((it) => ({
      changeRequestId: crId,
      proposalId,
      description: it.description,
      hours: toDecimal(it.hours),
      unitPrice: it.unitPrice.toFixed(2),
      quantity: (it.quantity ?? 1).toFixed(2),
    })),
  )
}

/**
 * Marca una propuesta como ENVIADA y deja la CR esperando al cliente.
 *
 * Es el único lugar donde ocurre "enviar": jubilar la versión anterior,
 * denormalizar los números en la CR, moverla a `sent`, registrar el evento y
 * auditar. Lo llaman los DOS caminos de envío —crear-y-enviar y enviar un
 * borrador guardado— porque son el mismo hecho de negocio: duplicar esta
 * secuencia era garantizar que uno de los dos se olvidara de un paso (de hecho
 * el borrador no actualizaba `currentProposalId`, que es el bug que originó
 * esta extracción).
 *
 * Corre SIEMPRE dentro de la transacción del caller: una CR en `sent`
 * apuntando a una propuesta que nunca se marcó `sent` es un estado imposible
 * de explicar después.
 */
async function markProposalSent(
  tx: Tx,
  args: { cr: CRRow; proposal: CRProposalRow; portalId: string; userId: string; now: Date },
): Promise<CRProposalRow> {
  const { cr, portalId, userId, now } = args
  const id = cr.id

  const [sent] = await tx
    .update(changeRequestProposal)
    .set({ status: 'sent', sentAt: now })
    .where(and(eq(changeRequestProposal.id, args.proposal.id), eq(changeRequestProposal.status, args.proposal.status)))
    .returning()
  if (!sent) throw Errors.conflict('La propuesta cambió de estado mientras tanto. Recargá e intentá de nuevo.')

  // La versión anterior deja de estar vigente. Solo las 'sent': una 'draft'
  // nunca salió, y una 'accepted'/'rejected' ya tiene decisión del cliente.
  await tx
    .update(changeRequestProposal)
    .set({ status: 'superseded' })
    .where(
      and(
        eq(changeRequestProposal.changeRequestId, id),
        eq(changeRequestProposal.status, 'sent'),
        sql`${changeRequestProposal.id} <> ${sent.id}`,
      ),
    )

  const [updated] = await tx
    .update(changeRequest)
    .set({
      status: 'sent',
      currentProposalId: sent.id,
      proposedScope: sent.scope,
      totalAmount: sent.amount,
      currency: sent.currency,
      timelineImpactDays: sent.timelineImpactDays,
      newDeliveryDate: sent.newDeliveryDate,
      updatedAt: now,
    })
    .where(and(eq(changeRequest.id, id), eq(changeRequest.status, cr.status)))
    .returning({ id: changeRequest.id })
  if (!updated) throw Errors.conflict('La change request cambió de estado mientras tanto. Recargá e intentá de nuevo.')

  const snapshot = {
    proposalId: sent.id,
    version: sent.version,
    amount: sent.amount,
    currency: sent.currency,
    timelineImpactDays: sent.timelineImpactDays,
    newDeliveryDate: sent.newDeliveryDate,
  }
  await recordCREvent(tx, {
    changeRequestId: id,
    eventType: 'proposal_sent',
    actorRole: 'admin',
    fromStatus: cr.status,
    toStatus: 'sent',
    userId,
    metadata: snapshot,
  })
  await writeAudit({
    tx,
    portalId,
    userId,
    entityType: 'change_request',
    entityId: id,
    action: 'CR_PROPOSAL_SENT',
    payload: { proposalId: sent.id, version: sent.version, amount: sent.amount, currency: sent.currency },
  })
  return sent
}

/** Aviso al cliente, DESPUÉS del commit. El primer envío y un reenvío son hechos distintos para él. */
async function notifyProposalSent(cr: CRRow, proposal: CRProposalRow): Promise<void> {
  const entity = { type: 'change_request', id: cr.id }
  if (proposal.version === 1) {
    await notifyDealClients(cr.portalId, cr.dealId, 'cr_sent', { crId: cr.id, crNumber: cr.number, title: cr.title }, {
      entity,
      dedupeKey: `cr_proposal_sent:${proposal.id}`,
    })
    return
  }
  await notifyDealClients(
    cr.portalId,
    cr.dealId,
    'cr_proposal_updated',
    { crId: cr.id, crNumber: cr.number, version: proposal.version },
    { entity, dedupeKey: `cr_proposal_sent:${proposal.id}` },
  )
}

/**
 * Crea la versión N+1 de la propuesta y, salvo que se pida lo contrario, la
 * envía en el mismo movimiento.
 *
 * Todo pasa en UNA transacción: crear la versión, jubilar la anterior,
 * denormalizar los números en la CR y moverla a `sent`. Si el envío fallara a
 * mitad, la CR quedaría diciendo "esperando al cliente" apuntando a una
 * propuesta que nunca se marcó como enviada.
 *
 * Con `send: false` la propuesta queda en `draft` y la CR NO se mueve: es un
 * borrador interno del equipo. Se envía después con `sendProposal`; el detalle
 * lo expone en `draftProposal` para que el formulario lo recupere en vez de
 * abrir otra versión en blanco.
 */
export async function createProposal(
  portalId: string,
  userId: string,
  id: string,
  input: CreateProposalDTO,
): Promise<CRProposalDTO> {
  const cr = await getCRInPortal(portalId, id)
  const send = input.send ?? true
  // Se valida ANTES de escribir nada: mandar una propuesta es, para el cliente,
  // el mismo hecho que la transición a 'sent'; si el salto no es legal tampoco
  // tiene sentido crear la versión.
  if (send) assertAdminTransition(cr.status, 'sent')

  const now = new Date()
  const currency = input.currency ?? cr.currency ?? 'USD'

  const proposal = await db.transaction(async (tx) => {
    // Mismo razonamiento que la numeración de la CR: MAX+1 bajo READ COMMITTED
    // no ve las inserciones en curso y dos envíos simultáneos rompen el
    // UNIQUE(change_request_id, version).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`change-request-proposal:${id}`}))`)
    const [versionRow] = await tx
      .select({ next: sql<number>`coalesce(max(${changeRequestProposal.version}), 0) + 1` })
      .from(changeRequestProposal)
      .where(eq(changeRequestProposal.changeRequestId, id))
    const version = versionRow?.next ?? 1

    const [created] = await tx
      .insert(changeRequestProposal)
      .values({
        changeRequestId: id,
        version,
        scope: input.scope ?? null,
        amount: toDecimal(input.amount) ?? null,
        currency,
        timelineImpactDays: input.timelineImpactDays ?? 0,
        newDeliveryDate: input.newDeliveryDate ?? null,
        note: input.note ?? null,
        status: 'draft',
        createdBy: userId,
      })
      .returning()
    if (!created) throw Errors.internal('No se pudo crear la propuesta')
    await insertProposalItems(tx, id, created.id, input.items)

    if (!send) return created
    return markProposalSent(tx, { cr, proposal: created, portalId, userId, now })
  })

  if (send) await notifyProposalSent(cr, proposal)
  return withItems(proposal)
}

/**
 * Envía una propuesta que estaba guardada como BORRADOR.
 *
 * Sin esto, `send: false` era una vía muerta: la propuesta quedaba en `draft`,
 * la CR nunca la apuntaba y no había ninguna forma de mandarla. El admin volvía
 * al día siguiente, encontraba el formulario vacío, cargaba todo de nuevo y al
 * enviar se creaba OTRA versión — dejando la anterior huérfana para siempre.
 */
export async function sendProposal(
  portalId: string,
  userId: string,
  id: string,
  proposalId: string,
): Promise<CRProposalDTO> {
  const cr = await getCRInPortal(portalId, id)
  assertAdminTransition(cr.status, 'sent')
  const now = new Date()

  const proposal = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(changeRequestProposal)
      .where(and(eq(changeRequestProposal.id, proposalId), eq(changeRequestProposal.changeRequestId, id)))
      .limit(1)
      .for('update')
    if (!row) throw Errors.notFound('Propuesta no encontrada')
    if (row.status !== 'draft') throw Errors.conflict('Solo se puede enviar una propuesta en borrador')
    return markProposalSent(tx, { cr, proposal: row, portalId, userId, now })
  })

  await notifyProposalSent(cr, proposal)
  return withItems(proposal)
}

/** Edición de una propuesta que todavía no salió. Una enviada es inmutable: se supersede con una versión nueva. */
export async function updateProposal(
  portalId: string,
  userId: string,
  id: string,
  proposalId: string,
  input: UpdateProposalDTO,
): Promise<CRProposalDTO> {
  await getCRInPortal(portalId, id)

  const proposal = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(changeRequestProposal)
      .where(and(eq(changeRequestProposal.id, proposalId), eq(changeRequestProposal.changeRequestId, id)))
      .limit(1)
      .for('update')
    if (!row) throw Errors.notFound('Propuesta no encontrada')
    if (row.status !== 'draft') throw Errors.conflict('Solo se puede editar una propuesta en borrador')

    const [updated] = await tx
      .update(changeRequestProposal)
      .set({
        ...(input.scope === undefined ? {} : { scope: input.scope }),
        ...(input.amount === undefined ? {} : { amount: toDecimal(input.amount) ?? null }),
        ...(input.currency === undefined ? {} : { currency: input.currency }),
        ...(input.timelineImpactDays === undefined ? {} : { timelineImpactDays: input.timelineImpactDays }),
        ...(input.newDeliveryDate === undefined ? {} : { newDeliveryDate: input.newDeliveryDate }),
        ...(input.note === undefined ? {} : { note: input.note }),
      })
      .where(and(eq(changeRequestProposal.id, proposalId), eq(changeRequestProposal.status, 'draft')))
      .returning()
    if (!updated) throw Errors.conflict('La propuesta cambió de estado mientras tanto. Recargá e intentá de nuevo.')

    // `items` reemplaza el set completo de la versión: una propuesta es un
    // precio cerrado, no una lista que se parchea de a un ítem.
    if (input.items) {
      await tx.delete(changeRequestItem).where(eq(changeRequestItem.proposalId, proposalId))
      await insertProposalItems(tx, id, proposalId, input.items)
    }

    await recordCREvent(tx, {
      changeRequestId: id,
      eventType: 'proposal_updated',
      actorRole: 'admin',
      userId,
      metadata: { proposalId, version: updated.version },
    })
    return updated
  })

  return withItems(proposal)
}

/** Propuestas de una CR, de la más nueva a la más vieja. */
export async function listProposals(portalId: string, id: string): Promise<CRProposalDTO[]> {
  await getCRInPortal(portalId, id)
  const rows = await db
    .select()
    .from(changeRequestProposal)
    .where(eq(changeRequestProposal.changeRequestId, id))
    .orderBy(desc(changeRequestProposal.version))
  return Promise.all(rows.map(withItems))
}
