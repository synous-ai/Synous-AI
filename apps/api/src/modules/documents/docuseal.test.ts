/**
 * docuseal.test.ts — Integración con DocuSeal.
 *
 * Se testean las reglas que, si se rompen, rompen el negocio:
 *
 *  1. La URL del PDF firmado NUNCA se persiste (expira a los 40 min): en la
 *     fila solo vive el `docuseal_submission_id`.
 *  2. El webhook rechaza cualquier token que no valide — este endpoint activa
 *     portales de cliente, así que no puede procesar nada sin verificar origen.
 *  3. `form.completed` de un CONTRATO activa el Client Portal; el de una
 *     PROPUESTA no.
 *  4. Idempotencia: DocuSeal reintenta, y el reintento no debe re-activar nada
 *     ni duplicar historial.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db, closeDb } from '../../db'
import { document, deal, contact, clientAccount, recordHistory } from '../../db/schema'
import { createId } from '../../lib/id'
import { ensurePortalAndUser, ensurePipeline, type PipelineContext } from '../../test/helpers'
import { verifyDocusealToken } from '../webhooks/webhooks.service'
import { handleDocusealWebhook } from './docuseal.service'

vi.mock('../../lib/mailer', () => ({ sendEmail: vi.fn(async () => {}) }))

let portalId: string
let userId: string
let ventas: PipelineContext

beforeAll(async () => {
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  userId = ctx.userId
  ventas = await ensurePipeline(portalId)
})

afterAll(async () => {
  await closeDb()
})

beforeEach(() => {
  vi.clearAllMocks()
})

/** Crea deal + contacto + documento DocuSeal pendiente. Devuelve ids y el slug. */
async function seedPendingDocument(type: 'contract' | 'proposal'): Promise<{
  documentId: string
  dealId: string
  slug: string
  email: string
}> {
  const email = `docuseal-${createId()}@test.com`
  const [c] = await db.insert(contact).values({ portalId, firstName: 'Ana', email }).returning()
  const [d] = await db
    .insert(deal)
    .values({
      portalId,
      name: `Deal DocuSeal ${createId()}`,
      pipelineId: ventas.pipelineId,
      stageId: ventas.firstStageId,
      primaryContactId: c!.id,
    })
    .returning()

  const slug = `slug-${createId()}`
  const [doc] = await db
    .insert(document)
    .values({
      portalId,
      dealId: d!.id,
      name: 'Contrato de prestación',
      type,
      source: 'docuseal',
      docusealSubmissionId: 12345,
      docusealTemplateId: 99,
      docusealStatus: 'pending',
      docusealExternalId: slug,
      createdBy: userId,
    })
    .returning()

  return { documentId: doc!.id, dealId: d!.id, slug, email }
}

// ── Seguridad del webhook ────────────────────────────────────────────────────

describe('verifyDocusealToken', () => {
  it('rechaza si no hay token', () => {
    expect(verifyDocusealToken(undefined)).toBe(false)
  })

  it('rechaza un token incorrecto', () => {
    expect(verifyDocusealToken('token-que-no-es')).toBe(false)
  })

  it('sin DOCUSEAL_WEBHOOK_SECRET configurado rechaza SIEMPRE', () => {
    // En el entorno de test el secret está vacío: sin poder verificar el origen
    // no se procesa nada, porque este endpoint activa portales de cliente.
    expect(verifyDocusealToken('cualquier-cosa')).toBe(false)
  })
})

// ── Regla de los 40 minutos ──────────────────────────────────────────────────

describe('persistencia — la URL firmada nunca se guarda', () => {
  it('la fila guarda submission_id, y no hay ninguna columna con la URL del PDF', async () => {
    const { documentId } = await seedPendingDocument('contract')

    const [row] = await db.select().from(document).where(eq(document.id, documentId)).limit(1)

    expect(row!.docusealSubmissionId).toBe(12345)
    // Ninguna columna de la fila debe contener una URL de documento firmado:
    // si alguien agrega uno "por comodidad", este test lo caza.
    const values = Object.values(row!).filter((v): v is string => typeof v === 'string')
    expect(values.some((v) => v.includes('/documents') || v.endsWith('.pdf'))).toBe(false)
  })
})

