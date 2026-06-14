export interface PortalSettings {
  id: string
  name: string
  domain: string | null
  timeZone: string
  currency: string
  /**
   * Descripción de los servicios de la agencia para pre-cargar en búsquedas de
   * prospección. La IA lo usa como contexto para generar propuestas personalizadas.
   */
  prospectingServices: string | null
}

/** Orden de permisos de mayor a menor: owner > member > collaborator > viewer */
export type HubUserRole = 'owner' | 'member' | 'collaborator' | 'viewer'

export interface TeamUser {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  role: HubUserRole
  isActive: boolean
}

export interface User {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  role: HubUserRole
  portalId: string
}

export interface ClientAccountSummary {
  id: string
  email: string
  inviteAccepted: boolean
  isActive: boolean
  createdAt: string
  dealIds: string[]
}

export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'boolean'
export type CustomFieldEntityType = 'contact' | 'deal' | 'company'

export interface CustomField {
  id: string
  portalId: string
  entityType: CustomFieldEntityType
  key: string
  label: string
  fieldType: CustomFieldType
  options: string[] | null
  displayOrder: number
  createdAt: string
}
