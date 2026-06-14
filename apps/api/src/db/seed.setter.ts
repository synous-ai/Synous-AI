import { eq } from 'drizzle-orm'
import { db, closeDb } from './index'
import { setterTenant, portal } from './schema'

/**
 * Seed del SETTER (separado del seed del CRM para mantenerlo aislado).
 * Crea el único `setter_tenant` de Sprint 0 con el businessBrief REAL
 * (Founder SaaS OS — ver setter/Oferta en resumen.md, sección 27).
 *
 * Correr con:  pnpm --filter api db:seed:setter
 *
 * NOTA: `agentName` y `ownerName` son defaults editables — ajustalos a los
 * nombres reales con los que querés que se presente el agente y a quién deriva
 * la call.
 */

const TENANT_NAME = 'Founder SaaS OS'

/**
 * Prospección LOCAL (Google Places = negocios con local físico).
 * NOTA: distinto de la oferta Founder SaaS OS (creadores online, que entra por
 * el setter inbound). Para prospectar locales, el "qué ofrecemos" y los nichos
 * son de la oferta de agencia para negocios locales. Editable.
 */
const PROSPECTING_SERVICES =
  'Desarrollamos sitios web a medida y automatizaciones para negocios (turnos y reservas online, facturación, recordatorios y atención por WhatsApp, reportes). Les sacamos el laburo manual de encima y profesionalizan su presencia online.'

/** Nichos LOCALES sugeridos para buscar leads en Google Places. */
const PROSPECTING_NICHES = [
  'gimnasios',
  'consultorios médicos',
  'estudios contables',
  'inmobiliarias',
  'estudios jurídicos',
  'centros de estética',
  'clínicas odontológicas',
  'restaurantes',
]

/** Ciudades del autopilot (Places busca "nicho + ciudad"). */
const PROSPECTING_CITIES = [
  'Buenos Aires',
  'Córdoba',
  'Rosario',
  'Mendoza',
  'La Plata',
  'Mar del Plata',
]

