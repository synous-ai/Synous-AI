/**
 * documents.client.test.ts — DTO client-facing de `listClientDocuments`.
 *
 * Cubre dos agregados a `ClientDocumentDTO` (ver documents.service.ts):
 *  1. `docusealStatus` — ya vivía en la columna, faltaba exponerlo al portal.
 *  2. `uploadedBy` — nombre legible de quién subió el documento, vía LEFT JOIN
 *     a hub_user. Tiene que ser LEFT JOIN y no INNER: `document.created_by` es
 *     nullable (documentos de DocuSeal/generados pueden no tenerlo), y un
 *     INNER haría desaparecer esos documentos del portal — una regresión de
 *     visibilidad silenciosa que este archivo fija.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db, closeDb } from '../../db'
import { contact, deal, document } from '../../db/schema'
import { createId } from '../../lib/id'
import { ensurePortalAndUser, ensurePipeline, type PipelineContext } from '../../test/helpers'
import { listClientDocuments } from './documents.service'

let portalId: string
let userId: string
let ventas: PipelineContext
let dealId: string

beforeAll(async () => {
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  userId = ctx.userId
  ventas = await ensurePipeline(portalId)

  const email = `documents-client-${createId()}@test.com`
  const [c] = await db.insert(contact).values({ portalId, firstName: 'Cli', lastName: 'Docs', email }).returning()
  const [d] = await db
    .insert(deal)
    .values({
      portalId,
      name: `Deal Documents Client ${createId()}`,
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

describe('listClientDocuments — docusealStatus', () => {
  it('expone docusealStatus pending y completed', async () => {
    await db.insert(document).values([
      {
        portalId,
        dealId,
        name: 'Contrato pendiente de firma',
        type: 'contract',
        source: 'docuseal',
        docusealStatus: 'pending',
        createdBy: userId,
      },
      {
        portalId,
        dealId,
        name: 'Contrato firmado',
        type: 'contract',
        source: 'docuseal',
        docusealStatus: 'completed',
        createdBy: userId,
      },
    ])

    const docs = (await listClientDocuments(portalId, [dealId], { limit: 100 })).items
    const pending = docs.find((d) => d.name === 'Contrato pendiente de firma')
    const completed = docs.find((d) => d.name === 'Contrato firmado')

    expect(pending?.docusealStatus).toBe('pending')
    expect(completed?.docusealStatus).toBe('completed')
  })
})

describe('listClientDocuments — uploadedBy', () => {
  it('un documento con created_by resuelve el nombre del hub_user', async () => {
    await db.insert(document).values({
      portalId,
      dealId,
      name: 'Documento con autor',
      type: 'other',
      createdBy: userId,
    })

    const docs = (await listClientDocuments(portalId, [dealId], { limit: 100 })).items
    const found = docs.find((d) => d.name === 'Documento con autor')

    // ensurePortalAndUser() crea al owner de test con firstName: 'Owner'.
    expect(found?.uploadedBy).toBe('Owner')
  })

  it('un documento SIN created_by devuelve uploadedBy=null y SIGUE apareciendo en el listado (LEFT JOIN, no INNER)', async () => {
    await db.insert(document).values({
      portalId,
      dealId,
      name: 'Documento sin autor (generado)',
      type: 'other',
      source: 'generated',
      createdBy: null,
    })

    const docs = (await listClientDocuments(portalId, [dealId], { limit: 100 })).items
    const found = docs.find((d) => d.name === 'Documento sin autor (generado)')

    expect(found).toBeDefined()
    expect(found?.uploadedBy).toBeNull()
  })
})
