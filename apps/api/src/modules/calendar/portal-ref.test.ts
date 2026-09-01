/**
 * portal-ref.test.ts — Resolución del segmento de portal en la URL pública.
 *
 * La página de reservas vive en `/book/:portalRef/:eventSlug`. Ese `portalRef`
 * era el `portal.id` — un cuid interno en un link que se le manda a un lead.
 * Ahora acepta el slug legible, y sigue aceptando el id para no romper links
 * que ya salieron.
 *
 * Lo que se verifica acá es justamente esa doble aceptación, porque es lo que
 * hace que el cambio sea seguro de desplegar.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, closeDb } from '../../db'
import { portal } from '../../db/schema'
import { ensurePortalAndUser } from '../../test/helpers'
import { resolvePortalRef } from './calendar.service'

let portalId: string
let originalSlug: string | null = null

beforeAll(async () => {
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId

  const [p] = await db.select({ slug: portal.slug }).from(portal).where(eq(portal.id, portalId)).limit(1)
  originalSlug = p?.slug ?? null

  await db.update(portal).set({ slug: 'synous-test' }).where(eq(portal.id, portalId))
})

afterAll(async () => {
  await db.update(portal).set({ slug: originalSlug }).where(eq(portal.id, portalId))
  await closeDb()
})

describe('resolvePortalRef', () => {
  it('resuelve por slug legible — la forma que se le manda a un lead', async () => {
    expect(await resolvePortalRef('synous-test')).toBe(portalId)
  })

  it('sigue resolviendo por id — los links viejos llevan el cuid', async () => {
    expect(await resolvePortalRef(portalId)).toBe(portalId)
  })

  it('un ref inexistente da 404, no un portal cualquiera', async () => {
    await expect(resolvePortalRef('no-existe-este-portal')).rejects.toMatchObject({ statusCode: 404 })
  })

  // NOTA: la unicidad del slug NO se testea acá. Hacerlo exige insertar un
  // segundo `portal`, y `ensurePortalAndUser` (test/helpers) resuelve el portal
  // con `select().from(portal).limit(1)` SIN ORDER BY: con dos filas, los otros
  // archivos de test —que corren en paralelo— pueden agarrar el portal de más y
  // quedar con un hub_user de un portal y datos de otro. Eso rompió 21 tests.
  // La restricción la garantiza el UNIQUE de la migración 0032.
})
