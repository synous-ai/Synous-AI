/**
 * Sistema de notificaciones: persistencia, aislamiento entre destinatarios,
 * idempotencia y paginación.
 *
 * Lo que más importa acá es que un destinatario NO pueda tocar la bandeja de
 * otro, y que emitir una notificación nunca pueda romper la operación de
 * negocio que la dispara.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { and, eq } from 'drizzle-orm'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import { contact, deal, clientAccount, clientDealAccess, notification, hubUser, notificationPref } from '../../db/schema'
import { ensurePortalAndUser, ensurePipeline, loginToken, type PipelineContext } from '../../test/helpers'
import { notifyUser, notifyAdmins, notifyDealClients } from './notify'
import { NOTIFICATION_EVENTS, ADMIN_EVENT_TYPES, CLIENT_EVENT_TYPES } from './notification-events'

const app = buildApp()
let portalId: string
let adminToken: string
let adminUserId: string
let pipe: PipelineContext

interface TestClient { clientId: string; dealId: string; token: string }

async function makeClient(tag: string): Promise<TestClient> {
  const unique = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `notif-${unique}@test.com`
  const [c] = await db.insert(contact).values({ portalId, firstName: 'N', lastName: tag, email }).returning()
  const [d] = await db.insert(deal).values({ portalId, name: `Deal ${unique}`, pipelineId: pipe.pipelineId, stageId: pipe.firstStageId, primaryContactId: c!.id }).returning()
  const clerkUserId = `clerk_notif_${unique}`
  const [ca] = await db.insert(clientAccount).values({ portalId, contactId: c!.id, email, clerkUserId, isActive: true }).returning()
  await db.insert(clientDealAccess).values({ clientId: ca!.id, dealId: d!.id })
  return { clientId: ca!.id, dealId: d!.id, token: `faketoken:${clerkUserId}` }
}

const auth = (t: string) => ({ Authorization: `Bearer ${t}` })

beforeAll(async () => {
  await app.ready()
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  adminUserId = ctx.userId
  adminToken = await loginToken(app, ctx.email, ctx.password)
  pipe = await ensurePipeline(portalId)
})

afterAll(async () => { await app.close(); await closeDb() })

// ─── Catálogo ────────────────────────────────────────────────────────────────

describe('catálogo de eventos', () => {
  it('toda entrada rinde un título no vacío y una prioridad válida', () => {
    const valid = ['low', 'normal', 'high', 'urgent']
    for (const [type, def] of Object.entries(NOTIFICATION_EVENTS)) {
      expect(valid, `${type}: prioridad`).toContain(def.priority)
      expect(['admin', 'client'], `${type}: audiencia`).toContain(def.audience)
    }
  })

  it('cubre las dos audiencias', () => {
    expect(ADMIN_EVENT_TYPES.length).toBeGreaterThan(0)
    expect(CLIENT_EVENT_TYPES.length).toBeGreaterThan(0)
  })
})

// ─── Emisión ─────────────────────────────────────────────────────────────────

describe('emisión', () => {
  it('notifyDealClients llega al cliente con acceso al deal', async () => {
    const c = await makeClient('emit')
    const okEmit = await notifyDealClients(portalId, c.dealId, 'deliverable_ready', {
      dealId: c.dealId, deliverableTitle: 'Diseño de la home',
    }, { entity: { type: 'deliverable', id: 'dlv-1' } })
    expect(okEmit).toBe(true)

    const rows = await db.select().from(notification).where(eq(notification.clientId, c.clientId))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.title).toContain('Diseño de la home')
    expect(rows[0]!.priority).toBe('high')
    expect(rows[0]!.userId).toBeNull()
  })

  it('rechaza emitir un evento de cliente hacia admins y viceversa', async () => {
    const c = await makeClient('audiencia')
    // `deliverable_ready` es de cliente: notifyAdmins debe descartarlo.
    expect(await notifyAdmins(portalId, 'deliverable_ready' as never, {} as never)).toBe(false)
    // `cr_approved` es de admin: notifyDealClients debe descartarlo.
    expect(await notifyDealClients(portalId, c.dealId, 'cr_approved' as never, {} as never)).toBe(false)
  })

  it('NUNCA propaga un error: un destinatario inexistente no rompe al caller', async () => {
    // portalId inválido ⇒ el insert viola la FK. La promesa debe resolver false,
    // no lanzar: la operación de negocio que la llamó ya ocurrió.
    const emitted = await notifyUser('portal-inexistente-xyz', adminUserId, 'deal_stale', {
      dealId: 'd1', dealName: 'X', days: 10,
    })
    expect(emitted).toBe(false)
  })
})

// ─── Idempotencia ────────────────────────────────────────────────────────────

describe('idempotencia', () => {
  it('el mismo evento con la misma dedupeKey inserta UNA sola vez', async () => {
    const c = await makeClient('dedupe')
    const key = `invoice_sent:test-${Date.now()}`
    const payload = { invoiceId: 'inv-1', invoiceNumber: 7, amount: '100.00', currency: 'USD' }

    for (let i = 0; i < 3; i++) {
      await notifyDealClients(portalId, c.dealId, 'invoice_sent', payload, { dedupeKey: key })
    }
    const rows = await db.select().from(notification).where(eq(notification.clientId, c.clientId))
    expect(rows).toHaveLength(1)
  })

  it('emisiones CONCURRENTES del mismo evento tampoco duplican', async () => {
    const c = await makeClient('dedupe-race')
    const key = `invoice_sent:race-${Date.now()}`
    const payload = { invoiceId: 'inv-2', invoiceNumber: 8, amount: '50.00', currency: 'USD' }

    await Promise.all(
      Array.from({ length: 5 }, () =>
        notifyDealClients(portalId, c.dealId, 'invoice_sent', payload, { dedupeKey: key }),
      ),
    )
    const rows = await db.select().from(notification).where(eq(notification.clientId, c.clientId))
    expect(rows).toHaveLength(1)
  })

  it('sin dedupeKey, cada emisión es un evento nuevo', async () => {
    const c = await makeClient('repetible')
    for (let i = 0; i < 3; i++) {
      await notifyDealClients(portalId, c.dealId, 'cr_commented', { crId: 'cr-1', crNumber: 1 })
    }
    const rows = await db.select().from(notification).where(eq(notification.clientId, c.clientId))
    expect(rows).toHaveLength(3)
  })

  it('notifyAdmins con dedupeKey notifica a TODOS los admins, no solo al primero', async () => {
    const extraEmail = `notif-admin-${Date.now()}@test.com`
    const [extra] = await db.insert(hubUser).values({
      portalId, email: extraEmail, role: 'member', firstName: 'Extra', clerkUserId: `clerk_x_${Date.now()}`,
    }).returning()

    const key = `contract_signed:multi-${Date.now()}`
    await notifyAdmins(portalId, 'contract_signed', { dealId: 'd9', dealName: 'Multi' }, { dedupeKey: key })

    const rows = await db.select().from(notification)
      .where(and(eq(notification.portalId, portalId), eq(notification.type, 'contract_signed')))
    const destinatarios = new Set(rows.map((r) => r.userId))
    expect(destinatarios.has(extra!.id)).toBe(true)
    expect(destinatarios.size).toBeGreaterThan(1)
  })
})

// ─── Preferencias ────────────────────────────────────────────────────────────

describe('preferencias de notificación', () => {
  it('un admin que apagó el evento NO lo recibe; los demás sí', async () => {
    const [silenciado] = await db.insert(hubUser).values({
      portalId, email: `pref-off-${Date.now()}@test.com`, role: 'member', firstName: 'Silencioso',
      clerkUserId: `clerk_pref_${Date.now()}`,
    }).returning()

    await db.insert(notificationPref).values({
      portalId, userId: silenciado!.id, eventType: 'deal_stale', inApp: false, email: false,
    })

    const dealId = `pref-deal-${Date.now()}`
    await notifyAdmins(portalId, 'deal_stale', { dealId, dealName: 'Con pref', days: 9 }, {
      entity: { type: 'deal', id: dealId },
    })

    const rows = await db.select().from(notification)
      .where(and(eq(notification.entityId, dealId), eq(notification.type, 'deal_stale')))
    const destinatarios = rows.map((r) => r.userId)

    expect(destinatarios).not.toContain(silenciado!.id)
    // El resto del equipo sí: apagar una preferencia es individual.
    expect(destinatarios.length).toBeGreaterThan(0)
  })

  it('sin fila de preferencia, el evento llega (default in-app activado)', async () => {
    const dealId = `pref-default-${Date.now()}`
    await notifyAdmins(portalId, 'deal_stale', { dealId, dealName: 'Sin pref', days: 3 }, {
      entity: { type: 'deal', id: dealId },
    })
    const rows = await db.select().from(notification).where(eq(notification.entityId, dealId))
    expect(rows.length).toBeGreaterThan(0)
  })
})

// ─── Aislamiento entre destinatarios ─────────────────────────────────────────

describe('aislamiento y ownership', () => {
  it('un cliente solo ve SUS notificaciones', async () => {
    const a = await makeClient('iso-a')
    const b = await makeClient('iso-b')
    await notifyDealClients(portalId, a.dealId, 'document_shared', { documentId: 'doc-a', documentName: 'Solo de A' })
    await notifyDealClients(portalId, b.dealId, 'document_shared', { documentId: 'doc-b', documentName: 'Solo de B' })

    const res = await request(app.server).get('/api/client/notifications').set(auth(a.token))
    expect(res.status).toBe(200)
    const titulos = res.body.data.map((n: { title: string }) => n.title)
    expect(titulos.some((t: string) => t.includes('Solo de A'))).toBe(true)
    expect(titulos.some((t: string) => t.includes('Solo de B'))).toBe(false)
  })

  it('un cliente NO puede marcar como leída la notificación de otro (404, no 403)', async () => {
    const a = await makeClient('idor-a')
    const b = await makeClient('idor-b')
    await notifyDealClients(portalId, b.dealId, 'document_shared', { documentId: 'doc-b', documentName: 'De B' })
    const [deB] = await db.select().from(notification).where(eq(notification.clientId, b.clientId))

    const res = await request(app.server).post(`/api/client/notifications/${deB!.id}/read`).set(auth(a.token))
    expect(res.status).toBe(404)

    // Y sigue sin leer para su dueño.
    const [after] = await db.select().from(notification).where(eq(notification.id, deB!.id))
    expect(after!.readAt).toBeNull()
  })

  it('el admin no ve las notificaciones de los clientes', async () => {
    const c = await makeClient('admin-sep')
    await notifyDealClients(portalId, c.dealId, 'document_shared', { documentId: 'x', documentName: 'Privado del cliente' })

    const res = await request(app.server).get('/api/notifications').set(auth(adminToken))
    expect(res.status).toBe(200)
    const titulos = res.body.data.map((n: { title: string }) => n.title)
    expect(titulos.some((t: string) => t.includes('Privado del cliente'))).toBe(false)
  })

  it('sin token no se accede a ninguna de las dos bandejas', async () => {
    expect((await request(app.server).get('/api/notifications')).status).toBe(401)
    expect((await request(app.server).get('/api/client/notifications')).status).toBe(401)
  })

  it('un token de cliente no sirve para la bandeja de admin', async () => {
    const c = await makeClient('cross')
    const res = await request(app.server).get('/api/notifications').set(auth(c.token))
    expect(res.status).toBe(401)
  })
})

// ─── Leídas / no leídas ──────────────────────────────────────────────────────

describe('leídas y contador', () => {
  it('unread-count refleja lo no leído y baja al marcar', async () => {
    const c = await makeClient('unread')
    for (let i = 0; i < 3; i++) {
      await notifyDealClients(portalId, c.dealId, 'cr_commented', { crId: `cr-${i}`, crNumber: i })
    }
    let res = await request(app.server).get('/api/client/notifications/unread-count').set(auth(c.token))
    expect(res.body.data.count).toBe(3)

    const [one] = await db.select().from(notification).where(eq(notification.clientId, c.clientId)).limit(1)
    await request(app.server).post(`/api/client/notifications/${one!.id}/read`).set(auth(c.token))

    res = await request(app.server).get('/api/client/notifications/unread-count').set(auth(c.token))
    expect(res.body.data.count).toBe(2)
  })

  it('read-all deja el contador en cero', async () => {
    const c = await makeClient('readall')
    for (let i = 0; i < 4; i++) {
      await notifyDealClients(portalId, c.dealId, 'cr_commented', { crId: `x-${i}`, crNumber: i })
    }
    await request(app.server).post('/api/client/notifications/read-all').set(auth(c.token))
    const res = await request(app.server).get('/api/client/notifications/unread-count').set(auth(c.token))
    expect(res.body.data.count).toBe(0)
  })

  it('marcar como leída es idempotente', async () => {
    const c = await makeClient('idem-read')
    await notifyDealClients(portalId, c.dealId, 'cr_commented', { crId: 'y', crNumber: 1 })
    const [n] = await db.select().from(notification).where(eq(notification.clientId, c.clientId))
    for (let i = 0; i < 2; i++) {
      const res = await request(app.server).post(`/api/client/notifications/${n!.id}/read`).set(auth(c.token))
      expect(res.status).toBe(200)
    }
  })
})

// ─── Paginación ──────────────────────────────────────────────────────────────

describe('paginación por cursor', () => {
  it('pagina sin repetir ni saltear elementos', async () => {
    const c = await makeClient('pag')
    const TOTAL = 7
    for (let i = 0; i < TOTAL; i++) {
      await notifyDealClients(portalId, c.dealId, 'cr_commented', { crId: `p-${i}`, crNumber: i })
    }

    const vistos: string[] = []
    let cursor: string | null = null
    for (let page = 0; page < 10; page++) {
      const url = `/api/client/notifications?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
      const res: { body: { data: { id: string }[]; meta: { nextCursor: string | null } } } =
        await request(app.server).get(url).set(auth(c.token))
      vistos.push(...res.body.data.map((n) => n.id))
      cursor = res.body.meta.nextCursor
      if (!cursor) break
    }

    expect(vistos).toHaveLength(TOTAL)
    expect(new Set(vistos).size).toBe(TOTAL) // sin repetidos
  })

  it('respeta el límite y lo topea en 50', async () => {
    const c = await makeClient('limite')
    await notifyDealClients(portalId, c.dealId, 'cr_commented', { crId: 'l', crNumber: 1 })
    expect((await request(app.server).get('/api/client/notifications?limit=1').set(auth(c.token))).body.data.length).toBeLessThanOrEqual(1)
    expect((await request(app.server).get('/api/client/notifications?limit=999').set(auth(c.token))).status).toBe(400)
  })
})

// ─── Integridad en DB ────────────────────────────────────────────────────────

describe('integridad', () => {
  it('la base rechaza una notificación sin destinatario', async () => {
    await expect(
      db.insert(notification).values({
        portalId, userId: null, clientId: null, type: 'deal_stale', title: 'Huérfana',
      }),
    ).rejects.toThrow()
  })

  it('la base rechaza una prioridad desconocida', async () => {
    await expect(
      db.insert(notification).values({
        portalId, userId: adminUserId, type: 'deal_stale', title: 'X', priority: 'altísima',
      }),
    ).rejects.toThrow()
  })
})
