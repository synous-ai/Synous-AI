/**
 * Frontera de visibilidad interno ↔ cliente.
 *
 * El proceso de entrega define entregables y documentos que el cliente NO debe
 * ver (Blueprint técnico, Diagnóstico de negocio). Antes de `visible_to_client`
 * el portal devolvía TODO lo adjunto al deal sin filtrar, así que este archivo
 * fija ese límite: si alguien vuelve a sacar el filtro, estos tests fallan.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import {
  contact,
  deal,
  clientAccount,
  clientDealAccess,
  deliverable,
  document,
} from '../../db/schema'
import { ensurePortalAndUser, ensurePipeline, loginToken, type PipelineContext } from '../../test/helpers'

const app = buildApp()

let portalId: string
let adminToken: string
let adminUserId: string
let ventas: PipelineContext
let dealId: string
let clientToken: string

let visibleDeliverableId: string
let internalDeliverableId: string
let archivedDealId: string
let archivedDeliverableId: string

beforeAll(async () => {
  await app.ready()

  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  adminUserId = ctx.userId
  adminToken = await loginToken(app, ctx.email, ctx.password)
  ventas = await ensurePipeline(portalId)

  const uniqueEmail = `visibility-client-${Date.now()}@test.com`
  const [c] = await db
    .insert(contact)
    .values({ portalId, firstName: 'Vis', lastName: 'Test', email: uniqueEmail })
    .returning()
  const [d] = await db
    .insert(deal)
    .values({
      portalId,
      name: 'Deal Visibilidad',
      pipelineId: ventas.pipelineId,
      stageId: ventas.firstStageId,
      primaryContactId: c!.id,
      ownerId: adminUserId,
    })
    .returning()
  dealId = d!.id

  const clerkUserId = `clerk_test_visibility_${Date.now()}`
  const [ca] = await db
    .insert(clientAccount)
    .values({ portalId, contactId: c!.id, email: uniqueEmail, clerkUserId, isActive: true })
    .returning()
  await db.insert(clientDealAccess).values({ clientId: ca!.id, dealId: d!.id })
  clientToken = `faketoken:${clerkUserId}`

  const [visible] = await db
    .insert(deliverable)
    .values({ dealId, title: 'MVP para el cliente', type: 'prototype', createdBy: adminUserId })
    .returning()
  visibleDeliverableId = visible!.id

  const [internal] = await db
    .insert(deliverable)
    .values({
      dealId,
      title: 'Blueprint técnico (interno)',
      type: 'design',
      visibleToClient: false,
      createdBy: adminUserId,
    })
    .returning()
  internalDeliverableId = internal!.id

  await db.insert(document).values([
    { portalId, dealId, name: 'Contrato firmado', type: 'contract', createdBy: adminUserId },
    {
      portalId,
      dealId,
      name: 'Diagnóstico de negocio (interno)',
      type: 'other',
      visibleToClient: false,
      createdBy: adminUserId,
    },
  ])

  // Segundo deal, ARCHIVADO, con el mismo cliente teniendo acceso. Archivar es
  // el borrado del CRM: nada de este deal debe seguir llegando al portal.
  const [archived] = await db
    .insert(deal)
    .values({
      portalId,
      name: 'Deal Archivado',
      pipelineId: ventas.pipelineId,
      stageId: ventas.firstStageId,
      primaryContactId: c!.id,
      ownerId: adminUserId,
      archived: true,
      archivedAt: new Date(),
    })
    .returning()
  archivedDealId = archived!.id
  await db.insert(clientDealAccess).values({ clientId: ca!.id, dealId: archivedDealId })

  const [archDeliverable] = await db
    .insert(deliverable)
    .values({
      dealId: archivedDealId,
      title: 'Entregable de deal archivado',
      type: 'prototype',
      createdBy: adminUserId,
    })
    .returning()
  archivedDeliverableId = archDeliverable!.id

  await db.insert(document).values({
    portalId,
    dealId: archivedDealId,
    name: 'Documento de deal archivado',
    type: 'other',
    createdBy: adminUserId,
  })
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

const clientAuth = () => ({ Authorization: `Bearer ${clientToken}` })
const adminAuth = () => ({ Authorization: `Bearer ${adminToken}` })

describe('entregables — visibilidad', () => {
  it('el cliente ve los compartidos y NO los internos', async () => {
    const res = await request(app.server).get('/api/client/deliverables').set(clientAuth())
    expect(res.status).toBe(200)

    const ids = (res.body.data as { id: string }[]).map((d) => d.id)
    expect(ids).toContain(visibleDeliverableId)
    expect(ids).not.toContain(internalDeliverableId)
  })

  it('el default es visible: un entregable creado sin el campo llega al cliente', async () => {
    const res = await request(app.server).get('/api/client/deliverables').set(clientAuth())
    const found = (res.body.data as { id: string; visibleToClient: boolean }[]).find(
      (d) => d.id === visibleDeliverableId,
    )
    expect(found?.visibleToClient).toBe(true)
  })

  it('el cliente NO puede aprobar un entregable interno aunque conozca el id', async () => {
    const res = await request(app.server)
      .post(`/api/client/deliverables/${internalDeliverableId}/approve`)
      .set(clientAuth())
    // 404 y no 403: no se le confirma al cliente que el entregable existe.
    expect(res.status).toBe(404)
  })

  it('el admin sí ve ambos', async () => {
    const res = await request(app.server)
      .get(`/api/deliverables?dealId=${dealId}`)
      .set(adminAuth())
    expect(res.status).toBe(200)
    const ids = (res.body.data as { id: string }[]).map((d) => d.id)
    expect(ids).toContain(visibleDeliverableId)
    expect(ids).toContain(internalDeliverableId)
  })
})

describe('documentos — visibilidad', () => {
  it('el cliente ve el contrato pero no el documento interno', async () => {
    const res = await request(app.server).get('/api/client/documents').set(clientAuth())
    expect(res.status).toBe(200)

    const names = (res.body.data as { name: string }[]).map((d) => d.name)
    expect(names).toContain('Contrato firmado')
    expect(names).not.toContain('Diagnóstico de negocio (interno)')
  })
})

/**
 * Archivar es el borrado del CRM (nunca se borran filas). `clientDealIds` no
 * filtraba por `deal.archived`, así que el deal desaparecía de /deals pero el
 * cliente seguía viendo y pudiendo ACTUAR sobre todo lo que colgaba de él.
 */
