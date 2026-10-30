/**
 * Shape del layout `product-vision`: la propuesta que muestra el ROADMAP de un
 * producto digital todavía no construido. El producto avanza por VERSIONES
 * (V1, V2…) y la construcción de cada versión, por PASOS.
 *
 * Como en la plantilla clásica, el copy vive en código, un archivo por cliente
 * (ver `katherine-lindo-content.ts`). El layout es el mismo para todos.
 */

/**
 * Un dato que el equipo todavía no validó (plazo, montos de cuotas…).
 *
 * - Con `draft`: el link público muestra el borrador tal cual, y la vista
 *   previa interna lo marca en ámbar para que nadie lo mande sin revisarlo.
 * - Sin `draft`: se muestra "A confirmar" en todos lados.
 *
 * El detalle de la propuesta en el admin lista `pendingChecklist` antes de
 * aprobarla, así que todo dato pendiente tiene que figurar también ahí.
 */
export interface PendingValue {
  pending: string
  draft?: string
}

export type MaybePending = string | PendingValue

export function isPending(value: MaybePending): value is PendingValue {
  return typeof value !== 'string'
}

/** Titular con una parte destacada: `lead` va normal, `accent` en el acento. */
export interface SplitHeadline {
  lead: string
  accent: string
}

// ── Demo del celular ─────────────────────────────────────────────────────────

export type GuideTopic = 'training' | 'nutrition' | 'mindset'

/** Una conversación simulada: lo que pregunta el alumno y lo que responde la guía. */
export interface GuideConversation {
  id: string
  /** Etiqueta corta del chip: "Entrenamiento". */
  label: string
  question: string
  answer: string[]
}

export interface AppDemo {
  /** Nombre de la app tal como aparece en el celular. Identidad provisional. */
  appName: string
  /** Alumno de ejemplo. */
  studentName: string
  home: {
    greeting: string
    title: string
    body: string
    primaryAction: string
    shortcuts: { topic: GuideTopic; label: string; conversationId: string }[]
    checkin: {
      question: string
      options: { label: string; conversationId: string }[]
    }
  }
  guide: {
    title: string
    opening: string
    /** Las preguntas que se ofrecen al abrir la guía. */
    suggested: string[]
    conversations: GuideConversation[]
    /** Aviso discreto bajo cada respuesta simulada. */
    sampleNote: string
  }
  profile: {
    title: string
    goalLabel: string
    goal: string
    details: { label: string; value: string }[]
    historyLabel: string
    /** Conversaciones pasadas de ejemplo: título y cuándo. */
    history: { title: string; when: string }[]
  }
}

// ── Roadmap ──────────────────────────────────────────────────────────────────

export interface ProductVersion {
  /** "V1". */
  code: string
  name: string
  /** Una línea: qué suma esta versión. */
  summary: string
  /**
   * Lo que queda abierto: cada versión parte de lo conversado y se puede
   * ampliar. Nunca se presenta como un alcance cerrado de antemano.
   */
  open: string
  /** Chip junto al nombre: "Primera entrega" o "Se define con el uso real de la V1". */
  tag: string
  current: boolean
}

// ── Tu V1 ────────────────────────────────────────────────────────────────────

/** Qué mockup se dibuja en cada tarjeta del bento de pantallas. */
export type ScreenMockup = 'access' | 'home' | 'guide' | 'profile' | 'admin'

export interface V1Screen {
  mockup: ScreenMockup
  title: string
  points: string[]
}

export interface PaymentOption {
  label: string
  /** El monto grande de la opción. */
  amount: string
  /** El detalle bajo el monto: "3 × USD 533,33". */
  detail: MaybePending
}

// ── Contenido completo ───────────────────────────────────────────────────────

export interface ProductVisionContent {
  envelope: { recipient: string; dateLabel: string; statement: string }

  nav: { label: string; href: string }[]

  /** Rótulo del indicador fijo del roadmap. */
  rail: { label: string; cta: string }

  hero: {
    eyebrow: string
    forLine: string
    headline: SplitHeadline
    lede: string
    primaryCta: { label: string; href: string }
  }

  vision: {
    label: string
    headline: SplitHeadline
    paragraphs: string[]
    pillars: { title: string; body: string }[]
  }

  roadmap: {
    label: string
    headline: string
    lede: string
    versions: ProductVersion[]
  }

  v1: {
    label: string
    headline: SplitHeadline
    lede: string
    what: {
      title: string
      body: string
      traits: string[]
    }
    demo: {
      title: string
      body: string
      disclaimer: string
      app: AppDemo
    }
    screensTitle: string
    screensLede: string
    screens: V1Screen[]
    delivery: { title: string; items: string[] }
    notYet: {
      title: string
      items: { label: string; version: string }[]
    }
  }

  process: {
    label: string
    headline: string
    lede: string
    totalLabel: string
    total: MaybePending
    steps: { title: string; body: string; time: MaybePending }[]
  }

  investment: {
    label: string
    headline: string
    lede: string
    cardTitle: string
    options: PaymentOption[]
    includesLabel: string
    includes: string[]
    next: string
  }

  after: {
    label: string
    headline: string
    lede: string
    signals: { title: string; body: string }[]
  }

  faq: {
    label: string
    headline: string
    entries: { question: string; answer: string }[]
  }

  /**
   * Cierre: una pregunta, una bajada y un solo botón que abre WhatsApp con un
   * mensaje ya escrito. El click además avisa al equipo en el panel.
   */
  close: {
    headline: string
    lede: string
    cta: string
    /** Número en formato internacional, solo dígitos: "5492221429754". */
    whatsappNumber: string
    whatsappMessage: string
  }

  footer: string

  /**
   * Lo que el equipo tiene que confirmar antes de aprobar y enviar el link.
   * Lo lista el detalle de la propuesta en el admin.
   */
  pendingChecklist: string[]
}
