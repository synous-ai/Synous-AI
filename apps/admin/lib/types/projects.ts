// ─── Proyectos internos, procesos (plantillas) y checklist de tareas ─────────
// Espejo de apps/api/src/modules/{projects,processes}/*.types.ts. Las columnas
// `date` (startDate/dueDate) viajan como 'YYYY-MM-DD'; los timestamps, ISO.

export type ProjectStatus =
  | 'not_started'
  | 'in_progress'
  | 'in_review'
  | 'waiting_client'
  | 'on_hold'
  | 'delivered'

export type ProjectStage =
  | 'discovery'
  | 'design'
  | 'development'
  | 'qa'
  | 'client_review'
  | 'changes'
  | 'delivery'

export type ProjectPriority = 'low' | 'medium' | 'high'

export interface ChecklistChild {
  text: string
  done?: boolean
}

/** Un nivel de anidación como máximo (`children`). */
export interface ChecklistStep {
  text: string
  done?: boolean
  children?: ChecklistChild[]
}

export interface ProjectMember {
  id: string
  firstName: string | null
  lastName: string | null
}

export interface ProjectTaskCounts {
  total: number
  open: number
  completed: number
}

export interface Project {
  id: string
  portalId: string
  dealId: string | null
  companyId: string | null
  name: string
  kind: string | null
  status: ProjectStatus
  stage: ProjectStage | null
  priority: ProjectPriority
  startDate: string | null
  dueDate: string | null
  repoUrl: string | null
  stagingUrl: string | null
  productionUrl: string | null
  notes: string | null
  notesImportant: string | null
  createdBy: string | null
  archived: boolean
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectListItem extends Project {
  members: ProjectMember[]
  taskCounts: ProjectTaskCounts
  companyName: string | null
  dealName: string | null
}

export interface ProjectDetail extends Project {
  members: ProjectMember[]
  taskCounts: ProjectTaskCounts
  company: { id: string; name: string } | null
  deal: { id: string; name: string } | null
}

export interface Process {
  id: string
  portalId: string
  slug: string
  name: string
  description: string | null
  archived: boolean
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ProcessListItem extends Process {
  taskCount: number
}

export interface ProcessTask {
  id: string
  processId: string
  title: string
  notes: string | null
  steps: ChecklistStep[]
  position: number
  createdAt: string
  updatedAt: string
}

export interface ProcessDetail extends Process {
  tasks: ProcessTask[]
}
