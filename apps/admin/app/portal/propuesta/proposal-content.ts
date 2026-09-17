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

export type ScopePhase = {
  label: string
  title: string
  body: string
  /** Aclaración corta al pie de la tarjeta: qué cambia según lo que se contrate. */
  note?: string
}

export type ScopePath = { icon: 'modules' | 'versions'; title: string; body: string }

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

/**
 * Una forma de pago del combo, con su propia comparación: el precio por
 * separado cambia según cómo se pague, así que el ahorro también.
 *
 * Los montos van como números y ni el total por separado ni el ahorro se
 * escriben: se calculan al renderizar (`sitePrice + platformPrice - price`). Tipearlo a mano fue lo que dejó un
 * "Ahorro USD 850" sobre una opción que ahorraba 550.
 */
export type ComboOption = {
  label: string
  /** Precio del combo con esta forma de pago, en USD. */
  price: number
  /** Precio del sitio contratado solo, en USD. */
  sitePrice: number
  /** Precio de la plataforma contratada sola con esta misma forma de pago, en USD. */
  platformPrice: number
  terms: string
}

export type InvestmentPhase = {
  name: string
  price?: string
  includes: string[]
  /** Aclaración corta bajo los incluidos: qué cambia según lo que se contrate. */
  note?: string
  payment?: string
  options?: PricingOption[]
}

