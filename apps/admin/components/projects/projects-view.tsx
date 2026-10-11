'use client'

/**
 * Lista de proyectos (/admin/projects): tarjetas o tabla, filtros por grupo de
 * estado (con conteos) y por empresa. En "Todos" se agrupa en secciones por
 * grupo de estado, con "Entregados" al final. Los filtros son locales.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, FolderOpen, LayoutGrid, Plus, Table as TableIcon } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { useArchiveProject, useCompanies, useDuplicateProject, useProjects } from '@/lib/hooks'
import type { ProjectListItem } from '@/lib/types'
import { PROJECT_STATUS_GROUPS, projectStatusGroup, type ProjectStatusGroupKey } from '@/lib/projects'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import { PillTabs } from '@/components/ui/pill-tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CardGridSkeleton, TableSkeleton } from '@/components/ui/skeletons'
import { ProjectCard } from '@/components/projects/project-card'
import { ProjectDialog } from '@/components/projects/project-dialog'
import { ProjectsTable } from '@/components/projects/projects-table'

type ViewMode = 'cards' | 'table'
type GroupFilter = 'all' | ProjectStatusGroupKey

const VIEW_STORAGE_KEY = 'synous:projects:view'

const VIEW_BUTTONS: { mode: ViewMode; icon: typeof LayoutGrid; label: string }[] = [
  { mode: 'cards', icon: LayoutGrid, label: 'Tarjetas' },
  { mode: 'table', icon: TableIcon, label: 'Tabla' },
]

function readStoredView(): ViewMode {
  try {
    const v = window.localStorage.getItem(VIEW_STORAGE_KEY)
    return v === 'table' || v === 'cards' ? v : 'cards'
  } catch {
    return 'cards'
  }
}

/** Vence antes primero; sin fecha al final; desempata por nombre. */
function byDueThenName(a: ProjectListItem, b: ProjectListItem): number {
  const da = a.dueDate ?? '9999-12-31'
  const db = b.dueDate ?? '9999-12-31'
  return da === db ? a.name.localeCompare(b.name, 'es') : da < db ? -1 : 1
}

