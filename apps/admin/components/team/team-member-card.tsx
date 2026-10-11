import Link from 'next/link'
import { roleLabel } from '@/lib/roles'
import type { TeamMember } from '@/lib/types'
import { cn, fullName } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { MemberAvatar } from '@/components/team/member-avatar'
import { WorkStatusBadge } from '@/components/team/work-status'

function Count({ label, value, danger = false }: { label: string; value: number; danger?: boolean }): React.JSX.Element {
  return (
    <div className="min-w-0">
      <dd className={cn('text-xl font-semibold tabular-nums', danger && value > 0 && 'text-destructive')}>{value}</dd>
      <dt className="text-xs text-muted-foreground">{label}</dt>
    </div>
  )
}

export function TeamMemberCard({ member }: { member: TeamMember }): React.JSX.Element {
  const name = fullName(member.firstName, member.lastName, member.email)
  return (
    <Link
      href={`/team/${member.id}`}
      className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="h-full p-4 transition-colors hover:border-foreground/30">
        <div className="flex items-start gap-3">
          <MemberAvatar firstName={member.firstName} lastName={member.lastName} email={member.email} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{name}</p>
            <p className="truncate text-sm text-muted-foreground">{member.jobTitle ?? 'Sin cargo definido'}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <StatusBadge kind="neutral">{roleLabel(member.role)}</StatusBadge>
          <WorkStatusBadge status={member.workStatus} />
        </div>
        <dl className="mt-4 grid grid-cols-4 gap-2">
          <Count label="Proyectos" value={member.activeProjects} />
          <Count label="Abiertas" value={member.openTasks} />
          <Count label="Vencidas" value={member.overdueTasks} danger />
          <Count label="En revisión" value={member.inReviewTasks} />
        </dl>
        {member.responsibilities && (
          <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{member.responsibilities}</p>
        )}
      </Card>
    </Link>
  )
}
