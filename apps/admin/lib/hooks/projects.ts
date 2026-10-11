import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiDelete, apiList } from '../api'
import { fetchAllPages } from '../fetch-all-pages'
import type {
  ProjectDetail,
  ProjectListItem,
  ProjectPriority,
  ProjectStage,
  ProjectStatus,
  Task,
  TaskStatus,
} from '../types'

// ─── Proyectos ────────────────────────────────────────────────────────────────
// Keys: ['projects', 'list', filters] · ['projects', 'detail', id].
// Las tareas del proyecto viven bajo ['tasks', 'project', id] para que las
// mutaciones de tareas (que invalidan ['tasks']) las refresquen solas.

export interface ProjectFilters {
  status?: ProjectStatus
  companyId?: string
  memberId?: string
  includeArchived?: boolean
}

export function useProjects(filters: ProjectFilters = {}) {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.companyId) params.set('companyId', filters.companyId)
  if (filters.memberId) params.set('memberId', filters.memberId)
  if (filters.includeArchived) params.set('includeArchived', 'true')
  const qs = params.toString()
  return useQuery({
    queryKey: ['projects', 'list', filters],
    queryFn: () => fetchAllPages<ProjectListItem>(apiList, `/api/projects${qs ? `?${qs}` : ''}`),
  })
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: ['projects', 'detail', id],
    queryFn: () => apiGet<ProjectDetail>(`/api/projects/${id}`),
    enabled: id != null,
  })
}

/** Campos de POST /api/projects (startDate obligatorio). Fechas 'YYYY-MM-DD'. */
export interface CreateProjectInput {
  name: string
  startDate: string
  kind?: string | null
  status?: ProjectStatus
  stage?: ProjectStage | null
  priority?: ProjectPriority
  dueDate?: string | null
  repoUrl?: string | null
  stagingUrl?: string | null
  productionUrl?: string | null
  notes?: string | null
  notesImportant?: string | null
  companyId?: string | null
  dealId?: string | null
  memberIds?: string[]
}

/** PATCH /api/projects/:id — parcial; `memberIds` reemplaza el set completo. */
export type UpdateProjectInput = Partial<Omit<CreateProjectInput, 'startDate'>> & {
  startDate?: string | null
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateProjectInput) => apiPost<ProjectDetail>('/api/projects', input),
    // Crear con `kind` copia tareas del proceso → también refrescar las tareas.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects'] })
      void qc.invalidateQueries({ queryKey: ['tasks'] })
      void qc.invalidateQueries({ queryKey: ['team'] })
    },
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProjectInput }) =>
      apiPatch<ProjectDetail>(`/api/projects/${id}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects'] })
      void qc.invalidateQueries({ queryKey: ['team'] })
    },
  })
}

export function useArchiveProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/api/projects/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects'] })
      void qc.invalidateQueries({ queryKey: ['tasks'] })
      void qc.invalidateQueries({ queryKey: ['team'] })
    },
  })
}

export function useDuplicateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiPost<ProjectDetail>(`/api/projects/${id}/duplicate`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects'] })
      void qc.invalidateQueries({ queryKey: ['tasks'] })
      void qc.invalidateQueries({ queryKey: ['team'] })
    },
  })
}

// ─── Tareas del proyecto (kanban) ─────────────────────────────────────────────

export function projectTasksKey(projectId: string): readonly unknown[] {
  return ['tasks', 'project', projectId]
}

export function useProjectTasks(projectId: string | null) {
  return useQuery({
    queryKey: projectTasksKey(projectId ?? ''),
    queryFn: () => apiGet<Task[]>(`/api/projects/${projectId}/tasks`),
    enabled: projectId != null,
  })
}

export interface MoveProjectTaskInput {
  taskId: string
  status: TaskStatus
  /** Ids COMPLETOS de la columna destino, en el orden final (incluye `taskId`). */
  orderedIds: string[]
}

interface MoveContext {
  previous: Task[] | undefined
}

/**
 * Mueve / reordena una tarea del kanban. Optimista: reescribe status y posición
 * en el cache al instante y revierte si el POST falla.
 */
export function useMoveProjectTask(projectId: string) {
  const qc = useQueryClient()
  const key = projectTasksKey(projectId)
  return useMutation<Task[], Error, MoveProjectTaskInput, MoveContext>({
    mutationFn: (input) => apiPost<Task[]>(`/api/projects/${projectId}/tasks/move`, input),
    onMutate: async ({ taskId, status, orderedIds }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<Task[]>(key)
      qc.setQueryData<Task[]>(key, (old) => {
        if (!old) return old
        const position = new Map(orderedIds.map((id, i) => [id, i]))
        return old.map((t) => {
          if (t.id === taskId) {
            return {
              ...t,
              status,
              position: position.get(t.id) ?? t.position,
              completedAt: status === 'completed' ? (t.completedAt ?? new Date().toISOString()) : null,
            }
          }
          const p = position.get(t.id)
          return p === undefined ? t : { ...t, position: p }
        })
      })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSuccess: (tasks) => qc.setQueryData(key, tasks),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['projects'] })
      void qc.invalidateQueries({ queryKey: ['team'] })
    },
  })
}
