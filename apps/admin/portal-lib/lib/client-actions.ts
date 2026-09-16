/**
 * "Requiere tu atención" — qué está esperando una acción REAL del cliente.
 *
 * Módulo PURO a propósito (sin React, sin iconos, sin Tailwind): recibe los
 * datos que ya trae `usePortalPendingCounts` y devuelve una lista ordenada de
 * acciones concretas. La UI decide cómo pintarlas; acá vive el único criterio
 * de qué cuenta como acción, con qué urgencia y a dónde lleva.
 *
 * Por qué acá y no adentro del componente:
 *
 * 1. El Inicio no puede volver a decidir por su cuenta qué es "pendiente" —
 *    ese criterio ya existe en `usePortalPendingCounts` (compartido con los
 *    badges del sidebar). Esto lo CONSUME, no lo redefine.
 * 2. La urgencia tiene que salir de un dato real (una fecha vencida), nunca de
 *    una opinión de la pantalla. Todo lo que devuelve `tone: 'overdue'` sale
 *    de comparar una fecha contra hoy.
 * 3. Es testeable sin montar nada.
 *
 * ─── Qué NO entra ───────────────────────────────────────────────────────────
 *
 * - Entregables en `changes_requested`: el cliente YA actuó (pidió ajustes) y
 *   la pelota es del equipo. Siguen contando para el badge del sidebar, que
 *   significa "ítems abiertos en esta sección", pero no son una acción suya.
 *   Ver `PortalPending.deliverablesAwaitingReview`.
 * - Documentos pendientes de firma: el portal todavía no expone el botón
 *   "Firmar" (falta exponer la `signingUrl` de DocuSeal validando al firmante
 *   — ver documents-panel.tsx). Una tarjeta sin CTA real sería peor que no
 *   mostrarla.
 */

import { formatCurrency, formatDate } from '@synous/shared'
import type { ChangeRequest, ClientIntake, ClientInvoice, Deliverable } from './types'

export type ClientActionKind = 'invoice' | 'request' | 'deliverable' | 'form'

/**
 * Tono de la tarjeta. `overdue` es el ÚNICO que pinta en rojo, y solo se
 * asigna comparando una fecha real contra hoy — nunca por "parecer urgente".
 */
export type ClientActionTone = 'overdue' | 'attention'

export interface ClientAction {
  /** Estable y único entre tipos: dos entidades distintas nunca colisionan. */
  id: string
  kind: ClientActionKind
  /** Etiqueta del tipo, en mayúsculas en la UI: "ENTREGABLE", "FACTURA". */
  kindLabel: string
  /** Identificador legible del ítem ("CR #3", "Factura #12"). `null` si no tiene. */
  reference: string | null
  /** El nombre CONCRETO del ítem. Nunca un genérico tipo "Tenés 3 entregables". */
  title: string
  /** Una línea que explica por qué está acá. */
  context: string
  /** Metadata corta y relevante (monto, impacto, vencimiento). `null` si no aporta. */
  meta: string | null
  tone: ClientActionTone
  /** Ruta RELATIVA a la base del portal (el caller le antepone `portalBase`). */
  href: string
  /** Describe la acción concreta. Nada de "Ver más". */
  cta: string
}

/**
 * Peso por tipo de acción, de más a menos urgente. El orden final es
 * `(tone overdue primero) → (peso del tipo) → (fecha más vieja primero)`:
 *
 * - Una factura vencida primero: es lo único con consecuencia externa (corte
 *   de servicio, intereses) y su urgencia es un hecho, no una interpretación.
 * - Después lo que BLOQUEA al equipo: una decisión sobre una solicitud y una
 *   revisión de entregable frenan el proyecto hasta que el cliente responde.
 * - Los formularios van después porque suelen admitir más margen.
 * - Las facturas no vencidas al final: son información, no urgencia.
 *
 * Los vencidos (facturas y formularios con fecha pasada) suben por encima de
 * todo vía `tone`, así que un formulario vencido gana a una solicitud.
 */
const KIND_WEIGHT: Record<ClientActionKind, number> = {
  invoice: 0,
  request: 1,
  deliverable: 2,
  form: 3,
}

