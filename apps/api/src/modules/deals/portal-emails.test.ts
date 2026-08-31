/**
 * portal-emails.test.ts — Emails automáticos hacia el cliente (Resend).
 *
 * Cubre las dos piezas que faltaban del flujo "pago → cuenta → invitación":
 * el email de bienvenida al activarse el portal y el aviso de novedad.
 *
 * El mailer va MOCKEADO: sin mock, `sendEmail()` sin `RESEND_API_KEY` loguea y
 * retorna, con lo cual los tests solo podrían afirmar "no explotó". Con el mock
 * verificamos lo que importa de verdad: a QUIÉN le llega cada email, con qué
 * asunto, y que no se mande dos veces.
 */
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db, closeDb } from '../../db'
import { contact, deal, clientAccount, clientDealAccess } from '../../db/schema'
import { ensurePortalAndUser, ensurePipeline, type PipelineContext } from '../../test/helpers'
import { changeStage, activateClientPortal } from './stage.service'
import { createDealUpdate } from './project-updates.service'
import { portalLoginUrl, portalHomeUrl } from '../../lib/portal-url'
import { portalWelcomeHtml, portalWelcomeSubject } from './emails/portal-welcome'
import { projectUpdateHtml } from './emails/project-update-published'
import { escParagraphs } from '../../lib/emails/esc'
import { sendEmail } from '../../lib/mailer'

vi.mock('../../lib/mailer', () => ({ sendEmail: vi.fn(async () => {}) }))
const sendEmailMock = vi.mocked(sendEmail)

let portalId: string
let userId: string
let ventas: PipelineContext

beforeAll(async () => {
  const ctx = await ensurePortalAndUser()
  portalId = ctx.portalId
  userId = ctx.userId
  ventas = await ensurePipeline(portalId)
})

beforeEach(() => {
  sendEmailMock.mockClear()
})

afterAll(async () => {
  await closeDb()
})

/** Crea un contacto + deal frescos en la etapa inicial. */
async function seedDeal(tag: string): Promise<{ dealId: string; email: string }> {
  const email = `portal-email-${tag}-${Date.now()}@test.com`
  const [c] = await db
    .insert(contact)
    .values({ portalId, firstName: 'Ana', lastName: 'Cliente', email })
    .returning()
  const [d] = await db
    .insert(deal)
    .values({
      portalId,
      name: `Proyecto ${tag}`,
      pipelineId: ventas.pipelineId,
      stageId: ventas.firstStageId,
      primaryContactId: c!.id,
    })
    .returning()
  return { dealId: d!.id, email }
}

// ─── URLs del portal ─────────────────────────────────────────────────────────

describe('portal-url — base y white-label', () => {
  it('sin brandSlug apunta a /portal/login', () => {
    expect(portalLoginUrl(null).endsWith('/portal/login')).toBe(true)
  })

  it('con brandSlug apunta a /c/<slug>/login', () => {
    expect(portalLoginUrl('acme').endsWith('/c/acme/login')).toBe(true)
  })

  it('el home sin slug es /portal y con slug es /c/<slug>', () => {
    expect(portalHomeUrl(null).endsWith('/portal')).toBe(true)
    expect(portalHomeUrl('acme').endsWith('/c/acme')).toBe(true)
  })

  it('escapa un slug con caracteres raros en vez de romper la URL', () => {
    expect(portalLoginUrl('a b/c')).toContain('/c/a%20b%2Fc/login')
  })

  it('no duplica la barra si la base viene con barra final', () => {
    expect(portalLoginUrl(null)).not.toContain('//portal')
  })
})

// ─── Templates ───────────────────────────────────────────────────────────────

