import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiDelete, apiList } from '../api'
import { fetchAllPages } from '../fetch-all-pages'
import type { ChecklistStep, Process, ProcessDetail, ProcessListItem, ProcessTask } from '../types'

// ─── Procesos (plantillas / SOPs) ─────────────────────────────────────────────
// Keys: ['processes', 'list'] · ['processes', 'detail', id].

export function useProcesses() {
  return useQuery({
    queryKey: ['processes', 'list'],
    queryFn: () => fetchAllPages<ProcessListItem>(apiList, '/api/processes'),
  })
}

export function useProcess(id: string | null) {
  return useQuery({
    queryKey: ['processes', 'detail', id],
    queryFn: () => apiGet<ProcessDetail>(`/api/processes/${id}`),
    enabled: id != null,
  })
}

export interface CreateProcessInput {
  /** kebab-case; inmutable una vez creado (los proyectos lo guardan en `kind`). */
  slug: string
  name: string
  description?: string | null
}

export interface UpdateProcessInput {
  name?: string
  description?: string | null
}

export function useCreateProcess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateProcessInput) => apiPost<Process>('/api/processes', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['processes'] }),
  })
}

export function useUpdateProcess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProcessInput }) =>
      apiPatch<Process>(`/api/processes/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['processes'] }),
  })
}

export function useArchiveProcess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/api/processes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['processes'] }),
  })
}

export interface ProcessTaskInput {
  title: string
  notes?: string | null
  steps?: ChecklistStep[]
}

export function useCreateProcessTask(processId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ProcessTaskInput) => apiPost<ProcessTask>(`/api/processes/${processId}/tasks`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['processes'] }),
  })
}

export function useUpdateProcessTask(processId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, input }: { taskId: string; input: Partial<ProcessTaskInput> }) =>
      apiPatch<ProcessTask>(`/api/processes/${processId}/tasks/${taskId}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['processes'] }),
  })
}

export function useDeleteProcessTask(processId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) =>
      apiDelete<{ success: boolean }>(`/api/processes/${processId}/tasks/${taskId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['processes'] }),
  })
}

/** Reordena las tareas del proceso. Optimista sobre el detalle; revierte si falla. */
export function useReorderProcessTasks(processId: string) {
  const qc = useQueryClient()
  const key = ['processes', 'detail', processId]
  return useMutation<unknown, Error, string[], { previous: ProcessDetail | undefined }>({
    mutationFn: (orderedIds) => apiPost<unknown>(`/api/processes/${processId}/tasks/reorder`, { orderedIds }),
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<ProcessDetail>(key)
      qc.setQueryData<ProcessDetail>(key, (old) => {
        if (!old) return old
        const byId = new Map(old.tasks.map((t) => [t.id, t]))
        const tasks = orderedIds
          .map((id, i) => {
            const t = byId.get(id)
            return t ? { ...t, position: i } : undefined
          })
          .filter((t): t is ProcessTask => t !== undefined)
        return { ...old, tasks }
      })
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['processes'] }),
  })
}
