import type { ProposalContent } from '@/lib/types/proposals'
import { proposal as template, type InvestmentPhase, type ScopePhase, type ScopePath } from './proposal-content'

/**
 * Resuelve lo que la landing renderiza.
 *
 * La propuesta se muestra SIEMPRE tal cual está en `proposal-content.ts`. El
 * `proposal.content` de la base (el JSON que genera la IA o que se edita a
 * mano) ya no pisa ningún texto: antes se mezclaba campo por campo con la
 * plantilla, y eso dejaba en el link publicado un copy distinto del que se
 * revisó en el código.
 *
 * La base sigue decidiendo si el link existe y si la propuesta está publicada
 * (un borrador responde 404); los textos salen de acá.
 *
 * Se mantiene el parámetro para no tocar a quien la llama: el contenido se
 * recibe y se ignora a propósito.
 */
type Template = typeof template

/**
 * La plantilla es un literal, así que TypeScript infiere sus listas con la forma
 * exacta de esos valores — una fase con `price` y otra con `options` salen como
 * dos tipos distintos. Las listas se ensanchan al tipo nombrado para que la
 * landing las recorra sin pelear con la unión.
 */
export type ResolvedProposal = Omit<Template, 'scope' | 'investment'> & {
  scope: Omit<Template['scope'], 'phases' | 'paths'> & {
    phases: ScopePhase[]
    paths: ScopePath[]
  }
  investment: Omit<Template['investment'], 'phases'> & {
    phases: InvestmentPhase[]
  }
}

export function resolveProposal(_content?: ProposalContent | null): ResolvedProposal {
  return template
}