/** Un bloque rotulado de la letra chica: "Revisiones.", "Moneda y pagos.". */
export type LabeledNote = { label: string; text: string }

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

  /** El sobre (`/p/<token>`): la primera pantalla del link, antes de la propuesta. */
  envelope: {
    recipient: 'UIRTUS',
    dateLabel: 'SEPTIEMBRE 2026',
    statement: 'Proyecto a medida para UIRTUS.',
  },

  hero: {
    eyebrow: 'PROPUESTA · SEPTIEMBRE 2026',
    headline: 'Una infraestructura digital a la altura de la consultora',
    headlineHighlight: 'UIRTUS',
    lede: 'UIRTUS ya no es solamente un estudio contable. Hoy conviven distintas áreas, herramientas propias, un diagnóstico, contenidos y una visión clara de construir un ecosistema digital propio. Esta propuesta contempla dos proyectos que forman parte de ese mismo ecosistema: su nueva presencia institucional y la nueva Plataforma UIRTUS.',
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
    lede: 'Si avanzan con los dos proyectos, el objetivo es llegar al evento con el ecosistema inicial funcionando: la nueva presencia oficial, el Diagnóstico UIRTUS y la primera versión de la Plataforma UIRTUS. Con un plazo estimado de 45 días, la fecha es alcanzable siempre que materiales, accesos, devoluciones y aprobaciones lleguen en los tiempos acordados.',
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
          'Convertimos el prototipo aprobado en un producto funcional y mostramos avances periódicos. A mitad de camino hacemos la primera revisión formal del avance; si trabajamos los dos proyectos, los revisamos juntos para decidir de forma coordinada.',
      },
      {
        label: '05',
        title: 'Lanzamiento',
        description:
          'Antes de entregar hacemos la segunda revisión formal. Después vienen QA, configuración, capacitación, documentación y salida a producción: entregamos el sistema y también cómo usarlo.',
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
    heading: 'Dos proyectos. Un mismo ecosistema.',
    lede: 'Cada proyecto resuelve algo distinto y se puede contratar por separado. El primero construye la nueva presencia de UIRTUS; el segundo reconstruye su producto y la experiencia privada de sus clientes. Juntos, se desarrollan en paralelo sobre una misma base.',
    phases: [
      {
        label: 'PROYECTO 01 — PRESENCIA',
        title: 'Sitio institucional + CMS',
        body: 'La nueva presencia oficial de UIRTUS: quiénes son, sus áreas, servicios y metodología, contenidos y casos, contacto, la entrada al Diagnóstico UIRTUS y el acceso de clientes. Incluye un CMS para que el equipo actualice el contenido institucional sin depender de terceros.',
        note: 'Si se contrata solo, el sitio se conecta con el Diagnóstico y el panel de clientes actuales. Si se contratan los dos proyectos, se conecta directamente con los nuevos.',
      },
      {
        label: 'PROYECTO 02 — PLATAFORMA',
        title: 'MVP de la Plataforma UIRTUS',
        body: 'Una plataforma web responsive que se usa desde la computadora, la tablet o el celular, sin instalar nada. Lleva a una base sólida y unificada lo que hoy UIRTUS ya resuelve con herramientas separadas: el Diagnóstico, el portal privado de clientes y el backoffice con el que el equipo sigue cada proceso.',
        note: 'Incluye la migración de la información existente necesaria para operar: no se parte de cero.',
      },
    ] satisfies ScopePhase[],
    pathsHeading: 'El MVP no define el techo de la plataforma. Define la base.',
    pathsLede: 'Una vez validada la primera versión, UIRTUS puede seguir evolucionando según lo que tenga mayor impacto en ese momento.',
    pathsNote: 'Ejemplos que surgieron en la conversación: ingresos y gastos, vencimientos, obligaciones, herramientas financieras, medios de pago, el Consultor UIRTUS con IA, integraciones y, si más adelante aparece una necesidad real, una app móvil nativa. La arquitectura los tiene en cuenta, pero ninguno está incluido en esta propuesta.',
    paths: [
      {
        icon: 'modules',
        title: 'Por módulos',
        body: 'Para incorporar funcionalidades puntuales, a medida que se vuelven necesarias.',
      },
      {
        icon: 'versions',
        title: 'Por versiones',
        body: 'Para agrupar varias mejoras en una nueva evolución del producto.',
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
    lede: 'El sitio es la puerta de entrada pública; la plataforma concentra el producto y la operación privada. Si se contratan los dos proyectos, todo se desarrolla conectado desde el inicio, y cada evolución posterior aprovecha lo construido en lugar de empezar de cero.',
    layers: [
      { label: 'PROYECTO 01', title: 'Sitio UIRTUS', body: 'Presencia institucional\u00a0· Áreas\u00a0· Servicios\u00a0· Contenido' },
      { label: 'PROYECTO 02', title: 'Diagnóstico UIRTUS', body: 'Cuestionario\u00a0· Resultados\u00a0· Prioridades\u00a0· Informe' },
      { label: 'PROYECTO 02', title: 'Plataforma UIRTUS', body: 'Portal de clientes\u00a0· Backoffice\u00a0· Seguimiento\u00a0· Gestión' },
      { label: 'EVOLUCIÓN', title: 'Nuevos módulos', body: 'Finanzas\u00a0· Automatizaciones\u00a0· IA\u00a0· Integraciones' },
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
    heading: 'Cada proyecto por separado, o los dos juntos.',
    lede: 'Cada proyecto tiene su precio, y tomarlos juntos tiene el suyo. Trabajarlos en paralelo comparte arquitectura, decisiones y horas de equipo — y ese ahorro vuelve al presupuesto.',
    phases: [
      {
        name: 'Proyecto 01 · Sitio institucional + CMS',
        price: 'USD 2.350',
        includes: [
          'Diseño y desarrollo del sitio institucional',
          'Áreas, servicios, metodología, casos, contenidos y contacto',
          'CMS para gestionar el contenido institucional',
          'Entrada e integración del Diagnóstico UIRTUS',
          'Acceso de clientes',
          'Diseño responsive',
          'Deploy y configuración',
          'Capacitación para administrar el sitio',
          '15 días de estabilización técnica',
        ],
        note: 'Si se contrata solo, el sitio se integra con las herramientas actuales de UIRTUS como solución transitoria. Si se contratan los dos proyectos, se conecta directamente con el nuevo Diagnóstico y la nueva Plataforma UIRTUS.',
        payment: '50% al inicio · 50% en la entrega',
      },
      {
        name: 'Proyecto 02 · MVP de la Plataforma UIRTUS',
        includes: [
          'Acceso único para clientes, equipo y administración',
          'Diagnóstico UIRTUS reconstruido, con informe e historial',
          'Portal privado del cliente',
          'Backoffice: reuniones, tareas, indicadores y documentos',
          'Administración de usuarios, perfiles y configuración',
          'Migración de la información necesaria',
          'Integración con el sitio institucional',
          'Responsive y preparada para crecer',
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
            price: 'USD 6.900',
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
      body: 'Es la forma en que recomendamos encararlo. Trabajar los dos proyectos al mismo tiempo permite:',
      benefits: [
        'Definir la arquitectura una sola vez',
        'Diseñar una experiencia unificada',
        'Conectar sitio, Diagnóstico y plataforma desde el comienzo',
        'Avanzar en los dos frentes en paralelo',
        'Llegar al 09/11 con el ecosistema inicial funcionando',
      ],
      separateLabel: 'Por separado',
      savingLabel: 'Ahorro',
      siteLabel: 'Sitio',
      platformLabel: 'Plataforma',
      // Los precios individuales repiten los de las tarjetas de arriba: si
      // cambian allá, cambian acá. El total y el ahorro se calculan solos.
      options: [
        {
          label: 'En dos pagos',
          price: 7800,
          sitePrice: 2350,
          platformPrice: 6300,
          terms: '50% al inicio · 50% en la entrega',
        },
        {
          label: 'En tres pagos',
          price: 8400,
          sitePrice: 2350,
          platformPrice: 6900,
          terms: '40% al inicio · 30% en hito intermedio · 30% en la entrega',
        },
      ] satisfies ComboOption[],
    },

    note: 'Cada proyecto se puede contratar por separado. Juntos comparten arquitectura, diseño y equipo: por eso el presupuesto rinde más y el ecosistema llega completo al 9 de noviembre.',
  },

  /**
   * Everything the client should read before signing, gathered after pricing:
   * the terms that govern the dates, and what the quote does not cover.
   */
  important: {
    eyebrow: "INFORMACIÓN IMPORTANTE",
    heading: "Lo esencial antes de comenzar.",
    terms: {
      title: "Plazos, revisiones y pagos",
      bodyLabel: "Plazos.",
      // Lo único de esta tarjeta que pisa la base (`termsNote`).
      body: "El plazo estimado es de alrededor de 45 días desde el inicio efectivo, con el objetivo de tener los proyectos acordados listos para el 9 de noviembre de 2026. Para cumplirlo, UIRTUS entrega materiales, contenidos, accesos, información, devoluciones y aprobaciones en los tiempos que definimos en el kickoff. Si alguna de esas entregas se demora, el cronograma se corre en la misma medida.",
      // Revisiones y cobro son la forma de trabajar de Synous, igual en toda
      // propuesta: no vienen de la base.
      notes: [
        {
          label: "Revisiones.",
          text: "Hay dos instancias formales: la revisión del avance funcional y la revisión previa a la entrega. No hay cambios ilimitados: lo que se pida después de una aprobación, o lo que modifique el alcance, se evalúa aparte.",
        },
        {
          label: "Moneda y pagos.",
          text: "Los precios están expresados en dólares estadounidenses. Los pagos se pueden hacer en USD o en su equivalente en pesos, tomando como referencia el dólar blue del día efectivo del pago.",
        },
      ] satisfies LabeledNote[],
    },
    exclusionsTitle: "Lo que no entra en esta cotización",
    exclusions: [
      "Identidad visual completa de marca (logo, manual, redes sociales)",
      "Aplicación móvil nativa para App Store o Google Play",
      "Soporte directo a usuarios finales (los clientes de UIRTUS)",
      "Funcionalidades nuevas fuera del alcance acordado",
      "Cambios ilimitados",
      "Roles y permisos avanzados no definidos para el MVP",
      "Medios de pago y suscripciones",
      "Módulos financieros: gastos, ingresos, vencimientos, facturación",
      "Consultor UIRTUS con IA",
      "Integraciones bancarias o fiscales (ARCA, bancos, tarjetas) no contempladas",
    ],
    exclusionsNote: "El MVP contempla los perfiles necesarios para operar esta primera versión. Roles adicionales, permisos granulares o experiencias específicas por perfil quedan para futuras evoluciones, salvo que se acuerden expresamente. Lo que viene después puede estar previsto en la arquitectura, pero no se desarrolla dentro de este alcance.",
  },

  faq: {
    eyebrow: 'PREGUNTAS FRECUENTES',
    heading: 'Lo que suelen preguntarnos.',
    entries: [
      {
        question: '¿Cuánto tarda?',
        answer:
          'El plazo estimado de desarrollo es de alrededor de 45 días desde el inicio efectivo. El cronograma se confirma en el kickoff y depende de que los materiales, accesos, devoluciones y aprobaciones de UIRTUS lleguen en los tiempos acordados.',
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
        question: '¿Llegamos al evento del 9 de noviembre?',
        answer:
          'Sí. El objetivo es llegar a esa fecha con los proyectos contratados funcionando, siempre que materiales, accesos, devoluciones y aprobaciones lleguen en los tiempos acordados.',
      },
      {
        question: '¿El Diagnóstico UIRTUS también está en la plataforma?',
        answer:
          'Sí. El Diagnóstico forma parte del nuevo ecosistema: desde el sitio funciona como puerta de entrada pública, y dentro de la Plataforma UIRTUS vive la lógica que permite realizarlo, procesarlo, consultar sus resultados y usar esa información en la experiencia del cliente.',
      },
      {
        question: '¿Qué pasa con el Diagnóstico y el panel de clientes que UIRTUS ya tiene?',
        answer:
          'No se parte de cero en conocimiento ni en información. Se preserva la lógica validada, se migra la información necesaria y se reconstruyen los dos sobre una infraestructura pensada para sostener la evolución de UIRTUS.',
      },
      {
        question: '¿Qué pasa si contratamos solamente el sitio?',
        answer:
          'El sitio se publica igual y se integra con el Diagnóstico y el panel de clientes actuales como solución transitoria. Si más adelante suman la Plataforma UIRTUS, el sitio ya queda preparado para conectarse con ella.',
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
