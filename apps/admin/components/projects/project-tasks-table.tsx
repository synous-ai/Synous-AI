'use client'

import { ListChecks } from 'lucide-react'
import type { Task } from '@/lib/types'
import { priority as priorityStatus, taskStatus } from '@/lib/status'
import { checklistProgress } from '@/lib/projects'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { TableShell } from '@/components/ui/data-table'
import { DueBadge } from '@/components/projects/due-badge'
import { MemberAvatars } from '@/components/projects/member-avatars'

/** Tabla plana de las tareas del proyecto (incluye canceladas, que el tablero oculta). */
export function ProjectTasksTable({ tasks, onOpenTask }: { tasks: Task[]; onOpenTask: (t: Task) => void }): React.JSX.Element {
  return (
    <Card>
      <CardContent className="p-0">
        <TableShell
          columns={[
            { key: 'title', label: 'Tarea' },
            { key: 'status', label: 'Estado' },
            { key: 'priority', label: 'Prioridad' },
            { key: 'assignees', label: 'Responsables' },
            { key: 'checklist', label: 'Checklist' },
            { key: 'due', label: 'Vence' },
          ]}
          rows={tasks}
          emptyMessage="Este proyecto no tiene tareas"
          renderRow={(t) => {
            const st = taskStatus(t.status)
            const pr = priorityStatus(t.priority)
            const progress = checklistProgress(t.steps)
            return (
              <tr
                key={t.id}
                tabIndex={0}
                onClick={() => onOpenTask(t)}
                onKeyDown={(e) => e.key === 'Enter' && onOpenTask(t)}
                className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
              >
                <td className="px-4 py-3 text-sm font-medium">{t.title}</td>
                <td className="px-4 py-3">
                  <StatusBadge kind={st.kind}>{st.label}</StatusBadge>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge kind={pr.kind}>{pr.label}</StatusBadge>
                </td>
                <td className="px-4 py-3">
                  <MemberAvatars members={t.assignees ?? []} max={3} />
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {progress.total > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <ListChecks className="h-3 w-3" aria-hidden="true" />
                      {progress.done}/{progress.total}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3">
                  <DueBadge date={t.dueDate} done={t.status === 'completed' || t.status === 'cancelled'} />
                </td>
              </tr>
            )
          }}
        />
      </CardContent>
    </Card>
  )
}
