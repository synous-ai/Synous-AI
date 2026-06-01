import type { AttentionDeal } from './focus'

export interface ReportDealsAtRisk {
  count: number
  deals: AttentionDeal[]
}

export interface ReportFunnelStage {
  stageId: string
  label: string
  isWon: boolean
  isClosed: boolean
  currentDeals: number
  currentValue: string
}

export interface ReportPipelineFunnel {
  stages: ReportFunnelStage[]
  winRate: number | null
}

export interface ReportConversionBySource {
  source: string
  leads: number
  customers: number
  rate: number
}

export interface ReportUserActivity {
  userId: string
  name: string
  calls: number
  meetings: number
  notes: number
  tasksCreated: number
  tasksCompleted: number
}

export interface ReportClosedWonPeriod {
  count: number
  value: string
}

export interface ReportClosedWon {
  thisPeriod: ReportClosedWonPeriod
  previousPeriod: ReportClosedWonPeriod
}

export interface ReportsData {
  dealsAtRisk: ReportDealsAtRisk
  pipelineFunnel: ReportPipelineFunnel
  conversionBySource: ReportConversionBySource[]
  activityByUser: ReportUserActivity[]
  closedWon: ReportClosedWon
}
