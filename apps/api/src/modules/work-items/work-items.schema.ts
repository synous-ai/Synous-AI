import { z } from 'zod'

export const WorkItemTypeEnum = z.enum(['bug', 'improvement', 'roadmap', 'process'])
export type WorkItemType = z.infer<typeof WorkItemTypeEnum>

export const WorkItemStatusEnum = z.enum(['open', 'in_progress', 'done', 'cancelled'])
export type WorkItemStatus = z.infer<typeof WorkItemStatusEnum>

export const WorkItemPriorityEnum = z.enum(['low', 'medium', 'high'])
export type WorkItemPriority = z.infer<typeof WorkItemPriorityEnum>

export const CreateWorkItemSchema = z.object({
  type: WorkItemTypeEnum,
  title: z.string().min(1),
  description: z.string().optional(),
  status: WorkItemStatusEnum.optional(),
  priority: WorkItemPriorityEnum.optional(),
  dealId: z.string().min(1).optional(),
  assignedTo: z.string().min(1).optional(),
})
export type CreateWorkItemDTO = z.infer<typeof CreateWorkItemSchema>

export const UpdateWorkItemSchema = z
  .object({
    type: WorkItemTypeEnum,
    title: z.string().min(1),
    description: z.string(),
    status: WorkItemStatusEnum,
    priority: WorkItemPriorityEnum,
    dealId: z.string().min(1),
    assignedTo: z.string().min(1),
  })
  .partial()
export type UpdateWorkItemDTO = z.infer<typeof UpdateWorkItemSchema>

export const ListWorkItemsQuerySchema = z.object({
  type: WorkItemTypeEnum.optional(),
  status: WorkItemStatusEnum.optional(),
})
export type ListWorkItemsQuery = z.infer<typeof ListWorkItemsQuerySchema>
