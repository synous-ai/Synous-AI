import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch } from '../api'
import type { TeamMember, TeamMemberDetail, WorkStatus } from '../types'

// ─── Equipo ───────────────────────────────────────────────────────────────────
// Keys: ['team', 'list'] · ['team', 'member', userId]. Las mutaciones de tareas y
// proyectos invalidan ['team'] para que la carga de trabajo no quede vieja.

export function useTeam() {
  return useQuery({
    queryKey: ['team', 'list'],
    queryFn: () => apiGet<TeamMember[]>('/api/team'),
  })
}

export function useTeamMember(userId: string | null) {
  return useQuery({
    queryKey: ['team', 'member', userId],
    queryFn: () => apiGet<TeamMemberDetail>(`/api/team/${userId}`),
    enabled: userId != null,
  })
}

/** PATCH /api/team/:userId/profile — parcial; `null` o '' limpia el campo. */
export interface UpdateTeamProfileInput {
  jobTitle?: string | null
  responsibilities?: string | null
  autonomousDecisions?: string | null
  approvalRequired?: string | null
  workStatus?: WorkStatus | null
}

export function useUpdateTeamProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: UpdateTeamProfileInput }) =>
      apiPatch<TeamMemberDetail>(`/api/team/${userId}/profile`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }),
  })
}
