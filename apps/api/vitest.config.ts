import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.ts'],
    pool: 'forks',
    // Tests de integración comparten la misma DB → correrlos en serie evita
    // condiciones de carrera entre archivos.
    fileParallelism: false,
    hookTimeout: 30000,
    // AISLAMIENTO CRÍTICO: los tests SIEMPRE corren contra la base de TEST,
    // nunca contra dev. vitest fija process.env antes de importar el código,
    // y dotenv no sobreescribe vars ya definidas → este valor gana sobre .env.
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5433/devduo_crm_test',
    },
  },
})
