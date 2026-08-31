import { and, asc, eq } from 'drizzle-orm'
import { db, closeDb } from './index'
import { portal, hubUser, pipeline, pipelineStage, contact, deal, clientAccount, clientDealAccess, deliverable } from './schema'

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
    ;[p] = await db.insert(portal).values({ name: 'DevDúo' }).returning()
    console.log(`✓ portal creado (id ${p!.id})`)
  } else {
    console.log(`· portal ya existe (id ${p.id})`)
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
