import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticateClient } from '../../middleware/authenticate-client'
import { CLIENT_SECURITY } from '../../lib/http'
import {
  OnboardingProgressSchema,
  OnboardingSignatureSchema,
  OnboardingBriefSchema,
  OnboardingMaterialsSchema,
  OnboardingMaterialAssetSchema,
  OnboardingBriefDraftSchema,
  OnboardingMaterialsDraftSchema,
} from './onboarding.schema'
import {
  getOnboardingState,
  markStepProgress,
  submitSignature,
  submitBrief,
  saveBriefDraft,
  submitMaterials,
  saveMaterialsDraft,
  attachMaterialAsset,
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

  r.patch(
    '/brief/draft',
    {
      schema: {
        tags: [TAG],
        summary: 'Guardar un borrador parcial del brief (paso 6)',
        description: 'Se llama al avanzar cada bloque del paso 6 para que lo tipeado no se pierda en un reload. No valida las 16 respuestas ni marca el paso como completo — eso lo hace POST /brief.',
        security: CLIENT_SECURITY,
        body: OnboardingBriefDraftSchema,
      },
    },
    async (request) => ok(await saveBriefDraft(request.clientAccount!.sub, request.body)),
  )

  r.post(
    '/materials',
    {
      schema: {
        tags: [TAG],
        summary: 'Registrar estado de materiales (paso 7)',
        description: 'Los archivos se vinculan antes con POST /materials/assets; acá solo se persisten los assetIds y el estado por categoría.',
        security: CLIENT_SECURITY,
        body: OnboardingMaterialsSchema,
      },
    },
    async (request) => ok(await submitMaterials(request.clientAccount!.sub, request.body.materials)),
  )

  r.patch(
    '/materials/draft',
    {
      schema: {
        tags: [TAG],
        summary: 'Guardar un borrador parcial del checklist de materiales (paso 7)',
        description: 'Se llama al tildar una categoría, escribir una nota o terminar una subida, para que ese estado no viva solo en memoria hasta "Continuar". Acepta solo las categorías que cambiaron y NO marca el paso como completo — eso lo hace POST /materials.',
        security: CLIENT_SECURITY,
        body: OnboardingMaterialsDraftSchema,
      },
    },
    async (request) => ok(await saveMaterialsDraft(request.clientAccount!.sub, request.body.materials)),
  )

  // El archivo ya está subido (POST /api/client/uploads + subida directa): acá
  // solo se reclama la key y se crea el client_asset del deal activo.
  r.post(
    '/materials/assets',
    {
      schema: {
        tags: [TAG],
        summary: 'Vincular un archivo subido a los materiales (paso 7)',
        security: CLIENT_SECURITY,
        body: OnboardingMaterialAssetSchema,
      },
    },
    async (request, reply) => {
      const asset = await attachMaterialAsset(request.clientAccount!.sub, request.body.category, request.body.storageKey)
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
