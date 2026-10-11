/**
 * status.ts — Semantic colour layer for status badges
 *
 * Everything here is a pure presentational concern: colours + labels.
 * No business logic, no API calls.
 *
 * Usage:
 *   import { StatusBadge } from '@/components/ui/status-badge'
 *   import { invoiceStatus } from '@/lib/status'
 *   const { kind, label } = invoiceStatus(invoice.status)
 *   <StatusBadge kind={kind}>{label}</StatusBadge>
 */

import {
  CHANGE_REQUEST_STATUS_META,
  CHANGE_REQUEST_PRIORITY_LABEL,
  type ChangeRequestStatus,
  type ChangeRequestPriority,
  type ChangeRequestTone,
} from '@synous/shared'

// ─── Kinds ────────────────────────────────────────────────────────────────────

export type StatusKind = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

// ─── Badge class map ──────────────────────────────────────────────────────────

const BASE =
  'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium'

// Colores de badges vía tokens nombrados (CSS vars con rgba exacto, paleta Resend).
// Cambian solos con .dark — NO hace falta variante dark: ni rgba arbitrario.
export const BADGE_CLASS: Record<StatusKind, string> & { base: string } = {
  base: BASE,
  success: 'bg-badge-success-bg text-badge-success-fg ring-1 ring-inset ring-badge-success-ring',
  warning: 'bg-badge-warning-bg text-badge-warning-fg ring-1 ring-inset ring-badge-warning-ring',
  danger: 'bg-badge-danger-bg text-badge-danger-fg ring-1 ring-inset ring-badge-danger-ring',
  info: 'bg-badge-info-bg text-badge-info-fg ring-1 ring-inset ring-badge-info-ring',
  neutral: 'bg-badge-neutral-bg text-badge-neutral-fg ring-1 ring-inset ring-badge-neutral-ring',
}

// ─── Result helper type ───────────────────────────────────────────────────────

export interface StatusResult {
  kind: StatusKind
  label: string
}

// ─── Domain mappers ───────────────────────────────────────────────────────────

export function invoiceStatus(s: string): StatusResult {
  switch (s) {
    case 'draft':
      return { kind: 'neutral', label: 'Borrador' }
    case 'sent':
      return { kind: 'info', label: 'Enviada' }
    case 'paid':
      return { kind: 'success', label: 'Pagada' }
    case 'overdue':
      return { kind: 'danger', label: 'Vencida' }
    case 'void':
      return { kind: 'neutral', label: 'Anulada' }
    default:
      return { kind: 'neutral', label: s }
  }
}

export function workItemStatus(s: string): StatusResult {
  switch (s) {
    case 'open':
      return { kind: 'neutral', label: 'Abierto' }
    case 'in_progress':
      return { kind: 'info', label: 'En progreso' }
    case 'done':
      return { kind: 'success', label: 'Hecho' }
    case 'cancelled':
      return { kind: 'neutral', label: 'Cancelado' }
    default:
      return { kind: 'neutral', label: s }
  }
}

export function priority(p: string): StatusResult {
  switch (p) {
    case 'low':
      return { kind: 'neutral', label: 'Baja' }
    case 'medium':
      return { kind: 'warning', label: 'Media' }
    case 'high':
      return { kind: 'danger', label: 'Alta' }
    default:
      return { kind: 'neutral', label: p }
  }
}

export function deliverableStatus(s: string): StatusResult {
  switch (s) {
    case 'pending_review':
      return { kind: 'warning', label: 'En revisión' }
    case 'approved':
      return { kind: 'success', label: 'Aprobado' }
    case 'changes_requested':
      return { kind: 'danger', label: 'Cambios pedidos' }
    default:
      return { kind: 'neutral', label: s }
  }
}

// Tono semántico del catálogo compartido → StatusKind del admin. Se mapea acá
// UNA sola vez: ninguna pantalla de change requests vuelve a decidir colores.
const CR_TONE_TO_KIND: Record<ChangeRequestTone, StatusKind> = {
  neutral: 'neutral',
  info: 'info',
  warning: 'warning',
  success: 'success',
  danger: 'danger',
}

