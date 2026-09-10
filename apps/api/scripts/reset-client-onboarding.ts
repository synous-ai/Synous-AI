/**
 * reset-client-onboarding.ts — devuelve el onboarding de un cliente al paso 1
 * para poder recorrer el wizard de nuevo (QA / demo).
 *
 * Uso:
 *   pnpm --filter api exec tsx scripts/reset-client-onboarding.ts <email> [--keep-data] [--keep-stage]
 *
 *   <email>        email del client_account (el del login del portal).
 *   --keep-data    conserva firma, brief y materiales; solo reabre el wizard.
 *                  Por defecto los borra para probar el flujo desde cero.
 *   --keep-stage   NO devuelve el deal a su pipeline de ventas; lo deja donde
 *                  está. Por defecto lo saca de "Producción" y lo vuelve a la
 *                  etapa ganada del pipeline de ventas, que es el estado real
 *                  previo al onboarding.
 *
 * Por qué toca el deal y no solo la fila de onboarding: completar el paso 8
 * ejecuta moveDealToProduction (cambia pipeline + stage + owner). Si se
 * reabriera el wizard dejando el deal en Producción, al re-completarlo se
 * duplicarían entradas de record_history/audit_log y el deal quedaría con un
 * historial que no refleja lo que pasó.
 *
 * NO toca Clerk ni client_account: el login del cliente sigue funcionando igual.
 */
import 'dotenv/config'
import { and, desc, eq } from 'drizzle-orm'
import { db, closeDb } from '../src/db'
import {
  clientOnboarding,
  clientAccount,
  clientDealAccess,
  clientAsset,
  deal,
  pipeline,
  pipelineStage,
} from '../src/db/schema'

const email = process.argv[2]
const keepData = process.argv.includes('--keep-data')
const keepStage = process.argv.includes('--keep-stage')

async function run(): Promise<void> {
  if (!email || email.startsWith('--')) {
    console.error('Falta el email. Uso: tsx scripts/reset-client-onboarding.ts <email> [--keep-data] [--keep-stage]')
    process.exit(1)
  }

  const [account] = await db.select().from(clientAccount).where(eq(clientAccount.email, email)).limit(1)
  if (!account) {
    console.error(`No existe client_account con email ${email}`)
    process.exit(1)
  }

  // Mismo criterio que resolveActiveDeal del servicio: el deal accesible más
  // reciente no archivado.
  const [access] = await db
    .select({ dealId: clientDealAccess.dealId, createdAt: deal.createdAt })
    .from(clientDealAccess)
    .innerJoin(deal, eq(deal.id, clientDealAccess.dealId))
    .where(and(eq(clientDealAccess.clientId, account.id), eq(deal.archived, false)))
    .orderBy(desc(deal.createdAt))
    .limit(1)
  if (!access) {
    console.error(`El cliente ${email} no tiene deals accesibles`)
    process.exit(1)
  }

  const [row] = await db.select().from(clientOnboarding).where(eq(clientOnboarding.dealId, access.dealId)).limit(1)
  if (!row) {
    console.error(`El deal ${access.dealId} no tiene fila de client_onboarding`)
    process.exit(1)
  }

  await db.transaction(async (tx) => {
    await tx
      .update(clientOnboarding)
      .set({
        status: 'in_progress',
        currentStep: 1,
        stepsCompleted: {},
        completedAt: null,
        updatedAt: new Date(),
        ...(keepData
          ? {}
          : {
              signatureName: null,
              signatureAcceptedAt: null,
              signatureIp: null,
              briefAnswers: null,
              // `materials` es NOT NULL con default {} — se vacía, no se anula.
              materials: {},
            }),
      })
      .where(eq(clientOnboarding.id, row.id))

    // Los archivos subidos en el paso 7 viven en client_asset, no en la fila de
    // onboarding: sin esto reaparecerían ya cargados en un wizard "desde cero".
    if (!keepData) {
      await tx.delete(clientAsset).where(eq(clientAsset.dealId, access.dealId))
    }

    if (!keepStage) {
      // Volver el deal a la etapa ganada del pipeline de ventas (el estado en
      // que estaba justo antes de completar el onboarding).
      const [wonStage] = await tx
        .select({ stageId: pipelineStage.id, pipelineId: pipelineStage.pipelineId, label: pipelineStage.label })
        .from(pipelineStage)
        .innerJoin(pipeline, eq(pipeline.id, pipelineStage.pipelineId))
        .where(and(eq(pipeline.portalId, row.portalId), eq(pipelineStage.isWon, true)))
        .limit(1)

      if (wonStage) {
        await tx
          .update(deal)
          .set({ pipelineId: wonStage.pipelineId, stageId: wonStage.stageId, updatedAt: new Date() })
          .where(eq(deal.id, access.dealId))
        console.log(`   deal → pipeline de ventas, etapa "${wonStage.label}"`)
      } else {
        console.warn('   ⚠ no se encontró etapa is_won: el deal queda donde está')
      }
    }
  })

  console.log(`✅ Onboarding reabierto para ${email}`)
  console.log(`   deal: ${access.dealId} · datos: ${keepData ? 'conservados' : 'borrados'}`)
  console.log('   Entrá al portal y vas a ver el wizard desde el paso 1.')
}

run()
  .catch((e) => {
    console.error('💥', e instanceof Error ? e.message : e)
    process.exit(1)
  })
  .finally(() => void closeDb())
