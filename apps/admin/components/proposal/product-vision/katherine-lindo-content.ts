import type { ProductVisionContent } from './product-vision-types'

/**
 * Propuesta para Katherine Lindo: coach de ciclismo, entrenamiento, nutrición
 * y mentalidad. Se lee como el ROADMAP de su producto.
 *
 * Reglas que sostiene este copy (no aflojarlas al editar):
 * - Vocabulario único: "versión" (V1…V5) para el producto y "paso" para el
 *   proceso de construcción. Nunca "etapa" ni "fase".
 * - La V1 es una app real, publicada y en uso. No es la plataforma completa con
 *   descuento ni un prototipo.
 * - V2 a V5 no tienen precio: se cotizan por separado, cuando se decida cuál
 *   sumar con el uso real de la V1.
 * - La demo es un adelanto de cómo trabajamos, no el diseño final. Usa
 *   respuestas de ejemplo, marcadas como tales.
 * - Cada versión parte de lo conversado y queda abierta a ampliarse (`open`).
 * - Sin promesas de resultados de negocio, de salud ni de calorías. Sin
 *   urgencia artificial.
 * - Lo que falta validar va como `{ pending, draft }` y figura en
 *   `pendingChecklist`.
 */
export const katherineLindoProposal: ProductVisionContent = {
  envelope: {
    recipient: 'Katherine Lindo',
    dateLabel: 'NOVIEMBRE 2026',
    statement: 'El roadmap de tu plataforma.',
  },

  nav: [
    { label: 'La visión', href: '#vision' },
    { label: 'Roadmap', href: '#roadmap' },
    { label: 'Tu V1', href: '#v1' },
    { label: 'Cómo la construimos', href: '#pasos' },
    { label: 'Inversión', href: '#inversion' },
  ],

  rail: { label: 'Tu roadmap', cta: 'Empezamos por la V1' },

  hero: {
    eyebrow: 'ROADMAP · NOVIEMBRE 2026',
    forLine: 'Una propuesta para Katherine Lindo',
    headline: { lead: 'El roadmap de', accent: 'tu plataforma.' },
    lede: 'Así vamos a construir tu producto, versión por versión, empezando por una primera entrega lista para tus alumnos.',
    primaryCta: { label: 'Ver qué incluye tu V1', href: '#v1' },
  },

  vision: {
    label: 'La visión',
    headline: {
      lead: 'El ciclismo es el vehículo.',
      accent: 'La transformación es el propósito.',
    },
    paragraphs: [
      'Tu metodología integra entrenamiento, nutrición y mentalidad para construir hábitos que se sostengan en el tiempo. Y gran parte de ese proceso pasa entre una sesión y otra.',
      'Hacia ahí vamos: un espacio propio donde tus alumnos encuentren tu acompañamiento todos los días, con tu forma de trabajar.',
    ],
    pillars: [
      {
        title: 'Tu método, en un solo lugar',
        body: 'Entrenamiento, nutrición y mentalidad en la misma app, ordenados como vos trabajás.',
      },
      {
        title: 'Acompañamiento entre sesiones',
        body: 'Una guía a la que tus alumnos recurren cuando necesitan orientación.',
      },
      {
        title: 'Simple de usar',
        body: 'Entrar, encontrar lo que buscan y seguir con su día. Sin vueltas.',
      },
    ],
  },

  roadmap: {
    label: 'Roadmap',
    headline: 'Cinco versiones. Empezamos por la primera.',
    lede: 'Cada versión parte de lo que conversamos y queda abierta a sumar lo que vayamos definiendo juntos. No hace falta construir todo de una vez: la siguiente se decide con lo que aprendamos de la anterior.',
    versions: [
      {
        code: 'V1',
        name: 'Espacio de acompañamiento',
        summary:
          'Tu app publicada: acceso privado para tus alumnos, un inicio claro y una guía de IA configurada con tu metodología.',
        open: 'Es la base de lo que conversamos. Antes de arrancar podemos ajustarla y sumarle lo que veas necesario.',
        tag: 'Primera entrega',
        current: true,
      },
      {
        code: 'V2',
        name: 'Activación y hábitos',
        summary: 'Check-ins diarios, hábitos y rachas para darle estructura al día a día de tus alumnos.',
        open: 'Sobre esta base podemos sumar recordatorios, desafíos o lo que surja de cómo usan la V1.',
        tag: 'Se define con el uso real de la V1',
        current: false,
      },
      {
        code: 'V3',
        name: 'Nutrición',
        summary: 'Planes de nutrición dentro de la app, conectados con el proceso de cada alumno.',
        open: 'Podemos ampliarla con registros, seguimiento u otras herramientas, según cómo trabajes la alimentación.',
        tag: 'Se define con el uso real de la V1',
        current: false,
      },
      {
        code: 'V4',
        name: 'Entrenamiento y rendimiento',
        summary: 'Planes de entrenamiento y métricas para ver la evolución física en el mismo lugar.',
        open: 'Queda abierta a conectar otras plataformas o sumar métricas que hoy no estemos viendo.',
        tag: 'Se define con el uso real de la V1',
        current: false,
      },
      {
        code: 'V5',
        name: 'Comunidad y gestión',
        summary: 'Comunidad entre tus alumnos y herramientas avanzadas para gestionar tus programas.',
        open: 'La diseñamos con vos, según cómo crezcan tu comunidad y tus programas.',
        tag: 'Se define con el uso real de la V1',
        current: false,
      },
    ],
  },

  v1: {
    label: 'Tu V1',
    headline: { lead: 'Tu V1, en detalle.', accent: 'Una app real, publicada y funcionando.' },
    lede: 'No es un prototipo ni una maqueta: es la primera versión de tu producto, lista para que tus alumnos la usen desde el primer día.',
    what: {
      title: 'Qué es',
      body: 'Una aplicación web propia, con tu identidad visual, publicada en tu dominio y lista para que la usen tus alumnos.',
      traits: [
        'Con tu identidad visual',
        'Celular, tablet y computadora',
        'Se instala en la pantalla de inicio del celular',
        'Publicada en tu dominio',
      ],
    },
    demo: {
      title: 'Un adelanto de tu V1',
      body: 'Tocá la pantalla: podés recorrerla.',
      disclaimer:
        'Es una muestra de cómo trabajamos, no el diseño final. Cuando nos des el OK, trabajamos sobre la demo que nos pediste, con tu identidad y tus contenidos.',
      app: {
        appName: 'Katherine Lindo',
        studentName: 'Ana',
        home: {
          greeting: 'Buen día, Ana.',
          title: 'Tu transformación empieza con lo que hacés hoy.',
          body: 'Tu espacio para el entrenamiento, la alimentación y la mentalidad.',
          primaryAction: 'Hablar con mi guía',
          shortcuts: [
            { topic: 'training', label: 'Entrenamiento', conversationId: 'training' },
            { topic: 'nutrition', label: 'Nutrición', conversationId: 'nutrition' },
            { topic: 'mindset', label: 'Mentalidad', conversationId: 'mindset' },
          ],
          checkin: {
            question: '¿Cómo te sentís hoy?',
            options: [
              { label: 'Con energía', conversationId: 'checkin-energy' },
              { label: 'Necesito enfocarme', conversationId: 'checkin-focus' },
              { label: 'Me está costando', conversationId: 'checkin-hard' },
            ],
          },
        },
        guide: {
          title: 'Tu guía',
          opening: 'Hola, Ana. Estoy acá para acompañarte en tu proceso. ¿En qué te gustaría enfocarte hoy?',
          suggested: ['training', 'nutrition', 'mindset'],
          sampleNote: 'Respuesta de ejemplo. La guía real se configura con los materiales de Katherine.',
          conversations: [
            {
              id: 'training',
              label: 'Entrenamiento',
              question: 'Hoy tengo entrenamiento, pero me está costando arrancar.',
              answer: [
                'Pasa más seguido de lo que creés, y no significa que estés fallando.',
                'Probemos achicar el primer paso: preparate la ropa y empezá con unos minutos suaves. Muchas veces lo más pesado es arrancar.',
                'Si sentís dolor o un cansancio fuera de lo normal, frená y contáselo a Katherine. ¿Vemos cómo encarar la sesión de hoy?',
              ],
            },
            {
              id: 'nutrition',
              label: 'Nutrición',
              question: 'Quiero organizar mejor mi alimentación durante la semana.',
              answer: [
                'Buena decisión: ordenar la semana suele hacer más fácil todo lo demás.',
                'Empecemos simple: elegí dos o tres comidas que ya te funcionan y dejalas resueltas para los días con más trabajo.',
                'Las pautas concretas de tu plan las define Katherine. Yo te ayudo a llevarlas a tu rutina. ¿Qué días se te complican más?',
              ],
            },
            {
              id: 'mindset',
              label: 'Mentalidad',
              question: 'Me cuesta mantener la constancia cuando tengo mucho trabajo.',
              answer: [
                'Cuando el trabajo aprieta, la constancia no es hacer todo: es no soltar del todo.',
                'Definí tu mínimo para esta semana: lo más chico que podés sostener incluso en un día complicado.',
                'Un día difícil no borra tu proceso. Lo que construye es volver al día siguiente. ¿Cuál sería tu mínimo para hoy?',
              ],
            },
            {
              id: 'checkin-energy',
              label: 'Con energía',
              question: 'Hoy me siento con energía.',
              answer: [
                '¡Qué bueno arrancar así!',
                'Aprovechala en lo que ya tenés planificado, sin sumar de más: sostener el plan vale más que un día heroico.',
                '¿Qué tenés en agenda para hoy?',
              ],
            },
            {
              id: 'checkin-focus',
              label: 'Necesito enfocarme',
              question: 'Hoy necesito enfocarme.',
              answer: [
                'Vamos a ordenar el día.',
                'Elegí una sola cosa de tu proceso que, si la hacés hoy, te deja tranquila. Empecemos por ahí.',
              ],
            },
            {
              id: 'checkin-hard',
              label: 'Me está costando',
              question: 'Hoy me está costando.',
              answer: [
                'Gracias por decirlo. También es parte del proceso.',
                'No hace falta resolver todo hoy. ¿Qué te pesa más: el cuerpo, la cabeza o la agenda?',
              ],
            },
          ],
        },
        profile: {
          title: 'Mi perfil',
          goalLabel: 'Mi objetivo',
          goal: 'Completar mi primera salida de 80 km sintiéndome bien.',
          details: [
            { label: 'Nombre', value: 'Ana Ruiz' },
            { label: 'Email', value: 'ana@ejemplo.com' },
            { label: 'Programa', value: 'Transformación 12 semanas' },
          ],
          historyLabel: 'Mis conversaciones',
          history: [
            { title: 'Cómo arrancar cuando cuesta', when: 'Hoy' },
            { title: 'Organizar las comidas de la semana', when: 'Ayer' },
            { title: 'Mi mínimo para días con mucho trabajo', when: 'Lunes' },
          ],
        },
      },
    },
    screensTitle: 'Las pantallas de tu V1',
    screensLede: 'Cinco pantallas, cada una con una función clara.',
    screens: [
      {
        mockup: 'guide',
        title: 'Guía de IA',
        points: [
          'Chat configurado con tu metodología y tus materiales',
          'Conversaciones guiadas de entrenamiento, nutrición y mentalidad',
          'Historial de conversaciones de cada alumno',
        ],
      },
      {
        mockup: 'access',
        title: 'Acceso',
        points: [
          'Inicio de sesión con email y contraseña',
          'Solo entran los alumnos que habilitás',
          'Recuperación de contraseña',
        ],
      },
      {
        mockup: 'profile',
        title: 'Perfil del alumno',
        points: ['Datos básicos', 'Su objetivo, a la vista'],
      },
      {
        mockup: 'home',
        title: 'Inicio',
        points: [
          'Saludo personalizado y un punto de partida claro',
          'Check-in: "¿Cómo te sentís hoy?"',
          'Accesos rápidos a entrenamiento, nutrición y mentalidad',
        ],
      },
      {
        mockup: 'admin',
        title: 'Tu panel',
        points: [
          'Todos tus alumnos en un solo lugar, como un CRM',
          'Métricas de uso: quién entra y qué consulta',
          'Alta y baja de alumnos y gestión de accesos',
        ],
      },
    ],
    delivery: {
      title: 'Cómo la construimos y te la entregamos',
      items: [
        'Diseño con tu identidad',
        'Desarrollo de la app',
        'Configuración de la guía con tus materiales',
        'Infraestructura preparada para que la app pueda escalar',
        'Adaptación a celular, tablet y computadora',
        'Publicación en tu dominio, instalable como una app',
        'Nos encargamos de proveedores, dominio y servicios',
        'Una reunión para mostrarte cómo administrarla',
      ],
    },
    notYet: {
      title: 'Qué todavía no incluye',
      items: [
        { label: 'Hábitos y rachas', version: 'V2' },
        { label: 'Planes de nutrición', version: 'V3' },
        { label: 'Planes de entrenamiento y métricas de rendimiento', version: 'V4' },
        { label: 'Comunidad y gestión avanzada', version: 'V5' },
        { label: 'Publicación en App Store y Google Play', version: 'No incluido' },
      ],
    },
  },

  process: {
    label: 'Cómo la construimos',
    headline: 'Cinco pasos, de tu metodología a tu app publicada.',
    lede: 'Vas a saber en qué paso estamos en todo momento.',
    totalLabel: 'Tiempo total',
    total: '2 a 4 semanas desde que recibimos tus materiales',
    steps: [
      {
        title: 'Conocemos tu metodología',
        body: 'Recibimos tus materiales y entendemos cómo acompañás a tus alumnos.',
        time: 'Semana 1',
      },
      {
        title: 'Diseñamos la experiencia',
        body: 'Definimos cómo se ve y cómo se usa tu app, con tu identidad.',
        time: 'Semana 1',
      },
      {
        title: 'Construimos la app',
        body: 'Desarrollamos las pantallas y configuramos la guía con tus materiales.',
        time: 'Semanas 2 y 3',
      },
      {
        title: 'Probamos y validamos',
        body: 'La probamos en celular, tablet y computadora, y la revisás con nosotros.',
        time: 'Semanas 3 y 4',
      },
      {
        title: 'Publicamos y habilitamos a tus alumnos',
        body: 'La publicamos en tu dominio y te mostramos cómo dar de alta a tus alumnos.',
        time: 'Semana 4',
      },
    ],
  },

  investment: {
    label: 'Inversión',
    headline: 'La inversión de tu V1.',
    lede: 'Un precio cerrado por la primera versión de tu producto.',
    cardTitle: 'V1 · Espacio de acompañamiento',
    options: [
      { label: 'En un pago', amount: 'USD 1.500', detail: 'Pago único' },
      {
        label: 'En tres pagos',
        amount: 'USD 1.600',
        detail: { pending: 'Montos de las tres cuotas', draft: '3 × USD 533,33' },
      },
    ],
    includesLabel: 'Incluye',
    includes: [
      'App web propia, publicada en tu dominio',
      'Acceso, inicio, guía de IA, perfil y tu panel',
      'Guía configurada con tus materiales',
      'Proveedores, cuentas y dominio: nos encargamos nosotros',
      'Una reunión para mostrarte cómo administrarla',
    ],
    next: 'Las siguientes versiones se cotizan por separado, cuando decidamos juntos cuál sumar.',
  },

  after: {
    label: 'Después de la V1',
    headline: 'La V2 la decidimos juntos, con datos reales.',
    lede: 'Con tus alumnos usando la app, vamos a mirar tres cosas antes de elegir qué sumar.',
    signals: [
      { title: 'El uso real', body: 'Qué pantallas usan tus alumnos y cuándo entran.' },
      { title: 'Lo que le preguntan a la guía', body: 'Los temas que más consultan entre sesión y sesión.' },
      { title: 'Lo que te piden a vos', body: 'Lo que tus alumnos te reclaman y la app todavía no resuelve.' },
    ],
  },

  faq: {
    label: 'Preguntas frecuentes',
    headline: 'Lo que conviene saber antes de empezar.',
    entries: [
      {
        question: '¿La V1 es una app de verdad o un prototipo?',
        answer:
          'Es una app de verdad: publicada en tu dominio, con acceso para tus alumnos y lista para usar. La demo de esta página es solo un adelanto de cómo trabajamos.',
      },
      {
        question: '¿De dónde la descargan mis alumnos?',
        answer:
          'Desde cualquier navegador, como Google Chrome o Safari: entran a tu dominio y la instalan en la pantalla de inicio del celular, como cualquier app. No hace falta pasar por App Store ni Google Play.',
      },
      {
        question: '¿Qué necesitás de mí para empezar?',
        answer:
          'Tus materiales (los contenidos con los que trabajás entrenamiento, nutrición y mentalidad), tu identidad visual y un rato para contarnos cómo acompañás a tus alumnos. El tiempo de construcción corre desde que tenemos todo ese material.',
      },
      {
        question: '¿Hay costos mensuales aparte de la inversión?',
        answer:
          'Sí, pero al principio son bajos. Recomendamos pagar Vercel, el proveedor donde se aloja la app: USD 20 por mes. Los demás servicios que usa la app, como la base de datos y el inicio de sesión, arrancan en planes gratuitos y recién podrían pasar a ser pagos si la app crece. Lo que sí tiene un costo propio desde el inicio es el proveedor de IA de la guía, que depende de cuánto la usen tus alumnos.',
      },
      {
        question: '¿Puedo sumar funciones a la V1 sobre la marcha?',
        answer:
          'Las funciones de la V1 se definen antes de arrancar, así podemos entregarla en tiempo. Lo que surja en el camino lo anotamos y lo evaluamos para la próxima versión.',
      },
      {
        question: '¿Qué pasa cuando termina la V1?',
        answer:
          'Medimos cómo usan la app tus alumnos y, con esos datos, tomamos decisiones más estratégicas sobre qué sumar. La app sigue evolucionando hacia lo que vos querés: cada versión se define con vos y se cotiza por separado.',
      },
    ],
  },

  close: {
    headline: '¿Avanzamos con tu V1?',
    lede: 'Si te pareció interesante, coordinamos y te presentamos la demo navegable de tu app.',
    cta: 'Quiero avanzar con la V1',
    whatsappNumber: '5492221429754',
    whatsappMessage: 'Hola, soy Katherine. Vi la propuesta y quiero avanzar con la V1 de mi plataforma.',
  },

  footer: 'Synous · Software, sistemas e inteligencia artificial para negocios digitales.',

  pendingChecklist: [
    'Montos de las tres cuotas (borrador: 3 × USD 533,33 = USD 1.600)',
    'Costo estimado del proveedor de IA de la guía (el FAQ dice que depende del uso)',
    'Estado real del asistente de IA de Katherine (dijo que ya la estaban ayudando con el bot)',
    'Identidad visual y materiales del programa (la de la demo es provisional)',
  ],
}
