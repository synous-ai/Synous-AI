import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ok } from '../../lib/response'
import { authenticate } from '../../middleware/authenticate'
import { IdParamSchema } from '../../lib/crm-schemas'
import { ADMIN_SECURITY } from '../../lib/http'
import {
  OnboardingSubmitSchema,
  OnboardingResolveQuerySchema,
  OnboardingInviteSchema,
} from './onboarding.schema'
import {
  submitOnboarding,
  listSubmissions,
  getSubmission,
  resolveOnboardingInvite,
  createOnboardingInvite,
} from './onboarding.service'

const TAG = 'Onboarding'

/** Rutas PÚBLICAS — sin auth. El prospecto las usa antes de ser cliente. */
export async function onboardingPublicRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.post(
    '/',
    {
      schema: {
        tags: [TAG],
        summary: 'Enviar el wizard de onboarding (público)',
        description:
          'Recibe las respuestas del wizard pre-venta, calcula el routing (llamada/propuesta) y crea automáticamente lead + deal en el CRM.',
        body: OnboardingSubmitSchema,
      },
      // Anti-spam: cada envío crea contacto+deal+submission+notificación.
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const result = await submitOnboarding(request.body)
      return reply.status(201).send(ok(result))
    },
  )

  // Resuelve un link de invitación (`/onboarding?t=…`) y devuelve los datos del
  // lead para pre-cargar el wizard. Público porque lo consume el formulario
  // antes de cualquier login; el token es la credencial.
  r.get(
    '/resolve',
    {
      schema: {
        tags: [TAG],
        summary: 'Resolver un link de onboarding (público)',
        description:
          'Verifica el token de invitación y devuelve nombre/email/empresa del lead para pre-cargar el wizard.',
        querystring: OnboardingResolveQuerySchema,
      },
    },
    async (request) => ok(await resolveOnboardingInvite(request.query.t)),
  )
}

/** Rutas de ADMIN — review de submissions. Requieren token de hub_user. */
export async function onboardingAdminRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  r.addHook('preHandler', authenticate)

  r.get(
    '/submissions',
    { schema: { tags: [TAG], summary: 'Listar submissions de onboarding', security: ADMIN_SECURITY } },
    async (request) => ok(await listSubmissions(request.hubUser!.portalId)),
  )

  r.get(
    '/submissions/:id',
    {
      schema: {
        tags: [TAG],
        summary: 'Detalle de una submission',
        security: ADMIN_SECURITY,
        params: IdParamSchema,
      },
    },
    async (request) => ok(await getSubmission(request.hubUser!.portalId, request.params.id)),
  )

  // Genera el link tokenizado de onboarding para enviarle a un lead. Este es el
  // disparador del flujo correcto: tras el primer contacto, mandamos este link
  // y la submission queda asociada al lead automáticamente.
  r.post(
    '/invite',
    {
      schema: {
        tags: [TAG],
        summary: 'Generar link de invitación al onboarding para un lead',
        security: ADMIN_SECURITY,
        body: OnboardingInviteSchema,
      },
    },
    async (request) =>
      ok(await createOnboardingInvite(request.hubUser!.portalId, request.body.contactId)),
  )
}
