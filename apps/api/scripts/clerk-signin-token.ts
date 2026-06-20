/**
 * clerk-signin-token.ts — genera un Clerk Sign-in Token para un usuario.
 *
 * Uso (dev/testing E2E): `tsx scripts/clerk-signin-token.ts <clerkUserId>`
 *
 * El sign-in token es auth iniciada por el backend: permite iniciar sesión sin
 * password ni verificación de nuevo-dispositivo (OTP). Se consume navegando a
 * la app con `?__clerk_ticket=<token>`. TTL corto.
 *
 * NO usar en producción para nada que no sea testing controlado.
 */
import { createClerkClient } from '@clerk/backend'
import { env } from '../src/config/env'

const userId = process.argv[2]
if (!userId) {
  console.error('Falta el clerkUserId. Uso: tsx scripts/clerk-signin-token.ts <clerkUserId>')
  process.exit(1)
}

const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY })
const tok = await clerk.signInTokens.createSignInToken({ userId, expiresInSeconds: 600 })
console.log('TOKEN=' + tok.token)
console.log('URL=' + (tok.url ?? ''))