/**
 * Estado de Change Request — SIEMPRE derivado de `CHANGE_REQUEST_STATUS_META`
 * (`@synous/shared`). Prohibido hardcodear acá la matriz de labels/tonos: si
 * el backend agrega un estado nuevo, este mapper lo resuelve solo.
 */
export function crStatus(s: string): StatusResult {
  const meta = CHANGE_REQUEST_STATUS_META[s as ChangeRequestStatus]
  if (!meta) return { kind: 'neutral', label: s }
  return { kind: CR_TONE_TO_KIND[meta.tone], label: meta.adminLabel }
}

/** Prioridad de Change Request ('low' | 'normal' | 'high' — distinto del `priority()` genérico de arriba). */
export function crPriority(p: string): StatusResult {
  const label = CHANGE_REQUEST_PRIORITY_LABEL[p as ChangeRequestPriority] ?? p
  if (p === 'high') return { kind: 'danger', label }
  if (p === 'low') return { kind: 'neutral', label }
  return { kind: 'info', label }
}

export function taskStatus(s: string): StatusResult {
  switch (s) {
    case 'pending':
      return { kind: 'neutral', label: 'Pendiente' }
    case 'in_progress':
      return { kind: 'info', label: 'En progreso' }
    case 'in_review':
      return { kind: 'warning', label: 'En revisión' }
    case 'completed':
      return { kind: 'success', label: 'Completada' }
    case 'cancelled':
      return { kind: 'neutral', label: 'Cancelada' }
    case 'blocked':
      return { kind: 'danger', label: 'Bloqueada' }
    default:
      return { kind: 'neutral', label: s }
  }
}

export function projectStatus(s: string): StatusResult {
  switch (s) {
    case 'not_started':
      return { kind: 'neutral', label: 'Por iniciar' }
    case 'in_progress':
      return { kind: 'info', label: 'En progreso' }
    case 'in_review':
      return { kind: 'warning', label: 'En revisión' }
    case 'waiting_client':
      return { kind: 'warning', label: 'Esperando cliente' }
    case 'on_hold':
      return { kind: 'danger', label: 'En pausa' }
    case 'delivered':
      return { kind: 'success', label: 'Entregado' }
    default:
      return { kind: 'neutral', label: s }
  }
}

export function lifecycleStage(s: string): StatusResult {
  switch (s) {
    case 'lead':
      return { kind: 'neutral', label: 'Nuevo Lead' }
    case 'mql':
      return { kind: 'info', label: 'Contactado' }
    case 'sql':
      return { kind: 'info', label: 'Calificado' }
    case 'opportunity':
      return { kind: 'warning', label: 'Oportunidad' }
    case 'customer':
      return { kind: 'success', label: 'Cliente' }
    case 'other':
      return { kind: 'neutral', label: 'Otro' }
    default:
      return { kind: 'neutral', label: s }
  }
}

export function clientAccountStatus(inviteAccepted: boolean): StatusResult {
  return inviteAccepted
    ? { kind: 'success', label: 'Activo' }
    : { kind: 'warning', label: 'Invitado' }
}

export function intakeStatus(s: string): StatusResult {
  switch (s) {
    case 'completed':
      return { kind: 'success', label: 'Completado' }
    case 'in_progress':
      return { kind: 'info', label: 'En progreso' }
    case 'pending':
    default:
      return { kind: 'neutral', label: 'Pendiente' }
  }
}

// ─── Lead stage constants ─────────────────────────────────────────────────────

export function documentType(t: string): StatusResult {
  switch (t) {
    case 'contract':
      return { kind: 'info', label: 'Contrato' }
    case 'proposal':
      return { kind: 'neutral', label: 'Propuesta' }
    case 'invoice':
      return { kind: 'warning', label: 'Factura' }
    case 'other':
    default:
      return { kind: 'neutral', label: 'Otro' }
  }
}

export const STAGE_LABELS: Record<string, string> = {
  lead: 'Nuevo Lead',
  mql: 'Contactado',
  sql: 'Calificado',
  opportunity: 'Oportunidad',
}

export const STAGE_DOT_CLASS: Record<string, string> = {
  lead: 'bg-signal',
  mql: 'bg-amber-400',
  sql: 'bg-blue-400',
  opportunity: 'bg-emerald-500',
}
