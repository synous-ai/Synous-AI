import { and, asc, eq, sql } from 'drizzle-orm'
import { db, closeDb } from './index'
import {
  clientAccount,
  clientDealAccess,
  hubUser,
  deliverable,
  intakeForm,
  dealIntake,
  dealIntakeResponse,
  changeRequest,
  changeRequestItem,
  changeRequestHistory,
  changeRequestComment,
  invoice,
  invoiceItem,
  payment,
  document,
  notification,
} from './schema'

/**
 * Seed idempotente de datos REALISTAS para UN cliente puntual del Client Portal.
 *
 * Objetivo: poblar entregables, formularios de intake, solicitudes de cambio,
 * facturas, documentos y notificaciones de un deal ya existente para que las
 * seis pestañas del portal (Inicio, Entregables, Formularios, Solicitudes,
 * Facturas, Documentos) muestren contenido con sentido de negocio.
 *
 * Idempotencia: como la mayoría de estas tablas no tienen columna `custom`
 * (jsonb) para marcar filas de seed, cada bloque busca primero por un campo
 * naturalmente único dentro del deal (título, slug, notas) y sólo inserta si
 * no existe. Volver a correr el script no debe duplicar filas.
 *
 * Correr con:  pnpm --filter api db:seed:portal-demo
 * Cliente por defecto: jeremiastomasingla@gmail.com (override: primer argv o SEED_CLIENT_EMAIL)
 */

const CLIENT_EMAIL = process.argv[2] ?? process.env.SEED_CLIENT_EMAIL ?? 'jeremiastomasingla@gmail.com'
const PROJECT_LABEL = 'Sitio web corporativo + tienda online'

