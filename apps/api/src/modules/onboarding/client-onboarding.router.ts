import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { Errors } from '../../lib/errors'
import { authenticateClient } from '../../middleware/authenticate-client'
import { CLIENT_SECURITY } from '../../lib/http'
import { saveUpload } from '../files/files.service'
import {
  OnboardingProgressSchema,
  OnboardingSignatureSchema,
  OnboardingBriefSchema,
  OnboardingMaterialsSchema,
  OnboardingMaterialUploadQuerySchema,
} from './onboarding.schema'
import {
  getOnboardingState,
  markStepProgress,
  submitSignature,
  submitBrief,
  submitMaterials,
  uploadMaterialAsset,
  completeOnboarding,
} from './onboarding.service'

const TAG = 'Client Portal'

/**
 * Rutas del CLIENTE — wizard de onboarding post-venta (8 pasos), dentro del
 * Client Portal. El deal objetivo siempre es el deal activo del cliente
 * (resuelto vía client_deal_access). Requieren token de client_account.
 */
export async function clientOnboardingRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticateClient)

  r.get(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Estado del onboarding post-venta',
        description: 'Lazy-create: si el cliente no tiene onboarding para su deal activo, se crea. Incluye los client_asset subidos en el paso de materiales.',
        security: CLIENT_SECURITY,
      },
    },
    async (request) => ok(await getOnboardingState(request.clientAccount!.sub)),
  )

  r.patch(
    '/progress',
    {
      schema: {
        tags: [TAG],
        summary: 'Marcar un paso de orientación como completado (pasos 1-4)',
        security: CLIENT_SECURITY,
        body: OnboardingProgressSchema,
      },
    },
    async (request) => ok(await markStepProgress(request.clientAccount!.sub, request.body.step)),
  )

  r.post(
    '/signature',
    {
      schema: {
        tags: [TAG],
        summary: 'Firmar el onboarding (paso 5)',
        description: 'Checkbox de aceptación + nombre completo tipeado. Guarda timestamp + IP. No re-firmable (409 si ya está firmado).',
        security: CLIENT_SECURITY,
        body: OnboardingSignatureSchema,
      },
    },
    async (request) => ok(await submitSignature(request.clientAccount!.sub, request.body.fullName, request.ip)),
  )

  r.post(
    '/brief',
    {
      schema: {
        tags: [TAG],
        summary: 'Enviar el brief del proyecto (paso 6, 16 preguntas)',
        description: 'Re-submit permitido mientras el onboarding no esté completo (sobreescribe).',
        security: CLIENT_SECURITY,
        body: OnboardingBriefSchema,
      },
    },
    async (request) => ok(await submitBrief(request.clientAccount!.sub, request.body)),
  )

  r.post(
    '/materials',
    {
      schema: {
        tags: [TAG],
        summary: 'Registrar estado de materiales (paso 7)',
        description: 'Los archivos se suben antes con POST /materials/upload; acá solo se persisten los assetIds y el estado por categoría.',
        security: CLIENT_SECURITY,
        body: OnboardingMaterialsSchema,
      },
    },
    async (request) => ok(await submitMaterials(request.clientAccount!.sub, request.body.materials)),
  )

  // Multipart: sube un archivo de materiales y crea el client_asset vinculado
  // al deal activo del cliente. Mismo storage que clientFilesRoutes
  // (files.service.saveUpload). No usa ZodTypeProvider para el body (es
  // multipart, no JSON) — la categoría viaja por querystring para no depender
  // del orden de los campos del form-data.
  app.post(
    '/materials/upload',
    {
      schema: {
        tags: [TAG],
        summary: 'Subir un archivo de materiales (paso 7)',
        security: CLIENT_SECURITY,
      },
    },
    async (request, reply) => {
      const query = OnboardingMaterialUploadQuerySchema.safeParse(request.query)
      if (!query.success) throw Errors.badRequest('Categoría de material inválida', query.error.flatten())

      const file = await request.file()
      if (!file) throw Errors.badRequest('No se envió ningún archivo')

      const saved = await saveUpload(await file.toBuffer(), file.filename, file.mimetype)
      const asset = await uploadMaterialAsset(request.clientAccount!.sub, query.data.category, saved)
      return reply.status(201).send(ok(asset))
    },
  )

  r.post(
    '/complete',
    {
      schema: {
        tags: [TAG],
        summary: 'Completar el onboarding (paso 8)',
        description: 'Gate: exige firma + brief + checklist de materiales enviado (400 con detalle si falta alguno). El checklist de materiales puede tener ítems en `done: false` — el cliente puede no tener, p. ej., manual de marca aún; lo que exige el gate es haber ENVIADO el paso, no que todo esté "listo". Mueve el deal al pipeline Producción / etapa Diagnóstico y notifica al responsable asignado.',
        security: CLIENT_SECURITY,
      },
    },
    async (request) => ok(await completeOnboarding(request.clientAccount!)),
  )
}
