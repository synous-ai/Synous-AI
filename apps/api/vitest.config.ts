import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.ts'],
    // Mock global de Clerk (@clerk/backend.verifyToken): permite a los tests de
    // integración autenticar con tokens "faketoken:<clerkUserId>" sin claves reales.
    setupFiles: ['src/test/setup.ts'],
    pool: 'forks',
    // Tests de integración comparten la misma DB → correrlos en serie evita
    // condiciones de carrera entre archivos.
    fileParallelism: false,
    hookTimeout: 30000,
    // AISLAMIENTO CRÍTICO: los tests SIEMPRE corren contra la base de TEST,
    // nunca contra dev. vitest fija process.env antes de importar el código,
    // y dotenv no sobreescribe vars ya definidas → este valor gana sobre .env.
    env: {
      // El fallback apuntaba a `devduo_crm_test`, la base del nombre viejo de
      // la agencia. Sobrevivió al rename y hacía que los tests corrieran contra
      // una base distinta a la de desarrollo (`nous`), con su propio drift de
      // migraciones. `nous_test` se recreó desde cero con `db:migrate`.
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5433/nous_test',
      // Provisioning de Clerk DESHABILITADO en tests: con la key vacía,
      // ensureClerkUserType corta antes de cualquier llamada → createUser /
      // activateClientPortal NO pegan a Clerk real (no crean usuarios basura).
      CLERK_SECRET_KEY: '',
      // Emails DESHABILITADOS en tests, por la misma razón que Clerk: con una
      // RESEND_API_KEY real en `.env` (dotenv la carga y no la pisa), cada test
      // que completa un onboarding, activa un portal o manda una invitación
      // pegaba a la API de Resend de verdad — lento, dependiente de la red y,
      // con el dominio verificado, mandando correo real desde la suite.
      // Con la key vacía, sendEmail corta antes de salir a la red y loguea
      // "[mailer] RESEND_API_KEY no configurada — email omitido".
      RESEND_API_KEY: '',
    },
  },
})
