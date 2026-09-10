/**
 * slug.test.ts
 *
 * Tests de `uniqueCompanySlug` — Fase A del multi-tenant por empresa.
 * Cubre: colisión con un slug ya usado, colisión con un reservado, nombre que
 * queda vacío al slugificar (fallback "empresa"), y acentos.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { db, closeDb } from '../db'
import { company } from '../db/schema'
import { ensurePortalAndUser } from '../test/helpers'
import { uniqueCompanySlug, slugify, SLUG_RESERVED } from './slug'

let portalId: string

beforeAll(async () => {
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
})

afterAll(async () => {
  await closeDb()
})

/** Inserta una empresa de test con un slug fijo (para forzar colisiones). */
async function makeCompanyWithSlug(slug: string): Promise<string> {
  const [row] = await db
    .insert(company)
    .values({ portalId, name: `Empresa ${randomUUID()}`, slug })
    .returning({ id: company.id })
  return row!.id
}

describe('SLUG_RESERVED', () => {
  it('incluye los subdominios reales en uso hoy en producción (app.*, api.*)', () => {
    // `apps/admin/middleware.ts` (getSubdomain) usa esta MISMA lista para
    // descartarlos como tenant — si "app" o "api" faltaran acá, un tenant de
    // empresa podría reclamar ese slug y colisionar con la infraestructura
    // real (app.synousai.com, api.synousai.com).
    expect(SLUG_RESERVED).toContain('app')
    expect(SLUG_RESERVED).toContain('api')
  })
})

describe('slugify', () => {
  it('normaliza a minúsculas, sin acentos y con guiones', () => {
    expect(slugify('Café Central')).toBe('cafe-central')
    expect(slugify('María José')).toBe('maria-jose')
    expect(slugify('  Uirtus  ')).toBe('uirtus')
  })

  it('devuelve vacío si el nombre no tiene alfanuméricos', () => {
    expect(slugify('!!!')).toBe('')
    expect(slugify('😀😀')).toBe('')
  })
})

describe('uniqueCompanySlug', () => {
  it('genera el slug directo del nombre cuando está libre', async () => {
    const name = `Uirtus ${randomUUID().slice(0, 8)}`
    const slug = await db.transaction((tx) => uniqueCompanySlug(tx, portalId, name))
    expect(slug).toBe(slugify(name))
  })

  it('sufija -2 cuando el slug base ya está en uso en el mismo portal', async () => {
    const base = `colision-${randomUUID().slice(0, 8)}`
    await makeCompanyWithSlug(base)

    const slug = await db.transaction((tx) => uniqueCompanySlug(tx, portalId, base))
    expect(slug).toBe(`${base}-2`)
  })

  it('sigue sufijando hasta encontrar un slug libre (-2, -3, ...)', async () => {
    const base = `serial-${randomUUID().slice(0, 8)}`
    await makeCompanyWithSlug(base)
    await makeCompanyWithSlug(`${base}-2`)

    const slug = await db.transaction((tx) => uniqueCompanySlug(tx, portalId, base))
    expect(slug).toBe(`${base}-3`)
  })

  it('evita los slugs reservados aunque estén libres en la DB', async () => {
    // "admin" es un slug de plataforma (SLUG_RESERVED) — nunca se le asigna a
    // una empresa, aunque ninguna otra fila lo esté usando.
    expect(SLUG_RESERVED).toContain('admin')
    const slug = await db.transaction((tx) => uniqueCompanySlug(tx, portalId, 'Admin'))
    expect(slug).toBe('admin-2')
    expect(SLUG_RESERVED as readonly string[]).not.toContain(slug)
  })

  it('usa "empresa" como base cuando el nombre no deja nada slugificable', async () => {
    const slug = await db.transaction((tx) => uniqueCompanySlug(tx, portalId, '😀😀😀'))
    expect(slug === 'empresa' || /^empresa-\d+$/.test(slug)).toBe(true)
  })

  it('ignora acentos y mayúsculas al generar el slug', async () => {
    const name = `Ñoño Software ${randomUUID().slice(0, 6)}`
    const slug = await db.transaction((tx) => uniqueCompanySlug(tx, portalId, name))
    expect(slug).toBe(slugify(name))
    expect(slug).not.toMatch(/[^a-z0-9-]/)
  })

  it('no choca contra su propio slug cuando se pasa excludeCompanyId', async () => {
    const base = `self-${randomUUID().slice(0, 8)}`
    const id = await makeCompanyWithSlug(base)

    const slug = await db.transaction((tx) => uniqueCompanySlug(tx, portalId, base, id))
    expect(slug).toBe(base)
  })
})
