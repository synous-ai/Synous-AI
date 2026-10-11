/**
 * Constantes y helpers puros del módulo de proyectos: etiquetas en español,
 * opciones de select, grupos de estado y cálculo de fechas de calendario.
 * Sin React ni red — fácil de testear.
 */

import type { ChecklistStep, ProjectPriority, ProjectStage, ProjectStatus, TaskStatus } from '@/lib/types'

// ─── Etiquetas ────────────────────────────────────────────────────────────────

export const PROJECT_STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'not_started', label: 'Por iniciar' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'in_review', label: 'En revisión' },
  { value: 'waiting_client', label: 'Esperando cliente' },
  { value: 'on_hold', label: 'En pausa' },
  { value: 'delivered', label: 'Entregado' },
]

export const PROJECT_STAGE_OPTIONS: { value: ProjectStage; label: string }[] = [
  { value: 'discovery', label: 'Discovery' },
  { value: 'design', label: 'Diseño' },
  { value: 'development', label: 'Desarrollo' },
  { value: 'qa', label: 'QA' },
  { value: 'client_review', label: 'Revisión cliente' },
  { value: 'changes', label: 'Cambios' },
  { value: 'delivery', label: 'Entrega' },
]

export const PRIORITY_OPTIONS: { value: ProjectPriority; label: string }[] = [
  { value: 'high', label: 'Alta' },
  { value: 'medium', label: 'Media' },
  { value: 'low', label: 'Baja' },
]

export const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'in_review', label: 'En revisión' },
  { value: 'blocked', label: 'Bloqueada' },
  { value: 'completed', label: 'Completada' },
  { value: 'cancelled', label: 'Cancelada' },
]

export function projectStageLabel(stage: ProjectStage | null): string {
  if (!stage) return 'Sin etapa'
  return PROJECT_STAGE_OPTIONS.find((o) => o.value === stage)?.label ?? stage
}

// ─── Grupos de estado (filtros de la lista) ───────────────────────────────────

export type ProjectStatusGroupKey = 'not_started' | 'active' | 'waiting_client' | 'on_hold' | 'delivered'

export interface ProjectStatusGroup {
  key: ProjectStatusGroupKey
  label: string
  statuses: readonly ProjectStatus[]
}

/** En el orden de las secciones de "Todos"; Entregados siempre último. */
export const PROJECT_STATUS_GROUPS: readonly ProjectStatusGroup[] = [
  { key: 'not_started', label: 'Por iniciar', statuses: ['not_started'] },
  { key: 'active', label: 'En proceso', statuses: ['in_progress', 'in_review'] },
  { key: 'waiting_client', label: 'Esperando cliente', statuses: ['waiting_client'] },
  { key: 'on_hold', label: 'En pausa', statuses: ['on_hold'] },
  { key: 'delivered', label: 'Entregados', statuses: ['delivered'] },
]

export function projectStatusGroup(status: ProjectStatus): ProjectStatusGroupKey {
  return PROJECT_STATUS_GROUPS.find((g) => g.statuses.includes(status))?.key ?? 'not_started'
}

// ─── Fechas de calendario ─────────────────────────────────────────────────────
// `project.startDate/dueDate` son 'YYYY-MM-DD' (columna date): se comparan como
// día de calendario LOCAL, nunca vía `new Date('YYYY-MM-DD')` (UTC → corre un día).
// `task.dueDate` es un timestamp: nos quedamos con su parte de fecha.

/** 'YYYY-MM-DD' de un date-only o de un ISO (los timestamps de tareas se guardan a mediodía UTC). */
export function dateOnlyOf(value: string): string {
  return value.slice(0, 10)
}

function parseDateOnly(value: string): Date {
  const [y, m, d] = dateOnlyOf(value).split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

function startOfToday(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** Días de calendario desde hoy hasta la fecha (negativo = vencida). */
export function daysUntil(value: string, now: Date = new Date()): number {
  const ms = parseDateOnly(value).getTime() - startOfToday(now).getTime()
  return Math.round(ms / 86_400_000)
}

export function formatDateOnly(value: string | null | undefined, withYear = false): string {
  if (!value) return '—'
  return parseDateOnly(value).toLocaleDateString(
    'es',
    withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' },
  )
}

/** Fecha elegida en el DateField → timestamp de tarea (mediodía UTC: mismo día en cualquier huso americano/europeo). */
export function dateOnlyToTaskIso(value: string): string {
  return `${value}T12:00:00.000Z`
}

// ─── Checklist ────────────────────────────────────────────────────────────────

export interface ChecklistProgress {
  done: number
  total: number
}

/** Cuenta cada paso y cada sub-paso como un ítem. */
export function checklistProgress(steps: readonly ChecklistStep[] | null | undefined): ChecklistProgress {
  let done = 0
  let total = 0
  for (const s of steps ?? []) {
    total += 1
    if (s.done) done += 1
    for (const c of s.children ?? []) {
      total += 1
      if (c.done) done += 1
    }
  }
  return { done, total }
}

export function percent(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100)
}
