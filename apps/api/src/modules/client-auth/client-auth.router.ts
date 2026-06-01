import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { env } from '../../config/env'
import { ok } from '../../lib/response'
import { Errors } from '../../lib/errors'
import { authenticateClient } from '../../middleware/authenticate-client'
import { AcceptInviteSchema, ClientLoginSchema } from './client-auth.schema'
import {
  acceptInvite,
  clientLogin,
  clientRefresh,
  getClientAccount,
} from './client-auth.service'

const CLIENT_REFRESH_COOKIE = 'clientRefreshToken'

const clientRefreshCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production',
  path: '/api/client-auth',
  maxAge: 60 * 60 * 24 * 7, // 7 días
}

export async function clientAuthRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()

  // ─── POST /accept-invite ────────────────────────────────────────────────────
  r.post(
    '/accept-invite',
    {
      schema: {
        tags: ['Client Portal'],
        summary: 'Aceptar invitación al portal del cliente',
        description:
          'Valida el token de invitación, establece la contraseña del cliente y activa la cuenta. ' +
          'Devuelve un access token y setea el refresh token en una cookie httpOnly.',
        body: AcceptInviteSchema,
      },
    },
    async (request, reply) => {
      const { token, password } = request.body
      const result = await acceptInvite(token, password)
      reply.setCookie(CLIENT_REFRESH_COOKIE, result.refreshToken, clientRefreshCookieOptions)
      return ok({ accessToken: result.accessToken, client: result.client })
    },
  )

  // ─── POST /login ────────────────────────────────────────────────────────────
  r.post(
    '/login',
    {
      schema: {
        tags: ['Client Portal'],
        summary: 'Iniciar sesión en el portal del cliente',
        description:
          'Valida email + contraseña del cliente y devuelve un access token. ' +
          'El refresh token se setea en una cookie httpOnly.',
        body: ClientLoginSchema,
      },
    },
    async (request, reply) => {
      const { email, password } = request.body
      const result = await clientLogin(email, password)
      reply.setCookie(CLIENT_REFRESH_COOKIE, result.refreshToken, clientRefreshCookieOptions)
      return ok({ accessToken: result.accessToken, client: result.client })
    },
  )

  // ─── POST /refresh ──────────────────────────────────────────────────────────
  r.post(
    '/refresh',
    {
      schema: {
        tags: ['Client Portal'],
        summary: 'Renovar access token del cliente',
        description:
          'Usa el refresh token de la cookie httpOnly para emitir un nuevo par de tokens. ' +
          'Sólo acepta tokens de tipo client_refresh.',
      },
    },
    async (request, reply) => {
      const token = request.cookies[CLIENT_REFRESH_COOKIE]
      if (!token) throw Errors.unauthorized('No hay sesión activa en el portal del cliente')
      const result = await clientRefresh(token)
      reply.setCookie(CLIENT_REFRESH_COOKIE, result.refreshToken, clientRefreshCookieOptions)
      return ok({ accessToken: result.accessToken, client: result.client })
    },
  )

  // ─── POST /logout ───────────────────────────────────────────────────────────
  r.post(
    '/logout',
    {
      schema: {
        tags: ['Client Portal'],
        summary: 'Cerrar sesión del portal del cliente',
        description: 'Limpia la cookie del refresh token del cliente.',
      },
    },
    async (_request, reply) => {
      reply.clearCookie(CLIENT_REFRESH_COOKIE, { path: '/api/client-auth' })
      return ok({ success: true })
    },
  )

  // ─── GET /me ─────────────────────────────────────────────────────────────────
  r.get(
    '/me',
    {
      schema: {
        tags: ['Client Portal'],
        summary: 'Cliente autenticado actual',
        description:
          'Devuelve los datos públicos del clientAccount a partir del access token. ' +
          'Requiere header Authorization: Bearer <client_access_token>.',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [authenticateClient],
    },
    async (request) => {
      const client = await getClientAccount(request.clientAccount!.sub)
      return ok(client)
    },
  )
}
