/**
 * portal-access.test.ts
 *
 * Cubre `assertFolderInDeal` (guard de tenant para document_folder — ver
 * CLAUDE.md "Guardia de FKs por tenant"): null/undefined pasan, carpeta viva
 * del mismo deal+portal pasa, y cualquier otro caso (deal ajeno, portal ajeno,
 * archivada, inexistente) tira `badRequest`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db, closeDb } from '../db'
import { contact, deal, documentFolder, portal } from '../db/schema'
import { createId } from './id'
import { ensurePortalAndUser, ensurePipeline, type PipelineContext } from '../test/helpers'
import { assertFolderInDeal } from './portal-access'

let portalId: string
let userId: string
let ventas: PipelineContext
let dealId: string

beforeAll(async () => {
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  userId = ctx.userId
  ventas = await ensurePipeline(portalId)

  const email = `portal-access-${createId()}@test.com`
  const [c] = await db.insert(contact).values({ portalId, firstName: 'Cli', lastName: 'Folder', email }).returning()
  const [d] = await db
    .insert(deal)
    .values({
      portalId,
      name: `Deal Portal Access ${createId()}`,
      pipelineId: ventas.pipelineId,
      stageId: ventas.firstStageId,
      primaryContactId: c!.id,
      ownerId: userId,
    })
    .returning()
  dealId = d!.id
})

afterAll(async () => {
  await closeDb()
})

async function makeFolder(opts: { portalId: string; dealId: string; archived?: boolean }): Promise<string> {
  const [f] = await db
    .insert(documentFolder)
    .values({
      portalId: opts.portalId,
      dealId: opts.dealId,
      name: `Carpeta ${createId()}`,
      createdBy: userId,
      archived: opts.archived ?? false,
    })
    .returning()
  return f!.id
}

describe('assertFolderInDeal', () => {
  it('null pasa sin tocar la DB', async () => {
    await expect(assertFolderInDeal(portalId, dealId, null)).resolves.toBeUndefined()
  })

  it('undefined pasa sin tocar la DB', async () => {
    await expect(assertFolderInDeal(portalId, dealId, undefined)).resolves.toBeUndefined()
  })

  it('carpeta viva del mismo portal y deal pasa', async () => {
    const folderId = await makeFolder({ portalId, dealId })
    await expect(assertFolderInDeal(portalId, dealId, folderId)).resolves.toBeUndefined()
  })

  it('carpeta inexistente → badRequest', async () => {
    await expect(assertFolderInDeal(portalId, dealId, 'nonexistent-id-xyz')).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('carpeta archivada → badRequest', async () => {
    const folderId = await makeFolder({ portalId, dealId, archived: true })
    await expect(assertFolderInDeal(portalId, dealId, folderId)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('carpeta de otro deal (mismo portal) → badRequest', async () => {
    const email = `portal-access-other-deal-${createId()}@test.com`
    const [c] = await db.insert(contact).values({ portalId, firstName: 'Otro', lastName: 'Deal', email }).returning()
    const [otherDeal] = await db
      .insert(deal)
      .values({
        portalId,
        name: `Otro Deal ${createId()}`,
        pipelineId: ventas.pipelineId,
        stageId: ventas.firstStageId,
        primaryContactId: c!.id,
        ownerId: userId,
      })
      .returning()
    const folderId = await makeFolder({ portalId, dealId: otherDeal!.id })
    await expect(assertFolderInDeal(portalId, dealId, folderId)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('carpeta cuyo portal_id no coincide con el portalId del caller → badRequest', async () => {
    const [otherPortal] = await db.insert(portal).values({ name: `Otro Portal Folder ${createId()}` }).returning()
    // Fila deliberadamente inconsistente (portal_id no coincide con el portal
    // real del deal) — no hay FK que lo impida a nivel DB; justo por eso hace
    // falta este guard en el service, no alcanza con la FK compuesta.
    const folderId = await makeFolder({ portalId: otherPortal!.id, dealId })
    await expect(assertFolderInDeal(portalId, dealId, folderId)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('funciona pasando un executor (tx) explícito, con el lock FOR SHARE', async () => {
    const folderId = await makeFolder({ portalId, dealId })
    await db.transaction(async (tx) => {
      await expect(assertFolderInDeal(portalId, dealId, folderId, tx)).resolves.toBeUndefined()
    })
  })
})