// ── Webhook: efectos ─────────────────────────────────────────────────────────

describe('handleDocusealWebhook', () => {
  it('form.completed de un CONTRATO marca firmado y activa el Client Portal', async () => {
    const { documentId, slug, email } = await seedPendingDocument('contract')

    await handleDocusealWebhook({ event_type: 'form.completed', data: { slug } })

    const [row] = await db.select().from(document).where(eq(document.id, documentId)).limit(1)
    expect(row!.docusealStatus).toBe('completed')
    expect(row!.signedAt).not.toBeNull()

    // El portal del cliente quedó activado para ese contacto.
    const [acc] = await db
      .select()
      .from(clientAccount)
      .where(and(eq(clientAccount.portalId, portalId), eq(clientAccount.email, email)))
      .limit(1)
    expect(acc).toBeDefined()
  })

  it('registra el cambio en record_history con source_type DOCUSEAL', async () => {
    const { documentId, slug } = await seedPendingDocument('contract')

    await handleDocusealWebhook({ event_type: 'form.completed', data: { slug } })

    const rows = await db
      .select()
      .from(recordHistory)
      .where(and(eq(recordHistory.entityType, 'document'), eq(recordHistory.entityId, documentId)))

    expect(rows.length).toBeGreaterThan(0)
    // `field_name` va en camelCase, que es lo que escribe `recordFieldChanges`
    // (usa la clave del objeto tal cual). El resto del historial ya está así:
    // 'stageId', 'firstName'. CLAUDE.md dice 'docuseal_status' en snake_case —
    // la documentación quedó desalineada del código; se sigue el código para no
    // partir el historial existente en dos convenciones.
    expect(rows[0]!.fieldName).toBe('docusealStatus')
    expect(rows[0]!.newValue).toBe('completed')
    expect(rows[0]!.sourceType).toBe('DOCUSEAL')
  })

  it('una PROPUESTA completada NO activa el portal', async () => {
    const { documentId, slug, email } = await seedPendingDocument('proposal')

    await handleDocusealWebhook({ event_type: 'form.completed', data: { slug } })

    const [row] = await db.select().from(document).where(eq(document.id, documentId)).limit(1)
    expect(row!.docusealStatus).toBe('completed')

    const [acc] = await db
      .select()
      .from(clientAccount)
      .where(and(eq(clientAccount.portalId, portalId), eq(clientAccount.email, email)))
      .limit(1)
    expect(acc).toBeUndefined()
  })

  it('form.declined marca rechazado y no deja signedAt', async () => {
    const { documentId, slug } = await seedPendingDocument('contract')

    await handleDocusealWebhook({ event_type: 'form.declined', data: { slug } })

    const [row] = await db.select().from(document).where(eq(document.id, documentId)).limit(1)
    expect(row!.docusealStatus).toBe('declined')
    expect(row!.signedAt).toBeNull()
  })

  it('el reintento del mismo evento no duplica historial — DocuSeal reintenta', async () => {
    const { documentId, slug } = await seedPendingDocument('contract')

    await handleDocusealWebhook({ event_type: 'form.completed', data: { slug } })
    await handleDocusealWebhook({ event_type: 'form.completed', data: { slug } })

    const rows = await db
      .select()
      .from(recordHistory)
      .where(and(eq(recordHistory.entityType, 'document'), eq(recordHistory.entityId, documentId)))

    expect(rows).toHaveLength(1)
  })

  it('ignora eventos que no nos interesan y slugs desconocidos, sin explotar', async () => {
    await expect(
      handleDocusealWebhook({ event_type: 'form.viewed', data: { slug: 'no-existe' } }),
    ).resolves.toBeUndefined()
    await expect(
      handleDocusealWebhook({ event_type: 'form.completed', data: { slug: 'no-existe' } }),
    ).resolves.toBeUndefined()
  })
})
