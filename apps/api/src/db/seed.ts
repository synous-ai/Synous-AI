import { and, asc, eq, isNull } from 'drizzle-orm'
import { db, closeDb } from './index'
import { portal, hubUser, pipeline, pipelineStage, contact, deal, clientAccount, clientDealAccess, deliverable, processTemplate, processTask } from './schema'

/** Tareas de la plantilla "Web App", en orden. Cada una con su checklist inicial. */
const WEB_APP_PROCESS_TASKS: { title: string; notes: string; steps: string[] }[] = [
  {
    title: 'Kickoff & discovery',
    notes: 'Alinear con el cliente objetivos, alcance y accesos antes de escribir código.',
    steps: [
      'Reunión de kickoff con el cliente',
      'Definir objetivos de negocio y métricas de éxito',
      'Relevar stakeholders y canal de comunicación',
      'Pedir accesos (dominio, hosting, analytics, marca)',
      'Documentar el resumen del discovery',
    ],
  },
  {
    title: 'Requirements & scope',
    notes: 'Convertir el discovery en un alcance cerrado y estimable.',
    steps: [
      'Listar historias de usuario y criterios de aceptación',
      'Priorizar MVP vs. fases posteriores',
      'Definir integraciones y servicios de terceros',
      'Estimar esfuerzo y armar el cronograma',
      'Validar el alcance por escrito con el cliente',
    ],
  },
  {
    title: 'UX/UI design',
    notes: 'Diseño navegable aprobado por el cliente antes de desarrollar.',
    steps: [
      'Mapa del sitio y flujos de usuario',
      'Wireframes de las pantallas clave',
      'Diseño visual (sistema de componentes, tipografía, colores)',
      'Versión mobile / responsive',
      'Aprobación del diseño por el cliente',
    ],
  },
  {
    title: 'Architecture & setup (repo, CI, environments)',
    notes: 'Base técnica lista para que el equipo desarrolle sin fricción.',
    steps: [
      'Crear el repositorio y definir la estrategia de ramas',
      'Elegir stack y documentar decisiones de arquitectura',
      'Configurar CI (lint, typecheck, tests, build)',
      'Crear entornos de desarrollo, staging y producción',
      'Gestionar variables de entorno y secretos',
      'Modelar la base de datos y configurar migraciones',
    ],
  },
  {
    title: 'Development',
    notes: 'Implementación iterativa del alcance acordado.',
    steps: [
      'Implementar autenticación y autorización',
      'Construir las funcionalidades del MVP por módulo',
      'Integrar servicios de terceros',
      'Escribir tests de las reglas de negocio críticas',
      'Code review de cada pull request',
      'Demo intermedia al cliente',
    ],
  },
  {
    title: 'QA & testing',
    notes: 'Verificar que todo funciona antes de mostrarlo al cliente.',
    steps: [
      'Probar los flujos críticos de punta a punta',
      'Revisar en los navegadores y dispositivos objetivo',
      'Revisar performance y accesibilidad',
      'Revisión de seguridad básica (permisos, validación de inputs)',
      'Corregir los bugs encontrados',
    ],
  },
  {
    title: 'Client review',
    notes: 'El cliente prueba el staging y da feedback consolidado.',
    steps: [
      'Desplegar a staging y compartir el acceso',
      'Enviar guía de revisión con lo que hay que probar',
      'Recolectar feedback consolidado en un solo lugar',
      'Clasificar el feedback: bug, cambio dentro de alcance o change request',
    ],
  },
  {
    title: 'Changes',
    notes: 'Aplicar el feedback aprobado. Lo que excede el alcance va como change request.',
    steps: [
      'Implementar los cambios dentro del alcance',
      'Cotizar y aprobar los change requests fuera de alcance',
      'Re-testear lo modificado',
      'Obtener la aprobación final del cliente',
    ],
  },
  {
    title: 'Deploy to production',
    notes: 'Salida a producción con plan de vuelta atrás.',
    steps: [
      'Backup de datos y plan de rollback',
      'Configurar dominio, DNS y certificado SSL',
      'Cargar variables de entorno de producción',
      'Correr migraciones y desplegar',
      'Smoke test en producción',
      'Configurar monitoreo y alertas de errores',
    ],
  },
  {
    title: 'Handoff & documentation',
    notes: 'Cierre del proyecto y traspaso al cliente.',
    steps: [
      'Documentar arquitectura, setup y deploy en el repositorio',
      'Entregar accesos y credenciales de forma segura',
      'Capacitar al cliente en el uso del sistema',
      'Acordar soporte y mantenimiento posterior',
      'Reunión de cierre y marcar el proyecto como entregado',
    ],
  },
]


