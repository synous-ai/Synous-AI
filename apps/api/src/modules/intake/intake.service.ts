import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../../db'
import { intakeForm, dealIntake, dealIntakeResponse, deal, intakeForm as form } from '../../db/schema'
import { Errors } from '../../lib/errors'
import { clientDealIds } from '../../lib/portal-access'
import type { CreateIntakeFormDTO, AssignIntakeDTO } from './intake.schema'

type IntakeFormRow = typeof intakeForm.$inferSelect

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// ── Admin: plantillas de formulario ────────────────────
export async function listIntakeForms(portalId: string): Promise<IntakeFormRow[]> {
  return db.select().from(intakeForm).where(eq(intakeForm.portalId, portalId)).orderBy(asc(intakeForm.name))
}

export async function createIntakeForm(portalId: string, input: CreateIntakeFormDTO): Promise<IntakeFormRow> {
  const [row] = await db
    .insert(intakeForm)
    .values({
      portalId,
      name: input.name,
      description: input.description,
      slug: slugify(input.slug ?? input.name),
      fields: input.fields,
    })
    .returning()
  if (!row) throw Errors.internal('No se pudo crear el formulario')
  return row
}

// ── Admin: intakes asignados a un deal ─────────────────
export async function listDealIntakes(portalId: string, dealId: string) {
  return db
    .select({
      id: dealIntake.id,
      title: dealIntake.title,
      status: dealIntake.status,
      dueDate: dealIntake.dueDate,
      completedAt: dealIntake.completedAt,
      formName: form.name,
    })
    .from(dealIntake)
    .innerJoin(deal, and(eq(deal.id, dealIntake.dealId), eq(deal.portalId, portalId)))
    .innerJoin(form, eq(form.id, dealIntake.formId))
    .where(eq(dealIntake.dealId, dealId))
    .orderBy(desc(dealIntake.createdAt))
}

export async function assignIntake(portalId: string, input: AssignIntakeDTO) {
  const [d] = await db.select().from(deal).where(and(eq(deal.id, input.dealId), eq(deal.portalId, portalId))).limit(1)
  if (!d) throw Errors.badRequest('Deal inexistente')
  const [f] = await db.select().from(intakeForm).where(and(eq(intakeForm.id, input.formId), eq(intakeForm.portalId, portalId))).limit(1)
  if (!f) throw Errors.badRequest('Formulario inexistente')
  const [row] = await db
    .insert(dealIntake)
    .values({
      dealId: input.dealId,
      formId: input.formId,
      title: input.title ?? f.name,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
    })
    .returning()
  return row!
}

// ── Cliente: sus intakes + responder ───────────────────
export async function clientIntakes(clientId: string) {
  const ids = await clientDealIds(clientId)
  if (ids.length === 0) return []
  return db
    .select({
      id: dealIntake.id,
      title: dealIntake.title,
      status: dealIntake.status,
      dueDate: dealIntake.dueDate,
      fields: form.fields,
      answers: dealIntakeResponse.answers,
    })
    .from(dealIntake)
    .innerJoin(form, eq(form.id, dealIntake.formId))
    .leftJoin(dealIntakeResponse, eq(dealIntakeResponse.intakeId, dealIntake.id))
    .where(inArray(dealIntake.dealId, ids))
    .orderBy(asc(dealIntake.status))
}

export async function respondIntake(clientId: string, intakeId: string, answers: Record<string, unknown>): Promise<void> {
  const ids = await clientDealIds(clientId)
  const [intake] = await db.select().from(dealIntake).where(eq(dealIntake.id, intakeId)).limit(1)
  if (!intake || !ids.includes(intake.dealId)) throw Errors.notFound('Formulario no encontrado')

  await db
    .insert(dealIntakeResponse)
    .values({ intakeId, clientId, answers })
    .onConflictDoUpdate({ target: dealIntakeResponse.intakeId, set: { answers, clientId, submittedAt: new Date() } })

  await db.update(dealIntake).set({ status: 'completed', completedAt: new Date() }).where(eq(dealIntake.id, intakeId))
}
