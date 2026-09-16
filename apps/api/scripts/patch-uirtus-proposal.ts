/**
 * patch-uirtus-proposal.ts — alinea el `content` de la propuesta de UIRTUS con
 * la decisión de alcance: la Fase 2 es una aplicación WEB responsive (mobile
 * first) y el desarrollo nativo pasa a ser una Fase 3 nombrada, sin precio.
 *
 * Por qué un script y no un UPDATE a mano: `PATCH /proposals/:id` reemplaza el
 * objeto `content` entero, no hace merge. Leer-modificar-escribir es la única
 * forma de no perder el resto de los campos.
 *
 * Es idempotente: si el cambio ya está aplicado, no escribe.
 *
 * Uso (desde apps/api):
 *   pnpm exec tsx scripts/patch-uirtus-proposal.ts --dry
 *   pnpm exec tsx scripts/patch-uirtus-proposal.ts
 */
import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db, closeDb } from '../src/db'
import { proposal } from '../src/db/schema'
import type { ProposalContent } from '../src/modules/proposals/proposals.types'

const TOKEN = 'hthygvinjumkk9uiy5fzt3xh'
const DRY = process.argv.includes('--dry')

const FASE2_TITLE = 'MVP de la aplicación web UIRTUS'
const FASE2_BODY =
  'Una aplicación web responsive, diseñada mobile first: se usa desde el navegador ' +
  'del celular, sin instalación ni tiendas. Es el primer paso para transformar ' +
  'herramientas y procesos que hoy existen por separado en una experiencia digital ' +
  'propia para los clientes de UIRTUS, sobre una base preparada para crecer ' +
  '—incluida una futura versión nativa— a medida que el producto demuestre qué necesita.'

const MOBILE_PATH = {
  icon: 'mobile' as const,
  title: 'Fase 3 — Aplicación móvil nativa',
  body:
    'Publicación en App Store y Google Play sobre la misma arquitectura, sin rehacer ' +
    'lo construido. Se cotiza una vez validado el MVP.',
}

const EXCLUSION =
  'Desarrollo móvil nativo y publicación en App Store / Google Play: corresponde a la ' +
  'Fase 3 y se cotiza por separado'

const FAQ = {
  question: '¿La aplicación se va a poder descargar de App Store o Google Play?',
  answer:
    'El MVP es una aplicación web responsive: se entra desde el navegador del celular, ' +
    'sin instalación ni tiendas, y se ve y se usa como una app. La versión nativa ' +
    'publicada en las tiendas es la Fase 3: se construye sobre la misma arquitectura y ' +
    'se cotiza por separado, una vez que el MVP esté validado.',
}

function patchContent(c: ProposalContent): { next: ProposalContent; changes: string[] } {
  const changes: string[] = []
  const next: ProposalContent = structuredClone(c)

  // 1. Fase 02 del alcance: decir "web responsive", no "la aplicación" a secas.
  const f2 = next.scopePhases?.find((p) => /FASE\s*0?2/i.test(p.label))
  if (f2 && (f2.title !== FASE2_TITLE || f2.body !== FASE2_BODY)) {
    f2.title = FASE2_TITLE
    f2.body = FASE2_BODY
    changes.push('scopePhases[FASE 02]: título + body')
  }

  // 2. Tercer camino post-MVP: la app nativa, nombrada como Fase 3 y sin precio.
  next.scopePaths ??= []
  if (!next.scopePaths.some((p) => p.icon === 'mobile')) {
    next.scopePaths.push(MOBILE_PATH)
    changes.push('scopePaths: + Fase 3 móvil nativa')
  }

  // 3. Card de inversión: el nombre y el primer bullet son lo que se skimea.
  const inv = next.investmentPhases?.find((p) => /aplicaci[oó]n/i.test(p.name))
  if (inv) {
    if (!/web/i.test(inv.name)) {
      inv.name = 'MVP de la aplicación web'
      changes.push('investmentPhases: nombre → "MVP de la aplicación web"')
    }
    if (!inv.includes.some((i) => /responsive/i.test(i))) {
      inv.includes.unshift('Aplicación web responsive, diseñada mobile first')
      changes.push('investmentPhases: + bullet "web responsive, mobile first"')
    }
  }

  // 4. La exclusión va primera: es la brecha de expectativa más cara.
  next.exclusions ??= []
  if (!next.exclusions.some((e) => /App Store/i.test(e))) {
    next.exclusions.unshift(EXCLUSION)
    changes.push('exclusions: + nativo/tiendas (primera)')
  }

  // 5. El FAQ va acá y no en la plantilla: es propio de ESTE proyecto.
  next.extraFaq ??= []
  if (!next.extraFaq.some((f) => /App Store/i.test(f.question))) {
    next.extraFaq.push(FAQ)
    changes.push('extraFaq: + "¿se descarga de las tiendas?"')
  }

  return { next, changes }
}

async function run(): Promise<void> {
  const [row] = await db
    .select({ id: proposal.id, title: proposal.title, status: proposal.status, content: proposal.content })
    .from(proposal)
    .where(eq(proposal.token, TOKEN))
    .limit(1)

  if (!row) throw new Error(`No hay propuesta con token ${TOKEN}`)

  console.log(`Propuesta: ${row.title} (${row.id}) · estado: ${row.status}`)

  const { next, changes } = patchContent(row.content)

  if (changes.length === 0) {
    console.log('Sin cambios: el contenido ya está alineado.')
    return
  }

  console.log('\nCambios a aplicar:')
  for (const c of changes) console.log(`  · ${c}`)

  if (DRY) {
    console.log('\n--dry: no se escribió nada.')
    console.log(JSON.stringify(next, null, 2))
    return
  }

  await db.update(proposal).set({ content: next }).where(eq(proposal.id, row.id))
  console.log('\nAplicado.')
}

run()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(closeDb)
