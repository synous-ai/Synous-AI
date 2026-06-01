/**
 * history.ts — Human-readable labels and value formatters for record_history entries
 *
 * Usage:
 *   import { fieldLabel, formatHistoryValue } from '@/lib/history'
 *   const label = fieldLabel('stageId')       // → 'Etapa'
 *   const val   = formatHistoryValue('stageId', 'abc123', { stageMap: { abc123: 'Propuesta' } }) // → 'Propuesta'
 */

import { lifecycleStage, taskStatus, priority } from '@/lib/status'
import { formatCurrency } from '@/lib/utils'

// ─── Field label map ──────────────────────────────────────────────────────────

export const HISTORY_FIELD_LABELS: Record<string, string> = {
  stageId: 'Etapa',
  lifecycleStage: 'Etapa de ciclo',
  amount: 'Monto',
  name: 'Nombre',
  title: 'Título',
  status: 'Estado',
  priority: 'Prioridad',
  dueDate: 'Vencimiento',
  closeDate: 'Fecha de cierre',
  companyId: 'Empresa',
  primaryContactId: 'Contacto principal',
  ownerId: 'Responsable',
  email: 'Email',
  phone: 'Teléfono',
  jobTitle: 'Cargo',
  firstName: 'Nombre',
  lastName: 'Apellido',
  industry: 'Industria',
  domain: 'Dominio',
  website: 'Website',
  currency: 'Moneda',
  description: 'Descripción',
  type: 'Tipo',
  url: 'URL',
  direction: 'Dirección',
  durationSec: 'Duración (seg)',
  fromEmail: 'De',
  toEmail: 'Para',
  subject: 'Asunto',
  location: 'Lugar',
  startsAt: 'Inicio',
  endsAt: 'Fin',
  pipelineId: 'Pipeline',
  dealId: 'Deal',
  contactId: 'Contacto',
  archived: 'Archivado',
  archivedAt: 'Archivado el',
}

// ─── Fallback: camelCase → Title Case (strips trailing "Id") ─────────────────

function humanizeCamel(name: string): string {
  // Strip trailing "Id" (e.g. companyId → company)
  const stripped = name.replace(/Id$/, '')
  // Insert spaces before uppercase letters, then capitalize first
  const spaced = stripped.replace(/([A-Z])/g, ' $1').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function fieldLabel(name: string): string {
  return HISTORY_FIELD_LABELS[name] ?? humanizeCamel(name)
}

// ─── CUID2 detection ──────────────────────────────────────────────────────────
// CUID2 are lowercase alphanumeric, typically 24–32 chars
const CUID2_RE = /^[a-z0-9]{20,}$/

function looksLikeCuid2(value: string): boolean {
  return CUID2_RE.test(value)
}

// ─── Context for value resolution ────────────────────────────────────────────

export interface FormatHistoryCtx {
  /** map stageId → stage label, built from usePipelines() data */
  stageMap?: Record<string, string>
}

// ─── Value formatter ──────────────────────────────────────────────────────────

export function formatHistoryValue(
  fieldName: string,
  value: string | null | undefined,
  ctx: FormatHistoryCtx = {},
): string {
  if (value == null || value === '' || value === '—') return '—'

  switch (fieldName) {
    case 'stageId':
      return ctx.stageMap?.[value] ?? (looksLikeCuid2(value) ? '—' : value)

    case 'lifecycleStage':
      return lifecycleStage(value).label

    case 'status':
      return taskStatus(value).label

    case 'priority':
      return priority(value).label

    case 'amount':
      return formatCurrency(value)

    case 'dueDate':
    case 'closeDate':
    case 'startsAt':
    case 'endsAt':
    case 'archivedAt': {
      const d = new Date(value)
      return isNaN(d.getTime()) ? value : d.toLocaleDateString('es')
    }

    case 'archived':
      return value === 'true' ? 'Sí' : 'No'

    case 'companyId':
    case 'primaryContactId':
    case 'contactId':
    case 'ownerId':
    case 'dealId':
    case 'pipelineId':
      // These are foreign-key IDs we can't resolve without more context
      return looksLikeCuid2(value) ? '—' : value

    default:
      // If the raw value looks like an unresolved CUID2, hide it
      if (looksLikeCuid2(value)) return '—'
      return value
  }
}

// ─── Build a stageId→label map from usePipelines() data ──────────────────────

import type { Pipeline } from '@/lib/types'

export function buildStageMap(pipelines: Pipeline[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const p of pipelines) {
    for (const s of p.stages) {
      map[s.id] = s.label
    }
  }
  return map
}
