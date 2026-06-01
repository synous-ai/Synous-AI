export interface FollowUpEntity {
  kind: 'deal' | 'contact' | 'company'
  id: string
  label: string
}

export interface FollowUpItem {
  id: string
  title: string
  dueDate: string | null
  priority: 'low' | 'medium' | 'high'
  assignedTo: string | null
  entity: FollowUpEntity | null
}

export interface AttentionDeal {
  id: string
  name: string
  amount: string | null
  stageLabel: string
  ownerId: string | null
  lastActivityAt: string | null
  daysSinceActivity: number | null
}

export interface FocusData {
  followUps: {
    overdue: FollowUpItem[]
    today: FollowUpItem[]
    upcoming: FollowUpItem[]
  }
  attention: {
    noNextAction: AttentionDeal[]
    stale: AttentionDeal[]
  }
}
