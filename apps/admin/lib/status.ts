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

export function crStatus(s: string): StatusResult {
  switch (s) {
    case 'draft':
      return { kind: 'neutral', label: 'Borrador' }
    case 'sent':
      return { kind: 'info', label: 'Enviado' }
    case 'approved':
      return { kind: 'success', label: 'Aprobado' }
    case 'approved_verbally':
      return { kind: 'success', label: 'Aprobado verbalmente' }
    case 'rejected':
      return { kind: 'danger', label: 'Rechazado' }
    case 'disputed':
      return { kind: 'danger', label: 'Disputado' }
    case 'negotiating':
      return { kind: 'warning', label: 'Negociando' }
    case 'completed':
      return { kind: 'success', label: 'Completado' }
    default:
      return { kind: 'neutral', label: s }
  }
}

export function taskStatus(s: string): StatusResult {
  switch (s) {
    case 'pending':
      return { kind: 'neutral', label: 'Pendiente' }
    case 'in_progress':
      return { kind: 'info', label: 'En progreso' }
    case 'completed':
      return { kind: 'success', label: 'Completado' }
    case 'cancelled':
      return { kind: 'neutral', label: 'Cancelado' }
    case 'blocked':
      return { kind: 'danger', label: 'Bloqueada' }
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
