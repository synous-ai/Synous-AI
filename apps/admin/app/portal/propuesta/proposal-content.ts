/**
 * Every string the proposal renders, kept apart from the markup.
 *
 * The deck marks each section as fixed template copy or per-client copy. That
 * split lives here as `client` (swapped per proposal) versus the sections that
 * describe how Synous works, which stay the same. A new proposal is a change to
 * this file, never to the layout — and the same shape can later come from the
 * `proposal` table keyed by company.
 *
 * The landing never names the contact person: it addresses the brand, in plural.
 */

export type NavItem = { id: string; label: string }

export type TitledBlock = { title: string; body: string }

export type Phase = { label: string; title: string; description: string }

export type TeamMember = { name: string; title: string; description: string }

export type ScopePhase = { label: string; title: string; body: string }

export type ScopePath = { icon: 'modules' | 'versions' | 'mobile'; title: string; body: string }

/** Un nivel de la arquitectura conceptual: qué se construye y en qué fase. */
export type ArchitectureLayer = { label: string; title: string; body: string }

/** Bloque del diagnóstico inicial, con un glifo que nombra el problema. */
export type OriginBlock = {
  icon: 'visibility' | 'scattered' | 'system'
  title: string
  body: string
}

/** Garantía de proceso, con un glifo que nombra el compromiso. */
export type GuaranteeBlock = {
  icon: 'progress' | 'blueprint' | 'ownership' | 'support'
  title: string
  body: string
}

export type CaseStudy = { name: string; kind: string; description: string; proves: string }

export type PricingOption = { label: string; price: string; terms: string }

export type InvestmentPhase = {
  name: string
  price?: string
  includes: string[]
  payment?: string
  options?: PricingOption[]
}

export type FaqEntry = { question: string; answer: string }

/**
 * Nav order mirrors the page: what we build, what it costs, how we deliver,
 * what we've built before. Inversión sits second on purpose — a lead who opens
 * this to check the number should reach it in one click.
 */
export const NAV: NavItem[] = [
  { id: 'de-donde-partimos', label: 'El punto de partida' },
  { id: 'alcance', label: 'La estrategia' },
  { id: 'inversion', label: 'Inversión' },
  { id: 'como-trabajamos', label: 'Cómo trabajamos' },
]

