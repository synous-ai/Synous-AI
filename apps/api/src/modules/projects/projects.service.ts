import { and, asc, desc, eq, exists, inArray, sql, type SQL } from 'drizzle-orm'
import { cursorWhere, decodeCursor, paginateRows, type Paginated } from '../../lib/pagination'
import { db, type DB } from '../../db'
import {
  company,
  deal,
  hubUser,
  processTask,
  processTemplate,
  project,
  projectMember,
  task,
} from '../../db/schema'
import { recordFieldChanges, writeAudit, type Tx } from '../../lib/audit'
import { Errors } from '../../lib/errors'
import { assertCompanyInPortal, assertDealInPortal, assertHubUsersInPortal } from '../../lib/portal-access'
import { resetChecklist } from '../../lib/checklist'
import { withAssignees, type TaskWithAssignees } from '../activities/activities.service'
import type { CreateProjectDTO, ListProjectsQuery, MoveTaskDTO, UpdateProjectDTO } from './projects.schema'
import type {
  ProjectDetailDTO,
  ProjectListItemDTO,
  ProjectMemberDTO,
  ProjectRow,
  ProjectTaskCountsDTO,
} from './projects.types'

const ENTITY = 'project'
type Executor = DB | Tx

const EMPTY_COUNTS: ProjectTaskCountsDTO = { total: 0, open: 0, completed: 0 }

// ── Lecturas auxiliares ───────────────────────────────────────────────

async function requireProject(executor: Executor, portalId: string, id: string): Promise<ProjectRow> {
  const [row] = await executor
    .select()
    .from(project)
    .where(and(eq(project.id, id), eq(project.portalId, portalId), eq(project.archived, false)))
    .limit(1)
  if (!row) throw Errors.notFound('Proyecto no encontrado')
  return row
}

async function loadMembers(executor: Executor, projectIds: readonly string[]): Promise<Map<string, ProjectMemberDTO[]>> {
  const map = new Map<string, ProjectMemberDTO[]>()
  if (projectIds.length === 0) return map
  const rows = await executor
    .select({
      projectId: projectMember.projectId,
      id: hubUser.id,
      firstName: hubUser.firstName,
      lastName: hubUser.lastName,
    })
    .from(projectMember)
    .innerJoin(hubUser, eq(hubUser.id, projectMember.hubUserId))
    .where(inArray(projectMember.projectId, [...projectIds]))
    .orderBy(asc(hubUser.firstName), asc(hubUser.id))
  for (const r of rows) {
    const list = map.get(r.projectId) ?? []
    list.push({ id: r.id, firstName: r.firstName, lastName: r.lastName })
    map.set(r.projectId, list)
  }
  return map
}

