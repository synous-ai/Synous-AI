import { and, asc, eq, notInArray, sql } from 'drizzle-orm'
import { db, type DB } from '../../db'
import { hubUser, project, projectMember, task, taskAssignee, teamMemberProfile } from '../../db/schema'
import { writeAudit, type Tx } from '../../lib/audit'
import { Errors } from '../../lib/errors'
import { assertHubUsersInPortal } from '../../lib/portal-access'
import type { UpdateTeamProfileDTO } from './team.schema'
import type {
  TeamMemberDTO,
  TeamMemberDetailDTO,
  TeamProjectDTO,
  TeamTaskDTO,
  TeamWorkloadDTO,
  WorkStatus,
} from './team.types'

const ENTITY = 'team_member_profile'
type Executor = DB | Tx

/** Proyectos que cuentan como carga activa: ni entregados ni en pausa. */
const INACTIVE_PROJECT_STATUSES = ['delivered', 'on_hold']
/** Tareas abiertas: ni completadas ni canceladas. */
const CLOSED_TASK_STATUSES = ['completed', 'cancelled']

const EMPTY_WORKLOAD: TeamWorkloadDTO = {
  activeProjects: 0,
  openTasks: 0,
  overdueTasks: 0,
  inReviewTasks: 0,
  blockedTasks: 0,
}

/**
 * Carga de trabajo de todo el portal en 2 queries agregadas (sin N+1).
 * Las tareas se cuentan por task_assignee: un co-responsable suma en cada uno.
 */
async function loadWorkloads(executor: Executor, portalId: string): Promise<Map<string, TeamWorkloadDTO>> {
  // Secuencial: el executor puede ser un tx (una sola conexión; el driver no admite queries en paralelo).
  const projectRows = await executor
      .select({ userId: projectMember.hubUserId, n: sql<number>`count(*)::int` })
      .from(projectMember)
      .innerJoin(project, eq(project.id, projectMember.projectId))
      .where(
        and(
          eq(project.portalId, portalId),
          eq(project.archived, false),
          notInArray(project.status, INACTIVE_PROJECT_STATUSES),
        ),
      )
      .groupBy(projectMember.hubUserId)
  const taskRows = await executor
      .select({
        userId: taskAssignee.hubUserId,
        open: sql<number>`count(*)::int`,
        overdue: sql<number>`count(*) FILTER (WHERE ${task.dueDate} < now())::int`,
        inReview: sql<number>`count(*) FILTER (WHERE ${task.status} = 'in_review')::int`,
        blocked: sql<number>`count(*) FILTER (WHERE ${task.status} = 'blocked')::int`,
      })
      .from(taskAssignee)
      .innerJoin(task, eq(task.id, taskAssignee.taskId))
      .where(
        and(eq(task.portalId, portalId), eq(task.archived, false), notInArray(task.status, CLOSED_TASK_STATUSES)),
      )
      .groupBy(taskAssignee.hubUserId)

  const map = new Map<string, TeamWorkloadDTO>()
  const get = (id: string): TeamWorkloadDTO => {
    let w = map.get(id)
    if (!w) {
      w = { ...EMPTY_WORKLOAD }
      map.set(id, w)
    }
    return w
  }
  for (const r of projectRows) get(r.userId).activeProjects = r.n
  for (const r of taskRows) {
    const w = get(r.userId)
    w.openTasks = r.open
    w.overdueTasks = r.overdue
    w.inReviewTasks = r.inReview
    w.blockedTasks = r.blocked
  }
  return map
}

type UserRow = Pick<typeof hubUser.$inferSelect, 'id' | 'firstName' | 'lastName' | 'email' | 'role'>
type ProfileRow = typeof teamMemberProfile.$inferSelect

function toMember(u: UserRow, p: ProfileRow | undefined, w: TeamWorkloadDTO | undefined): TeamMemberDTO {
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    role: u.role,
    jobTitle: p?.jobTitle ?? null,
    responsibilities: p?.responsibilities ?? null,
    autonomousDecisions: p?.autonomousDecisions ?? null,
    approvalRequired: p?.approvalRequired ?? null,
    workStatus: (p?.workStatus as WorkStatus | null | undefined) ?? null,
    ...(w ?? EMPTY_WORKLOAD),
  }
}

const userColumns = {
  id: hubUser.id,
  firstName: hubUser.firstName,
  lastName: hubUser.lastName,
  email: hubUser.email,
  role: hubUser.role,
}