describe('templates — escapado y contenido', () => {
  it('el asunto de bienvenida nombra el proyecto', () => {
    expect(portalWelcomeSubject('Sitio Acme')).toContain('Sitio Acme')
  })

  it('la bienvenida escapa HTML del nombre del deal (no inyecta markup)', () => {
    const html = portalWelcomeHtml({
      firstName: 'Ana',
      dealName: '<script>alert(1)</script>',
      email: 'ana@test.com',
      loginUrl: 'https://app.test/portal/login',
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('la bienvenida incluye el link de login y el email de acceso', () => {
    const html = portalWelcomeHtml({
      firstName: null,
      dealName: 'Proyecto',
      email: 'ana@test.com',
      loginUrl: 'https://app.test/portal/login',
    })
    expect(html).toContain('https://app.test/portal/login')
    expect(html).toContain('ana@test.com')
    // Sin firstName el saludo no queda colgado con "undefined".
    expect(html).not.toContain('undefined')
  })

  it('el aviso de novedad escapa el cuerpo escrito por el equipo', () => {
    const html = projectUpdateHtml({
      firstName: 'Ana',
      dealName: 'Proyecto',
      phaseLabel: 'Diagnóstico',
      body: '<img src=x onerror=alert(1)>',
      portalUrl: 'https://app.test/portal',
    })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img')
    expect(html).toContain('Diagnóstico')
  })

  it('sin fase, el aviso no muestra el bloque de fase', () => {
    const html = projectUpdateHtml({
      firstName: null,
      dealName: 'Proyecto',
      phaseLabel: null,
      body: 'Avanzamos.',
      portalUrl: 'https://app.test/portal',
    })
    expect(html).not.toContain('Fase:')
  })

  it('escParagraphs parte en párrafos y convierte saltos simples en <br />', () => {
    const out = escParagraphs('Uno\nsigue\n\nDos')
    expect(out).toContain('Uno<br />sigue')
    expect(out.match(/<p>/g)).toHaveLength(2)
  })
})

// ─── Activación del portal ───────────────────────────────────────────────────

describe('activateClientPortal — bienvenida e idempotencia', () => {
  it('al ganar el deal crea la cuenta y marca inviteSentAt tras mandar el email', async () => {
    const { dealId, email } = await seedDeal('won')

    await changeStage(portalId, userId, dealId, ventas.wonStageId)

    const [acc] = await db
      .select()
      .from(clientAccount)
      .where(and(eq(clientAccount.portalId, portalId), eq(clientAccount.email, email)))
      .limit(1)

    expect(acc).toBeDefined()
    // El email se manda DESPUÉS del commit; recién ahí se sella inviteSentAt.
    expect(acc!.inviteSentAt).not.toBeNull()

    const access = await db.select().from(clientDealAccess).where(eq(clientDealAccess.dealId, dealId))
    expect(access).toHaveLength(1)

    // Le llegó al cliente, no al equipo, y con el link de login adentro.
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    const sent = sendEmailMock.mock.calls[0]![0]
    expect(sent.to).toBe(email)
    expect(sent.subject).toContain('Proyecto won')
    expect(sent.html).toContain('/portal/login')
  })

  it('ganar un deal ya ganado no re-manda la bienvenida', async () => {
    const { dealId } = await seedDeal('rewon')

    await changeStage(portalId, userId, dealId, ventas.wonStageId)
    expect(sendEmailMock).toHaveBeenCalledTimes(1)

    // Volver a la etapa inicial y re-ganarlo: la cuenta ya existe.
    sendEmailMock.mockClear()
    await changeStage(portalId, userId, dealId, ventas.firstStageId)
    await changeStage(portalId, userId, dealId, ventas.wonStageId)
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('si la cuenta ya existía no devuelve bienvenida (no se re-invita)', async () => {
    const { dealId } = await seedDeal('idem')

    // Primera activación: hay bienvenida pendiente.
    const first = await db.transaction((tx) => activateClientPortal(tx, portalId, dealId))
    expect(first).not.toBeNull()

    // Segunda activación sobre el mismo deal: la cuenta ya existe → null.
    const second = await db.transaction((tx) => activateClientPortal(tx, portalId, dealId))
    expect(second).toBeNull()
  })

  it('un deal sin contacto principal no genera bienvenida ni rompe', async () => {
    const [d] = await db
      .insert(deal)
      .values({
        portalId,
        name: 'Sin contacto',
        pipelineId: ventas.pipelineId,
        stageId: ventas.firstStageId,
      })
      .returning()

    const pending = await db.transaction((tx) => activateClientPortal(tx, portalId, d!.id))
    expect(pending).toBeNull()
  })
})

// ─── Aviso de novedad ────────────────────────────────────────────────────────

describe('createDealUpdate — aviso al cliente', () => {
  it('avisa al cliente con acceso al deal', async () => {
    const { dealId, email } = await seedDeal('update')
    await changeStage(portalId, userId, dealId, ventas.wonStageId)
    sendEmailMock.mockClear()

    await createDealUpdate(portalId, userId, dealId, { body: 'Terminamos el diseño.' })

    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    const sent = sendEmailMock.mock.calls[0]![0]
    expect(sent.to).toBe(email)
    expect(sent.html).toContain('Terminamos el diseño.')
  })

  it('si el deal todavía no tiene portal activo, publica la novedad sin avisar a nadie', async () => {
    const { dealId } = await seedDeal('no-portal')

    const row = await createDealUpdate(portalId, userId, dealId, { body: 'Nota interna temprana.' })

    expect(row.id).toBeDefined()
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('no avisa a una cuenta desactivada', async () => {
    const { dealId, email } = await seedDeal('inactive')
    await changeStage(portalId, userId, dealId, ventas.wonStageId)

    await db
      .update(clientAccount)
      .set({ isActive: false })
      .where(and(eq(clientAccount.portalId, portalId), eq(clientAccount.email, email)))
    sendEmailMock.mockClear()

    await createDealUpdate(portalId, userId, dealId, { body: 'No debería llegar.' })
    expect(sendEmailMock).not.toHaveBeenCalled()
  })
})
