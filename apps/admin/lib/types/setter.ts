export type DraftStatus = 'pending' | 'approved' | 'edited' | 'rejected' | 'sent'
export type ModelProvider = 'gemini' | 'claude'

/** Un draft en la cola de aprobación (shadow mode) con contexto del lead. */
export interface SetterDraft {
  id: string
  content: string
  editedContent: string | null
  beat: string | null
  format: string
  status: DraftStatus
  toolCalls: { tools?: string[]; checkAvailabilityCalled?: boolean } | null
  createdAt: string
  leadId: string
  leadStatus: string
  qualification: Record<string, unknown> | null
  conversationId: string
  channel: string
  personName: string | null
  personPhone: string | null
  crmContactId: string | null
  crmDealId: string | null
}

export interface SetterMessage {
  role: string
  content: string
  beat: string | null
  createdAt: string
}

export interface SetterDraftDetail extends SetterDraft {
  messages: SetterMessage[]
}

/** Config del setter — incluye el Model Switcher. */
export interface SetterConfig {
  modelProvider: ModelProvider
  operationMode: string
  agentName: string
  ownerName: string
  timezone: string
  providers: { gemini: boolean; claude: boolean }
  prospectingServices: string | null
  prospectingNiches: string[]
  prospectingCities: string[]
  prospectingAutopilot: boolean
}

export interface SendResult {
  id: string
  status: DraftStatus
  sent: boolean
  messageId: string
}

export type EventLevel = 'info' | 'success' | 'warn' | 'error'

export interface SetterEvent {
  id: string
  level: EventLevel
  type: string
  message: string
  leadId: string | null
  meta: Record<string, unknown> | null
  createdAt: string
}