/** Helper de fechas relativas a "hoy" para que el seed nunca quede con fechas viejas. */
function daysAgo(n: number): Date {
  const d = new Date()
  d.setUTCHours(12, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - n)
  return d
}
function daysFromNow(n: number): Date {
  return daysAgo(-n)
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

async function main(): Promise<void> {
  const [client] = await db.select().from(clientAccount).where(eq(clientAccount.email, CLIENT_EMAIL)).limit(1)
  if (!client) {
    throw new Error(`No existe client_account con email "${CLIENT_EMAIL}". Creá el cliente primero (seed base o admin).`)
  }

  const [access] = await db
    .select()
    .from(clientDealAccess)
    .where(eq(clientDealAccess.clientId, client.id))
    .limit(1)
  if (!access) {
    throw new Error(`El cliente "${CLIENT_EMAIL}" no tiene acceso a ningún deal (client_deal_access vacío).`)
  }

  const dealId = access.dealId
  const portalId = client.portalId
  const clientId = client.id

  // Autor de los registros "de la agencia": cualquier hub_user activo del portal.
  // No hardcodeamos el email (el seed base usa @devduo.com y esta DB puede tener @nous.com).
  // Si no hay ninguno, cortamos: un autor null viola change_request_comment_author_check.
  const [author] = await db
    .select({ id: hubUser.id })
    .from(hubUser)
    .where(and(eq(hubUser.portalId, portalId), eq(hubUser.isActive, true)))
    .orderBy(asc(hubUser.createdAt))
    .limit(1)
  if (!author) {
    throw new Error(`No hay hub_user activo en el portal ${portalId}. Corré primero \`pnpm --filter api db:seed\`.`)
  }
  const createdBy = author.id

  console.log(`Seed portal-demo → cliente ${CLIENT_EMAIL} (id ${clientId}), deal ${dealId}, portal ${portalId}`)

  await db.transaction(async (tx) => {
    // ── 1. Entregables ────────────────────────────────────────────────────
    const deliverables = [
      {
        title: 'Diseño UI — Home y catálogo (Figma)',
        description: 'Propuesta visual de la home y las páginas de catálogo de productos.',
        type: 'design',
        url: 'https://www.figma.com/file/devduo-demo/home-catalogo',
        version: 2,
        status: 'approved' as const,
        feedback: null,
        createdAt: daysAgo(65),
        reviewedAt: daysAgo(60),
      },
      {
        title: 'Prototipo interactivo — Checkout',
        description: 'Flujo de compra navegable: carrito, datos de envío y confirmación.',
        type: 'prototype',
        url: 'https://www.figma.com/proto/devduo-demo/checkout',
        version: 1,
        status: 'approved' as const,
        feedback: null,
        createdAt: daysAgo(50),
        reviewedAt: daysAgo(45),
      },
      {
        title: 'Home — Ajustes de branding v2',
        description: 'Segunda vuelta de diseño de la home aplicando el manual de marca.',
        type: 'design',
        url: 'https://www.figma.com/file/devduo-demo/home-branding-v2',
        version: 2,
        status: 'changes_requested' as const,
        feedback:
          'Falta actualizar la paleta de colores según el manual de marca y agrandar el logo en el header.',
        createdAt: daysAgo(15),
        reviewedAt: daysAgo(12),
      },
      {
        title: 'Staging — Tienda online (ambiente de pruebas)',
        description: 'Ambiente de staging con el catálogo, carrito y checkout integrados.',
        type: 'staging',
        url: 'https://staging.clienteweb.devduo.app',
        version: 1,
        status: 'pending_review' as const,
        feedback: null,
        createdAt: daysAgo(10),
        reviewedAt: null,
      },
      {
        title: 'Entrega final — Sitio productivo',
        description: 'Build final desplegado en el dominio productivo del cliente.',
        type: 'final',
        url: 'https://www.clienteweb.com.ar',
        version: 1,
        status: 'pending_review' as const,
        feedback: null,
        createdAt: daysAgo(3),
        reviewedAt: null,
      },
    ]

    for (const d of deliverables) {
      const [existing] = await tx
        .select({ id: deliverable.id })
        .from(deliverable)
        .where(and(eq(deliverable.dealId, dealId), eq(deliverable.title, d.title)))
        .limit(1)
      if (existing) continue

      await tx.insert(deliverable).values({
        dealId,
        title: d.title,
        description: d.description,
        type: d.type,
        url: d.url,
        version: d.version,
        status: d.status,
        feedback: d.feedback,
        reviewedBy: d.reviewedAt ? clientId : null,
        reviewedAt: d.reviewedAt,
        createdBy,
        createdAt: d.createdAt,
      })
    }
    console.log(`  ✓ deliverables (${deliverables.length} objetivo)`)

    // ── 2. Formularios de intake ──────────────────────────────────────────
    async function upsertIntakeForm(
      slug: string,
      name: string,
      description: string,
      fields: Array<{ name: string; label: string; type: string }>,
    ): Promise<typeof intakeForm.$inferSelect> {
      const [existing] = await tx
        .select()
        .from(intakeForm)
        .where(and(eq(intakeForm.portalId, portalId), eq(intakeForm.slug, slug)))
        .limit(1)
      if (existing) return existing
      const [row] = await tx.insert(intakeForm).values({ portalId, name, description, slug, fields }).returning()
      return row!
    }

    const briefForm = await upsertIntakeForm(
      'brief-proyecto-web',
      'Brief de proyecto — Sitio web corporativo',
      'Preguntas iniciales para entender objetivos, público y referencias del proyecto.',
      [
        { name: 'objetivoPrincipal', label: '¿Cuál es el objetivo principal del sitio?', type: 'textarea' },
        { name: 'publicoObjetivo', label: 'Describí tu público objetivo', type: 'textarea' },
        { name: 'referenciasDiseno', label: 'Sitios de referencia que te gusten (URLs)', type: 'text' },
        { name: 'contactoTecnico', label: 'Email de contacto técnico', type: 'email' },
      ],
    )

    const accesosForm = await upsertIntakeForm(
      'accesos-hosting',
      'Accesos y datos de hosting',
      'Datos necesarios para configurar el dominio y desplegar el sitio.',
      [
        { name: 'proveedorHosting', label: 'Proveedor de hosting actual', type: 'text' },
        { name: 'dominioPrincipal', label: 'Dominio principal', type: 'text' },
        { name: 'usuarioFTP', label: 'Usuario de acceso FTP/cPanel', type: 'text' },
        { name: 'notasAdicionales', label: 'Notas adicionales', type: 'textarea' },
      ],
    )

    async function upsertDealIntake(
      form: typeof intakeForm.$inferSelect,
      title: string,
      status: 'pending' | 'in_progress' | 'completed',
      dueDate: Date,
      completedAt: Date | null,
    ): Promise<typeof dealIntake.$inferSelect> {
      const [existing] = await tx
        .select()
        .from(dealIntake)
        .where(and(eq(dealIntake.dealId, dealId), eq(dealIntake.title, title)))
        .limit(1)
      if (existing) return existing
      const [row] = await tx
        .insert(dealIntake)
        .values({ dealId, formId: form.id, title, status, dueDate, completedAt })
        .returning()
      return row!
    }

    const briefIntake = await upsertDealIntake(
      briefForm,
      `Brief de proyecto — ${PROJECT_LABEL}`,
      'completed',
      daysAgo(74),
      daysAgo(70),
    )
    const [briefResponse] = await tx
      .select({ id: dealIntakeResponse.id })
      .from(dealIntakeResponse)
      .where(eq(dealIntakeResponse.intakeId, briefIntake.id))
      .limit(1)
    if (!briefResponse) {
      await tx.insert(dealIntakeResponse).values({
        intakeId: briefIntake.id,
        clientId,
        answers: {
          objetivoPrincipal:
            'Renovar la imagen de marca online y habilitar venta directa de nuestros productos a través de una tienda propia.',
          publicoObjetivo: 'Clientes B2C entre 25 y 45 años, principalmente en Argentina, que compran por mobile.',
          referenciasDiseno: 'https://www.mercadolibre.com.ar, https://www.tiendanube.com.ar',
          contactoTecnico: 'jeremiastomasingla@gmail.com',
        },
        submittedAt: daysAgo(70),
      })
    }

    await upsertDealIntake(accesosForm, 'Accesos y datos de hosting', 'pending', daysFromNow(5), null)
    console.log('  ✓ intake forms (2 objetivo)')

    // ── 3. Change requests ────────────────────────────────────────────────
    async function upsertChangeRequest(input: {
      title: string
      description: string
      status: string
      totalAmount: string
      timelineImpactDays: number
      newDeliveryDate: string | null
      createdAt: Date
      approvedAt: Date | null
      items: Array<{ description: string; hours: string; unitPrice: string }>
      history: Array<{ fromStatus: string | null; toStatus: string; comment?: string; byUser?: boolean; changedAt: Date }>
      comments: Array<{ body: string; byClient: boolean; createdAt: Date }>
    }): Promise<void> {
      const [existing] = await tx
        .select({ id: changeRequest.id })
        .from(changeRequest)
        .where(and(eq(changeRequest.dealId, dealId), eq(changeRequest.title, input.title)))
        .limit(1)
      if (existing) return

      const [numRow] = await tx
        .select({ next: sql<number>`coalesce(max(${changeRequest.number}), 0) + 1` })
        .from(changeRequest)
        .where(eq(changeRequest.dealId, dealId))
      const number = numRow?.next ?? 1

      const [cr] = await tx
        .insert(changeRequest)
        .values({
          portalId,
          dealId,
          number,
          title: input.title,
          description: input.description,
          origin: 'agency',
          status: input.status,
          totalAmount: input.totalAmount,
          timelineImpactDays: input.timelineImpactDays,
          newDeliveryDate: input.newDeliveryDate,
          approvedAt: input.approvedAt,
          approvedBy: input.approvedAt ? clientId : null,
          createdBy,
          createdAt: input.createdAt,
          updatedAt: input.createdAt,
        })
        .returning()
      if (!cr) throw new Error(`No se pudo crear la CR "${input.title}"`)

      if (input.items.length > 0) {
        await tx.insert(changeRequestItem).values(
          input.items.map((it) => ({
            changeRequestId: cr.id,
            description: it.description,
            hours: it.hours,
            unitPrice: it.unitPrice,
            // subtotal es columna generada (unit_price * quantity): la cantidad SON las horas.
            quantity: it.hours,
          })),
        )
      }

      for (const h of input.history) {
        await tx.insert(changeRequestHistory).values({
          changeRequestId: cr.id,
          fromStatus: h.fromStatus,
          toStatus: h.toStatus,
          comment: h.comment,
          changedByUser: h.byUser ? createdBy : null,
          changedByClient: h.byUser ? null : clientId,
          changedAt: h.changedAt,
        })
      }

      for (const c of input.comments) {
        await tx.insert(changeRequestComment).values({
          changeRequestId: cr.id,
          body: c.body,
          authorUser: c.byClient ? null : createdBy,
          authorClient: c.byClient ? clientId : null,
          createdAt: c.createdAt,
        })
      }
    }

    await upsertChangeRequest({
      title: 'Agregar pasarela de pago con Mercado Pago',
      description:
        'Integrar Mercado Pago Checkout Pro como método de pago adicional en el checkout de la tienda.',
      status: 'approved',
      totalAmount: '650.00',
      timelineImpactDays: 5,
      newDeliveryDate: isoDate(daysAgo(30)),
      createdAt: daysAgo(40),
      approvedAt: daysAgo(35),
      items: [
        { description: 'Integración API Mercado Pago Checkout Pro', hours: '9.00', unitPrice: '50.00' },
        { description: 'Testing del flujo de pago en staging', hours: '4.00', unitPrice: '50.00' },
      ],
      history: [
        { fromStatus: 'draft', toStatus: 'sent', byUser: true, changedAt: daysAgo(39) },
        { fromStatus: 'sent', toStatus: 'approved', byUser: false, comment: 'Dale, adelante con Mercado Pago.', changedAt: daysAgo(35) },
      ],
      comments: [
        { body: 'Les mandamos el presupuesto para sumar Mercado Pago como medio de pago.', byClient: false, createdAt: daysAgo(39) },
        { body: 'Perfecto, aprobado. ¿Cuándo lo tendrían listo?', byClient: true, createdAt: daysAgo(36) },
      ],
    })

    await upsertChangeRequest({
      title: 'Sumar sección de testimonios y blog',
      description: 'Agregar una sección de testimonios de clientes en la home y un blog simple para novedades.',
      status: 'sent',
      totalAmount: '380.00',
      timelineImpactDays: 3,
      newDeliveryDate: null,
      createdAt: daysAgo(8),
      approvedAt: null,
      items: [
        { description: 'Sección de testimonios en home', hours: '5.00', unitPrice: '50.00' },
        { description: 'Blog básico (listado + detalle de posts)', hours: '2.60', unitPrice: '50.00' },
      ],
      history: [{ fromStatus: 'draft', toStatus: 'sent', byUser: true, changedAt: daysAgo(7) }],
      comments: [
        {
          body: 'Te dejamos esta propuesta para sumar testimonios y un blog simple. Quedamos atentos a tu decisión.',
          byClient: false,
          createdAt: daysAgo(7),
        },
      ],
    })

    await upsertChangeRequest({
      title: 'Rediseño del menú de navegación mobile',
      description: 'El menú actual en mobile no muestra bien las categorías del catálogo. Proponemos un rediseño.',
      status: 'negotiating',
      totalAmount: '210.00',
      timelineImpactDays: 2,
      newDeliveryDate: null,
      createdAt: daysAgo(6),
      approvedAt: null,
      items: [{ description: 'Rediseño e implementación de menú mobile', hours: '4.20', unitPrice: '50.00' }],
      history: [
        { fromStatus: 'draft', toStatus: 'sent', byUser: true, changedAt: daysAgo(5) },
        { fromStatus: 'sent', toStatus: 'negotiating', byUser: false, comment: 'Nos parece caro para el alcance, ¿se puede ajustar?', changedAt: daysAgo(3) },
      ],
      comments: [
        { body: 'Nos parece un poco elevado el costo para ese cambio, ¿podemos verlo?', byClient: true, createdAt: daysAgo(3) },
        { body: 'Claro, te paso una versión acotada solo con el ajuste de categorías principales.', byClient: false, createdAt: daysAgo(2) },
      ],
    })
    console.log('  ✓ change requests (3 objetivo)')

    // ── 4. Facturas ───────────────────────────────────────────────────────
    async function upsertInvoice(input: {
      notes: string
      status: string
      issueDate: string
      dueDate: string
      items: Array<{ description: string; quantity: string; unitPrice: string }>
      paidAt: Date | null
    }): Promise<void> {
      const [existing] = await tx
        .select({ id: invoice.id })
        .from(invoice)
        .where(and(eq(invoice.dealId, dealId), eq(invoice.notes, input.notes), eq(invoice.archived, false)))
        .limit(1)
      if (existing) return

      const subtotal = input.items.reduce((acc, it) => acc + Number(it.quantity) * Number(it.unitPrice), 0)

      const [numRow] = await tx
        .select({ next: sql<number>`coalesce(max(${invoice.number}), 0) + 1` })
        .from(invoice)
        .where(eq(invoice.portalId, portalId))
      const number = numRow?.next ?? 1

      const [inv] = await tx
        .insert(invoice)
        .values({
          portalId,
          number,
          dealId,
          status: input.status,
          issueDate: input.issueDate,
          dueDate: input.dueDate,
          subtotal: subtotal.toFixed(2),
          tax: '0.00',
          total: subtotal.toFixed(2),
          currency: 'USD',
          exchangeRate: '1',
          amountBase: subtotal.toFixed(2),
          notes: input.notes,
          createdBy,
        })
        .returning()
      if (!inv) throw new Error(`No se pudo crear la factura "${input.notes}"`)

      await tx.insert(invoiceItem).values(
        input.items.map((it) => ({
          invoiceId: inv.id,
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        })),
      )

      if (input.paidAt) {
        await tx.insert(payment).values({
          portalId,
          invoiceId: inv.id,
          amount: subtotal.toFixed(2),
          currency: 'USD',
          exchangeRate: '1',
          amountBase: subtotal.toFixed(2),
          method: 'transfer',
          paidAt: input.paidAt,
          reference: `Transferencia — ${PROJECT_LABEL}`,
          createdBy,
        })
      }
    }

    await upsertInvoice({
      notes: `[SEED:portal-demo] Seña 50% — ${PROJECT_LABEL}`,
      status: 'paid',
      issueDate: isoDate(daysAgo(70)),
      dueDate: isoDate(daysAgo(55)),
      items: [{ description: `Seña 50% — desarrollo ${PROJECT_LABEL}`, quantity: '1', unitPrice: '2500.00' }],
      paidAt: daysAgo(58),
    })

    await upsertInvoice({
      notes: `[SEED:portal-demo] Segunda cuota 30% — ${PROJECT_LABEL}`,
      status: 'sent',
      issueDate: isoDate(daysAgo(10)),
      dueDate: isoDate(daysFromNow(5)),
      items: [{ description: `Segunda cuota 30% — ${PROJECT_LABEL}`, quantity: '1', unitPrice: '1500.00' }],
      paidAt: null,
    })

    await upsertInvoice({
      notes: '[SEED:portal-demo] Cargo adicional — CR #1 Mercado Pago',
      status: 'overdue',
      issueDate: isoDate(daysAgo(35)),
      dueDate: isoDate(daysAgo(20)),
      items: [{ description: 'Integración de pasarela Mercado Pago (CR aprobada)', quantity: '1', unitPrice: '650.00' }],
      paidAt: null,
    })
    console.log('  ✓ invoices (3 objetivo)')

    // ── 5. Documentos ─────────────────────────────────────────────────────
    // NOTA: storageKey son placeholders que NO existen en uploads/ (ni en R2);
    // la descarga desde el portal devolverá 404. Ver reporte para más detalle.
    const documents = [
      {
        name: 'Propuesta comercial — Sitio + Tienda online',
        type: 'proposal',
        storageKey: 'seed-placeholder/propuesta-comercial.pdf',
        signedAt: null as Date | null,
        createdAt: daysAgo(80),
      },
      {
        name: 'Contrato de servicios — Sitio web corporativo',
        type: 'contract',
        storageKey: 'seed-placeholder/contrato-servicios.pdf',
        signedAt: daysAgo(75),
        createdAt: daysAgo(75),
      },
      {
        name: 'Brief inicial del proyecto',
        type: 'other',
        storageKey: 'seed-placeholder/brief-inicial.pdf',
        signedAt: null,
        createdAt: daysAgo(74),
      },
      {
        name: 'Mockups de diseño — Home y checkout',
        type: 'other',
        storageKey: 'seed-placeholder/mockups-diseno.pdf',
        signedAt: null,
        createdAt: daysAgo(60),
      },
    ]

    for (const doc of documents) {
      const [existing] = await tx
        .select({ id: document.id })
        .from(document)
        .where(and(eq(document.dealId, dealId), eq(document.name, doc.name)))
        .limit(1)
      if (existing) continue
      await tx.insert(document).values({
        portalId,
        dealId,
        name: doc.name,
        type: doc.type,
        source: 'manual',
        storageKey: doc.storageKey,
        signedAt: doc.signedAt,
        signedBy: doc.signedAt ? clientId : null,
        createdBy,
        createdAt: doc.createdAt,
      })
    }
    console.log(`  ✓ documents (${documents.length} objetivo)`)

    // ── 6. Notificaciones para el cliente ────────────────────────────────
    const notifications = [
      {
        type: 'deliverable_review',
        title: 'Nuevo entregable para revisar: Home — Ajustes de branding v2',
        entityType: 'deliverable',
        createdAt: daysAgo(15),
        readAt: null as Date | null,
      },
      {
        type: 'cr_sent',
        title: 'Nueva solicitud de cambio: Sumar sección de testimonios y blog',
        entityType: 'change_request',
        createdAt: daysAgo(7),
        readAt: null,
      },
      {
        type: 'invoice_overdue',
        title: 'Factura vencida — Cargo adicional CR Mercado Pago',
        entityType: 'invoice',
        createdAt: daysAgo(19),
        readAt: daysAgo(18),
      },
      {
        type: 'intake_assigned',
        title: 'Nuevo formulario asignado: Accesos y datos de hosting',
        entityType: 'deal_intake',
        createdAt: daysAgo(20),
        readAt: daysAgo(19),
      },
    ]

    for (const n of notifications) {
      const [existing] = await tx
        .select({ id: notification.id })
        .from(notification)
        .where(and(eq(notification.clientId, clientId), eq(notification.title, n.title)))
        .limit(1)
      if (existing) continue
      await tx.insert(notification).values({
        portalId,
        clientId,
        entityType: n.entityType,
        type: n.type,
        title: n.title,
        createdAt: n.createdAt,
        readAt: n.readAt,
      })
    }
    console.log(`  ✓ notifications (${notifications.length} objetivo)`)
  })

  console.log('Seed portal-demo completo.')
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('Seed portal-demo falló:', err)
    await closeDb()
    process.exit(1)
  })
