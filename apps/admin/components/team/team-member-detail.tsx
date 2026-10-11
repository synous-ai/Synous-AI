'use client'

/**
 * Detalle de una persona del equipo (/admin/team/[userId]): perfil, estado de
 * trabajo, proyectos activos y tareas abiertas (que abren el panel de tarea).
 */

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ChevronLeft, Pencil, Users } from 'lucide-react'
import { useHubUser, useTasks, useTeamMember } from '@/lib/hooks'
import { ApiError } from '@/lib/api'
import { roleLabel } from '@/lib/roles'
import { projectStatus, priority as priorityStatus, taskStatus } from '@/lib/status'
import type { TeamMemberDetail } from '@/lib/types'
import { cn, fullName } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import { DetailViewSkeleton } from '@/components/ui/skeletons'
import { StatusBadge } from '@/components/ui/status-badge'
import { DueBadge } from '@/components/projects/due-badge'
import { TaskPanel } from '@/components/tasks/task-panel'
import { MemberAvatar } from '@/components/team/member-avatar'
import { TeamProfileDialog } from '@/components/team/team-profile-dialog'
import { WorkStatusBadge, WorkStatusSelect } from '@/components/team/work-status'

function TextSection({ title, text }: { title: string; text: string | null }): React.JSX.Element {
  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {text ? (
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{text}</p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground/70">Sin definir</p>
      )}
    </Card>
  )
}

function Stat({ label, value, danger = false }: { label: string; value: number; danger?: boolean }): React.JSX.Element {
  return (
    <div>
      <dd className={cn('text-2xl font-semibold tabular-nums', danger && value > 0 && 'text-destructive')}>{value}</dd>
      <dt className="text-xs text-muted-foreground">{label}</dt>
    </div>
  )
}

function Body({ member, isOwner, isSelf }: { member: TeamMemberDetail; isOwner: boolean; isSelf: boolean }): React.JSX.Element {
  const [editOpen, setEditOpen] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  // El panel necesita la tarea completa (checklist, responsables): se lee de la lista de tareas
  // de la persona (el filtro assignedTo usa task_assignee, así que incluye co-responsables).
  const { data: fullTasks } = useTasks({ assignedTo: member.id })
  const selectedTask = selectedTaskId ? (fullTasks ?? []).find((t) => t.id === selectedTaskId) ?? null : null
  const name = fullName(member.firstName, member.lastName, member.email)

  return (
    <div className="p-6">
      <nav className="mb-4 flex items-center gap-2 text-sm text-muted-foreground" aria-label="Migas de pan">
        <Link href="/team" className="flex items-center gap-1 transition-colors hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Equipo
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-foreground">{name}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <MemberAvatar firstName={member.firstName} lastName={member.lastName} email={member.email} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-semibold tracking-tight">{name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="text-sm text-muted-foreground">{member.jobTitle ?? 'Sin cargo definido'}</span>
              <StatusBadge kind="neutral">{roleLabel(member.role)}</StatusBadge>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isOwner || isSelf ? (
            <WorkStatusSelect userId={member.id} value={member.workStatus} />
          ) : (
            <WorkStatusBadge status={member.workStatus} />
          )}
          {isOwner && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" /> Editar perfil
            </Button>
          )}
        </div>
      </div>

      <Card className="mb-6 p-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Stat label="Proyectos activos" value={member.activeProjects} />
          <Stat label="Tareas abiertas" value={member.openTasks} />
          <Stat label="Vencidas" value={member.overdueTasks} danger />
          <Stat label="En revisión" value={member.inReviewTasks} />
          <Stat label="Bloqueadas" value={member.blockedTasks} danger />
        </dl>
      </Card>

      <div className="mb-6 grid gap-3 lg:grid-cols-3">
        <TextSection title="Responsabilidades" text={member.responsibilities} />
        <TextSection title="Decide solo" text={member.autonomousDecisions} />
        <TextSection title="Necesita aprobación" text={member.approvalRequired} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="team-projects">
          <h2 id="team-projects" className="mb-2 text-lg font-semibold">
            Proyectos activos
          </h2>
          <Card className="divide-y">
            {member.projects.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No participa en proyectos activos.</p>
            ) : (
              member.projects.map((p) => {
                const st = projectStatus(p.status)
                return (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/50"
                  >
                    <span className="min-w-0 truncate text-sm font-medium">{p.name}</span>
                    <span className="flex flex-shrink-0 items-center gap-1.5">
                      <StatusBadge kind={st.kind}>{st.label}</StatusBadge>
                      <DueBadge date={p.dueDate} />
                    </span>
                  </Link>
                )
              })
            )}
          </Card>
        </section>

        <section aria-labelledby="team-tasks">
          <h2 id="team-tasks" className="mb-2 text-lg font-semibold">
            Tareas abiertas
          </h2>
          <Card className="divide-y">
            {member.tasks.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No tiene tareas abiertas.</p>
            ) : (
              member.tasks.map((t) => {
                const st = taskStatus(t.status)
                const pr = priorityStatus(t.priority)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTaskId(t.id)}
                    className="flex w-full items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{t.title}</span>
                      {t.projectName && <span className="block truncate text-xs text-muted-foreground">{t.projectName}</span>}
                    </span>
                    <span className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1.5">
                      <StatusBadge kind={st.kind}>{st.label}</StatusBadge>
                      <StatusBadge kind={pr.kind}>{pr.label}</StatusBadge>
                      <DueBadge date={t.dueDate} />
                    </span>
                  </button>
                )
              })
            )}
          </Card>
        </section>
      </div>

      <TaskPanel task={selectedTask} onClose={() => setSelectedTaskId(null)} />
      {isOwner && <TeamProfileDialog open={editOpen} onClose={() => setEditOpen(false)} member={member} />}
    </div>
  )
}

export function TeamMemberDetailView(): React.JSX.Element {
  const { userId } = useParams<{ userId: string }>()
  const { data: member, isLoading, isError, error, refetch } = useTeamMember(userId)
  const { data: me } = useHubUser()
  const isOwner = me?.role === 'owner'
  const isSelf = me?.id === userId

  if (isLoading) {
    return (
      <div className="p-6">
        <DetailViewSkeleton fields={6} tabs={0} actions={1} label="Cargando perfil…" />
      </div>
    )
  }

  if (isError || !member) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <div className="p-6">
        <Empty>
          <EmptyHeader>
            <EmptyIllustration icon={Users} />
            <EmptyTitle>{notFound ? 'Persona no encontrada' : 'No se pudo cargar el perfil'}</EmptyTitle>
            <EmptyDescription>
              {notFound ? 'El enlace es incorrecto o la persona ya no está en el equipo.' : 'Revisá tu conexión e intentá de nuevo.'}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {!notFound && (
              <Button size="sm" onClick={() => void refetch()}>
                Reintentar
              </Button>
            )}
            <Button size="sm" variant="outline" asChild>
              <Link href="/team">Volver al equipo</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    )
  }

  return <Body member={member} isOwner={isOwner} isSelf={isSelf} />
}
