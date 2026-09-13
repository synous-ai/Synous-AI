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

export type ScopePath = { icon: 'modules' | 'versions'; title: string; body: string }

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
  { id: 'alcance', label: 'Alcance' },
  { id: 'inversion', label: 'Inversión' },
  { id: 'como-trabajamos', label: 'Cómo trabajamos' },
  { id: 'proyectos', label: 'Proyectos' },
]

export const proposal = {
  meta: {
    client: 'UIRTUS Consultoría Evolutiva',
    date: 'Septiembre 2026',
    validity: '30 días',
  },

  hero: {
    eyebrow: 'PROPUESTA · SEPTIEMBRE 2026',
    headline: 'Propuesta para',
    headlineHighlight: 'UIRTUS Consultoría Evolutiva',
    lede: 'El sitio institucional consolida la presencia pública y la gestión de contenidos de UIRTUS; la aplicación transforma sus procesos y herramientas en un producto digital propio.',
    primaryCta: 'Ver la propuesta',
  },

  startingPoint: {
    eyebrow: 'PUNTO DE PARTIDA',
    heading: 'UIRTUS ya construyó más de lo que muestra.',
    lede: 'Nueve años, cinco áreas de trabajo y un método propio documentado. Lo que falta no es contenido: es el lugar donde todo eso viva junto.',
    blocks: [
      {
        title: 'El Diagnóstico UIRTUS es un producto, no un formulario',
        body: '45 preguntas repartidas en cinco áreas, con un modelo de puntuación propio que ustedes documentaron: cuánto vale cada respuesta, qué prioridades devuelve, qué herramienta recomendar según el resultado.\n\nEso es una metodología de evaluación empresarial convertida en herramienta. Hoy vive en un link que no se puede mostrar en un evento.',
      },
      {
        title: 'El ecosistema existe, pero no tiene casa',
        body: 'Plantillas financieras, un podcast, un libro por publicar, el panel de clientes con reuniones, objetivos, documentos y tareas, la calculadora de punto de equilibrio. Cada pieza funciona. Ninguna tiene un lugar oficial donde vivir junta.',
      },
      {
        title: 'Lo que falta no es criterio, es la capa técnica',
        body: 'UIRTUS tiene contadores, administradores, abogados. No tiene área de IT. Por eso el diagnóstico está publicado a fuerza de tutoriales — y por eso también salió bien: el criterio del negocio estaba claro, faltaban las herramientas para bajarlo.',
      },
    ] satisfies TitledBlock[],
    closing:
      'En noviembre UIRTUS cumple nueve años y presenta su Diagnóstico por primera vez, frente a los corporativos de La Pampa. Esa fecha es la que ordena toda esta propuesta.',
  },

  gap: {
    eyebrow: 'LA BRECHA',
    heading: 'Tener las piezas no es tener un sistema.',
    lede: 'Nos comentaron que en esencia el trabajo era pasar a una página lo que ya está armado. Visto desde afuera tiene toda la lógica. Pero entre lo que existe hoy y el embudo que ustedes diseñaron hay tres cosas que todavía no están.',
    blocks: [
      {
        title: 'No hay puerta de entrada',
        body: 'Alguien que llega a UIRTUS por el evento, por Instagram o por recomendación tiene que caer en un lugar que represente nueve años de consultoría. Hoy los busca y no encuentra nada.',
      },
      {
        title: 'El diagnóstico no tiene dónde apoyarse',
        body: 'Un link suelto a un formulario no sostiene una herramienta que van a presentar en un hotel frente a empresas. El mismo diagnóstico, dentro de un sitio oficial, cambia de categoría.',
      },
      {
        title: 'Cada cambio depende de alguien técnico',
        body: 'La calculadora de punto de equilibrio se actualiza todo el tiempo. Los objetivos de cada reunión cambian. Si para eso hay que tocar código, el sistema se rompe solo.',
      },
    ] satisfies TitledBlock[],
    closing:
      'Por eso esta propuesta empieza por el sitio y no por la app. No porque la app importe menos, sino porque es el orden que hace que la app tenga sentido cuando llegue.',
  },

  destination: {
    eyebrow: 'PUNTO DE LLEGADA',
    heading: 'Cómo queda funcionando.',
    blocks: [
      {
        title: 'Una sola puerta',
        body: 'El sitio es la entrada oficial. Desde ahí se llega al Diagnóstico y al panel de clientes, sin links sueltos ni dominios prestados.',
      },
      {
        title: 'El diagnóstico como captación real',
        body: 'Deja de ser una herramienta interna y pasa a ser el primer paso de una conversación de consultoría.',
      },
      {
        title: 'El equipo edita sin pedir permiso',
        body: 'Textos, fotos, entradas, objetivos de reunión. Todo administrable desde un panel propio.',
      },
    ] satisfies TitledBlock[],
    closing:
      'Y una arquitectura pensada para que la app y los módulos que vengan después se apoyen en esto, en lugar de empezar de nuevo.',
  },

  method: {
    eyebrow: 'CÓMO TRABAJAMOS',
    heading: 'Conocé nuestras etapas en el proyecto.',
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
    eyebrow: 'ALCANCE SOLICITADO',
    heading: 'Dos proyectos.',
    lede: 'El sitio institucional consolida la presencia pública y la gestión de contenidos de UIRTUS; la aplicación transforma sus procesos y herramientas en un producto digital propio.',
    phases: [
      {
        label: 'FASE 01',
        title: 'Sitio institucional + CMS',
        body: 'Presencia oficial, áreas y servicios, entrada al Diagnóstico UIRTUS, acceso al panel de clientes, y una administración de contenido para que el equipo cambie textos, fotos y entradas sin depender de nadie.',
      },
      {
        label: 'FASE 02',
        title: 'MVP de la aplicación',
        body: 'Portal institucional dentro de la app, Diagnóstico UIRTUS integrado, panel de clientes conectado, panel de administración, e integración del sitio con ese panel.',
      },
    ] satisfies ScopePhase[],
    pathsHeading: 'Después del MVP hay dos caminos',
    paths: [
      {
        icon: 'modules',
        title: 'Por módulos',
        body: 'Se cotiza de a uno, cuando lo quieran encarar. Sirve si van a paso tranquilo o si todavía no está claro qué sigue.',
      },
      {
        icon: 'versions',
        title: 'Por versiones',
        body: 'Una V2 que agrupa un conjunto de funcionalidades nuevas y se trabaja como un proyecto con su propio alcance y plazo. Sirve si quieren avanzar más rápido, y suele rendir mejor por lo que cuesta.',
      },
    ] satisfies ScopePath[],
  },

  guarantees: {
    eyebrow: 'NUESTRO COMPROMISO',
    heading: 'Garantías de proceso',
    blocks: [
      {
        title: 'Arquitectura antes de código',
        body: 'Si después de la fase de arquitectura no queda claro qué construir, qué priorizar y cómo debería funcionar, hacemos una sesión adicional sin costo hasta que quede definido.',
      },
      {
        title: 'Avance visible',
        body: 'El proyecto se desarrolla por hitos y demos. Van a ver la plataforma tomar forma. Nunca pasan semanas sin saber en qué estamos.',
      },
      {
        title: 'No desaparecemos después de publicar',
        body: 'Capacitación, documentación y 15 días de estabilización técnica incluidos.',
      },
      {
        title: 'Activos a nombre de UIRTUS',
        body: 'Construimos activos suyos, no dependencias nuestras. El código, la base de datos, los repositorios y las cuentas quedan a nombre de UIRTUS.',
      },
    ] satisfies TitledBlock[],
  },

  investment: {
    eyebrow: 'INVERSIÓN',
    heading: 'Una inversión para cada proyecto.',
    phases: [
      {
        name: 'Sitio institucional + CMS',
        price: 'USD 2.000',
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
        name: 'MVP de la aplicación',
        includes: [
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
            price: 'USD 6.000',
            terms: '50% al inicio · 50% en la entrega',
          },
          {
            label: 'En tres pagos',
            price: 'USD 7.000',
            terms: '40% al inicio · 30% en hito intermedio · 30% en la entrega',
          },
        ],
      },
    ] satisfies InvestmentPhase[],
    note: 'Las dos fases se pueden encarar juntas o una después de la otra. Si van por la Fase 1 primero, la arquitectura queda pensada para que la app se apoye en lo ya construido y no haya trabajo duplicado.',
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

  closing: {
    copyright: '© 2026 Synous AI. Todos los derechos reservados.',
  },
}
