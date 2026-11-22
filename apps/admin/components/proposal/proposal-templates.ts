import { proposal as classic } from '@/app/portal/propuesta/proposal-content'
import { PROPOSAL_TEMPLATE_KEYS, type ProposalTemplate } from '@/lib/types/proposals'
import { katherineLindoProposal } from './product-vision/katherine-lindo-content'

export { PROPOSAL_TEMPLATE_KEYS, type ProposalTemplate }

/**
 * Registro de plantillas de la landing pública. Cada propuesta guarda su
 * `template` en la base; acá se traduce a qué layout y qué copy se muestran.
 *
 * El copy vive en código (decisión de `resolve-proposal.ts`): `proposal.content`
 * no se renderiza. Agregar una plantilla = sumarla acá y en
 * `PROPOSAL_TEMPLATES` de `apps/api/src/modules/proposals/proposals.types.ts`.
 *
 * Solo datos, sin componentes: lo importa también el detalle del admin, que es
 * un componente cliente.
 */

export interface ProposalEnvelope {
  recipient: string
  dateLabel: string
  statement: string
}

interface TemplateEntry {
  /** Nombre para el selector del admin. */
  label: string
  layout: 'classic' | 'product-vision'
  envelope: ProposalEnvelope
  /** Lo que falta confirmar antes de aprobar y enviar el link. */
  pending: readonly string[]
  /**
   * Documento de alcance descargable, si la plantilla tiene uno. `file` vive en
   * `apps/admin/assets/proposals/` (ver `lib/proposal-scope-pdf.ts`).
   */
  scopePdf?: { file: string; downloadName: string }
}

export const PROPOSAL_TEMPLATES: Record<ProposalTemplate, TemplateEntry> = {
  classic: {
    label: 'Clásica (UIRTUS)',
    layout: 'classic',
    envelope: classic.envelope,
    pending: [],
  },
  'katherine-lindo': {
    label: 'Product vision — Katherine Lindo',
    layout: 'product-vision',
    envelope: katherineLindoProposal.envelope,
    pending: katherineLindoProposal.pendingChecklist,
    scopePdf: {
      file: 'katherine-lindo-alcance-v1.pdf',
      downloadName: 'Synous AI — Alcance V1 — Guía IA para Kathe Lindo.pdf',
    },
  },
}

export function isProposalTemplate(value: unknown): value is ProposalTemplate {
  return typeof value === 'string' && (PROPOSAL_TEMPLATE_KEYS as readonly string[]).includes(value)
}

/** Una plantilla desconocida (p. ej. una fila de una versión futura) cae en la clásica. */
export function templateOf(value: unknown): ProposalTemplate {
  return isProposalTemplate(value) ? value : 'classic'
}
