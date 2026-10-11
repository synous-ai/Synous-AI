// ─── Equipo: perfil + carga de trabajo ───────────────────────────────────────
// Espejo de apps/api/src/modules/team/team.types.ts.

import type { HubUserRole } from './settings'
import type { TaskStatus } from './common'

export type WorkStatus = 'available' | 'working' | 'blocked' | 'waiting_approval'

export interface TeamWorkload {
  activeProjects: number
  openTasks: number
  overdueTasks: number
  inReviewTasks: number
  blockedTasks: number
}

export interface TeamMember extends TeamWorkload {
  id: string
  firstName: string | null
  lastName: string | null
  email: string
  role: HubUserRole
  jobTitle: string | null
  responsibilities: string | null
  autonomousDecisions: string | null
  approvalRequired: string | null
  workStatus: WorkStatus | null
}

export interface TeamMemberProject {
  id: string
  name: string
  status: string
  dueDate: string | null
}

export interface TeamMemberTask {
  id: string
  title: string
  status: TaskStatus
  priority: 'low' | 'medium' | 'high'
  dueDate: string | null
  projectId: string | null
  projectName: string | null
}

export interface TeamMemberDetail extends TeamMember {
  projects: TeamMemberProject[]
  tasks: TeamMemberTask[]
}
