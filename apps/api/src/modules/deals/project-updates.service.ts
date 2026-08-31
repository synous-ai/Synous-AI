import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../db'
import {
  projectUpdate,
  deal,
  pipeline,
  pipelineStage,
  hubUser,
  clientAccount,
  clientDealAccess,
  contact,
} from '../../db/schema'
import { Errors } from '../../lib/errors'
import { writeAudit, type Tx } from '../../lib/audit'
import { assertDealInPortal } from '../../lib/portal-access'
import { sendEmail } from '../../lib/mailer'
import { portalHomeUrl } from '../../lib/portal-url'
import { PRODUCTION_PIPELINE_LABEL } from '../onboarding/assignees'
import { projectUpdateHtml, projectUpdateSubject } from './emails/project-update-published'
import type { CreateProjectUpdateDTO } from './project-updates.schema'

const ENTITY = 'project_update'
type ProjectUpdateRow = typeof projectUpdate.$inferSelect

/**
 * Novedades del proyecto ("estado de proyecto visible al cliente"), curadas
 * por el equipo — NUNCA tareas internas. `project_update` no es una entidad
 * núcleo (no lleva record_history, igual que note/task); sí lleva audit_log
 * por tratarse de contenido que ve el cliente.
 */

/** Valida que el stage exista y pertenezca al pipeline indicado. */
async function assertStageInPipeline(tx: Tx, pipelineId: string, stageId: string): Promise<typeof pipelineStage.$inferSelect> {
  const [stage] = await tx.select().from(pipelineStage).where(eq(pipelineStage.id, stageId)).limit(1)
  if (!stage) throw Errors.badRequest('Stage inexistente')
  if (stage.pipelineId !== pipelineId) throw Errors.badRequest('El stage no pertenece al pipeline del deal')
  return stage
}

export interface AdminProjectUpdateDTO {
  id: string
  body: string
  archived: boolean
  archivedAt: Date | null
  createdAt: Date
  phaseLabel: string | null
  createdBy: { id: string; firstName: string | null; email: string }
}

/** Listado completo (incluidas archivadas) para el admin, con autor y fase. */
export async function listDealUpdates(portalId: string, dealId: string): Promise<AdminProjectUpdateDTO[]> {
  await assertDealInPortal(portalId, dealId)

  const rows = await db
    .select({
      id: projectUpdate.id,
      body: projectUpdate.body,
      archived: projectUpdate.archived,
      archivedAt: projectUpdate.archivedAt,
      createdAt: projectUpdate.createdAt,
      stageLabel: pipelineStage.label,
      createdById: hubUser.id,
      createdByFirstName: hubUser.firstName,
      createdByEmail: hubUser.email,
    })
    .from(projectUpdate)
    .innerJoin(hubUser, eq(hubUser.id, projectUpdate.createdBy))
    .leftJoin(pipelineStage, eq(pipelineStage.id, projectUpdate.stageId))
    .where(and(eq(projectUpdate.portalId, portalId), eq(projectUpdate.dealId, dealId)))
    .orderBy(desc(projectUpdate.createdAt))

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    archived: r.archived,
    archivedAt: r.archivedAt,
    createdAt: r.createdAt,
    phaseLabel: r.stageLabel ?? null,
    createdBy: { id: r.createdById, firstName: r.createdByFirstName, email: r.createdByEmail },
  }))
}

/**
 * Crea una novedad de proyecto. Si no viene `stageId` y el deal está en el
 * pipeline "Producción", usa la fase ACTUAL del deal como default (la novedad
 * queda asociada a la fase en la que se posteó); si el deal no está en
 * Producción, queda sin fase (`stageId: null`).
 */
