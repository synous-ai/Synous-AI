import type { project } from '../../db/schema'

export type ProjectRow = typeof project.$inferSelect

export interface ProjectMemberDTO {
  id: string
  firstName: string | null
  lastName: string | null
}

export interface ProjectTaskCountsDTO {
  total: number
  open: number
  completed: number
}

export interface ProjectListItemDTO extends ProjectRow {
  members: ProjectMemberDTO[]
  taskCounts: ProjectTaskCountsDTO
  companyName: string | null
  dealName: string | null
}

export interface ProjectDetailDTO extends ProjectRow {
  members: ProjectMemberDTO[]
  taskCounts: ProjectTaskCountsDTO
  company: { id: string; name: string } | null
  deal: { id: string; name: string } | null
}
