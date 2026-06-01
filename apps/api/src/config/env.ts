import 'dotenv/config'
import { z } from 'zod'

/**
 * Validación de variables de entorno al startup.
 * Si falta algo crítico, la API falla rápido (fail-fast) con un mensaje claro.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),

  ACCESS_TOKEN_SECRET: z.string().min(32, 'ACCESS_TOKEN_SECRET debe tener al menos 32 caracteres'),
  REFRESH_TOKEN_SECRET: z.string().min(32, 'REFRESH_TOKEN_SECRET debe tener al menos 32 caracteres'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),

  // Integraciones — opcionales en Fase 1
  RESEND_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().email().optional(),
  ADMIN_URL: z.string().url().optional(),
  CLIENT_PORTAL_URL: z.string().url().optional(),
  API_URL: z.string().url().optional(),

  // Fathom webhook — opcional; sin secret configurado el webhook responde 401
  FATHOM_WEBHOOK_SECRET: z.string().optional(),

  // URL pública de la API para pixel de tracking (default: localhost en dev)
  PUBLIC_API_URL: z.string().url().default('http://localhost:3001'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env
