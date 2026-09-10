/**
 * import-team-sops.ts
 *
 * Importa los SOPs del equipo (carpeta EQUIPO_CORREGIDO, un .md por etapa) a la
 * Biblioteca del CRM como `library_item` con type='sop' y kind='procedure'.
 * Quedan visibles en Admin → Biblioteca → Procesos y checklists.
 *
 * Cada encabezado `## Sección` del markdown se convierte en un paso
 * ({ title, body }), preservando el contenido tal cual está escrito.
 *
 * IDEMPOTENTE: hace match por `name`. Si el SOP ya existe lo ACTUALIZA
 * (reemplaza steps/description/owner); si no, lo crea. Se puede correr cada vez
 * que se editen los markdown para re-sincronizar.
 *
 * Uso:
 *   pnpm --filter api tsx scripts/import-team-sops.ts [ruta-a-la-carpeta]
 *
 * Sin argumento usa la ruta por defecto de abajo.
 */

import 'dotenv/config'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { db, closeDb } from '../src/db'
import { libraryItem, hubUser, portal } from '../src/db/schema'

const DEFAULT_DIR =
  '/Users/jeremiasingla/Downloads/ENTREGA DE SERVICIO/EQUIPO_CORREGIDO'

/**
 * Responsable de cada SOP → email del hub_user, según la sección "Responsable"
 * de cada documento. Si el email no existe como hub_user, el ítem queda sin owner.
 */
const OWNER_BY_STAGE: Record<string, string> = {
  '01': 'laureanosierra.dev@gmail.com', // Onboarding — automatizado, contenido de Lauri
  '02': 'laureanosierra.dev@gmail.com', // Diagnóstico
  '03': 'jeremiasingla@gmail.com', // Blueprint
  '04': 'jeremiasingla@gmail.com', // Primera Versión (MVP)
  '05': 'jeremiasingla@gmail.com', // Revisión y Aprobación del MVP
  '06': 'jeremiasingla@gmail.com', // Construcción Completa
  '07': 'jeremiasingla@gmail.com', // Verificación de Calidad (QA)
  '08': 'jeremiasingla@gmail.com', // Activación / Lanzamiento
  '09': 'jeremiasingla@gmail.com', // Estabilización
  '10': 'laureanosierra.dev@gmail.com', // Evolución — ofrecimiento comercial
}

interface ParsedSop {
  stage: string
  name: string
  description: string
  steps: { title: string; body: string }[]
}

/**
 * Checklists operativos extraídos del contenido de los SOPs.
 *
 * Los SOPs se importan como `kind='procedure'` (pasos de un proceso). Estas
 * listas viven DENTRO de esos SOPs pero son de naturaleza distinta: se recorren
 * tildando ítem por ítem mientras se ejecuta la etapa. Por eso se cargan aparte
 * como `kind='checklist'`, para que aparezcan bajo el filtro Checklists y se
 * puedan abrir solas en el momento de usarlas.
 *
 * Se definen explícitamente (y no parseando el markdown) porque qué parte de un
 * SOP es "checklist" es una decisión editorial, no algo deducible del formato.
 */
const CHECKLISTS: { name: string; description: string; ownerEmail: string; items: string[] }[] = [
  {
    name: 'QA — Checklist técnico',
    description:
      'Verificación técnica antes de cada lanzamiento. Fuente: SOP 07 — Verificación de Calidad.',
    ownerEmail: 'jeremiasingla@gmail.com',
    items: [
      'Funcional: cada flujo principal (login, acción central, logout) sin errores',
      'Responsive: mobile, tablet y desktop (mínimo 3 breakpoints)',
      'Cross-browser: Chrome, Safari y Firefox',
      'Formularios: validación de campos obligatorios y mensajes de error claros',
      'Estados vacíos y de error: qué ve el usuario si algo falla o no hay datos',
      'Performance básica: carga inicial por debajo de 3 segundos en conexión normal',
      'Seguridad básica: HTTPS activo, credenciales fuera del frontend, rutas protegidas por rol',
      'Enlaces rotos y recursos 404',
    ],
  },
  {
    name: 'Lanzamiento — Checklist de pre-lanzamiento',
    description:
      'Verificaciones obligatorias antes de publicar en producción. Fuente: SOP 08 — Activación / Lanzamiento.',
    ownerEmail: 'jeremiasingla@gmail.com',
    items: [
      'Backup del estado previo al deploy final',
      'Dominio apuntando correctamente (DNS propagado — verificar, no asumir)',
      'Certificado SSL activo',
      'Variables de entorno de producción verificadas (no las de desarrollo/staging)',
      'Monitoreo/logging básico activo',
      'Accesos y cuentas críticas a nombre del cliente (regla de Propiedad)',
    ],
  },
  {
    name: 'Change Request — Qué debe incluir antes de aprobarse',
    description:
      'Ningún CR se construye sin estos cinco puntos completos. Fuente: SOP 06 — Construcción Completa.',
    ownerEmail: 'jeremiasingla@gmail.com',
    items: [
      'Descripción del pedido, en las palabras del cliente',
      'Impacto en tiempo (días adicionales)',
      'Impacto en costo (USD, o "sin costo" si entra en lo ya cotizado)',
      'Impacto en lo ya construido (¿rompe algo? ¿hay que rehacer algo?)',
      'Aprobación explícita del cliente ANTES de empezar a construir',
    ],
  },
]