export function ProjectsView(): React.JSX.Element {
  const router = useRouter()
  const { data, isLoading, isError, refetch } = useProjects()
  const { data: companies } = useCompanies()
  const archive = useArchiveProject()
  const duplicate = useDuplicateProject()

  const [view, setView] = useState<ViewMode>('cards')
  const [group, setGroup] = useState<GroupFilter>('all')
  const [companyId, setCompanyId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectListItem | null>(null)
  const [archiving, setArchiving] = useState<ProjectListItem | null>(null)

  // Se lee en un efecto (no en el initializer) para que SSR y primer render coincidan.
  useEffect(() => setView(readStoredView()), [])
  function changeView(mode: ViewMode): void {
    setView(mode)
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, mode)
    } catch {
      /* storage bloqueado: la preferencia solo dura la sesión */
    }
  }

  const all = useMemo(() => data ?? [], [data])
  const byCompany = useMemo(
    () => (companyId ? all.filter((p) => p.companyId === companyId) : all),
    [all, companyId],
  )

  const counts = useMemo(() => {
    const c: Record<GroupFilter, number> = {
      all: byCompany.length,
      not_started: 0,
      active: 0,
      waiting_client: 0,
      on_hold: 0,
      delivered: 0,
    }
    for (const p of byCompany) c[projectStatusGroup(p.status)] += 1
    return c
  }, [byCompany])

  // Secciones en el orden de PROJECT_STATUS_GROUPS (Entregados último), sin las vacías.
  const sections = useMemo(
    () =>
      PROJECT_STATUS_GROUPS.filter((g) => group === 'all' || g.key === group)
        .map((g) => ({
          ...g,
          projects: byCompany.filter((p) => projectStatusGroup(p.status) === g.key).sort(byDueThenName),
        }))
        .filter((s) => s.projects.length > 0),
    [byCompany, group],
  )
  const flat = useMemo(() => sections.flatMap((s) => s.projects), [sections])

  const onEdit = useCallback((p: ProjectListItem) => setEditing(p), [])
  const onArchive = useCallback((p: ProjectListItem) => setArchiving(p), [])
  const onDuplicate = useCallback(
    (p: ProjectListItem) => {
      duplicate.mutate(p.id, {
        onSuccess: (copy) => {
          toast.success('Proyecto duplicado')
          router.push(`/projects/${copy.id}`)
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo duplicar el proyecto'),
      })
    },
    [duplicate, router],
  )

  function confirmArchive(): void {
    if (!archiving) return
    archive.mutate(archiving.id, {
      onSuccess: () => {
        toast.success('Proyecto archivado')
        setArchiving(null)
      },
      onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo archivar el proyecto'),
    })
  }

  const filtersActive = group !== 'all' || companyId !== ''

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Producción</p>
          <h1 className="text-3xl font-semibold tracking-tight">Proyectos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Seguimiento interno de cada proyecto: estado, etapa, equipo y tareas.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Nuevo proyecto
        </Button>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <PillTabs<GroupFilter>
          tabs={[
            { key: 'all', label: 'Todos', count: counts.all },
            ...PROJECT_STATUS_GROUPS.map((g) => ({ key: g.key as GroupFilter, label: g.label, count: counts[g.key] })),
          ]}
          active={group}
          onChange={setGroup}
          className="max-w-full overflow-x-auto"
        />

        <Select value={companyId || 'all'} onValueChange={(v) => setCompanyId(v === 'all' ? '' : v)}>
          <SelectTrigger className="h-8 w-48 text-xs" aria-label="Filtrar por empresa">
            <Building2 className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue placeholder="Empresa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las empresas</SelectItem>
            {(companies ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex rounded-lg border border-border bg-card p-1 shadow-card" role="group" aria-label="Vista">
          {VIEW_BUTTONS.map(({ mode, icon: Icon, label }) => (
            <Button
              key={mode}
              variant="ghost"
              size="sm"
              aria-pressed={view === mode}
              onClick={() => changeView(mode)}
              className={cn(
                'flex h-auto items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                view === mode
                  ? 'bg-accent text-accent-foreground shadow-sm hover:bg-accent'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        view === 'cards' ? (
          <CardGridSkeleton count={6} label="Cargando proyectos…" />
        ) : (
          <TableSkeleton columns={8} rows={6} label="Cargando proyectos…" />
        )
      ) : isError ? (
        <Empty>
          <EmptyHeader>
            <EmptyIllustration icon={FolderOpen} />
            <EmptyTitle>No se pudieron cargar los proyectos</EmptyTitle>
            <EmptyDescription>Revisá tu conexión e intentá de nuevo.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => void refetch()}>
              Reintentar
            </Button>
          </EmptyContent>
        </Empty>
      ) : flat.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyIllustration icon={FolderOpen} />
            <EmptyTitle>{all.length === 0 ? 'Sin proyectos todavía' : 'Sin resultados'}</EmptyTitle>
            <EmptyDescription>
              {all.length === 0
                ? 'Creá el primer proyecto o convertí un deal en proyecto desde su detalle.'
                : 'Ningún proyecto coincide con los filtros.'}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {all.length === 0 ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                Nuevo proyecto
              </Button>
            ) : filtersActive ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setGroup('all')
                  setCompanyId('')
                }}
              >
                Limpiar filtros
              </Button>
            ) : null}
          </EmptyContent>
        </Empty>
      ) : view === 'table' ? (
        <ProjectsTable projects={flat} onEdit={onEdit} onDuplicate={onDuplicate} onArchive={onArchive} />
      ) : (
        <div className="space-y-8">
          {sections.map((s) => (
            <section key={s.key} aria-labelledby={`group-${s.key}`}>
              {group === 'all' && (
                <h2
                  id={`group-${s.key}`}
                  className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  {s.label}
                  <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs">{s.projects.length}</span>
                </h2>
              )}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {s.projects.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    onEdit={() => onEdit(p)}
                    onDuplicate={() => onDuplicate(p)}
                    onArchive={() => onArchive(p)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <ProjectDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={(created) => router.push(`/projects/${created.id}`)}
      />
      <ProjectDialog open={editing != null} onClose={() => setEditing(null)} project={editing ?? undefined} />
      <ConfirmDialog
        open={archiving != null}
        onOpenChange={(o) => !o && setArchiving(null)}
        title="Archivar proyecto"
        description={
          archiving
            ? `"${archiving.name}" deja de aparecer en la lista. Sus tareas se conservan.`
            : undefined
        }
        confirmLabel="Archivar"
        destructive
        pending={archive.isPending}
        onConfirm={confirmArchive}
      />
    </div>
  )
}
