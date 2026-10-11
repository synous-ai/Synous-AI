'use client'

import Link from 'next/link'
import { Building2, CalendarClock, ExternalLink, Flag, GitBranch, Globe, Handshake, Layers, Rocket, Users, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { useProcesses, useUpdateProject } from '@/lib/hooks'
import type { ProjectDetail, ProjectPriority, ProjectStage, ProjectStatus } from '@/lib/types'
import { PRIORITY_OPTIONS, PROJECT_STAGE_OPTIONS, PROJECT_STATUS_OPTIONS, formatDateOnly } from '@/lib/projects'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DueBadge } from '@/components/projects/due-badge'
import { MemberAvatars } from '@/components/projects/member-avatars'
import { fullName } from '@/lib/utils'

const NONE = 'none'

function Row({
  icon: Icon,
  label,
  htmlFor,
  children,
}: {
  icon: typeof Flag
  label: string
  htmlFor?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <label htmlFor={htmlFor} className="flex w-28 flex-shrink-0 items-center gap-2 pt-1 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </label>
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </div>
  )
}

function ExternalLinkRow({ icon, label, url }: { icon: typeof Flag; label: string; url: string | null }): React.JSX.Element {
  return (
    <Row icon={icon} label={label}>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-1 text-primary hover:underline"
        >
          <span className="truncate">{url.replace(/^https?:\/\//i, '')}</span>
          <ExternalLink className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
          <span className="sr-only">(se abre en una pestaña nueva)</span>
        </a>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </Row>
  )
}

export function ProjectProperties({ project }: { project: ProjectDetail }): React.JSX.Element {
  const update = useUpdateProject()
  const { data: processes } = useProcesses()

  function save(input: Parameters<typeof update.mutate>[0]['input']): void {
    update.mutate(
      { id: project.id, input },
      { onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el cambio') },
    )
  }

  const kindName = project.kind ? (processes ?? []).find((p) => p.slug === project.kind)?.name ?? project.kind : null

  return (
    <Card className="rounded-2xl">
      <CardContent className="divide-y divide-border p-5">
        <Row icon={Rocket} label="Estado" htmlFor="prop-status">
          <Select value={project.status} onValueChange={(v) => save({ status: v as ProjectStatus })}>
            <SelectTrigger id="prop-status" className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        <Row icon={Layers} label="Etapa" htmlFor="prop-stage">
          <Select
            value={project.stage ?? NONE}
            onValueChange={(v) => save({ stage: v === NONE ? null : (v as ProjectStage) })}
          >
            <SelectTrigger id="prop-stage" className="h-8">
              <SelectValue placeholder="Sin etapa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sin etapa</SelectItem>
              {PROJECT_STAGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        <Row icon={Flag} label="Prioridad" htmlFor="prop-priority">
          <Select value={project.priority} onValueChange={(v) => save({ priority: v as ProjectPriority })}>
            <SelectTrigger id="prop-priority" className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        <Row icon={Building2} label="Empresa">
          {project.company ? (
            <Link href={`/companies/${project.company.id}`} className="text-primary hover:underline">
              {project.company.name}
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Row>

        <Row icon={Handshake} label="Deal">
          {project.deal ? (
            <Link href={`/deals/${project.deal.id}`} className="text-primary hover:underline">
              {project.deal.name}
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Row>

        <Row icon={CalendarClock} label="Inicio">
          {formatDateOnly(project.startDate, true)}
        </Row>
        <Row icon={CalendarClock} label="Vencimiento">
          {project.dueDate ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              {formatDateOnly(project.dueDate, true)}
              <DueBadge date={project.dueDate} done={project.status === 'delivered'} />
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Row>

        <Row icon={Users} label="Equipo">
          {project.members.length === 0 ? (
            <span className="text-muted-foreground">Sin miembros</span>
          ) : (
            <div className="space-y-1.5">
              <MemberAvatars members={project.members} max={6} />
              <p className="text-xs text-muted-foreground">
                {project.members.map((m) => fullName(m.firstName, m.lastName)).join(', ')}
              </p>
            </div>
          )}
        </Row>

        <Row icon={Wrench} label="Tipo">
          {kindName ?? <span className="text-muted-foreground">—</span>}
        </Row>

        <ExternalLinkRow icon={GitBranch} label="Repositorio" url={project.repoUrl} />
        <ExternalLinkRow icon={Globe} label="Staging" url={project.stagingUrl} />
        <ExternalLinkRow icon={Globe} label="Producción" url={project.productionUrl} />
      </CardContent>
    </Card>
  )
}
