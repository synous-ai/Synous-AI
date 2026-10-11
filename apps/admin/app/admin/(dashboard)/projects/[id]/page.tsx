'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Archive, ChevronLeft, Copy, FolderOpen, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { useArchiveProject, useDuplicateProject, useProject, useProjectTasks } from '@/lib/hooks'
import { priority as priorityStatus, projectStatus } from '@/lib/status'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import { PillTabs } from '@/components/ui/pill-tabs'
import { StatusBadge } from '@/components/ui/status-badge'
import { DetailViewSkeleton, KanbanSkeleton } from '@/components/ui/skeletons'
import { ProjectDialog } from '@/components/projects/project-dialog'
import { ProjectNotes } from '@/components/projects/project-notes'
import { ProjectProperties } from '@/components/projects/project-properties'
import { ProjectTaskBoard } from '@/components/projects/project-task-board'
import { ProjectTasksTable } from '@/components/projects/project-tasks-table'
import { TaskDialog } from '@/components/tasks/task-dialog'
import { TaskPanel } from '@/components/tasks/task-panel'

type Tab = 'board' | 'table' | 'notes'

export default function ProjectDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: project, isLoading, isError, error, refetch } = useProject(id)
  const tasksQ = useProjectTasks(id)
  const archive = useArchiveProject()
  const duplicate = useDuplicateProject()

  const [tab, setTab] = useState<Tab>('board')
  const [editOpen, setEditOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data])
  const selectedTask = selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) ?? null : null
  const boardCount = useMemo(() => tasks.filter((t) => t.status !== 'cancelled').length, [tasks])

  function onDuplicate(): void {
    duplicate.mutate(id, {
      onSuccess: (copy) => {
        toast.success('Proyecto duplicado')
        router.push(`/projects/${copy.id}`)
      },
      onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo duplicar el proyecto'),
    })
  }

  function onArchive(): void {
    archive.mutate(id, {
      onSuccess: () => {
        toast.success('Proyecto archivado')
        router.push('/projects')
      },
      onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo archivar el proyecto'),
    })
  }

  if (isLoading) return <div className="p-6"><DetailViewSkeleton fields={8} tabs={3} actions={3} label="Cargando proyecto…" /></div>

  if (isError || !project) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <div className="p-6">
        <Empty>
          <EmptyHeader>
            <EmptyIllustration icon={FolderOpen} />
            <EmptyTitle>{notFound ? 'Proyecto no encontrado' : 'No se pudo cargar el proyecto'}</EmptyTitle>
            <EmptyDescription>
              {notFound ? 'Puede que se haya archivado o que el enlace sea incorrecto.' : 'Revisá tu conexión e intentá de nuevo.'}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {!notFound && (
              <Button size="sm" onClick={() => void refetch()}>
                Reintentar
              </Button>
            )}
            <Button size="sm" variant="outline" asChild>
              <Link href="/projects">Volver a proyectos</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    )
  }

  const st = projectStatus(project.status)
  const pr = priorityStatus(project.priority)

  return (
    <div className="p-6">
      <nav className="mb-4 flex items-center gap-2 text-sm text-muted-foreground" aria-label="Migas de pan">
        <Link href="/projects" className="flex items-center gap-1 transition-colors hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Proyectos
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-foreground">{project.name}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge kind={st.kind}>{st.label}</StatusBadge>
            <StatusBadge kind={pr.kind}>{pr.label}</StatusBadge>
            {project.company && <span className="text-sm text-muted-foreground">{project.company.name}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" /> Editar
          </Button>
          <Button variant="outline" size="sm" onClick={onDuplicate} disabled={duplicate.isPending}>
            <Copy className="h-3.5 w-3.5" /> {duplicate.isPending ? 'Duplicando…' : 'Duplicar'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/40 text-destructive hover:bg-destructive/5"
            onClick={() => setArchiveOpen(true)}
          >
            <Archive className="h-3.5 w-3.5" /> Archivar
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full lg:w-80 lg:flex-shrink-0" aria-label="Propiedades del proyecto">
          <ProjectProperties project={project} />
        </aside>

        <div className="min-w-0 flex-1">
          <Card className="rounded-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <PillTabs<Tab>
                tabs={[
                  { key: 'board', label: 'Tablero', count: boardCount },
                  { key: 'table', label: 'Tabla', count: tasks.length },
                  { key: 'notes', label: 'Notas' },
                ]}
                active={tab}
                onChange={setTab}
              />
              {tab !== 'notes' && (
                <Button size="sm" onClick={() => setNewTaskOpen(true)}>
                  <Plus className="h-4 w-4" /> Nueva tarea
                </Button>
              )}
            </div>
            <div className="p-4">
              {tab === 'notes' ? (
                <ProjectNotes project={project} />
              ) : tasksQ.isLoading ? (
                <KanbanSkeleton columns={3} cardsPerColumn={3} label="Cargando tareas…" />
              ) : tasksQ.isError ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>No se pudieron cargar las tareas</EmptyTitle>
                    <EmptyDescription>Revisá tu conexión e intentá de nuevo.</EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button size="sm" onClick={() => void tasksQ.refetch()}>
                      Reintentar
                    </Button>
                  </EmptyContent>
                </Empty>
              ) : tab === 'board' ? (
                <ProjectTaskBoard projectId={project.id} tasks={tasks} onOpenTask={(t) => setSelectedTaskId(t.id)} />
              ) : (
                <ProjectTasksTable tasks={tasks} onOpenTask={(t) => setSelectedTaskId(t.id)} />
              )}
            </div>
          </Card>
        </div>
      </div>

      <TaskPanel task={selectedTask} onClose={() => setSelectedTaskId(null)} />
      <TaskDialog open={newTaskOpen} onClose={() => setNewTaskOpen(false)} fixedProjectId={project.id} />
      <ProjectDialog open={editOpen} onClose={() => setEditOpen(false)} project={project} />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archivar proyecto"
        description={`"${project.name}" deja de aparecer en la lista de proyectos. Sus tareas también se archivan.`}
        confirmLabel="Archivar"
        destructive
        pending={archive.isPending}
        onConfirm={onArchive}
      />
    </div>
  )
}
