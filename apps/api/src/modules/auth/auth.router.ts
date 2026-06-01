import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { env } from '../../config/env'
import { ok } from '../../lib/response'
import { Errors } from '../../lib/errors'
import { authenticate } from '../../middleware/authenticate'
import { LoginSchema } from './auth.schema'
import { login, refresh, getCurrentUser } from './auth.service'

const REFRESH_COOKIE = 'refreshToken'

const refreshCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production',
  path: '/api/auth',
  maxAge: 60 * 60 * 24 * 7, // 7 días
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.post(
    '/login',
    {
      schema: {
        tags: ['Autenticación'],
        summary: 'Iniciar sesión',
        description: 'Valida email + contraseña y devuelve un access token. El refresh token se setea en una cookie httpOnly.',
        body: LoginSchema,
      },
    },
    async (request, reply) => {
      const { email, password } = request.body
      const result = await login(email, password)
      reply.setCookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions)
      return ok({ accessToken: result.accessToken, user: result.user })
    },
  )

  r.post(
    '/refresh',
    {
      schema: {
        tags: ['Autenticación'],
        summary: 'Renovar access token',
        description: 'Usa el refresh token de la cookie httpOnly para emitir un nuevo access token.',
      },
    },
    async (request, reply) => {
      const token = request.cookies[REFRESH_COOKIE]
      if (!token) throw Errors.unauthorized('No hay sesión activa')
      const result = await refresh(token)
      reply.setCookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions)
      return ok({ accessToken: result.accessToken, user: result.user })
    },
  )

  r.post(
    '/logout',
    {
      schema: {
        tags: ['Autenticación'],
        summary: 'Cerrar sesión',
        description: 'Limpia la cookie del refresh token.',
      },
    },
    async (_request, reply) => {
      reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' })
      return ok({ success: true })
    },
  )

  r.get(
    '/me',
    {
      schema: {
        tags: ['Autenticación'],
        summary: 'Usuario autenticado actual',
        description: 'Devuelve los datos del hub_user del access token.',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [authenticate],
    },
    async (request) => {
      const user = await getCurrentUser(request.hubUser!.sub)
      return ok(user)
    },
  )
}
