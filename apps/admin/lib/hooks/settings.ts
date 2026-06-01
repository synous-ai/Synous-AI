import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiDelete } from '../api'
import type {
  PortalSettings,
  TeamUser,
  Pipeline,
  ClientAccountSummary,
  NotificationPref,
  CustomField,
  CustomFieldEntityType,
} from '../types'

export function usePortal() {
  return useQuery({ queryKey: ['portal'], queryFn: () => apiGet<PortalSettings>('/api/settings/portal') })
}

export function useUpdatePortal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<Pick<PortalSettings, 'name' | 'timeZone' | 'currency'>>) =>
      apiPatch<PortalSettings>('/api/settings/portal', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal'] }),
  })
}

export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: () => apiGet<TeamUser[]>('/api/users') })
}

export interface UserInput {
  email: string
  firstName?: string
  lastName?: string
  role: 'owner' | 'member' | 'viewer'
  password: string
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UserInput) => apiPost<TeamUser>('/api/users', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function usePipelines() {
  return useQuery({ queryKey: ['pipelines'], queryFn: () => apiGet<Pipeline[]>('/api/pipelines') })
}

export interface NewPipelineInput {
  label: string
  stages?: { label: string; isWon?: boolean; isClosed?: boolean }[]
}

export function useCreatePipeline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewPipelineInput) => apiPost<Pipeline>('/api/pipelines', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines'] }),
  })
}

export interface StageInput {
  label: string
  probability?: number
  isClosed?: boolean
  isWon?: boolean
  exitCriteria?: string
  description?: string
}

export function useAddStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pipelineId, input }: { pipelineId: string; input: StageInput }) =>
      apiPost<unknown>(`/api/pipelines/${pipelineId}/stages`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines'] }),
  })
}

export interface UpdateStageInput {
  label?: string
  displayOrder?: number
  probability?: number | null
  isClosed?: boolean
  isWon?: boolean
  exitCriteria?: string | null
  description?: string | null
}

export function useUpdateStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pipelineId, stageId, input }: { pipelineId: string; stageId: string; input: UpdateStageInput }) =>
      apiPatch<unknown>(`/api/pipelines/${pipelineId}/stages/${stageId}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines'] }),
  })
}

export function useDeleteStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pipelineId, stageId }: { pipelineId: string; stageId: string }) =>
      apiDelete<{ success: boolean }>(`/api/pipelines/${pipelineId}/stages/${stageId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines'] }),
  })
}

export function useClientAccounts() {
  return useQuery({
    queryKey: ['client-accounts'],
    queryFn: () => apiGet<ClientAccountSummary[]>('/api/clients/accounts'),
  })
}

export function useNotificationPrefs() {
  return useQuery({
    queryKey: ['notification-prefs'],
    queryFn: () => apiGet<NotificationPref[]>('/api/notification-prefs'),
  })
}

export function useUpdateNotificationPref() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ eventType, inApp, email }: { eventType: string; inApp: boolean; email: boolean }) =>
      apiPatch<NotificationPref>(`/api/notification-prefs/${eventType}`, { inApp, email }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-prefs'] }),
  })
}

export function useCustomFields(entityType?: CustomFieldEntityType) {
  const qs = entityType ? `?entityType=${entityType}` : ''
  return useQuery({
    queryKey: ['custom-fields', entityType ?? 'all'],
    queryFn: () => apiGet<CustomField[]>(`/api/custom-fields${qs}`),
  })
}

export interface CreateCustomFieldInput {
  entityType: CustomFieldEntityType
  key: string
  label: string
  fieldType: 'text' | 'number' | 'date' | 'select' | 'boolean'
  options?: string[]
  displayOrder?: number
}

export function useCreateCustomField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCustomFieldInput) =>
      apiPost<CustomField>('/api/custom-fields', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields'] }),
  })
}

export interface UpdateCustomFieldInput {
  label?: string
  fieldType?: 'text' | 'number' | 'date' | 'select' | 'boolean'
  options?: string[] | null
  displayOrder?: number
}

export function useUpdateCustomField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCustomFieldInput }) =>
      apiPatch<CustomField>(`/api/custom-fields/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields'] }),
  })
}

export function useDeleteCustomField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/api/custom-fields/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields'] }),
  })
}
