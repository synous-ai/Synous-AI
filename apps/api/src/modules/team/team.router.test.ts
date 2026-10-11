/**
 * team.router.test.ts — Equipo: carga de trabajo por persona, permisos de edición
 * del perfil y guardia de tenant.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import { auditLog, hubUser, portal, project, projectMember, task, taskAssignee } from '../../db/schema'
import { ensurePortalAndUser, listenForSupertest, loginToken } from '../../test/helpers'

const app = buildApp()
let ownerToken: string
let memberToken: string
let portalId: string
let ownerId: string
let ana: string // miembro con carga de trabajo
let ben: string // co-responsable
let foreignUserId: string
let memberId: string

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` })
const get = (url: string, t = ownerToken) => request(app.server).get(url).set(bearer(t))
const patch = (url: string, body: unknown, t = ownerToken) =>
  request(app.server).patch(url).set(bearer(t)).send(body as object)

async function mkUser(extra: Partial<typeof hubUser.$inferInsert> = {}) {
  const clerkUserId = `clerk_team_${randomUUID()}`
  const [u] = await db
    .insert(hubUser)
    .values({ portalId, email: `t-${randomUUID()}@test.com`, role: 'member', firstName: 'Tm', clerkUserId, ...extra })
    .returning()
  return { id: u!.id, token: `faketoken:${clerkUserId}` }
}

async function mkTask(values: Partial<typeof task.$inferInsert>, assignees: string[]) {
  const [t] = await db.insert(task).values({ portalId, title: 'T', ...values }).returning()
  if (assignees.length > 0) await db.insert(taskAssignee).values(assignees.map((hubUserId) => ({ taskId: t!.id, hubUserId })))
  return t!.id
}

beforeAll(async () => {
  await listenForSupertest(app)
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  ownerId = ctx.userId
  ownerToken = await loginToken(app, ctx.email, ctx.password)

  const a = await mkUser({ firstName: 'Ana' })
  const b = await mkUser({ firstName: 'Ben' })
  const m = await mkUser({ firstName: 'Mem' })
  ana = a.id
  ben = b.id
  memberId = m.id
  memberToken = m.token

  const [other] = await db.insert(portal).values({ name: `Otro Portal Equipo ${randomUUID()}` }).returning()
  const [fu] = await db
    .insert(hubUser)
    .values({ portalId: other!.id, email: `ajeno-${randomUUID()}@test.com`, role: 'member' })
    .returning()
  foreignUserId = fu!.id

  // Proyectos: 2 activos (uno con Ben), 1 entregado, 1 en pausa, 1 archivado → Ana cuenta 2.
  const mk = async (status: string, archived = false, members: string[] = [ana]) => {
    const [p] = await db.insert(project).values({ portalId, name: `P-${status}`, status, archived }).returning()
    await db.insert(projectMember).values(members.map((hubUserId) => ({ projectId: p!.id, hubUserId })))
    return p!.id
  }
  const activeProject = await mk('in_progress', false, [ana, ben])
  await mk('not_started')
  await mk('delivered')
  await mk('on_hold')
  await mk('in_progress', true)

  const past = new Date(Date.now() - 3 * 24 * 3600 * 1000)
  const future = new Date(Date.now() + 3 * 24 * 3600 * 1000)
  // Ana: 1 vencida, 1 en revisión, 1 bloqueada, 1 pendiente a futuro (co-asignada con Ben) = 4 abiertas.
  await mkTask({ title: 'Vencida', dueDate: past, projectId: activeProject }, [ana])
  await mkTask({ title: 'Revisión', status: 'in_review' }, [ana])
  await mkTask({ title: 'Bloqueada', status: 'blocked' }, [ana])
  await mkTask({ title: 'Compartida', dueDate: future, projectId: activeProject }, [ana, ben])
  // Excluidas: completada, cancelada, archivada (aunque vencidas).
  await mkTask({ status: 'completed', dueDate: past }, [ana])
  await mkTask({ status: 'cancelled', dueDate: past }, [ana])
  await mkTask({ archived: true, dueDate: past }, [ana])
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

describe('GET /api/team', () => {
  it('devuelve la carga de trabajo por persona (co-responsable cuenta, cerradas/archivadas no)', async () => {
    const res = await get('/api/team')
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const byId = new Map((res.body.data as { id: string }[]).map((m) => [m.id, m as Record<string, unknown>]))
    expect(byId.get(ana)).toMatchObject({
      activeProjects: 2,
      openTasks: 4,
      overdueTasks: 1,
      inReviewTasks: 1,
      blockedTasks: 1,
      workStatus: null,
      jobTitle: null,
    })
    // Ben solo es co-responsable de la tarea compartida y miembro de un proyecto.
    expect(byId.get(ben)).toMatchObject({ activeProjects: 1, openTasks: 1, overdueTasks: 0, inReviewTasks: 0, blockedTasks: 0 })
    expect(byId.get(memberId)).toMatchObject({ activeProjects: 0, openTasks: 0 })
  })

  it('excluye usuarios inactivos y de otros portales', async () => {
    const inactive = await mkUser({ isActive: false })
    const res = await get('/api/team')
    const ids = (res.body.data as { id: string }[]).map((m) => m.id)
    expect(ids).not.toContain(inactive.id)
    expect(ids).not.toContain(foreignUserId)
    expect(ids).toContain(ownerId)
  })

  it('requiere autenticación', async () => {
    expect((await request(app.server).get('/api/team')).status).toBe(401)
  })
})

describe('GET /api/team/:userId', () => {
  it('trae proyectos activos y tareas abiertas de la persona', async () => {
    const res = await get(`/api/team/${ana}`)
    expect(res.status).toBe(200)
    const d = res.body.data as {
      openTasks: number
      projects: { name: string; status: string }[]
      tasks: { title: string; projectName: string | null }[]
    }
    expect(d.openTasks).toBe(4)
    expect(d.projects.map((p) => p.status).sort()).toEqual(['in_progress', 'not_started'])
    expect(d.tasks).toHaveLength(4)
    expect(d.tasks.find((t) => t.title === 'Vencida')?.projectName).toBe('P-in_progress')
    expect(d.tasks.map((t) => t.title)).not.toContain('T')
  })

  it('usuario de otro portal: 404', async () => {
    expect((await get(`/api/team/${foreignUserId}`)).status).toBe(404)
  })
})

describe('PATCH /api/team/:userId/profile', () => {
  it('un owner edita el perfil de cualquiera (upsert parcial) y deja audit_log', async () => {
    const first = await patch(`/api/team/${ben}/profile`, {
      jobTitle: 'Dev',
      responsibilities: 'Frontend',
      autonomousDecisions: 'Refactors chicos',
      approvalRequired: 'Cambios de precio',
    })
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(first.body.data).toMatchObject({ jobTitle: 'Dev', responsibilities: 'Frontend', workStatus: null })

    const second = await patch(`/api/team/${ben}/profile`, { workStatus: 'blocked', jobTitle: '' })
    expect(second.status).toBe(200)
    expect(second.body.data).toMatchObject({
      jobTitle: null,
      responsibilities: 'Frontend',
      approvalRequired: 'Cambios de precio',
      workStatus: 'blocked',
    })
    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'team_member_profile'), eq(auditLog.entityId, ben)))
    expect(audits).toHaveLength(2)
    expect(audits[0]!.userId).toBe(ownerId)
  })

  it('un no-owner puede cambiar SOLO su propio workStatus', async () => {
    const own = await patch(`/api/team/${memberId}/profile`, { workStatus: 'working' }, memberToken)
    expect(own.status, JSON.stringify(own.body)).toBe(200)
    expect(own.body.data.workStatus).toBe('working')

    const cleared = await patch(`/api/team/${memberId}/profile`, { workStatus: null }, memberToken)
    expect(cleared.status).toBe(200)
    expect(cleared.body.data.workStatus).toBeNull()

    const otherStatus = await patch(`/api/team/${ben}/profile`, { workStatus: 'available' }, memberToken)
    expect(otherStatus.status).toBe(403)

    const ownField = await patch(`/api/team/${memberId}/profile`, { jobTitle: 'CEO' }, memberToken)
    expect(ownField.status).toBe(403)
    const mixed = await patch(`/api/team/${memberId}/profile`, { workStatus: 'working', responsibilities: 'x' }, memberToken)
    expect(mixed.status).toBe(403)
  })

  it('valida el body con Zod', async () => {
    expect((await patch(`/api/team/${ben}/profile`, { workStatus: 'nope' })).status).toBe(400)
    expect((await patch(`/api/team/${ben}/profile`, {})).status).toBe(400)
  })

  it('guardia de tenant: usuario de otro portal se rechaza sin crear perfil', async () => {
    const res = await patch(`/api/team/${foreignUserId}/profile`, { jobTitle: 'Intruso' })
    expect(res.status).toBe(400)
    const check = await get(`/api/team/${foreignUserId}`)
    expect(check.status).toBe(404)
  })
})