describe('deals archivados — el acceso del cliente se corta', () => {
  it('el deal archivado no aparece en la lista de deals', async () => {
    const res = await request(app.server).get('/api/client/deals').set(clientAuth())
    expect(res.status).toBe(200)
    const ids = (res.body.data as { id: string }[]).map((d) => d.id)
    expect(ids).toContain(dealId)
    expect(ids).not.toContain(archivedDealId)
  })

  it('sus entregables no llegan al portal', async () => {
    const res = await request(app.server).get('/api/client/deliverables').set(clientAuth())
    expect(res.status).toBe(200)
    const ids = (res.body.data as { id: string }[]).map((d) => d.id)
    expect(ids).not.toContain(archivedDeliverableId)
  })

  it('sus documentos no llegan al portal', async () => {
    const res = await request(app.server).get('/api/client/documents').set(clientAuth())
    expect(res.status).toBe(200)
    const names = (res.body.data as { name: string }[]).map((d) => d.name)
    expect(names).not.toContain('Documento de deal archivado')
  })

  it('el cliente NO puede aprobar un entregable de un deal archivado', async () => {
    const res = await request(app.server)
      .post(`/api/client/deliverables/${archivedDeliverableId}/approve`)
      .set(clientAuth())
    expect(res.status).toBe(404)
  })
})