/** Equipo chico: se devuelve completo, sin paginar. */
export async function listTeam(portalId: string): Promise<TeamMemberDTO[]> {
  const [users, profiles, workloads] = await Promise.all([
    db
      .select(userColumns)
      .from(hubUser)
      .where(and(eq(hubUser.portalId, portalId), eq(hubUser.isActive, true)))
      .orderBy(asc(hubUser.firstName), asc(hubUser.email), asc(hubUser.id)),
    db.select().from(teamMemberProfile).where(eq(teamMemberProfile.portalId, portalId)),
    loadWorkloads(db, portalId),
  ])
  const profileById = new Map(profiles.map((p) => [p.hubUserId, p]))
  return users.map((u) => toMember(u, profileById.get(u.id), workloads.get(u.id)))
}

export async function getTeamMember(
  portalId: string,
  userId: string,
  executor: Executor = db,
): Promise<TeamMemberDetailDTO> {
  const [user] = await executor
    .select(userColumns)
    .from(hubUser)
    .where(and(eq(hubUser.id, userId), eq(hubUser.portalId, portalId)))
    .limit(1)
  if (!user) throw Errors.notFound('Usuario no encontrado')

  const profileRows = await executor.select().from(teamMemberProfile).where(eq(teamMemberProfile.hubUserId, userId)).limit(1)
  const workloads = await loadWorkloads(executor, portalId)
  const projects = await executor
      .select({ id: project.id, name: project.name, status: project.status, dueDate: project.dueDate })
      .from(projectMember)
      .innerJoin(project, eq(project.id, projectMember.projectId))
      .where(
        and(
          eq(projectMember.hubUserId, userId),
          eq(project.portalId, portalId),
          eq(project.archived, false),
          notInArray(project.status, INACTIVE_PROJECT_STATUSES),
        ),
      )
      .orderBy(sql`${project.dueDate} ASC NULLS LAST`, asc(project.name), asc(project.id))
  const tasks = await executor
      .select({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        projectId: task.projectId,
        projectName: project.name,
      })
      .from(taskAssignee)
      .innerJoin(task, eq(task.id, taskAssignee.taskId))
      .leftJoin(project, eq(project.id, task.projectId))
      .where(
        and(
          eq(taskAssignee.hubUserId, userId),
          eq(task.portalId, portalId),
          eq(task.archived, false),
          notInArray(task.status, CLOSED_TASK_STATUSES),
        ),
      )
      .orderBy(sql`${task.dueDate} ASC NULLS LAST`, asc(task.createdAt), asc(task.id))
      .limit(200)
  return {
    ...toMember(user, profileRows[0], workloads.get(userId)),
    projects: projects satisfies TeamProjectDTO[],
    tasks: tasks satisfies TeamTaskDTO[],
  }
}

export interface TeamActor {
  id: string
  role: string
}

function blank(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  return v.trim() === '' ? null : v.trim()
}

/**
 * Upsert del perfil. Un owner edita a cualquiera; el resto SOLO su propio
 * `workStatus` (cualquier otro campo, o el de otra persona, es 403).
 */
export async function updateTeamProfile(
  portalId: string,
  actor: TeamActor,
  userId: string,
  input: UpdateTeamProfileDTO,
): Promise<TeamMemberDetailDTO> {
  if (actor.role !== 'owner') {
    const onlyWorkStatus = Object.entries(input).every(([k, v]) => v === undefined || k === 'workStatus')
    if (actor.id !== userId || !onlyWorkStatus) {
      throw Errors.forbidden('Solo un owner puede editar el perfil de otras personas')
    }
  }

  return db.transaction(async (tx) => {
    await assertHubUsersInPortal(portalId, [userId], tx)

    const values = {
      jobTitle: blank(input.jobTitle),
      responsibilities: blank(input.responsibilities),
      autonomousDecisions: blank(input.autonomousDecisions),
      approvalRequired: blank(input.approvalRequired),
      workStatus: input.workStatus,
    }
    // Solo las claves presentes: un PATCH parcial no pisa el resto del perfil.
    const patch = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) as Partial<
      typeof teamMemberProfile.$inferInsert
    >

    await tx
      .insert(teamMemberProfile)
      .values({ hubUserId: userId, portalId, ...patch })
      .onConflictDoUpdate({ target: teamMemberProfile.hubUserId, set: { ...patch, updatedAt: new Date() } })

    await writeAudit({
      tx,
      portalId,
      userId: actor.id,
      entityType: ENTITY,
      entityId: userId,
      action: 'UPDATE',
      payload: patch,
    })
    return getTeamMember(portalId, userId, tx)
  })
}
