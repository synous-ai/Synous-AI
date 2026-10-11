'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import type { ProjectListItem } from '@/lib/types'
import { priority as priorityStatus, projectStatus } from '@/lib/status'
import { percent, projectStageLabel } from '@/lib/projects'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DueBadge } from '@/components/projects/due-badge'
import { MemberAvatars } from '@/components/projects/member-avatars'
import { ProjectActionsMenu } from '@/components/projects/project-actions-menu'
import { TaskProgress } from '@/components/projects/project-card'

interface ColSpec {
  id: string
  header: string
  accessor: (p: ProjectListItem) => string | number
  cell: (p: ProjectListItem) => React.ReactNode
  sortable?: boolean
}

function createColumnDef(spec: ColSpec): ColumnDef<ProjectListItem> {
  return {
    id: spec.id,
    header: spec.header,
    accessorFn: spec.accessor,
    cell: ({ row }) => spec.cell(row.original),
    enableSorting: spec.sortable ?? true,
  }
}

const PRIORITY_RANK: Record<ProjectListItem['priority'], number> = { high: 0, medium: 1, low: 2 }

export function ProjectsTable({
  projects,
  onEdit,
  onDuplicate,
  onArchive,
}: {
  projects: ProjectListItem[]
  onEdit: (p: ProjectListItem) => void
  onDuplicate: (p: ProjectListItem) => void
  onArchive: (p: ProjectListItem) => void
}): React.JSX.Element {
  const router = useRouter()
  // Sin orden elegido se respeta el de la lista (grupos de estado, entregados al final).
  const [sorting, setSorting] = useState<SortingState>([])

  const columns = useMemo<ColumnDef<ProjectListItem>[]>(
    () => [
      createColumnDef({
        id: 'name',
        header: 'Proyecto',
        accessor: (p) => p.name,
        cell: (p) => <span className="font-medium">{p.name}</span>,
      }),
      createColumnDef({
        id: 'company',
        header: 'Empresa',
        accessor: (p) => p.companyName ?? '',
        cell: (p) => <span className="text-muted-foreground">{p.companyName ?? '—'}</span>,
      }),
      createColumnDef({
        id: 'status',
        header: 'Estado',
        accessor: (p) => projectStatus(p.status).label,
        cell: (p) => {
          const st = projectStatus(p.status)
          return <StatusBadge kind={st.kind}>{st.label}</StatusBadge>
        },
      }),
      createColumnDef({
        id: 'stage',
        header: 'Etapa',
        accessor: (p) => (p.stage ? projectStageLabel(p.stage) : ''),
        cell: (p) => <span className="text-sm text-muted-foreground">{p.stage ? projectStageLabel(p.stage) : '—'}</span>,
      }),
      createColumnDef({
        id: 'priority',
        header: 'Prioridad',
        accessor: (p) => PRIORITY_RANK[p.priority],
        cell: (p) => {
          const pr = priorityStatus(p.priority)
          return <StatusBadge kind={pr.kind}>{pr.label}</StatusBadge>
        },
      }),
      createColumnDef({
        id: 'members',
        header: 'Equipo',
        accessor: (p) => p.members.length,
        cell: (p) => <MemberAvatars members={p.members} />,
        sortable: false,
      }),
      createColumnDef({
        id: 'due',
        header: 'Vence',
        // Sin fecha al final al ordenar ascendente.
        accessor: (p) => p.dueDate ?? '9999-12-31',
        cell: (p) => <DueBadge date={p.dueDate} done={p.status === 'delivered'} />,
      }),
      createColumnDef({
        id: 'progress',
        header: 'Progreso',
        accessor: (p) => percent(p.taskCounts.completed, p.taskCounts.total),
        cell: (p) => (
          <div className="w-32">
            <TaskProgress completed={p.taskCounts.completed} total={p.taskCounts.total} />
          </div>
        ),
      }),
      createColumnDef({
        id: 'actions',
        header: '',
        accessor: () => 0,
        sortable: false,
        cell: (p) => (
          <ProjectActionsMenu
            projectName={p.name}
            onEdit={() => onEdit(p)}
            onDuplicate={() => onDuplicate(p)}
            onArchive={() => onArchive(p)}
          />
        ),
      }),
    ],
    [onEdit, onDuplicate, onArchive],
  )

  const table = useReactTable({
    data: projects,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-muted/40 hover:bg-muted/40">
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted()
                  const canSort = h.column.getCanSort()
                  return (
                    <TableHead
                      key={h.id}
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                      className="px-4 py-3 text-xs font-medium text-muted-foreground"
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={h.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === 'asc' ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                tabIndex={0}
                onClick={() => router.push(`/projects/${row.original.id}`)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && e.key === 'Enter') router.push(`/projects/${row.original.id}`)
                }}
                className={cn(
                  'cursor-pointer transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none',
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
