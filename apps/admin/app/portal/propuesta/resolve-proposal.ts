import type { ProposalContent } from '@/lib/types/proposals'
import { proposal as template, type InvestmentPhase, type ScopePhase, type ScopePath } from './proposal-content'

/**
 * Resuelve lo que la landing renderiza para un cliente concreto.
 *
 * La plantilla (`proposal-content.ts`) es el default completo: método,
 * garantías, portfolio, equipo y también un ejemplo de las partes variables.
 * Lo que viene de la base pisa esa plantilla campo por campo.
 *
 * Un campo vacío o ausente cae al de la plantilla en vez de renderizar un
 * hueco, así una propuesta a medio cargar se ve entera. Es lo que permite
 * mandar un link con tres campos llenos mientras la estructura se termina de
 * definir, sin que la página se rompa por lo que falta.
 */
type Template = typeof template

/**
 * La plantilla es un literal, así que TypeScript infiere sus listas con la forma
 * exacta de esos valores — una fase con `price` y otra con `options` salen como
 * dos tipos distintos. Lo que llega de la base cumple el tipo declarado pero no
 * ese literal, así que las listas variables se ensanchan al tipo nombrado.
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

/** Texto no vacío, o undefined. Un string en blanco cuenta como ausente. */
function text(v: string | undefined): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined
}

/** Array con al menos un elemento, o undefined. */
function list<T>(v: T[] | undefined): T[] | undefined {
  return Array.isArray(v) && v.length > 0 ? v : undefined
}


export function resolveProposal(content?: ProposalContent | null): ResolvedProposal {
  if (!content) return template

  const client = text(content.clientName) ?? template.meta.client
  const dateLabel = text(content.dateLabel)

  return {
    ...template,

    meta: {
      ...template.meta,
      client,
      ...(dateLabel ? { date: dateLabel } : {}),
    },

    hero: {
      ...template.hero,
      ...(dateLabel ? { eyebrow: `PROPUESTA · ${dateLabel.toUpperCase()}` } : {}),
      headlineHighlight: client,
      lede: text(content.heroLede) ?? template.hero.lede,
    },

    scope: {
      ...template.scope,
      heading: text(content.scopeHeading) ?? template.scope.heading,
      lede: text(content.scopeLede) ?? template.scope.lede,
      phases: list(content.scopePhases) ?? template.scope.phases,
      paths: list(content.scopePaths) ?? template.scope.paths,
    },

    investment: {
      ...template.investment,
      heading: text(content.investmentHeading) ?? template.investment.heading,
      phases: list(content.investmentPhases) ?? template.investment.phases,
      note: text(content.investmentNote) ?? template.investment.note,
    },

    important: {
      ...template.important,
      terms: {
        ...template.important.terms,
        body: text(content.termsNote) ?? template.important.terms.body,
      },
      exclusions: list(content.exclusions) ?? template.important.exclusions,
    },

    faq: {
      ...template.faq,
      // Las propias del proyecto se SUMAN a las de siempre, que no cambian.
      entries: [...template.faq.entries, ...(list(content.extraFaq) ?? [])],
    },
  }
}