export async function createDealUpdate(
  portalId: string,
  userId: string,
  dealId: string,
  input: CreateProjectUpdateDTO,
): Promise<ProjectUpdateRow> {
  const d = await assertDealInPortal(portalId, dealId)

  const row = await db.transaction(async (tx) => {
    let stageId: string | null = null
    if (input.stageId) {
      const stage = await assertStageInPipeline(tx, d.pipelineId, input.stageId)
      stageId = stage.id
    } else {
      const [pl] = await tx.select({ label: pipeline.label }).from(pipeline).where(eq(pipeline.id, d.pipelineId)).limit(1)
      if (pl?.label === PRODUCTION_PIPELINE_LABEL) stageId = d.stageId
    }

    const [row] = await tx
      .insert(projectUpdate)
      .values({ portalId, dealId, stageId, body: input.body, createdBy: userId })
      .returning()
    if (!row) throw Errors.internal('No se pudo crear la novedad')

    await writeAudit({
      tx,
      portalId,
      userId,
      entityType: ENTITY,
      entityId: row.id,
      action: 'PROJECT_UPDATE_CREATED',
      payload: { dealId, stageId },
    })

    return row
  })

  // Aviso al cliente FUERA de la transacción: si el envío fallara adentro (o la
  // transacción hiciera rollback después de mandarlo), el cliente recibiría un
  // email sobre una novedad inexistente. Best-effort: nunca rompe la creación.
  await notifyClientOfUpdate(portalId, dealId, row)

  return row
}

/**
 * Manda el aviso de novedad a los clientes con acceso al deal.
 *
 * Silencioso por diseño en tres casos: si el deal no tiene ningún
 * `client_account` activo asociado (todavía no se activó el portal), si la
 * cuenta no tiene contacto con email, o si `sendEmail` falla. En ninguno de
 * esos casos la novedad deja de existir — ya está publicada en el portal.
 */
async function notifyClientOfUpdate(portalId: string, dealId: string, row: ProjectUpdateRow): Promise<void> {
  try {
    const [d] = await db.select({ name: deal.name }).from(deal).where(eq(deal.id, dealId)).limit(1)
    if (!d) return

    let phaseLabel: string | null = null
    if (row.stageId) {
      const [stage] = await db
        .select({ label: pipelineStage.label })
        .from(pipelineStage)
        .where(eq(pipelineStage.id, row.stageId))
        .limit(1)
      phaseLabel = stage?.label ?? null
    }

    const recipients = await db
      .select({
        email: clientAccount.email,
        brandSlug: clientAccount.brandSlug,
        firstName: contact.firstName,
      })
      .from(clientDealAccess)
      .innerJoin(clientAccount, eq(clientAccount.id, clientDealAccess.clientId))
      .leftJoin(contact, eq(contact.id, clientAccount.contactId))
      .where(
        and(
          eq(clientDealAccess.dealId, dealId),
          eq(clientAccount.portalId, portalId),
          eq(clientAccount.isActive, true),
        ),
      )

    for (const r of recipients) {
      await sendEmail({
        to: r.email,
        subject: projectUpdateSubject(d.name),
        html: projectUpdateHtml({
          firstName: r.firstName,
          dealName: d.name,
          phaseLabel,
          body: row.body,
          portalUrl: portalHomeUrl(r.brandSlug),
        }),
      })
    }
  } catch (err) {
    console.error('[project-updates.service] No se pudo avisar al cliente de la novedad', {
      projectUpdateId: row.id,
      error: (err as Error)?.message ?? err,
    })
  }
}

/** Archiva una novedad (nunca DELETE). 404 si no existe o si ya estaba archivada (mismo patrón que archiveDeal). */
export async function archiveDealUpdate(portalId: string, userId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(projectUpdate)
      .where(and(eq(projectUpdate.portalId, portalId), eq(projectUpdate.id, id), eq(projectUpdate.archived, false)))
      .limit(1)
    if (!existing) throw Errors.notFound('Novedad no encontrada')

    await tx.update(projectUpdate).set({ archived: true, archivedAt: new Date() }).where(eq(projectUpdate.id, id))
    await writeAudit({
      tx,
      portalId,
      userId,
      entityType: ENTITY,
      entityId: id,
      action: 'PROJECT_UPDATE_ARCHIVED',
      payload: { dealId: existing.dealId },
    })
  })
}
