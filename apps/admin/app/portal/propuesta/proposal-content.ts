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
  /** Un párrafo por entrada. */
  body: string[]
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
    heading: 'UIRTUS creció. Es momento de que su ecosistema digital crezca con ella.',
    lede: 'En estos nueve años, UIRTUS amplió su alcance más allá de lo contable e impositivo, incorporando gestión, recursos humanos, legales, administración inmobiliaria y nuevas herramientas propias. Este crecimiento abre la oportunidad de construir un entorno digital que integre y acompañe esta nueva etapa.',
    blocks: [
      {
        icon: 'visibility',
        title: 'Una evolución que merece verse',
        body: 'UIRTUS hoy representa mucho más que sus servicios iniciales. La oportunidad está en trasladar esa evolución a una experiencia digital capaz de comunicar con claridad todo lo que la organización es y hace actualmente.',
      },
      {
        icon: 'scattered',
        title: 'Un ecosistema con mucho por conectar',
        body: 'El diagnóstico, el panel de clientes, la comunicación institucional y las futuras herramientas ya forman parte de una visión más amplia. El próximo paso es integrarlas bajo una experiencia coherente y conectada.',
      },
      {
        icon: 'system',
        title: 'Una base pensada para seguir creciendo',
        body: 'No se trata solo de una página, sino de ordenar todo bajo un mismo ecosistema, con una arquitectura que sostenga lo que viene después.',
      },
    ] satisfies OriginBlock[],
  },

  /** El evento del 9 de noviembre: la fecha que ordena las prioridades. */
  milestone: {
    eyebrow: 'EL PRIMER HITO',
    heading: 'Llegar al 9 de noviembre mostrando la nueva etapa de UIRTUS.',
    /** Un párrafo por entrada. */
    lede: [
      'Si avanzamos con ambos proyectos, el objetivo es llegar al evento con el ecosistema inicial en funcionamiento: la nueva presencia institucional, el Diagnóstico UIRTUS y la primera versión de la Plataforma UIRTUS.',
      'Con un plazo estimado de 45 días, proponemos trabajar con un cronograma coordinado, contemplando instancias de entrega, revisión y aprobación para avanzar juntos hacia esta fecha.',
    ],
  },




  method: {
    eyebrow: 'CÓMO TRABAJAMOS',
    heading: 'Desde el primer día, cada etapa tiene un propósito claro.',
    phases: [
      {
        label: '01',
        title: 'Contexto',
        description:
          'Entendemos el negocio, sus servicios, procesos y forma de trabajo. Esta etapa nos permite alinear necesidades, prioridades y objetivos antes de definir la solución.',
      },
      {
        label: '02',
        title: 'Arquitectura',
        description:
          'Definimos la estructura de la solución: usuarios, roles, permisos, módulos, datos e integraciones. El resultado es una base clara sobre qué vamos a construir, cómo se relacionan sus partes y en qué orden avanzaremos.',
      },
      {
        label: '03',
        title: 'Prototipo',
        description:
          'Diseñamos la experiencia y los principales recorridos antes de comenzar el desarrollo. UIRTUS podrá visualizar, revisar y validar cómo funcionará la solución antes de llevarla a producción.',
      },
      {
        label: '04',
        title: 'Desarrollo',
        description:
          'Convertimos lo validado en una solución funcional. Trabajamos por etapas, compartiendo avances periódicos para revisar el progreso y validar las decisiones clave durante el desarrollo.',
      },
      {
        label: '05',
        title: 'Lanzamiento',
        description:
          'Realizamos la revisión final, pruebas de calidad y configuración necesaria para la puesta en producción. La entrega incluye capacitación y documentación para que el equipo pueda comenzar a utilizar y administrar la solución.',
      },
      {
        label: '06',
        title: 'Acompañamiento',
        description:
          'Durante los 15 días posteriores al lanzamiento acompañamos la puesta en marcha, resolvemos ajustes vinculados al desarrollo y verificamos que la implementación funcione según lo definido.',
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
        kind: 'Sistema operativo digital',
        description:
          'Convertimos la operación de un programa de transformación en un sistema digital propio. Centraliza la experiencia del alumno, gestión interna, onboarding, contenido, seguimiento, calendario, reportes e IA contextual.',
        proves: 'Convertimos una metodología en un sistema.',
      },
      {
        name: 'CASC',
        kind: 'Web + plataforma',
        description:
          'Rediseño del sitio institucional y construcción de una plataforma interna para centralizar información, documentación, usuarios y operación de la Cámara Argentina de Shopping Centers.',
        proves: 'Trabajamos con instituciones y estructuras de múltiples áreas.',
      },
      {
        name: 'Aura Studio',
        kind: 'Producto con IA',
        description:
          'Producto de IA para automatizar la creación de anuncios a partir de la identidad de cada marca. Genera ángulos de venta y creativos listos para usar, con perfiles de marca, biblioteca de referencias, variaciones y edición.',
        proves: 'Construimos productos con IA aplicada a un proceso real.',
      },
    ] satisfies CaseStudy[],
  },

  scope: {
    eyebrow: 'LA ESTRATEGIA',
    heading: 'Dos proyectos. Un mismo ecosistema.',
    lede: 'Cada proyecto responde a un objetivo diferente y puede desarrollarse de manera independiente. El primero fortalece la presencia institucional de UIRTUS; el segundo lleva su metodología y la experiencia de sus clientes a un entorno digital propio. Juntos, forman parte de una misma visión y se construyen sobre una base preparada para evolucionar.',
    phases: [
      {
        label: 'PROYECTO 01 — PRESENCIA',
        title: 'Sitio institucional + CMS',
        body: [
          'Una nueva presencia digital para comunicar con claridad quién es UIRTUS hoy: sus áreas, servicios, metodología, contenidos y casos, junto con los principales puntos de contacto y acceso a su ecosistema.',
          'El CMS permitirá al equipo gestionar y actualizar contenidos institucionales de forma autónoma, manteniendo el sitio vigente a medida que UIRTUS evoluciona.',
        ],
        note: 'Si se contrata solo, el sitio se conecta con el Diagnóstico y el panel de clientes actuales.',
      },
      {
        label: 'PROYECTO 02 — PLATAFORMA',
        title: 'MVP de la Plataforma UIRTUS',
        body: [
          'Una plataforma web responsive que lleva procesos clave de UIRTUS a una experiencia digital centralizada, accesible desde computadora, tablet o celular.',
          'Esta primera versión integra el Diagnóstico UIRTUS, el portal privado de clientes y las herramientas de gestión necesarias para que el equipo pueda acompañar cada proceso desde un mismo entorno.',
        ],
        note: 'El punto de partida incluye: la migración de la información necesaria para comenzar a operar sobre una base organizada desde el primer día.',
      },
    ] satisfies ScopePhase[],
    pathsHeading: 'El MVP es el punto de partida, no el límite.',
    pathsLede: 'Una primera versión enfocada en las necesidades prioritarias de hoy, construida sobre una arquitectura preparada para incorporar nuevas funcionalidades y acompañar la evolución de UIRTUS.',
    /** Hacia dónde puede crecer el producto después del MVP. */
    future: {
      eyebrow: 'VISIÓN A FUTURO',
      title: 'Pensando en lo que viene',
      body: 'Durante nuestras conversaciones surgieron posibles evoluciones como ingresos y gastos, vencimientos, obligaciones, herramientas financieras, medios de pago, el Consultor UIRTUS con IA e integraciones. Estas funcionalidades podrán evaluarse y priorizarse en futuras etapas, sobre la misma base tecnológica construida para el MVP.',
    },
    paths: [
      {
        icon: 'modules',
        title: 'Crecimiento por módulos',
        body: 'Nuevas funcionalidades pueden incorporarse de manera independiente, priorizando aquellas que generen mayor valor en cada etapa.',
      },
      {
        icon: 'versions',
        title: 'Evolución por versiones',
        body: 'Cuando el alcance lo requiera, distintas mejoras pueden agruparse en nuevas versiones de la plataforma, manteniendo una evolución ordenada y coherente.',
      },
    ] satisfies ScopePath[],
  },

  /**
   * Cómo se conecta todo: la arquitectura conceptual. Responde a la
   * preocupación de avanzar por partes sin rehacer lo ya construido.
   */
  architecture: {
    eyebrow: 'CÓMO SE CONECTA TODO',
    heading: 'Un ecosistema pensado para funcionar conectado.',
    lede: 'El sitio institucional funciona como la puerta de entrada al universo UIRTUS, mientras que la plataforma reúne el Diagnóstico, la experiencia de los clientes y la gestión interna. Ambos proyectos comparten una misma visión y están preparados para integrarse desde el inicio y evolucionar sobre una base común.',
    layers: [
      { label: 'PROYECTO 01', title: 'Sitio UIRTUS', body: 'Presencia institucional\u00a0· Servicios\u00a0· Contenidos\u00a0· Acceso al ecosistema' },
      // El Diagnóstico es parte de la experiencia que une los dos proyectos, no un tercero.
      { label: 'EXPERIENCIA UIRTUS', title: 'Diagnóstico UIRTUS', body: 'Diagnóstico\u00a0· Resultados\u00a0· Prioridades\u00a0· Plan de acción' },
      { label: 'PROYECTO 02', title: 'Plataforma UIRTUS', body: 'Portal de clientes\u00a0· Gestión interna\u00a0· Seguimiento\u00a0· Operación' },
      { label: 'EVOLUCIÓN', title: 'Evolución del ecosistema', body: 'Nuevos módulos\u00a0· Automatizaciones\u00a0· IA\u00a0· Integraciones' },
    ] satisfies ArchitectureLayer[],
  },

  guarantees: {
    eyebrow: 'NUESTRO COMPROMISO',
    heading: 'Lo que UIRTUS puede esperar durante todo el proyecto.',
    blocks: [
      {
        icon: 'progress',
        title: 'Avances visibles desde el inicio',
        body: 'Trabajamos por etapas, con hitos y demos que permiten acompañar el avance, validar decisiones y tener claridad sobre el estado del proyecto en todo momento.',
      },
      {
        icon: 'blueprint',
        title: 'Claridad antes de desarrollar',
        body: 'Antes de avanzar con el desarrollo, definimos junto al equipo de UIRTUS la arquitectura, las prioridades y el funcionamiento de cada solución. La idea es comenzar a construir con una dirección clara y compartida.',
      },
      {
        icon: 'ownership',
        title: 'Todo queda en manos de UIRTUS',
        body: 'El código, la base de datos, los repositorios y las cuentas asociadas al proyecto quedan bajo propiedad y control de UIRTUS. Construimos una solución propia, sin generar dependencias innecesarias.',
      },
      {
        icon: 'support',
        title: '15 días de acompañamiento',
        body: 'Después de la entrega, continuamos acompañando al equipo durante 15 días para facilitar la puesta en marcha, resolver ajustes de estabilización y asegurar una transición ordenada.',
      },
    ] satisfies GuaranteeBlock[],
  },

  investment: {
    eyebrow: 'INVERSIÓN',
    heading: 'Dos proyectos. Una inversión pensada para cada escenario.',
    lede: 'Cada proyecto puede desarrollarse de manera independiente. Al avanzar con ambos en paralelo, compartimos arquitectura, diseño y procesos de trabajo, optimizando recursos y consolidando todo el ecosistema desde el inicio.',
    phases: [
      {
        name: 'Proyecto 01 · Sitio institucional + CMS',
        price: 'USD 2.350',
        includes: [
          'Diseño y desarrollo del sitio institucional',
          'Áreas, servicios, metodología, casos, contenidos y contacto',
          'CMS para gestionar el contenido institucional',
          'Integración con el Diagnóstico UIRTUS',
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
          'Acceso centralizado para clientes, equipo y administración',
          'Diagnóstico UIRTUS integrado, con resultados, informe e historial',
          'Portal privado del cliente',
          'Gestión interna de reuniones, tareas, indicadores y documentos',
          'Administración de usuarios, perfiles y configuración',
          'Migración de la información necesaria',
          'Integración con el sitio institucional',
          'Experiencia responsive y arquitectura preparada para crecer',
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
      // Lo que se ve con la card cerrada.
      summary: "45\u00a0días estimados · 2\u00a0instancias de revisión · Pagos en\u00a0USD/ARS",
      openLabel: "Ver condiciones",
      closeLabel: "Ocultar condiciones",
      bodyLabel: "Plazos.",
      // Lo único de esta tarjeta que pisa la base (`termsNote`).
      body: "El plazo estimado es de aproximadamente 45 días desde el inicio efectivo del proyecto, con el objetivo de alcanzar el hito del 9 de noviembre de 2026. Para sostener este cronograma, materiales, contenidos, accesos, devoluciones y aprobaciones deberán estar disponibles en los tiempos acordados durante el kickoff.",
      // Revisiones y cobro son la forma de trabajar de Synous, igual en toda
      // propuesta: no vienen de la base.
      notes: [
        {
          label: "Revisiones.",
          text: "El proceso contempla dos instancias formales de revisión: una sobre el avance funcional y otra previa a la entrega. Los ajustes comprendidos dentro del alcance acordado se trabajan durante estas instancias. Nuevos requerimientos o cambios de alcance se evaluarán y cotizarán por separado.",
        },
        {
          label: "Moneda y pagos.",
          text: "Los valores están expresados en dólares estadounidenses (USD). Los pagos podrán realizarse en USD o en su equivalente en pesos argentinos, tomando como referencia el dólar blue correspondiente al día efectivo del pago.",
        },
      ] satisfies LabeledNote[],
    },
    exclusionsTitle: "Fuera del alcance de esta etapa",
    exclusionsSummary: "Alcances adicionales y funcionalidades previstas para futuras etapas",
    exclusionsOpenLabel: "Ver detalle",
    exclusionsCloseLabel: "Ocultar detalle",
    exclusions: [
      "Desarrollo integral de identidad visual de marca (logo, manual de marca y redes sociales).",
      "Aplicación móvil nativa para App Store o Google Play.",
      "Soporte directo a los usuarios finales de UIRTUS.",
      "Nuevas funcionalidades que excedan el alcance definido para el MVP.",
      "Revisiones o modificaciones adicionales fuera de las instancias acordadas.",
      "Roles, permisos o experiencias específicas por perfil que no formen parte del alcance definido para el MVP.",
      "Integración de medios de pago y suscripciones.",
      "Módulos financieros adicionales: ingresos, gastos, vencimientos y facturación.",
      "Consultor UIRTUS con IA.",
      "Integraciones bancarias, fiscales o con servicios de terceros no contempladas expresamente en el alcance.",
    ],
    exclusionsNote: "Esta primera versión contempla los perfiles, permisos y funcionalidades necesarios para operar el MVP definido en esta propuesta. La arquitectura quedará preparada para acompañar futuras evoluciones, que podrán evaluarse e incorporarse en nuevas etapas según las necesidades de UIRTUS.",
  },

  faq: {
    eyebrow: 'PREGUNTAS FRECUENTES',
    heading: 'Lo que suelen preguntarnos.',
    entries: [
      {
        question: '¿Cuánto tarda?',
        answer:
          'El plazo estimado es de aproximadamente 45 días desde el inicio efectivo. El cronograma se define durante el kickoff y se coordina en función de las entregas, revisiones y aprobaciones previstas para cada etapa.',
      },
      {
        question: '¿Qué pasa si aparece una nueva necesidad durante el proyecto?',
        answer:
          'La evaluamos en conjunto para entender su impacto en alcance, tiempos y presupuesto. Si tiene sentido incorporarla, definimos cómo integrarla al proyecto o la contemplamos para una siguiente etapa.',
      },
      {
        question: '¿Quién mantiene la propiedad y el control de la solución?',
        answer:
          'UIRTUS. El código, la base de datos, los repositorios, las cuentas y la infraestructura asociada al proyecto quedan bajo su propiedad y control. Nuestro equipo trabaja mediante los accesos y permisos necesarios durante el desarrollo.',
      },
      {
        question: '¿Qué pasa después del lanzamiento?',
        answer:
          'La propuesta incluye 15 días de acompañamiento y estabilización técnica posteriores a la entrega. Durante ese período acompañamos la puesta en marcha y resolvemos ajustes vinculados al desarrollo realizado. Luego, si UIRTUS lo desea, podemos continuar trabajando en nuevas etapas de evolución.',
      },
      {
        question: '¿El objetivo es llegar al evento del 9 de noviembre?',
        answer:
          'Sí. El proyecto se planifica tomando el 9 de noviembre como primer hito, con el objetivo de llegar al evento con la etapa contratada en funcionamiento. El cronograma se coordinará entre ambos equipos para sostener los tiempos necesarios.',
      },
      {
        question: '¿Cómo se integra el Diagnóstico UIRTUS con la plataforma?',
        answer:
          'El Diagnóstico forma parte del ecosistema digital: el sitio funciona como punto de entrada, mientras que la Plataforma UIRTUS concentra la lógica necesaria para realizarlo, procesar sus resultados, consultar el historial y utilizar esa información dentro de la experiencia del cliente.',
      },
      {
        question: '¿Qué pasa con el Diagnóstico y el panel de clientes que UIRTUS ya tiene?',
        answer:
          'Partimos del trabajo y el conocimiento que UIRTUS ya construyó. Se preserva la lógica validada, se migra la información necesaria y se lleva esa experiencia a una nueva infraestructura preparada para acompañar su evolución.',
      },
      {
        question: '¿Qué pasa si contratamos solamente el sitio?',
        answer:
          'El sitio puede desarrollarse y publicarse como un proyecto independiente, integrándose con las herramientas actuales de UIRTUS. Además, quedará preparado para conectarse con la nueva Plataforma UIRTUS si deciden avanzar con ella en una etapa posterior.',
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