const KIND_LABEL: Record<ClientActionKind, string> = {
  invoice: 'Factura',
  request: 'Solicitud',
  deliverable: 'Entregable',
  form: 'Formulario',
}

/** Fecha corta sin año: "12 sep". El año completo es ruido para un vencimiento cercano. */
function shortDate(iso: string): string {
  return formatDate(iso, { day: 'numeric', month: 'short' })
}

/** ¿La fecha ya pasó? Compara contra el arranque de HOY, no contra el instante actual. */
function isPast(iso: string | null, now: Date): boolean {
  if (!iso) return false
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return new Date(iso).getTime() < today.getTime()
}

/** Momento que ordena la acción dentro de su grupo: lo más viejo primero. */
interface Sortable {
  action: ClientAction
  weight: number
  at: number
}

function invoiceAction(invoice: ClientInvoice, now: Date): Sortable {
  const overdue = invoice.isOverdue
  const amount = formatCurrency(invoice.balance, invoice.currency)
  const due = invoice.dueDate
    ? overdue
      ? `Venció el ${shortDate(invoice.dueDate)}`
      : `Vence el ${shortDate(invoice.dueDate)}`
    : null

  return {
    weight: KIND_WEIGHT.invoice,
    at: new Date(invoice.dueDate ?? invoice.issueDate ?? 0).getTime(),
    action: {
      id: `invoice:${invoice.id}`,
      kind: 'invoice',
      kindLabel: KIND_LABEL.invoice,
      reference: `Factura #${invoice.number}`,
      title: amount,
      context: overdue
        ? 'Tiene saldo pendiente y ya pasó su vencimiento.'
        : 'Está emitida y pendiente de pago.',
      meta: due,
      tone: overdue ? 'overdue' : 'attention',
      href: `/invoices#invoice-${invoice.id}`,
      cta: 'Ver factura',
    },
  }
}

function requestAction(cr: ChangeRequest): Sortable {
  // Monto e impacto en plazo son los dos datos sobre los que el cliente
  // decide. Se muestran solo si existen: una CR sin presupuesto cargado no
  // debe inventar "USD 0".
  const bits: string[] = []
  if (cr.totalAmount !== null && Number(cr.totalAmount) > 0) {
    bits.push(formatCurrency(cr.totalAmount, cr.currency))
  }
  if (cr.timelineImpactDays > 0) {
    bits.push(`+${cr.timelineImpactDays} ${cr.timelineImpactDays === 1 ? 'día' : 'días'}`)
  }

  return {
    weight: KIND_WEIGHT.request,
    // `submittedAt` es cuándo entró al circuito; `createdAt` cubre el caso de
    // una CR abierta por el equipo que nunca pasó por "enviada por el cliente".
    at: new Date(cr.submittedAt ?? cr.createdAt).getTime(),
    action: {
      id: `request:${cr.id}`,
      kind: 'request',
      kindLabel: KIND_LABEL.request,
      reference: `CR #${cr.number}`,
      title: cr.title,
      context: 'Está esperando tu decisión para avanzar.',
      meta: bits.length > 0 ? bits.join(' · ') : null,
      tone: 'attention',
      href: `/requests/${cr.id}`,
      cta: 'Revisar solicitud',
    },
  }
}

function deliverableAction(deliverable: Deliverable): Sortable {
  return {
    weight: KIND_WEIGHT.deliverable,
    at: new Date(deliverable.createdAt).getTime(),
    action: {
      id: `deliverable:${deliverable.id}`,
      kind: 'deliverable',
      kindLabel: KIND_LABEL.deliverable,
      reference: deliverable.version > 1 ? `v${deliverable.version}` : null,
      title: deliverable.title,
      context: 'Está listo y esperando tu revisión.',
      meta: `Recibido el ${shortDate(deliverable.createdAt)}`,
      tone: 'attention',
      href: `/deliverables#deliverable-${deliverable.id}`,
      cta: 'Revisar entregable',
    },
  }
}

