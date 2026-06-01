import { asc, eq } from 'drizzle-orm'
import { db, closeDb } from './index'
import { portal, hubUser, pipeline, pipelineStage, contact, deal, clientAccount, clientDealAccess, deliverable } from './schema'
import { hashPassword } from '../lib/password'

/**
 * Seed idempotente: portal + usuario owner + pipeline de Ventas con etapas.
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
        passwordHash: await hashPassword('changeme123'),
        role: 'owner',
      })
      .returning()
    console.log(`✓ hub_user creado: ${u!.email} (password: changeme123)`)
  } else {
    console.log(`· hub_user ya existe: ${email}`)
  }

  // 3. Pipeline de Ventas + etapas
  const [existingPipeline] = await db.select().from(pipeline).where(eq(pipeline.portalId, portalId)).limit(1)
  if (!existingPipeline) {
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
    console.log('· pipeline ya existe')
  }

  // 4. Cliente demo (para probar el Client Portal): contacto + deal + cuenta + acceso + entregable
  const clientEmail = 'cliente@demo.com'
  const [existingClient] = await db.select().from(clientAccount).where(eq(clientAccount.email, clientEmail)).limit(1)
  if (!existingClient) {
    const [pl] = await db.select().from(pipeline).where(eq(pipeline.portalId, portalId)).limit(1)
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
      .values({ portalId, contactId: c!.id, email: clientEmail, passwordHash: await hashPassword('cliente123'), inviteAccepted: true })
      .returning()
    await db.insert(clientDealAccess).values({ clientId: ca!.id, dealId: dl!.id })
    await db
      .insert(deliverable)
      .values({ dealId: dl!.id, title: 'Home — diseño v1', type: 'design', url: 'https://figma.com/demo', status: 'pending_review' })
    console.log('✓ cliente demo creado: cliente@demo.com (password: cliente123) con 1 deal + 1 entregable')
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
