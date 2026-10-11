'use client'

import Link from 'next/link'
import { Building2 } from 'lucide-react'
import type { ProjectListItem } from '@/lib/types'
import { priority as priorityStatus, projectStatus } from '@/lib/status'
import { percent, projectStageLabel } from '@/lib/projects'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { DueBadge } from '@/components/projects/due-badge'
import { MemberAvatars } from '@/components/projects/member-avatars'
import { ProjectActionsMenu } from '@/components/projects/project-actions-menu'

export function TaskProgress({ completed, total }: { completed: number; total: number }): React.JSX.Element {
  const pct = percent(completed, total)
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Progreso de tareas"
      >
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-muted-foreground">
        {total === 0 ? 'Sin tareas' : `${completed}/${total}`}
      </span>
    </div>
  )
}

export function ProjectCard({
  project,
  onEdit,
  onDuplicate,
  onArchive,
}: {
  project: ProjectListItem
  onEdit: () => void
  onDuplicate: () => void
  onArchive: () => void
}): React.JSX.Element {
  const st = projectStatus(project.status)
  const pr = priorityStatus(project.priority)
  return (
    <Card className="relative flex flex-col gap-3 p-4 transition-all hover:-translate-y-0.5 hover:border-signal/40 hover:shadow-lift">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* Stretched link: toda la tarjeta navega, pero el menú queda por encima (z-10). */}
          <Link
            href={`/projects/${project.id}`}
            className="line-clamp-2 text-base font-semibold leading-snug after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring after:rounded-xl"
          >
            {project.name}
          </Link>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Building2 className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            {project.companyName ?? 'Sin empresa'}
          </p>
        </div>
        <ProjectActionsMenu
          projectName={project.name}
          onEdit={onEdit}
          onDuplicate={onDuplicate}
          onArchive={onArchive}
          className="relative z-10 -mr-2 -mt-1 h-8 w-8"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge kind={st.kind}>{st.label}</StatusBadge>
        {project.stage && <StatusBadge kind="neutral">{projectStageLabel(project.stage)}</StatusBadge>}
        <StatusBadge kind={pr.kind}>{pr.label}</StatusBadge>
      </div>

      <TaskProgress completed={project.taskCounts.completed} total={project.taskCounts.total} />

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <MemberAvatars members={project.members} />
        <DueBadge date={project.dueDate} done={project.status === 'delivered'} />
      </div>
    </Card>
  )
}
