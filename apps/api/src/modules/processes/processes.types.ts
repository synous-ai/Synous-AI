import type { processTask, processTemplate } from '../../db/schema'

export type ProcessRow = typeof processTemplate.$inferSelect
export type ProcessTaskRow = typeof processTask.$inferSelect

export interface ProcessListItemDTO extends ProcessRow {
  taskCount: number
}

export interface ProcessDetailDTO extends ProcessRow {
  tasks: ProcessTaskRow[]
}
