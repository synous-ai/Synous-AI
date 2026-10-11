import type { WORK_STATUSES } from './team.schema'

export type WorkStatus = (typeof WORK_STATUSES)[number]

export interface TeamWorkloadDTO {
  activeProjects: number
  openTasks: number
  overdueTasks: number
  inReviewTasks: number
  blockedTasks: number
}

export interface TeamMemberDTO extends TeamWorkloadDTO {
  id: string
  firstName: string | null
  lastName: string | null
  email: string
  role: string
  jobTitle: string | null
  responsibilities: string | null
  autonomousDecisions: string | null
  approvalRequired: string | null
  workStatus: WorkStatus | null
}

export interface TeamProjectDTO {
  id: string
  name: string
  status: string
  dueDate: string | null
}

export interface TeamTaskDTO {
  id: string
  title: string
  status: string
  priority: string
  dueDate: Date | null
  projectId: string | null
  projectName: string | null
}

export interface TeamMemberDetailDTO extends TeamMemberDTO {
  projects: TeamProjectDTO[]
  tasks: TeamTaskDTO[]
}