function formAction(intake: ClientIntake, now: Date): Sortable {
  const overdue = isPast(intake.dueDate, now)
  const due = intake.dueDate
    ? overdue
      ? `Venció el ${shortDate(intake.dueDate)}`
      : `Vence el ${shortDate(intake.dueDate)}`
    : null

  return {
    weight: KIND_WEIGHT.form,
    at: new Date(intake.dueDate ?? 0).getTime(),
    action: {
      id: `form:${intake.id}`,
      kind: 'form',
      kindLabel: KIND_LABEL.form,
      reference: null,
      title: intake.title,
      context:
        intake.status === 'in_progress'
          ? 'Lo empezaste y quedó a medias. Necesitamos completarlo para seguir.'
          : 'Necesitamos esta información para seguir avanzando.',
      meta: due,
      tone: overdue ? 'overdue' : 'attention',
      href: `/forms#form-${intake.id}`,
      cta: intake.status === 'in_progress' ? 'Terminar formulario' : 'Completar formulario',
    },
  }
}

export interface ClientActionSources {
  invoices: ClientInvoice[]
  requests: ChangeRequest[]
  /** SOLO los que esperan revisión (`pending_review`). Ver la nota de arriba. */
  deliverables: Deliverable[]
  forms: ClientIntake[]
}

/**
 * Traduce lo pendiente a una lista de acciones concretas, ya ordenada.
 *
 * `now` se inyecta (default: el instante actual) para que los tests puedan
 * fijar el "hoy" sin tocar relojes globales.
 */
export function buildClientActions(sources: ClientActionSources, now: Date = new Date()): ClientAction[] {
  const rows: Sortable[] = [
    ...sources.invoices.map((i) => invoiceAction(i, now)),
    ...sources.requests.map(requestAction),
    ...sources.deliverables.map(deliverableAction),
    ...sources.forms.map((f) => formAction(f, now)),
  ]

  rows.sort((a, b) => {
    const aOverdue = a.action.tone === 'overdue' ? 0 : 1
    const bOverdue = b.action.tone === 'overdue' ? 0 : 1
    if (aOverdue !== bOverdue) return aOverdue - bOverdue
    if (a.weight !== b.weight) return a.weight - b.weight
    // Desempate estable: lo más viejo primero (lleva más tiempo esperando).
    return a.at - b.at
  })

  return rows.map((r) => r.action)
}

/** Cuántas acciones se muestran en el Inicio antes de derivar al resto del portal. */
export const DASHBOARD_ACTION_LIMIT = 4

/** Sección del portal a la que pertenece cada tipo de acción. */
const KIND_SECTION: Record<ClientActionKind, { href: string; label: string }> = {
  invoice: { href: '/invoices', label: 'Facturas' },
  request: { href: '/requests', label: 'Solicitudes' },
  deliverable: { href: '/deliverables', label: 'Entregables' },
  form: { href: '/forms', label: 'Formularios' },
}

export interface ActionOverflowGroup {
  kind: ClientActionKind
  href: string
  label: string
  count: number
}

/**
 * Dónde quedó lo que no entró en el Inicio, agrupado por sección.
 *
 * Un solo link "Ver todas las acciones" no tendría a dónde ir: el portal no
 * tiene una pantalla que junte entregables, formularios, solicitudes y
 * facturas, y crearla duplicaría cuatro listados que ya existen y que siguen
 * siendo los responsables de gestionar lo suyo. En cambio, decir "2 en
 * Facturas · 1 en Entregables" es exacto y lleva directo al lugar correcto.
 *
 * Mantiene el orden de prioridad: el primer grupo es el de la acción más
 * urgente que quedó afuera.
 */
export function groupOverflow(actions: ClientAction[]): ActionOverflowGroup[] {
  const groups = new Map<ClientActionKind, ActionOverflowGroup>()
  for (const action of actions) {
    const existing = groups.get(action.kind)
    if (existing) {
      existing.count += 1
      continue
    }
    const section = KIND_SECTION[action.kind]
    groups.set(action.kind, { kind: action.kind, href: section.href, label: section.label, count: 1 })
  }
  return [...groups.values()]
}