/**
 * Seed idempotente: portal + usuario owner + pipeline de Ventas con etapas +
 * pipeline de Producción (post-venta, onboarding v2) con sus 9 fases +
 * usuarios responsables de Producción (Lauri, Jeremías).
 * Correr con:  pnpm --filter api db:seed
 */
async function seed(): Promise<void> {
  // 1. Portal
  let [p] = await db.select().from(portal).limit(1)
  if (!p) {
    ;[p] = await db.insert(portal).values({ name: 'Synous AI', slug: 'synous' }).returning()
    console.log(`✓ portal creado (id ${p!.id})`)
  } else {
    // Backfill del slug para portales creados antes de que existiera la columna:
    // sin él, la URL pública de reservas sigue cayendo al cuid.
    if (!p.slug) {
      ;[p] = await db.update(portal).set({ slug: 'synous' }).where(eq(portal.id, p.id)).returning()
      console.log(`· portal ya existía — slug seteado a 'synous'`)
    } else {
      console.log(`· portal ya existe (id ${p.id}, slug ${p.slug})`)
    }
  }
  const portalId = p!.id

  // 2. Usuario owner
  const email = 'carlos@devduo.com'
  const [existingUser] = await db.select().from(hubUser).where(eq(hubUser.email, email)).limit(1)
  if (!existingUser) {
    const [u] = await db
      .insert(hubUser)
      .values({
        portalId,
        email,
        firstName: 'Carlos',
        role: 'owner',
        // Auth vía Clerk: el clerk_user_id se vincula al provisionar en Clerk.
        clerkUserId: 'clerk_seed_carlos',
      })
      .returning()
    console.log(`✓ hub_user creado: ${u!.email} (auth: Clerk)`)
  } else {
    console.log(`· hub_user ya existe: ${email}`)
  }

  // 3. Pipeline de Ventas + etapas
  // OJO: se busca por label (no "existe algún pipeline") para no romper la
  // idempotencia cuando se agregan más pipelines al portal (p.ej. Producción).
  const [existingSalesPipeline] = await db
    .select()
    .from(pipeline)
    .where(and(eq(pipeline.portalId, portalId), eq(pipeline.label, 'Ventas')))
    .limit(1)
  if (!existingSalesPipeline) {
    const [pl] = await db.insert(pipeline).values({ portalId, label: 'Ventas' }).returning()
    const stages = [
      { label: 'Nuevo Lead', probability: '0.1000' },
      { label: 'Cuestionario Enviado', probability: '0.2000' },
      { label: 'Llamada de Discovery', probability: '0.4000' },
      { label: 'Propuesta Enviada', probability: '0.6000' },
      { label: 'Contrato Firmado', probability: '1.0000', isClosed: true, isWon: true },
    ]
    await db.insert(pipelineStage).values(
      stages.map((s, i) => ({
        pipelineId: pl!.id,
        label: s.label,
        displayOrder: i,
        probability: s.probability,
        isClosed: s.isClosed ?? false,
        isWon: s.isWon ?? false,
      })),
    )
    console.log(`✓ pipeline "Ventas" creado con ${stages.length} etapas`)
  } else {
    console.log('· pipeline "Ventas" ya existe')
  }

  // 3b. Pipeline de Producción + 9 etapas (post-venta, onboarding v2)
  // Ninguna etapa es isWon=true a propósito: activateClientPortal ya se disparó
  // al ganar el deal en Ventas — no queremos volver a dispararlo acá.
  const [existingProductionPipeline] = await db
    .select()
    .from(pipeline)
    .where(and(eq(pipeline.portalId, portalId), eq(pipeline.label, 'Producción')))
    .limit(1)
  if (!existingProductionPipeline) {
    const [pl] = await db.insert(pipeline).values({ portalId, label: 'Producción' }).returning()
    const stages = [
      'Diagnóstico',
      'Blueprint',
      'Primera Versión (MVP)',
      'Ajustes',
      'Construcción',
      'Verificación',
      'Lanzamiento',
      'Estabilización',
      'Evolución',
    ]
    await db.insert(pipelineStage).values(
      stages.map((label, i) => ({
        pipelineId: pl!.id,
        label,
        displayOrder: i,
        probability: null,
        isClosed: false,
        isWon: false,
      })),
    )
    console.log(`✓ pipeline "Producción" creado con ${stages.length} etapas`)
  } else {
    console.log('· pipeline "Producción" ya existe')
  }

  // 3c. Usuarios responsables de las fases de Producción (idempotentes por email)
  const productionUsers = [
    { email: 'laureanosierra.dev@gmail.com', firstName: 'Lauri', role: 'member', clerkUserId: 'clerk_seed_lauri' },
    { email: 'jeremiasingla@gmail.com', firstName: 'Jeremías', role: 'owner', clerkUserId: 'clerk_seed_jeremias' },
  ] as const
  for (const u of productionUsers) {
    const [existing] = await db.select().from(hubUser).where(eq(hubUser.email, u.email)).limit(1)
    if (!existing) {
      await db.insert(hubUser).values({
        portalId,
        email: u.email,
        firstName: u.firstName,
        role: u.role,
        clerkUserId: u.clerkUserId,
      })
      console.log(`✓ hub_user creado: ${u.email} (auth: Clerk)`)
    } else {
      console.log(`· hub_user ya existe: ${u.email}`)
    }
  }

  // 3d. Descripciones cliente-facing de las 9 fases de Producción (idempotente
  // por label: solo pisa `description` si está NULL, para no sobreescribir
  // ediciones manuales hechas desde el admin).
  const [productionPipeline] = await db
    .select()
    .from(pipeline)
    .where(and(eq(pipeline.portalId, portalId), eq(pipeline.label, 'Producción')))
    .limit(1)
  if (productionPipeline) {
    const stageDescriptions: Record<string, string> = {
      'Diagnóstico':
        'Estamos estudiando a fondo tu negocio: tu brief, tus materiales y tu operación. De acá sale el mapa de lo que vamos a construir.',
      'Blueprint': 'Diseñamos la arquitectura de tu plataforma: pantallas, flujos y estructura. Es el plano antes de construir.',
      'Primera Versión (MVP)':
        'Estamos construyendo la primera versión navegable de tu plataforma. Pronto la vas a ver y tocar en una llamada en vivo.',
      'Ajustes': 'Estamos afinando la plataforma con tu feedback de la primera versión.',
      'Construcción': 'Construimos todo lo que va por detrás: funcionalidades completas, integraciones y contenido.',
      'Verificación': 'Estamos probando todo a fondo para que el lanzamiento salga sin sorpresas.',
      'Lanzamiento': 'Tu plataforma está saliendo en vivo. Lo mostramos juntos en una llamada.',
      'Estabilización': 'Tu plataforma ya está en vivo. Te acompañamos de cerca estas primeras semanas.',
      'Evolución': 'Seguimos mejorando tu plataforma con nuevas iteraciones.',
    }
    let updatedCount = 0
    for (const [label, description] of Object.entries(stageDescriptions)) {
      const result = await db
        .update(pipelineStage)
        .set({ description })
        .where(
          and(
            eq(pipelineStage.pipelineId, productionPipeline.id),
            eq(pipelineStage.label, label),
            isNull(pipelineStage.description),
          ),
        )
        .returning({ id: pipelineStage.id })
      updatedCount += result.length
    }
    if (updatedCount > 0) {
      console.log(`✓ description seteada en ${updatedCount} fase(s) de "Producción"`)
    } else {
      console.log('· descripciones de "Producción" ya estaban seteadas')
    }
  }

  // 4. Cliente demo (para probar el Client Portal): contacto + deal + cuenta + acceso + entregable
  const clientEmail = 'cliente@demo.com'
  const [existingClient] = await db.select().from(clientAccount).where(eq(clientAccount.email, clientEmail)).limit(1)
  if (!existingClient) {
    // Explícito por label 'Ventas' — con 2 pipelines seedeados (Ventas +
    // Producción) el filtro por portalId solo ya no es determinístico.
    const [pl] = await db
      .select()
      .from(pipeline)
      .where(and(eq(pipeline.portalId, portalId), eq(pipeline.label, 'Ventas')))
      .limit(1)
    const [firstStage] = await db
      .select()
      .from(pipelineStage)
      .where(eq(pipelineStage.pipelineId, pl!.id))
      .orderBy(asc(pipelineStage.displayOrder))
      .limit(1)

    const [c] = await db
      .insert(contact)
      .values({ portalId, firstName: 'Cliente', lastName: 'Demo', email: clientEmail, lifecycleStage: 'customer' })
      .returning()
    const [dl] = await db
      .insert(deal)
      .values({ portalId, name: 'Sitio Web Demo', amount: '8000.00', pipelineId: pl!.id, stageId: firstStage!.id, primaryContactId: c!.id })
      .returning()
    const [ca] = await db
      .insert(clientAccount)
      .values({ portalId, contactId: c!.id, email: clientEmail, inviteAccepted: true, clerkUserId: 'clerk_seed_cliente' })
      .returning()
    await db.insert(clientDealAccess).values({ clientId: ca!.id, dealId: dl!.id })
    await db
      .insert(deliverable)
      .values({ dealId: dl!.id, title: 'Home — diseño v1', type: 'design', url: 'https://figma.com/demo', status: 'pending_review' })
    console.log('✓ cliente demo creado: cliente@demo.com (auth: Clerk) con 1 deal + 1 entregable')
  } else {
    console.log('· cliente demo ya existe')
  }

  // 5. Proceso por defecto "Web App" (plantilla de tareas de un proyecto de software).
  // Idempotente: si el slug ya existe en el portal no se toca (el equipo puede haberlo editado).
  const [existingProcess] = await db
    .select({ id: processTemplate.id })
    .from(processTemplate)
    .where(and(eq(processTemplate.portalId, portalId), eq(processTemplate.slug, 'web-app')))
    .limit(1)
  if (!existingProcess) {
    await db.transaction(async (tx) => {
      const [proc] = await tx
        .insert(processTemplate)
        .values({
          portalId,
          slug: 'web-app',
          name: 'Web App',
          description: 'Proceso estándar para construir una aplicación web de punta a punta.',
        })
        .returning()
      await tx.insert(processTask).values(
        WEB_APP_PROCESS_TASKS.map((t, i) => ({
          processId: proc!.id,
          title: t.title,
          notes: t.notes,
          steps: t.steps.map((text) => ({ text, done: false })),
          position: i,
        })),
      )
    })
    console.log(`✓ proceso "Web App" creado con ${WEB_APP_PROCESS_TASKS.length} tareas`)
  } else {
    console.log('· proceso "Web App" ya existe')
  }

  console.log('Seed completo.')
}

seed()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('Seed falló:', err)
    await closeDb()
    process.exit(1)
  })