export const proposal = {
  meta: {
    client: 'UIRTUS Consultoría Evolutiva',
    date: 'Septiembre 2026',
    validity: '30 días',
  },

  hero: {
    eyebrow: 'PROPUESTA · SEPTIEMBRE 2026',
    headline: 'Una infraestructura digital a la altura de la consultora',
    headlineHighlight: 'UIRTUS',
    lede: 'UIRTUS ya no es solamente un estudio contable. Hoy conviven distintas áreas, herramientas propias, un diagnóstico, contenidos y una visión clara de construir un ecosistema digital propio. Esta propuesta cubre los dos proyectos que lo hacen posible: la presencia institucional y la aplicación, trabajados en paralelo sobre una misma arquitectura.',
    primaryCta: 'Ver propuesta',
  },

  /** De dónde partimos: el diagnóstico del momento, antes de proponer nada. */
  origin: {
    eyebrow: 'DE DÓNDE PARTIMOS',
    heading: 'UIRTUS creció. Su presencia digital todavía no acompañó esa evolución.',
    lede: 'En estos nueve años, UIRTUS pasó de concentrarse principalmente en lo contable e impositivo a incorporar gestión, recursos humanos, legales, administración inmobiliaria y nuevas herramientas propias.',
    blocks: [
      {
        icon: 'visibility',
        title: 'La evolución no tiene dónde verse',
        body: 'Esa transformación todavía no cuenta con un espacio digital que la represente de forma unificada. Quien busca a UIRTUS hoy no encuentra el alcance real de lo que hace.',
      },
      {
        icon: 'scattered',
        title: 'Las piezas existen, pero separadas',
        body: 'El diagnóstico, el panel de clientes, la comunicación institucional y las futuras herramientas viven como piezas independientes, sin un lugar común que las conecte.',
      },
      {
        icon: 'system',
        title: 'El objetivo no es una página',
        body: 'Es empezar a ordenar todo eso bajo un mismo ecosistema, con una arquitectura que sostenga lo que viene después.',
      },
    ] satisfies OriginBlock[],
  },

  /** El evento del 9 de noviembre: la fecha que ordena las prioridades. */
  milestone: {
    eyebrow: 'EL PRIMER HITO',
    heading: 'Llegar al 9 de noviembre con UIRTUS presentada como corresponde.',
    lede: 'Para el evento, la prioridad no es tener todo el ecosistema terminado. Es llegar con una presencia oficial, profesional y funcional desde la cual puedan presentar UIRTUS, sus áreas y el Diagnóstico UIRTUS como una herramienta propia de la consultora.',
    dateLabel: '09 NOV',
    dateTitle: 'Sitio institucional y MVP de su primer producto.',
  },




  method: {
    eyebrow: 'CÓMO TRABAJAMOS',
    heading: 'Desde el primer día van a saber qué estamos haciendo y qué sigue.',
    phases: [
      {
        label: '01',
        title: 'Contexto',
        description:
          'Entendemos cómo funciona el negocio: qué vende, cómo entrega, qué procesos sostiene y cómo se organiza su operación. Ese contexto guía todas las decisiones del proyecto.',
      },
      {
        label: '02',
        title: 'Arquitectura',
        description:
          'Definimos usuarios, roles, permisos, módulos, datos e integraciones. Al terminar esta fase queda por escrito qué se construye, por qué y en qué orden.',
      },
      {
        label: '03',
        title: 'Prototipo',
        description:
          'Diseñamos la experiencia. Van a ver cómo se va a ver y cómo se va a usar antes de que exista.',
      },
      {
        label: '04',
        title: 'Desarrollo',
        description:
          'Convertimos el prototipo aprobado en un producto funcional. Integramos cada parte y mostramos avances periódicos hasta completar el alcance acordado.',
      },
      {
        label: '05',
        title: 'Lanzamiento',
        description:
          'QA, configuración, capacitación, documentación y salida a producción. Entregamos el sistema y también cómo usarlo.',
      },
      {
        label: '06',
        title: 'Acompañamiento',
        description:
          'Durante 15 días después del lanzamiento acompañamos la puesta en marcha, respondemos dudas de uso y verificamos que la implementación funcione como fue definida.',
      },
    ] satisfies Phase[],
  },

  team: {
    eyebrow: 'QUIÉNES SOMOS',
    heading: 'Las mentes detrás de Synous',
    body: [
      'Synous AI es una agencia de software y automatización. Trabajamos con negocios que ya funcionan y necesitan que su parte digital esté a la altura de lo que son.',
    ],
    members: [
      {
        name: 'Laureano Sierra',
        title: 'CEO',
        description:
          'Diseñador y programador web con más de 4 años de experiencia y más de 50 proyectos concluidos, especializado en construir interfaces digitales de alto rendimiento.',
      },
      {
        name: 'Jeremías Ingla',
        title: 'CEO',
        description:
          'Programador web con más de 4 años de experiencia, especializado en infraestructuras y operaciones digitales.',
      },
    ] satisfies TeamMember[],
  },

  work: {
    eyebrow: 'PORTAFOLIO',
    heading: 'Mirá en la práctica algunos proyectos recientes.',
    cases: [
      {
        name: 'Consciencia MCE',
        kind: 'Plataforma',
        description:
          'Un programa de transformación que convertimos en una plataforma propia: portal de usuario, panel de administración, onboarding, contenido, comunidad, calendario, reportes, seguimiento de alumnos e IA contextual.',
        proves: 'Convertimos una metodología en un sistema.',
      },
      {
        name: 'CASC',
        kind: 'Plataforma institucional',
        description:
          'Cámara Argentina de Shopping Centers. Sitio institucional y plataforma web para centralizar operación, información y conocimiento de una entidad con varias áreas.',
        proves: 'Trabajamos con instituciones y estructuras de múltiples áreas.',
      },
      {
        name: 'Aura Studio',
        kind: 'Plataforma con IA',
        description:
          'Plataforma que automatiza parte de la producción de creativos publicitarios con IA: entiende la marca, genera ángulos de venta y los convierte en piezas listas. Con biblioteca de creativos clonables, perfiles de marca, variaciones y edición.',
        proves: 'Construimos productos con IA aplicada a un proceso real.',
      },
    ] satisfies CaseStudy[],
  },

  scope: {
    eyebrow: 'LA ESTRATEGIA',
    heading: 'Dos proyectos. Una misma infraestructura.',
    lede: 'Cada fase resuelve un problema distinto, pero se construyen sobre la misma base. La primera devuelve una presencia a la altura de lo que UIRTUS ya es; la segunda empieza a construir la visión que viene después.',
    phases: [
      {
        label: 'FASE 01 — PRESENCIA',
        title: 'Sitio institucional + CMS',
        body: 'El punto de entrada oficial a UIRTUS: quiénes son, qué hacen, sus áreas y servicios, el Diagnóstico UIRTUS y el acceso de clientes. Con un CMS propio para que el equipo pueda actualizar información sin depender de terceros.',
      },
      {
        label: 'FASE 02 — PRODUCTO',
        title: 'MVP de la aplicación web UIRTUS',
        body: 'Una aplicación web responsive, diseñada mobile first: se usa desde el navegador del celular, sin instalación ni tiendas. Es el primer paso para transformar herramientas y procesos que hoy existen por separado en una experiencia digital propia para los clientes de UIRTUS, sobre una base preparada para crecer —incluida una futura versión nativa— a medida que el producto demuestre qué necesita.',
      },
    ] satisfies ScopePhase[],
    pathsHeading: 'El MVP no define el techo de la aplicación. Define la base.',
    pathsLede: 'Una vez validada la primera versión, UIRTUS puede seguir evolucionando según lo que tenga mayor impacto en ese momento.',
    pathsNote: 'Ejemplos que aparecieron durante nuestra conversación: gestión de ingresos y gastos, vencimientos, obligaciones, herramientas financieras, medios de pago y un futuro Consultor UIRTUS impulsado por IA. Son visión futura, no están incluidos en esta propuesta.',
    paths: [
      {
        icon: 'modules',
        title: 'Por módulos',
        body: 'Para incorporar funcionalidades puntuales sin comprometer una inversión mayor.',
      },
      {
        icon: 'versions',
        title: 'Por versiones',
        body: 'Para agrupar varias mejoras en una evolución más ambiciosa del producto.',
      },
      {
        icon: 'mobile',
        title: 'Fase 3 — Aplicación móvil nativa',
        body: 'Publicación en App Store y Google Play sobre la misma arquitectura, sin rehacer lo construido. Se cotiza una vez validado el MVP.',
      },
    ] satisfies ScopePath[],
  },

  /**
   * Cómo se conecta todo: la arquitectura conceptual. Responde a la
   * preocupación de avanzar por partes sin rehacer lo ya construido.
   */
  architecture: {
    eyebrow: 'CÓMO SE CONECTA TODO',
    heading: 'No estamos construyendo piezas aisladas.',
    lede: 'La arquitectura se plantea desde el inicio para que el sitio, el diagnóstico, el panel y las futuras funcionalidades puedan convivir dentro del mismo ecosistema. Así, cada nueva etapa aprovecha lo que ya fue construido en lugar de empezar nuevamente desde cero.',
    layers: [
      { label: 'FASE 01', title: 'Sitio UIRTUS', body: 'Diagnóstico · Áreas · Contenido' },
      { label: 'FASE 01', title: 'Acceso de clientes', body: 'La puerta que conecta las dos fases' },
      { label: 'FASE 02', title: 'Aplicación UIRTUS', body: 'Panel de cliente · Herramientas · Gestión' },
      { label: 'EVOLUCIÓN', title: 'Nuevas versiones del producto', body: 'Lo que el producto pida cuando esté funcionando' },
    ] satisfies ArchitectureLayer[],
  },

  guarantees: {
    eyebrow: 'NUESTRO COMPROMISO',
    heading: 'Lo que UIRTUS puede esperar durante todo el proyecto.',
    blocks: [
      {
        icon: 'progress',
        title: 'Avances visibles desde el inicio',
        body: 'Trabajamos por hitos y demos. Van a poder ver cómo avanza el proyecto, validar decisiones y saber en qué etapa estamos en todo momento.',
      },
      {
        icon: 'blueprint',
        title: 'Arquitectura antes de código',
        body: 'Si después de la fase de arquitectura no queda claro qué construir, qué priorizar y cómo debería funcionar, hacemos una sesión adicional sin costo hasta que quede definido.',
      },
      {
        icon: 'ownership',
        title: 'Activos a nombre de UIRTUS',
        body: 'Construimos activos suyos, no dependencias nuestras. El código, la base de datos, los repositorios y las cuentas quedan a nombre de UIRTUS.',
      },
      {
        icon: 'support',
        title: '15 días de acompañamiento',
        body: 'Después del lanzamiento seguimos disponibles: capacitación, documentación y estabilización técnica incluidas.',
      },
    ] satisfies GuaranteeBlock[],
  },

  investment: {
    eyebrow: 'INVERSIÓN',
    heading: 'Dos proyectos, una sola inversión.',
    lede: 'Cada proyecto tiene su precio, y tomarlos juntos tiene el suyo. Trabajarlos en paralelo comparte arquitectura, decisiones y horas de equipo — y ese ahorro vuelve al presupuesto.',
    phases: [
      {
        name: 'Sitio institucional + CMS',
        price: 'USD 2.350',
        includes: [
          'Sitio institucional con áreas y servicios',
          'CMS para gestión de contenido',
          'Integración del Diagnóstico UIRTUS',
          'Acceso al panel de clientes',
          'Diseño responsive',
          'Deploy y configuración',
          'Capacitación de uso del CMS',
          '15 días de estabilización técnica',
        ],
        payment: '50% al inicio · 50% en la entrega',
      },
      {
        name: 'MVP de la aplicación web',
        includes: [
          'Aplicación web responsive, diseñada mobile first',
          'Portal institucional dentro de la app',
          'Diagnóstico UIRTUS integrado',
          'Panel de clientes',
          'Panel de administración',
          'Integración del sitio con el panel de administración',
          'Arquitectura preparada para sumar módulos o versiones',
          'Capacitación y documentación',
          '15 días de estabilización técnica',
        ],
        options: [
          {
            label: 'En dos pagos',
            price: 'USD 6.300',
            terms: '50% al inicio · 50% en la entrega',
          },
          {
            label: 'En tres pagos',
            price: 'USD 7.500',
            terms: '40% al inicio · 30% en hito intermedio · 30% en la entrega',
          },
        ],
      },
    ] satisfies InvestmentPhase[],

    /**
     * La opción que queremos que tomen: los dos proyectos juntos. Va en una
     * tarjeta aparte, después de las individuales, para que el número se lea
     * contra los dos que acaba de ver.
     */
    combo: {
      label: 'LOS DOS PROYECTOS',
      title: 'Todo el ecosistema, en un solo proyecto.',
      body: 'Es la forma en que recomendamos encararlo. Trabajar las dos fases en paralelo permite decidir la arquitectura una sola vez, sin rehacer nada al pasar de una a la otra, y llegar al evento con el sitio publicado mientras la aplicación ya está en marcha.',
      separateLabel: 'Por separado',
      separatePrice: 'USD 8.650',
      savingLabel: 'Ahorro',
      savingAmount: 'USD 850',
      options: [
        {
          label: 'En dos pagos',
          price: 'USD 7.800',
          terms: '50% al inicio · 50% en la entrega',
        },
        {
          label: 'En tres pagos',
          price: 'USD 9.300',
          terms: '40% al inicio · 30% en hito intermedio · 30% en la entrega',
        },
      ] satisfies PricingOption[],
    },

    note: 'Los precios están en dólares. Cada proyecto se puede tomar por separado, pero la arquitectura está pensada para construirlos juntos: es donde el presupuesto rinde más y donde el resultado llega antes.',
  },

  /**
   * Everything the client should read before signing, gathered after pricing:
   * the terms that govern the dates, and what the quote does not cover.
   */
  important: {
    eyebrow: "INFORMACIÓN IMPORTANTE",
    heading: "Lo esencial antes de comenzar.",
    terms: {
      title: "Sobre los plazos",
      body: "Las fechas se confirman en el kickoff y requieren que los materiales y las aprobaciones se entreguen en los tiempos acordados.",
    },
    exclusionsTitle: "Lo que no entra en esta cotización",
    exclusions: [
      "Desarrollo móvil nativo y publicación en App Store / Google Play: corresponde a la Fase 3 y se cotiza por separado",
      "Identidad visual de marca (logo, manual, redes sociales)",
      "Soporte a usuarios finales",
      "Funcionalidades no definidas en el alcance. Si aparece algo nuevo, se evalúa costo e impacto y se aprueba antes de desarrollar",
      "Cambios ilimitados",
      "Medios de pago",
      "Los módulos de gestión: gastos, ingresos, vencimientos, facturas",
      "Consultor UIRTUS (asistente IA)",
    ],
  },

  faq: {
    eyebrow: 'PREGUNTAS FRECUENTES',
    heading: 'Lo que suelen preguntarnos.',
    entries: [
      {
        question: '¿Cuánto tarda?',
        answer:
          'Alrededor de 45 días, y el plazo exacto se confirma en la fase de arquitectura según el alcance final. Trabajamos por hitos justamente para evitar proyectos eternos: siempre hay fecha de entrega y demos en el camino.',
      },
      {
        question: '¿Qué pasa si aparece algo nuevo a mitad del proyecto?',
        answer:
          'Se evalúa costo, tiempo e impacto, y se aprueba antes de desarrollarlo. No trabajamos con "ya que estamos, agreguemos esto", porque es lo que hace que los proyectos no terminen nunca.',
      },
      {
        question: '¿El sistema queda a nombre nuestro?',
        answer:
          'Sí. Código, base de datos, repositorios, cuentas e infraestructura son del cliente. Nosotros recibimos permisos.',
      },
      {
        question: '¿Qué pasa después del lanzamiento?',
        answer:
          'Están incluidos 15 días de estabilización técnica para resolver errores del desarrollo y acompañar la puesta en marcha. Después, si quieren, se puede continuar con un plan mensual de evolución. No es obligatorio.',
      },
      {
        question: '¿Llegamos con el sitio al evento de noviembre?',
        answer:
          'Sí. Es la fecha que ordena la Fase 1 y el plazo que nos comprometemos a cumplir.',
      },
      {
        question: '¿El Diagnóstico UIRTUS también va a estar en la app?',
        answer:
          'Sí, está incluido en el MVP. La idea es que el diagnóstico sea entrada al ecosistema tanto desde el sitio como desde la app.',
      },
    ] satisfies FaqEntry[],
  },

  /**
   * El cierre: la página termina pidiendo una decisión concreta. Sin esto el
   * lector llega al final del FAQ y no sabe qué se espera de él.
   */
  handoff: {
    eyebrow: 'EL SIGUIENTE PASO',
    heading: 'Si esta es la dirección que quieren tomar, estamos listos para construirla con ustedes.',
    primaryCta: 'Avanzar con la propuesta',
    /**
     * WhatsApp en formato wa.me: sin `+`, espacios ni guiones, y con el mensaje
     * ya redactado para que no tengan que escribir el primero.
     */
    whatsappUrl:
      'https://wa.me/5492944688181?text=' +
      encodeURIComponent('Hola, vimos la propuesta y queremos avanzar.'),
  },

  closing: {
    copyright: '© 2026 Synous AI. Todos los derechos reservados.',
  },
}
