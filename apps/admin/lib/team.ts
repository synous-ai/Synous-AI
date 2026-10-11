/**
 * Constantes y helpers puros de la sección Equipo: etiquetas en español del
 * estado de trabajo y agregados del encabezado. Sin React ni red.
 */

import type { StatusKind } from '@/lib/status'
import type { TeamMember, WorkStatus } from '@/lib/types'

export const WORK_STATUS_OPTIONS: { value: WorkStatus; label: string; kind: StatusKind }[] = [
  { value: 'available', label: 'Disponible', kind: 'success' },
  { value: 'working', label: 'Trabajando', kind: 'info' },
  { value: 'blocked', label: 'Bloqueado', kind: 'danger' },
  { value: 'waiting_approval', label: 'Esperando aprobación', kind: 'warning' },
]

export function workStatusMeta(s: WorkStatus): { label: string; kind: StatusKind } {
  const found = WORK_STATUS_OPTIONS.find((o) => o.value === s)
  return found ? { label: found.label, kind: found.kind } : { label: s, kind: 'neutral' }
}

export interface TeamTotals {
  people: number
  activeProjects: number
  openTasks: number
  /** Personas bloqueadas o esperando aprobación. */
  needAttention: number
}

/** `activeProjects` suma la carga de cada persona: un proyecto con dos miembros cuenta dos veces. */
export function teamTotals(members: readonly TeamMember[]): TeamTotals {
  return {
    people: members.length,
    activeProjects: members.reduce((n, m) => n + m.activeProjects, 0),
    openTasks: members.reduce((n, m) => n + m.openTasks, 0),
    needAttention: members.filter((m) => m.workStatus === 'blocked' || m.workStatus === 'waiting_approval').length,
  }
}
