import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { setterTenant } from '../../db/schema'
import { env } from '../../config/env'
import { Errors } from '../../lib/errors'

/** Config visible/editable del setter desde el admin (Model Switcher, etc.). */
export interface SetterConfig {
  modelProvider: string
  operationMode: string
  agentName: string
  ownerName: string
  timezone: string
  /** Qué providers tienen credenciales cargadas en la API (para el switcher). */
  providers: { gemini: boolean; claude: boolean }
  /** Prospección automática desde la oferta. */
  prospectingServices: string | null
  prospectingNiches: string[]
  prospectingCities: string[]
  prospectingAutopilot: boolean
}

/**
 * Columnas que necesita la config pública del setter.
 * EXCLUYE businessBrief (prompt interno) y evolutionInstance (dato de infraestructura):
 * ninguno de los dos debe aparecer en respuestas al cliente.
 * loadTenant es de uso estrictamente interno — su resultado alimenta toConfig(),
 * que descarta cualquier campo no listado en SetterConfig.
 */
const setterConfigCols = {
  id: setterTenant.id,
  portalId: setterTenant.portalId,
  modelProvider: setterTenant.modelProvider,
  operationMode: setterTenant.operationMode,
  agentName: setterTenant.agentName,
  ownerName: setterTenant.ownerName,
  timezone: setterTenant.timezone,
  prospectingServices: setterTenant.prospectingServices,
  prospectingNiches: setterTenant.prospectingNiches,
  prospectingCities: setterTenant.prospectingCities,
  prospectingAutopilot: setterTenant.prospectingAutopilot,
}

type SetterConfigRow = {
  id: string
  portalId: string
  modelProvider: string
  operationMode: string
  agentName: string
  ownerName: string
  timezone: string
  prospectingServices: string | null
  prospectingNiches: string[]
  prospectingCities: string[]
  prospectingAutopilot: boolean
}

async function loadTenant(portalId: string): Promise<SetterConfigRow> {
  const [tenant] = await db
    .select(setterConfigCols)
    .from(setterTenant)
    .where(eq(setterTenant.portalId, portalId))
    .limit(1)
  if (!tenant) throw Errors.notFound('No hay setter configurado para este portal')
  return tenant
}

function toConfig(tenant: SetterConfigRow): SetterConfig {
  return {
    modelProvider: tenant.modelProvider,
    operationMode: tenant.operationMode,
    agentName: tenant.agentName,
    ownerName: tenant.ownerName,
    timezone: tenant.timezone,
    providers: {
      gemini: Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON),
      claude: Boolean(env.ANTHROPIC_API_KEY),
    },
    prospectingServices: tenant.prospectingServices,
    prospectingNiches: tenant.prospectingNiches,
    prospectingCities: tenant.prospectingCities,
    prospectingAutopilot: tenant.prospectingAutopilot,
  }
}

export async function getSetterConfig(portalId: string): Promise<SetterConfig> {
  return toConfig(await loadTenant(portalId))
}

/** Cambia el LLM que genera los mensajes (Model Switcher). */
export async function setModelProvider(portalId: string, provider: string): Promise<SetterConfig> {
  const tenant = await loadTenant(portalId)
  await db
    .update(setterTenant)
    .set({ modelProvider: provider })
    .where(eq(setterTenant.id, tenant.id))
  return getSetterConfig(portalId)
}

/** Enciende/apaga el autopilot de prospección. */
export async function setProspectingAutopilot(portalId: string, enabled: boolean): Promise<SetterConfig> {
  const tenant = await loadTenant(portalId)
  await db
    .update(setterTenant)
    .set({ prospectingAutopilot: enabled })
    .where(eq(setterTenant.id, tenant.id))
  return getSetterConfig(portalId)
}
