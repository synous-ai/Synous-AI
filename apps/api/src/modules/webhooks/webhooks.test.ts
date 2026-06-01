/**
 * webhooks.test.ts
 *
 * Tests de integración para:
 *  - POST /webhooks/fathom  (seguridad HMAC + creación de meeting)
 *  - GET  /track/open/:id   (pixel de apertura + emailEvent 'opened')
 *  - GET  /track/click/:id  (redirect + emailEvent 'clicked')
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { createHmac } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { buildApp } from '../../app'
import { db, closeDb } from '../../db'
import { meeting, emailSend, emailEvent } from '../../db/schema'
import { ensurePortalAndUser } from '../../test/helpers'

// ── Setup del secret de test ──────────────────────────────────────────────────
// El secret se inyecta en process.env antes de buildApp()
// para que env.ts lo recoja en su parseo (ya ocurrió al importar env),
// pero la función verifyFathomSignature lee env en tiempo de ejecución.
const TEST_SECRET = 'test-fathom-secret-for-integration-tests-32chars'
process.env['FATHOM_WEBHOOK_SECRET'] = TEST_SECRET

// Sobrescribimos env.FATHOM_WEBHOOK_SECRET dinámicamente
// (env.ts ya fue evaluado; necesitamos parchear el objeto exportado)
import { env } from '../../config/env'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(env as any).FATHOM_WEBHOOK_SECRET = TEST_SECRET

const app = buildApp()
let portalId: string

beforeAll(async () => {
  await app.ready()
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

// ── Helper: genera firma HMAC-SHA256 ─────────────────────────────────────────

function signPayload(body: string, secret: string = TEST_SECRET): string {
  return createHmac('sha256', secret).update(body).digest('hex')
}

// ── POST /webhooks/fathom ─────────────────────────────────────────────────────

describe('POST /webhooks/fathom — seguridad HMAC', () => {
  it('sin header X-Fathom-Signature → 401 sin body informativo', async () => {
    const body = JSON.stringify({ title: 'Reunión test' })
    const res = await request(app.server)
      .post('/webhooks/fathom')
      .set('Content-Type', 'application/json')
      .send(body)
    expect(res.status).toBe(401)
    // sin body informativo
    expect(res.text).toBeFalsy()
  })

  it('firma inválida → 401 sin body informativo', async () => {
    const body = JSON.stringify({ title: 'Reunión test' })
    const res = await request(app.server)
      .post('/webhooks/fathom')
      .set('Content-Type', 'application/json')
      .set('X-Fathom-Signature', 'sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
      .send(body)
    expect(res.status).toBe(401)
    expect(res.text).toBeFalsy()
  })

  it('firma válida → 200 y crea una meeting en la DB', async () => {
    const payload = {
      title: 'Demo del producto',
      starts_at: '2026-06-01T14:00:00.000Z',
      ends_at: '2026-06-01T15:00:00.000Z',
      summary: 'El cliente está interesado en el plan Pro.',
      transcript_url: 'https://app.fathom.video/share/test-unique-url-001',
      action_items: ['Enviar propuesta', 'Agendar follow-up'],
      participants: [{ email: 'cliente@test.com', name: 'Cliente Test' }],
    }
    const bodyStr = JSON.stringify(payload)
    const sig = signPayload(bodyStr)

    const res = await request(app.server)
      .post('/webhooks/fathom')
      .set('Content-Type', 'application/json')
      .set('X-Fathom-Signature', sig)
      .send(bodyStr)

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    // Verificar que se creó la meeting en la DB
    const [row] = await db
      .select()
      .from(meeting)
      .where(eq(meeting.fathomTranscriptUrl, payload.transcript_url))
      .limit(1)

    expect(row).toBeDefined()
    expect(row?.title).toBe('Demo del producto')
    expect(row?.fathomSummary).toBe('El cliente está interesado en el plan Pro.')
    expect(Array.isArray(row?.fathomActionItems)).toBe(true)
    expect(row?.portalId).toBe(portalId)
  })

  it('idempotencia: misma transcript_url no crea duplicado, actualiza', async () => {
    const payload = {
      title: 'Demo actualizada',
      transcript_url: 'https://app.fathom.video/share/test-unique-url-002',
      summary: 'Resumen v1',
    }
    const bodyStr1 = JSON.stringify(payload)
    const sig1 = signPayload(bodyStr1)

    await request(app.server)
      .post('/webhooks/fathom')
      .set('Content-Type', 'application/json')
      .set('X-Fathom-Signature', sig1)
      .send(bodyStr1)

    const payload2 = { ...payload, summary: 'Resumen v2' }
    const bodyStr2 = JSON.stringify(payload2)
    const sig2 = signPayload(bodyStr2)

    await request(app.server)
      .post('/webhooks/fathom')
      .set('Content-Type', 'application/json')
      .set('X-Fathom-Signature', sig2)
      .send(bodyStr2)

    const rows = await db
      .select()
      .from(meeting)
      .where(eq(meeting.fathomTranscriptUrl, 'https://app.fathom.video/share/test-unique-url-002'))

    // Exactamente una fila (idempotente)
    expect(rows.length).toBe(1)
    // Con el summary actualizado
    expect(rows[0]?.fathomSummary).toBe('Resumen v2')
  })
})

// ── GET /track/open/:trackingId ───────────────────────────────────────────────

describe('GET /track/open/:trackingId — pixel de apertura', () => {
  let trackingId: string

  beforeEach(async () => {
    // Crear un emailSend de prueba para obtener un trackingId válido
    const [send] = await db
      .insert(emailSend)
      .values({
        portalId,
        fromEmail: 'test@devduo.com',
        toEmail: 'cliente@test.com',
        subject: 'Test tracking open',
      })
      .returning({ trackingId: emailSend.trackingId })
    trackingId = send!.trackingId
  })

  it('devuelve 200 con Content-Type image/gif', async () => {
    const res = await request(app.server).get(`/track/open/${trackingId}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/image\/gif/)
    // GIF magic bytes: 47 49 46 38 (GIF8)
    expect(res.body[0]).toBe(0x47) // 'G'
    expect(res.body[1]).toBe(0x49) // 'I'
    expect(res.body[2]).toBe(0x46) // 'F'
  })

  it('crea un emailEvent "opened" en la DB', async () => {
    await request(app.server).get(`/track/open/${trackingId}`)

    // Esperar un tick para que el fire-and-forget se complete
    await new Promise((r) => setTimeout(r, 50))

    const [sendRow] = await db
      .select({ id: emailSend.id })
      .from(emailSend)
      .where(eq(emailSend.trackingId, trackingId))
      .limit(1)

    expect(sendRow).toBeDefined()

    const events = await db
      .select()
      .from(emailEvent)
      .where(eq(emailEvent.emailId, sendRow!.id))

    const openEvent = events.find((e) => e.type === 'opened')
    expect(openEvent).toBeDefined()
  })

  it('trackingId inexistente → 200 image/gif (nunca error visible)', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const res = await request(app.server).get(`/track/open/${fakeId}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/image\/gif/)
  })
})

// ── GET /track/click/:trackingId ──────────────────────────────────────────────

describe('GET /track/click/:trackingId — redirect de click', () => {
  let trackingId: string

  beforeEach(async () => {
    const [send] = await db
      .insert(emailSend)
      .values({
        portalId,
        fromEmail: 'test@devduo.com',
        toEmail: 'cliente@test.com',
        subject: 'Test tracking click',
      })
      .returning({ trackingId: emailSend.trackingId })
    trackingId = send!.trackingId
  })

  it('redirige 302 a la URL destino', async () => {
    const destination = 'https://devduo.com/propuesta'
    const res = await request(app.server)
      .get(`/track/click/${trackingId}`)
      .query({ url: destination })
      .redirects(0) // no seguir el redirect

    expect(res.status).toBe(302)
    expect(res.headers.location).toBe(destination)
  })

  it('crea un emailEvent "clicked" en la DB', async () => {
    const destination = 'https://devduo.com/propuesta-click-test'
    await request(app.server)
      .get(`/track/click/${trackingId}`)
      .query({ url: destination })
      .redirects(0)

    await new Promise((r) => setTimeout(r, 50))

    const [sendRow] = await db
      .select({ id: emailSend.id })
      .from(emailSend)
      .where(eq(emailSend.trackingId, trackingId))
      .limit(1)

    const events = await db
      .select()
      .from(emailEvent)
      .where(eq(emailEvent.emailId, sendRow!.id))

    const clickEvent = events.find((e) => e.type === 'clicked')
    expect(clickEvent).toBeDefined()
    expect(clickEvent?.linkUrl).toBe(destination)
  })

  it('URL inválida → redirige a PUBLIC_API_URL base', async () => {
    const res = await request(app.server)
      .get(`/track/click/${trackingId}`)
      .query({ url: 'javascript:alert(1)' })
      .redirects(0)

    expect(res.status).toBe(302)
    // Debe redirigir a la URL base (no al javascript: malicioso)
    expect(res.headers.location).not.toContain('javascript:')
  })

  it('sin url → redirige a PUBLIC_API_URL base', async () => {
    const res = await request(app.server)
      .get(`/track/click/${trackingId}`)
      .redirects(0)

    expect(res.status).toBe(302)
    expect(res.headers.location).toBeTruthy()
  })
})
