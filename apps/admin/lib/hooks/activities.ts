import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiDelete, apiList } from '../api'
import { fetchAllPages } from '../fetch-all-pages'
import type { ChecklistStep, Note, Task, TaskStatus, TimelineItem } from '../types'
import { useInvalidatePeople } from './contacts'

export interface NoteInput {
  body: string
  dealId?: string
  contactId?: string
  companyId?: string
}

export function useCreateNote() {
  const invalidatePeople = useInvalidatePeople()
  return useMutation({
    mutationFn: (input: NoteInput) => apiPost<Note>('/api/notes', input),
    onSuccess: invalidatePeople,
  })
}

export function useDeleteNote() {
  const invalidatePeople = useInvalidatePeople()
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/api/notes/${id}`),
    onSuccess: invalidatePeople,
  })
}

export interface TaskFilters {
  status?: string
  assignedTo?: string
  dealId?: string
  projectId?: string
  priority?: string
}

/**
 * Devuelve todas las tareas del portal filtrando por los campos opcionales.
 * La queryKey incluye los filtros para que React Query cachee variantes separadas.
 */
export function useTasks(filters: TaskFilters = {}) {
  const qs = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v != null && v !== '') as [string, string][],
  ).toString()
  return useQuery({
    queryKey: ['tasks', filters],
    queryFn: () => fetchAllPages<Task>(apiList, `/api/tasks${qs ? `?${qs}` : ''}`),
  })
}

export interface TaskInput {
  title: string
  body?: string
  priority?: 'low' | 'medium' | 'high'
  status?: TaskStatus
  dueDate?: string
  assignedTo?: string
  /** Responsables (N:M). Si viene, manda sobre `assignedTo`. */
  assigneeIds?: string[]
  dealId?: string
  contactId?: string
  companyId?: string
  projectId?: string
  steps?: ChecklistStep[]
}

/** PATCH /api/tasks/:id — los campos nullable se limpian mandando `null`. */
export interface UpdateTaskInput extends Omit<Partial<TaskInput>, 'dueDate' | 'assignedTo' | 'projectId'> {
  dueDate?: string | null
  assignedTo?: string | null
  projectId?: string | null
}

export function useCreateTask() {
  const qc = useQueryClient()
  const invalidatePeople = useInvalidatePeople()
  return useMutation({
    mutationFn: (input: TaskInput) => apiPost<Task>('/api/tasks', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['focus'] })
      invalidatePeople()
    },
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  const invalidatePeople = useInvalidatePeople()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) => apiPatch<Task>(`/api/tasks/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['focus'] })
      invalidatePeople()
    },
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  const invalidatePeople = useInvalidatePeople()
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/api/tasks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      invalidatePeople()
    },
  })
}

export function useTimeline(
  params: { dealId?: string; contactId?: string; companyId?: string } | null,
) {
  const qs = params
    ? new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v != null)
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : ''
  const enabled =
    params != null &&
    (params.dealId != null || params.contactId != null || params.companyId != null)
  return useQuery({
    queryKey: ['timeline', params],
    queryFn: () => apiGet<TimelineItem[]>(`/api/timeline?${qs}`),
    enabled,
  })
}

export interface LogCallInput {
  title?: string
  body?: string
  direction?: 'inbound' | 'outbound'
  durationSec?: number
  occurredAt?: string
  dealId?: string
  contactId?: string
}

export function useLogCall() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: LogCallInput) => apiPost<unknown>('/api/timeline/calls', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timeline'] })
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['deals'] })
    },
  })
}

export interface LogMeetingInput {
  title: string
  startsAt?: string
  endsAt?: string
  location?: string
  dealId?: string
  contactId?: string
}

export function useLogMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: LogMeetingInput) => apiPost<unknown>('/api/timeline/meetings', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timeline'] })
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['deals'] })
    },
  })
}

export interface LogEmailInput {
  fromEmail: string
  toEmail: string
  subject: string
  bodyHtml?: string
  dealId?: string
  contactId?: string
}

export function useLogEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: LogEmailInput) => apiPost<unknown>('/api/timeline/emails', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timeline'] })
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['deals'] })
    },
  })
}