/** open = ni completed ni cancelled. Las tareas archivadas no cuentan. */
async function loadTaskCounts(executor: Executor, projectIds: readonly string[]): Promise<Map<string, ProjectTaskCountsDTO>> {
  const map = new Map<string, ProjectTaskCountsDTO>()
  if (projectIds.length === 0) return map
  const rows = await executor
    .select({
      projectId: task.projectId,
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) FILTER (WHERE ${task.status} NOT IN ('completed','cancelled'))::int`,
      completed: sql<number>`count(*) FILTER (WHERE ${task.status} = 'completed')::int`,
    })
    .from(task)
    .where(and(inArray(task.projectId, [...projectIds]), eq(task.archived, false)))
    .groupBy(task.projectId)
  for (const r of rows) {
    if (r.projectId) map.set(r.projectId, { total: r.total, open: r.open, completed: r.completed })
  }
  return map
}

/** Reemplaza los miembros del proyecto. El caller valida los ids contra el portal. */
async function syncMembers(tx: Tx, projectId: string, memberIds: readonly string[]): Promise<void> {
  await tx.delete(projectMember).where(eq(projectMember.projectId, projectId))
  const ids = [...new Set(memberIds)]
  if (ids.length > 0) {
    await tx.insert(projectMember).values(ids.map((hubUserId) => ({ projectId, hubUserId })))
  }
}

/** `kind` es el slug de un proceso vigente del mismo portal (no hay enum de DB). */
async function findProcessForKind(tx: Tx, portalId: string, kind: string | null | undefined) {
  if (!kind) return null
  const [proc] = await tx
    .select()
    .from(processTemplate)
    .where(and(eq(processTemplate.portalId, portalId), eq(processTemplate.slug, kind), eq(processTemplate.archived, false)))
    .limit(1)
  if (!proc) throw Errors.badRequest('Proceso inexistente')
  return proc
}

// ── Lecturas ──────────────────────────────────────────────────────────

export async function listProjects(
  portalId: string,
  query: ListProjectsQuery,
): Promise<Paginated<ProjectListItemDTO>> {
  const conds: SQL[] = [eq(project.portalId, portalId)]
  if (!query.includeArchived) conds.push(eq(project.archived, false))
  if (query.status) conds.push(eq(project.status, query.status))
  if (query.companyId) conds.push(eq(project.companyId, query.companyId))
  if (query.memberId) {
    conds.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(projectMember)
          .where(and(eq(projectMember.projectId, project.id), eq(projectMember.hubUserId, query.memberId))),
      ),
    )
  }
  const cursor = decodeCursor(query.cursor)
  const rows = await db
    .select({ project, companyName: company.name, dealName: deal.name })
    .from(project)
    .leftJoin(company, eq(company.id, project.companyId))
    .leftJoin(deal, eq(deal.id, project.dealId))
    .where(and(...conds, cursor ? cursorWhere(project.createdAt, project.id, cursor) : undefined))
    .orderBy(desc(project.createdAt), desc(project.id))
    .limit(query.limit + 1)

  const page = paginateRows(rows, query.limit, (r) => r.project)
  const ids = page.items.map((r) => r.project.id)
  const [members, counts] = await Promise.all([loadMembers(db, ids), loadTaskCounts(db, ids)])
  return {
    items: page.items.map((r) => ({
      ...r.project,
      members: members.get(r.project.id) ?? [],
      taskCounts: counts.get(r.project.id) ?? EMPTY_COUNTS,
      companyName: r.companyName,
      dealName: r.dealName,
    })),
    nextCursor: page.nextCursor,
  }
}

export async function getProject(portalId: string, id: string, executor: Executor = db): Promise<ProjectDetailDTO> {
  const row = await requireProject(executor, portalId, id)
  const [members, counts] = await Promise.all([loadMembers(executor, [id]), loadTaskCounts(executor, [id])])
  let companySummary: ProjectDetailDTO['company'] = null
  if (row.companyId) {
    const [c] = await executor
      .select({ id: company.id, name: company.name })
      .from(company)
      .where(and(eq(company.id, row.companyId), eq(company.portalId, portalId)))
      .limit(1)
    companySummary = c ?? null
  }
  let dealSummary: ProjectDetailDTO['deal'] = null
  if (row.dealId) {
    const [d] = await executor
      .select({ id: deal.id, name: deal.name })
      .from(deal)
      .where(and(eq(deal.id, row.dealId), eq(deal.portalId, portalId)))
      .limit(1)
    dealSummary = d ?? null
  }
  return {
    ...row,
    members: members.get(id) ?? [],
    taskCounts: counts.get(id) ?? EMPTY_COUNTS,
    company: companySummary,
    deal: dealSummary,
  }
}

export async function listProjectTasks(portalId: string, id: string): Promise<TaskWithAssignees[]> {
  await requireProject(db, portalId, id)
  const rows = await db
    .select()
    .from(task)
    .where(and(eq(task.projectId, id), eq(task.portalId, portalId), eq(task.archived, false)))
    .orderBy(asc(task.status), asc(task.position), asc(task.createdAt), asc(task.id))
  return withAssignees(db, rows)
}

// ── Escrituras ────────────────────────────────────────────────────────

export async function createProject(
  portalId: string,
  userId: string,
  input: CreateProjectDTO,
): Promise<ProjectDetailDTO> {
  return db.transaction(async (tx) => {
    await assertCompanyInPortal(portalId, input.companyId, tx)
    if (input.dealId) await assertDealInPortal(portalId, input.dealId, tx)
    const memberIds = [...new Set(input.memberIds ?? [])]
    await assertHubUsersInPortal(portalId, memberIds, tx)
    const proc = await findProcessForKind(tx, portalId, input.kind)

    const [row] = await tx
      .insert(project)
      .values({
        portalId,
        name: input.name,
        kind: input.kind ?? null,
        status: input.status ?? 'not_started',
        stage: input.stage ?? null,
        priority: input.priority ?? 'medium',
        startDate: input.startDate,
        dueDate: input.dueDate ?? null,
        repoUrl: input.repoUrl ?? null,
        stagingUrl: input.stagingUrl ?? null,
        productionUrl: input.productionUrl ?? null,
        notes: input.notes ?? null,
        notesImportant: input.notesImportant ?? null,
        companyId: input.companyId ?? null,
        dealId: input.dealId ?? null,
        createdBy: userId,
      })
      .returning()
    if (!row) throw Errors.internal('No se pudo crear el proyecto')

    await syncMembers(tx, row.id, memberIds)

    // Las tareas del proceso se COPIAN (no se referencian): editar la plantilla
    // después no toca proyectos existentes.
    if (proc) {
      const templates = await tx
        .select()
        .from(processTask)
        .where(eq(processTask.processId, proc.id))
        .orderBy(asc(processTask.position), asc(processTask.createdAt), asc(processTask.id))
      if (templates.length > 0) {
        await tx.insert(task).values(
          templates.map((t, i) => ({
            portalId,
            projectId: row.id,
            title: t.title,
            body: t.notes,
            steps: resetChecklist(t.steps),
            status: 'pending',
            priority: 'medium',
            position: i,
            createdBy: userId,
          })),
        )
      }
    }

    await writeAudit({ tx, portalId, userId, entityType: ENTITY, entityId: row.id, action: 'CREATE', payload: input })
    return getProject(portalId, row.id, tx)
  })
}

export async function updateProject(
  portalId: string,
  userId: string,
  id: string,
  input: UpdateProjectDTO,
): Promise<ProjectDetailDTO> {
  return db.transaction(async (tx) => {
    const existing = await requireProject(tx, portalId, id)
    const { memberIds, ...fields } = input

    await assertCompanyInPortal(portalId, fields.companyId, tx)
    if (fields.dealId) await assertDealInPortal(portalId, fields.dealId, tx)
    if (memberIds) await assertHubUsersInPortal(portalId, memberIds, tx)
    if (fields.kind) await findProcessForKind(tx, portalId, fields.kind)

    // El refine de Zod solo ve los campos del request: el orden de fechas se
    // revalida contra el valor ya guardado (p. ej. PATCH solo de dueDate).
    const start = fields.startDate !== undefined ? fields.startDate : existing.startDate
    const due = fields.dueDate !== undefined ? fields.dueDate : existing.dueDate
    if (start && due && start > due) throw Errors.badRequest('startDate no puede ser posterior a dueDate')

    const patch = { ...fields }
    const [updated] = await tx
      .update(project)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(project.id, id))
      .returning()
    if (!updated) throw Errors.internal('No se pudo actualizar el proyecto')

    await recordFieldChanges({
      tx,
      portalId,
      entityType: ENTITY,
      entityId: id,
      before: existing,
      after: patch,
      changedBy: userId,
    })
    if (memberIds) await syncMembers(tx, id, memberIds)
    await writeAudit({ tx, portalId, userId, entityType: ENTITY, entityId: id, action: 'UPDATE', payload: input })
    return getProject(portalId, id, tx)
  })
}

export async function duplicateProject(portalId: string, userId: string, id: string): Promise<ProjectDetailDTO> {
  return db.transaction(async (tx) => {
    const source = await requireProject(tx, portalId, id)
    const [copy] = await tx
      .insert(project)
      .values({
        portalId,
        name: `${source.name} (copia)`,
        kind: source.kind,
        status: 'not_started',
        stage: null,
        priority: source.priority,
        startDate: null,
        dueDate: null,
        // Las URLs (repo/staging/producción) son del proyecto original: no se copian.
        notes: source.notes,
        notesImportant: source.notesImportant,
        companyId: source.companyId,
        dealId: source.dealId,
        createdBy: userId,
      })
      .returning()
    if (!copy) throw Errors.internal('No se pudo duplicar el proyecto')

    const members = await tx
      .select({ hubUserId: projectMember.hubUserId })
      .from(projectMember)
      .where(eq(projectMember.projectId, id))
    await syncMembers(tx, copy.id, members.map((m) => m.hubUserId))

    const tasks = await tx
      .select()
      .from(task)
      .where(and(eq(task.projectId, id), eq(task.archived, false)))
      .orderBy(asc(task.position), asc(task.createdAt), asc(task.id))
    if (tasks.length > 0) {
      await tx.insert(task).values(
        tasks.map((t, i) => ({
          portalId,
          projectId: copy.id,
          title: t.title,
          body: t.body,
          steps: resetChecklist(t.steps),
          status: 'pending',
          priority: t.priority,
          position: i,
          createdBy: userId,
        })),
      )
    }

    await writeAudit({
      tx,
      portalId,
      userId,
      entityType: ENTITY,
      entityId: copy.id,
      action: 'DUPLICATE',
      payload: { sourceId: id },
    })
    return getProject(portalId, copy.id, tx)
  })
}

export async function archiveProject(portalId: string, userId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await requireProject(tx, portalId, id)
    const now = new Date()
    await tx.update(project).set({ archived: true, archivedAt: now, updatedAt: now }).where(eq(project.id, id))
    await writeAudit({ tx, portalId, userId, entityType: ENTITY, entityId: id, action: 'ARCHIVE', payload: { archived: true } })
  })
}

/**
 * Drag & drop del kanban: cambia el status de `taskId` y reescribe la posición
 * de TODAS las tareas de `orderedIds` según su índice. Todos los ids tienen que
 * ser tareas activas de este proyecto (y por lo tanto de este portal).
 */
export async function moveProjectTask(portalId: string, id: string, input: MoveTaskDTO): Promise<TaskWithAssignees[]> {
  const orderedIds = input.orderedIds
  if (new Set(orderedIds).size !== orderedIds.length) throw Errors.badRequest('orderedIds contiene ids repetidos')
  if (!orderedIds.includes(input.taskId)) throw Errors.badRequest('orderedIds debe incluir a taskId')

  await db.transaction(async (tx) => {
    await requireProject(tx, portalId, id)
    const rows = await tx
      .select({ id: task.id, completedAt: task.completedAt })
      .from(task)
      .where(
        and(
          inArray(task.id, orderedIds),
          eq(task.projectId, id),
          eq(task.portalId, portalId),
          eq(task.archived, false),
        ),
      )
    if (rows.length !== orderedIds.length) throw Errors.badRequest('Tarea inexistente en este proyecto')

    const now = new Date()
    const positions = sql.join(
      orderedIds.map((taskId, i) => sql`WHEN ${taskId} THEN ${i}`),
      sql` `,
    )
    await tx
      .update(task)
      .set({ position: sql`CASE ${task.id} ${positions} END::int`, updatedAt: now })
      .where(inArray(task.id, orderedIds))

    const moved = rows.find((r) => r.id === input.taskId)
    await tx
      .update(task)
      .set({
        status: input.status,
        completedAt: input.status === 'completed' ? (moved?.completedAt ?? now) : null,
      })
      .where(eq(task.id, input.taskId))
  })
  return listProjectTasks(portalId, id)
}
