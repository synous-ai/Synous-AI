/**
 * Contenido de una propuesta comercial: SOLO lo que cambia entre clientes.
 *
 * La landing pública (`/p/<token>`) mezcla dos clases de contenido. Lo que
 * describe cómo trabaja Synous —las seis fases del método, las garantías, el
 * portfolio, el equipo, las preguntas frecuentes— vive en el código de la
 * landing y es idéntico en toda propuesta: si la IA lo regenerara por cliente,
 * el método se leería distinto cada vez y dejaría de parecer un proceso.
 *
 * Acá va lo otro: a quién va dirigida, qué se construye, cuánto sale y la letra
 * chica de ESE proyecto. Es lo que la IA genera desde el onboarding, lo que el
 * equipo edita antes de enviar, y lo único que se guarda por fila en
 * `proposal.content`.
 */
export interface ProposalContent {
  // ── Portada ──────────────────────────────────────────────────────────────
  /** Empresa a la que va dirigida, tal como se muestra: "UIRTUS Consultoría Evolutiva". */
  clientName: string
  /** Sello de fecha de la portada y del sobre: "SEPTIEMBRE 2026". */
  dateLabel: string
  /** Bajada del hero: qué se construye, en una o dos frases. */
  heroLede: string

  // ── Alcance: qué se construye ────────────────────────────────────────────
  scopeHeading: string
  scopeLede: string
  scopePhases: ProposalScopePhase[]
  /** Caminos posibles después del MVP. Opcional: no toda propuesta los ofrece. */
  scopePaths?: ProposalScopePath[]

  // ── Inversión: cuánto sale ───────────────────────────────────────────────
  investmentHeading: string
  investmentPhases: ProposalInvestmentPhase[]
  /** Nota al pie del bloque de precios. */
  investmentNote?: string

  // ── Información importante: la letra chica de este proyecto ──────────────
  /** Qué condiciona las fechas acordadas. */
  termsNote: string
  /** Qué queda fuera de esta cotización. */
  exclusions: string[]

  // ── Preguntas ────────────────────────────────────────────────────────────
  /**
   * Preguntas propias de este proyecto. Se suman a las fijas de la landing en
   * vez de reemplazarlas, así las respuestas de siempre no cambian por cliente.
   */
  extraFaq?: ProposalFaqEntry[]
}

export interface ProposalScopePhase {
  /** Etiqueta corta: "FASE 01". */
  label: string
  title: string
  body: string
}

export interface ProposalScopePath {
  icon: 'modules' | 'versions' | 'mobile'
  title: string
  body: string
}

export interface ProposalInvestmentPhase {
  name: string
  /** Precio único. Se omite cuando la fase ofrece varias formas de pago. */
  price?: string
  includes: string[]
  /** Condiciones de pago del precio único. */
  payment?: string
  /** Alternativas de pago, cuando la fase se puede encarar de varias formas. */
  options?: ProposalPricingOption[]
}

export interface ProposalPricingOption {
  label: string
  price: string
  terms: string
}

export interface ProposalFaqEntry {
  question: string
  answer: string
}

/**
 * Plantilla de la landing pública. Agregar una = sumarla acá, en el schema Zod
 * y en el registro del admin (`components/proposal/proposal-templates.ts`).
 */
export const PROPOSAL_TEMPLATES = ['classic', 'katherine-lindo'] as const
export type ProposalTemplate = (typeof PROPOSAL_TEMPLATES)[number]

/** Lo que el cliente pide desde los CTAs del cierre de la propuesta. */
export type ProposalInterestIntent = 'advance' | 'questions'

/** Estados del ciclo de vida de una propuesta. */
export type ProposalStatus = 'draft' | 'accepted' | 'sent' | 'viewed'
