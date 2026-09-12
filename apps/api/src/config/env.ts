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

  // Secreto para firmar tokens de NEGOCIO (no de sesión): tokens de booking
  // (cancel/reschedule) en calendar.service.ts y el token de onboarding. La auth
  // de sesión (admin y cliente) es 100% Clerk — no usa este secreto.
  ACCESS_TOKEN_SECRET: z.string().min(32, 'ACCESS_TOKEN_SECRET debe tener al menos 32 caracteres'),

  // Integraciones — opcionales en Fase 1
  RESEND_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().email().optional(),
  ADMIN_URL: z.string().url().optional(),
  CLIENT_PORTAL_URL: z.string().url().optional(),
  /**
   * Orígenes EXTRA permitidos por CORS, separados por coma. `ADMIN_URL` y
   * `CLIENT_PORTAL_URL` ya entran solos en la allowlist, pero son UN valor cada
   * una y además cumplen otra función (`ADMIN_URL` es la base con la que se
   * arman los links de emails, propuestas y reservas — no se puede cambiar solo
   * para habilitar un origin). Cuando el mismo front se sirve desde varios
   * dominios a la vez (el *.vercel.app del proyecto, el dominio propio y el
   * subdominio del panel), el resto va acá.
   *
   * Ej: "https://synous-ai-admin.vercel.app,https://admin.synousai.com"
   */
  ALLOWED_ORIGINS: z.string().optional(),
  API_URL: z.string().url().optional(),

  // Fathom webhook — opcional; sin secret configurado el webhook responde 401
  FATHOM_WEBHOOK_SECRET: z.string().optional(),

  // Clerk webhook — opcional; sin secret configurado el endpoint responde 401 (fail-closed)
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().optional(),

  // URL pública de la API para pixel de tracking (default: localhost en dev)
  PUBLIC_API_URL: z.string().url().default('http://localhost:3001'),

  // ── Clerk (auth) ──────────────────────────────────────────
  // Requerido en prod: sin esto el verifyToken de Clerk falla y nadie autentica.
  // default '' para no romper boot/tests cuando no está configurado (auth devuelve 401).
  CLERK_SECRET_KEY: z.string().default(''),

  // ── IA: Anthropic y Vertex/Gemini ────────────────
  // Qué modelo usan las funciones con IA (propuestas, próxima acción).
  // Antes lo decidía `setter_tenant.model_provider`, que se fue con el setter;
  // el default sigue siendo gemini, que era el fallback histórico.
  MODEL_PROVIDER: z.enum(['gemini', 'claude']).default('gemini'),
  ANTHROPIC_API_KEY: z.string().default(''),
  ANTHROPIC_MODEL: z.string().default(''),
  VERTEX_LOCATION: z.string().default(''),
  VERTEX_MODEL: z.string().default(''),

  // ── Google service account (auth de Vertex/Gemini) ────────
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().default(''),

  // ── DocuSeal (firma de contratos y propuestas) ────────────
  // Sin DOCUSEAL_API_KEY la integración queda inactiva: los endpoints responden
  // 503 en vez de fallar de forma rara. El webhook rechaza todo si falta el
  // secret (no se procesa nada sin poder verificar el origen).
  // OJO: son DOS bases distintas y confundirlas manda al cliente a un link roto.
  //  - DOCUSEAL_URL     → app pública, de donde sale el link de firma (/s/<slug>)
  //  - DOCUSEAL_API_URL → API REST
  // En cloud son hosts distintos (docuseal.com vs api.docuseal.com); en
  // self-hosted es el mismo host y la API cuelga de /api.
  DOCUSEAL_URL: z.string().url().default('https://docuseal.com'),
  DOCUSEAL_API_URL: z.string().url().default('https://api.docuseal.com'),
  DOCUSEAL_API_KEY: z.string().default(''),
  DOCUSEAL_WEBHOOK_SECRET: z.string().default(''),

  // ── Onboarding post-venta: asignación automática de responsable por fase del
  // pipeline "Producción" (ver modules/onboarding/assignees.ts). Opcionales con
  // default — si el hub_user no existe (email no seedeado), el helper devuelve
  // null y no rompe: se mantiene el owner actual del deal.
  PRODUCTION_ASSIGNEE_DIAGNOSTICO_EMAIL: z.string().email().default('laureanosierra.dev@gmail.com'),
  PRODUCTION_ASSIGNEE_DEFAULT_EMAIL: z.string().email().default('jeremiasingla@gmail.com'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env
