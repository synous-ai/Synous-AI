/**
 * seed-tenant-company.ts — arma un tenant white-label REAL en la base local.
 *
 * Para qué: el subdominio (`uirtus.localhost:3000`) dispara el rewrite del
 * middleware y setea la cookie `dd_tenant`, pero el branding sale de buscar
 * `company.slug = <subdominio>`. Sin una empresa con ese slug el fetch a
 * `/api/public/branding/:slug` no devuelve nada y el portal cae al verde
 * genérico de Synous — EN SILENCIO, que es lo que lo vuelve confuso.
 *
 * Qué hace: crea (o actualiza) la empresa con ese slug dentro del portal del
 * deal, y le cuelga el deal del cliente indicado. Idempotente: correrlo dos
 * veces no duplica nada.
 *
 * Uso:
 *   tsx scripts/seed-tenant-company.ts <email> <slug> [nombre] \
 *       [--primary=#0f2d1f] [--secondary=#9ae66e] [--deal-name="Plataforma X"]
 *
 * SOLO para entornos de desarrollo: escribe directo sin pasar por los services,
 * así que no registra `record_history` ni `audit_log`.
 */
import 'dotenv/config'
import { and, eq } from 'drizzle-orm'
import { db, closeDb } from '../src/db'
import { clientAccount, clientDealAccess, company, deal } from '../src/db/schema'

function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit?.slice(name.length + 3)
}

async function run(): Promise<void> {
  const [email, slug, nameArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  if (!email || !slug) {
    console.error('Uso: tsx scripts/seed-tenant-company.ts <email> <slug> [nombre]')
    process.exit(1)
  }
  const companyName = nameArg ?? slug.charAt(0).toUpperCase() + slug.slice(1)

  const [account] = await db
    .select({ id: clientAccount.id, email: clientAccount.email })
    .from(clientAccount)
    .where(eq(clientAccount.email, email))
    .limit(1)
  if (!account) throw new Error(`No existe client_account para ${email} en esta base.`)

  const rows = await db
    .select({ dealId: deal.id, dealName: deal.name, portalId: deal.portalId })
    .from(clientDealAccess)
    .innerJoin(deal, eq(deal.id, clientDealAccess.dealId))
    .where(eq(clientDealAccess.clientId, account.id))
  if (rows.length === 0) throw new Error(`${email} no tiene ningún deal asociado.`)

  const target = rows[0]!
  console.log(`Cliente : ${account.email}`)
  console.log(`Deal    : "${target.dealName}" (${target.dealId})`)
  console.log(`Portal  : ${target.portalId}\n`)

  await db.transaction(async (tx) => {
    // El slug es único GLOBAL (migración 0035), así que se busca sin filtrar
    // por portal: si ya existe, se actualiza en vez de chocar contra el unique.
    const [existing] = await tx
      .select({ id: company.id })
      .from(company)
      .where(eq(company.slug, slug))
      .limit(1)

    const brand = {
      name: companyName,
      slug,
      brandName: flag('brand-name') ?? companyName,
      brandPrimary: flag('primary') ?? null,
      brandSecondary: flag('secondary') ?? null,
      archived: false,
      updatedAt: new Date(),
    }

    let companyId: string
    if (existing) {
      await tx.update(company).set(brand).where(eq(company.id, existing.id))
      companyId = existing.id
      console.log(`Empresa actualizada: ${companyName} (slug "${slug}") → ${companyId}`)
    } else {
      const [created] = await tx
        .insert(company)
        .values({ portalId: target.portalId, ...brand })
        .returning({ id: company.id })
      companyId = created!.id
      console.log(`Empresa creada: ${companyName} (slug "${slug}") → ${companyId}`)
    }

    const dealName = flag('deal-name')
    await tx
      .update(deal)
      .set({ companyId, ...(dealName ? { name: dealName } : {}), updatedAt: new Date() })
      .where(and(eq(deal.id, target.dealId), eq(deal.archived, false)))

    console.log(`Deal vinculado a la empresa${dealName ? ` y renombrado a "${dealName}"` : ''}.`)
  })

  console.log(`\nListo. El portal de este cliente ya resuelve en ${slug}.<host>`)
}

run()
  .catch((e) => {
    console.error('💥', e instanceof Error ? e.message : e)
    process.exit(1)
  })
  .finally(() => void closeDb())