/** businessBrief real, listo para el system prompt (Oferta en resumen.md §27 + FAQs §21). */
const BUSINESS_BRIEF = `NEGOCIO: Founder SaaS OS Program / Sistema Operativo Digital.

QUÉ VENDÉS: Ayudamos a emprendedores digitales, infoproductores, mentores, growth operators y comunidades premium a convertir su operación desordenada en un Sistema Operativo Digital propio: una plataforma SaaS que centraliza alumnos/clientes, contenido, pagos, reportes, comunidad, automatizaciones e inteligencia artificial, sin depender de WhatsApp, Notion, Drive, planillas ni herramientas desconectadas. No vendemos "desarrollo de software" como commodity; vendemos infraestructura digital para escalar negocios digitales premium. Principio central: arquitectura antes de código.

A QUIÉN: Negocios digitales validados en LATAM/español que ya tienen clientes, alumnos o comunidad activa, venden programas, mentorías, membresías o servicios premium, y sienten que su operación actual quedó chica para escalar.

EVENTO GATILLO: Están por lanzar una nueva cohorte, escalar su comunidad, sumar más clientes, profesionalizar su experiencia, dejar herramientas genéricas o construir una plataforma propia porque la operación actual ya se siente manual, dispersa o poco escalable. Gatillo emocional: "Estoy vendiendo algo premium, pero mi operación todavía se sostiene con parches."

NO ES PARA: Personas sin negocio validado, sin clientes, sin presupuesto, que buscan una app barata, que quieren saltar directo al desarrollo sin Blueprint, que comparan solo por precio o creen que el software va a salvar una oferta que todavía no vende.

CÓMO SÉ QUE CALIFICA: Tiene negocio digital activo, alumnos/clientes/comunidad, dolor operativo real, herramientas desconectadas, intención de resolver en 30/60/90 días, capacidad de inversión, autoridad de decisión y apertura a empezar por diagnóstico/Blueprint. Mapeo: dolor (operación manual/dispersa), fit (negocio validado con movimiento real), autoridad (decide o trae al decisor), timing (lanzamiento/cohorte cerca).

FORMATO DE TRABAJO (niveles): 1) SaaS Readiness Check (filtro inicial), 2) SaaS Strategy Intensive (sesión paga), 3) SaaS OS Blueprint (diagnóstico + arquitectura + roadmap MVP, USD 1.500–3.000+), 4) Founder SaaS OS Program / Build (USD 10.000–30.000+ según alcance), 5) SaaS Growth Partner (USD 1.000–5.000+/mes). El setter NO vende el Build directo: detecta fit/dolor/autoridad/timing y lleva a una call de diagnóstico.

PRUEBA: Experiencia construyendo Consciencia MCE como ecosistema digital con panel de usuario, panel admin, onboarding, contenido, comunidad, IA, reportes, calendario, seguimiento, productividad, salud, finanzas, archivos e inteligencia operativa.

PRECIO: El setter NO cotiza. Deriva el precio a la llamada. Puede decir que no somos low-cost ni una fábrica de apps; trabajamos por fases y normalmente se empieza por diagnóstico/Blueprint. El precio depende del alcance, módulos, integraciones, IA y acompañamiento. Nunca decir un número fijo ni "eso lo hacemos todo".

FAQs:
- ¿Hacen apps a medida? Sí, pero no somos una fábrica de apps: construimos Sistemas Operativos Digitales; antes de desarrollar hacemos una etapa de arquitectura.
- ¿Como Skool/Kajabi/Hotmart/Circle pero propio? Podemos, pero el foco no es copiar herramientas sino diseñar un sistema alrededor de tu metodología y operación.
- ¿Cuánto cuesta? Depende del alcance; normalmente se empieza por un Blueprint para definir qué construir y con qué inversión.
- ¿Cuánto tarda? Depende del alcance; el Blueprint es corto, la implementación va por fases priorizando un MVP funcional.
- ¿Necesito tenerlo todo claro? No, parte del valor es ayudarte a ordenar la idea; sí necesitás negocio validado, clientes activos y dolor operativo real.
- ¿Trabajan con quien recién empieza? No es el foco: esta oferta es para negocios con movimiento real.
- ¿La IA está incluida? Depende del proyecto; no usamos IA por moda, primero detectamos dónde aporta valor real.
- ¿Y después del lanzamiento? Modelo SaaS Growth Partner para soporte, mejoras y evolución.

TONO: Rioplatense, profesional-cercano, consultivo, estratégico, humano, directo y sin presión agresiva. Filtrador y orientado a diagnóstico. Frase guía: "No todos los negocios necesitan un Sistema Operativo Digital. Primero evaluamos si tu etapa, operación y objetivos justifican construir infraestructura propia."`

async function seedSetter(): Promise<void> {
  // El setter cuelga del portal del CRM (org admin). Requiere que el portal exista.
  const [p] = await db.select().from(portal).limit(1)
  if (!p) {
    throw new Error('No hay portal en la DB. Corré primero el seed del CRM: pnpm --filter api db:seed')
  }
  const portalId = p.id

  const [existing] = await db
    .select()
    .from(setterTenant)
    .where(eq(setterTenant.name, TENANT_NAME))
    .limit(1)

  if (existing) {
    await db
      .update(setterTenant)
      .set({
        businessBrief: BUSINESS_BRIEF,
        prospectingServices: PROSPECTING_SERVICES,
        prospectingNiches: PROSPECTING_NICHES,
        prospectingCities: PROSPECTING_CITIES,
      })
      .where(eq(setterTenant.id, existing.id))
    console.log(`· setter_tenant ya existe (id ${existing.id}) — oferta actualizada`)
    return
  }

  const [tenant] = await db
    .insert(setterTenant)
    .values({
      portalId,
      name: TENANT_NAME,
      businessBrief: BUSINESS_BRIEF,
      prospectingServices: PROSPECTING_SERVICES,
      prospectingNiches: PROSPECTING_NICHES,
      prospectingCities: PROSPECTING_CITIES,
      agentName: 'Tom', // default editable
      ownerName: 'Jeremías', // default editable
      timezone: 'America/Argentina/Buenos_Aires',
      operationMode: 'shadow',
    })
    .returning()

  console.log(`✓ setter_tenant creado: ${tenant!.name} (id ${tenant!.id})`)
}

seedSetter()
  .then(() => console.log('✓ seed del setter completo'))
  .catch((err) => {
    console.error('✗ seed del setter falló:', err)
    process.exitCode = 1
  })
  .finally(closeDb)