/** Convierte un markdown de SOP en { name, description, steps }. */
function parseSop(stage: string, raw: string): ParsedSop {
  const lines = raw.split('\n')

  // H1: "# SOP Equipo — Blueprint" → "Blueprint"
  const h1 = lines.find((l) => l.startsWith('# ')) ?? `# SOP ${stage}`
  const title = h1.replace(/^#\s+/, '').replace(/^SOP Equipo\s*[—-]\s*/, '').trim()

  // Línea de estado, usada como descripción del ítem.
  const estado = lines.find((l) => l.startsWith('**Estado**'))
  const description = estado
    ? estado.replace(/^\*\*Estado\*\*:\s*/, '').trim()
    : 'SOP del equipo.'

  // Cada `## Sección` es un paso; el cuerpo es todo hasta el próximo `##`.
  const steps: { title: string; body: string }[] = []
  let current: { title: string; body: string[] } | null = null
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) steps.push({ title: current.title, body: current.body.join('\n').trim() })
      current = { title: line.replace(/^##\s+/, '').trim(), body: [] }
    } else if (current) {
      current.body.push(line)
    }
  }
  if (current) steps.push({ title: current.title, body: current.body.join('\n').trim() })

  return { stage, name: `${stage} — ${title}`, description, steps }
}

async function main(): Promise<void> {
  const dir = process.argv[2] ?? DEFAULT_DIR
  console.log(`📂 Leyendo SOPs de: ${dir}\n`)

  // Portal destino: el único del sistema (o el primero si hubiera varios).
  const [p] = await db.select({ id: portal.id, name: portal.name }).from(portal).limit(1)
  if (!p) throw new Error('No hay ningún portal en la base. Corré el seed primero.')
  console.log(`🏢 Portal: ${p.name} (${p.id})\n`)

  // Mapa email → hub_user.id para resolver el responsable de cada SOP.
  const users = await db
    .select({ id: hubUser.id, email: hubUser.email })
    .from(hubUser)
    .where(eq(hubUser.portalId, p.id))
  const userIdByEmail = new Map(users.map((u) => [u.email, u.id]))

  // Solo los SOP de etapa: EQUIPO_01_... a EQUIPO_10_... (excluye 00 y META).
  const files = readdirSync(dir)
    .filter((f) => /^EQUIPO_(\d{2})_SOP_.*\.md$/.test(f))
    .sort()

  if (files.length === 0) {
    console.log('⚠️  No se encontró ningún archivo EQUIPO_NN_SOP_*.md en esa carpeta.')
    process.exit(1)
  }

  let created = 0
  let updated = 0

  for (const file of files) {
    const stage = file.slice('EQUIPO_'.length, 'EQUIPO_'.length + 2)
    const parsed = parseSop(stage, readFileSync(join(dir, file), 'utf8'))

    const ownerEmail = OWNER_BY_STAGE[stage]
    const ownerId = ownerEmail ? (userIdByEmail.get(ownerEmail) ?? null) : null
    if (ownerEmail && !ownerId) {
      console.log(`   ⚠️  ${parsed.name}: no existe el hub_user ${ownerEmail} → queda sin responsable`)
    }

    const [existing] = await db
      .select({ id: libraryItem.id })
      .from(libraryItem)
      .where(and(eq(libraryItem.portalId, p.id), eq(libraryItem.name, parsed.name)))
      .limit(1)

    const values = {
      type: 'sop' as const,
      kind: 'procedure' as const,
      category: 'Proceso de entrega',
      name: parsed.name,
      description: parsed.description,
      steps: parsed.steps,
      ownerId,
      updatedAt: new Date(),
    }

    if (existing) {
      await db.update(libraryItem).set(values).where(eq(libraryItem.id, existing.id))
      console.log(`   ♻️  actualizado  ${parsed.name}  (${parsed.steps.length} pasos)`)
      updated++
    } else {
      await db.insert(libraryItem).values({ portalId: p.id, ...values })
      console.log(`   ✅ creado       ${parsed.name}  (${parsed.steps.length} pasos)`)
      created++
    }
  }

  // ── Checklists operativos ──────────────────────────────────────────────────
  console.log('')
  for (const cl of CHECKLISTS) {
    const ownerId = userIdByEmail.get(cl.ownerEmail) ?? null

    const [existing] = await db
      .select({ id: libraryItem.id })
      .from(libraryItem)
      .where(and(eq(libraryItem.portalId, p.id), eq(libraryItem.name, cl.name)))
      .limit(1)

    const values = {
      type: 'sop' as const,
      kind: 'checklist' as const,
      category: 'Proceso de entrega',
      name: cl.name,
      description: cl.description,
      steps: cl.items.map((title) => ({ title })),
      ownerId,
      updatedAt: new Date(),
    }

    if (existing) {
      await db.update(libraryItem).set(values).where(eq(libraryItem.id, existing.id))
      console.log(`   ♻️  actualizado  ${cl.name}  (${cl.items.length} ítems)`)
      updated++
    } else {
      await db.insert(libraryItem).values({ portalId: p.id, ...values })
      console.log(`   ✅ creado       ${cl.name}  (${cl.items.length} ítems)`)
      created++
    }
  }

  console.log(`\n─────────────────────────────────────────`)
  console.log(
    `📊 ${created} creados, ${updated} actualizados — ${files.length} procedimientos + ${CHECKLISTS.length} checklists.`,
  )
  console.log(`   Vélos en Admin → Biblioteca → Procesos y checklists`)
  process.exit(0)
}

main()
  .catch((err) => {
    console.error('\n💥 Error:', err)
    process.exit(1)
  })
  .finally(() => {
    void closeDb()
  })
