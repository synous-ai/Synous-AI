import { defineConfig } from 'tsup'

/**
 * Config compartida por los dos builds de tsup (`build:bundle` y
 * `build:vercel-api`); el entry y el outDir siguen viniendo por CLI.
 *
 * `noExternal`: sin esto, tsup deja `@synous/shared` como import EXTERNO por
 * estar en `dependencies`. Ese paquete no tiene build — su `exports` apunta a
 * `./src/index.ts` — así que en runtime Node intenta cargar un archivo .ts y
 * revienta con ERR_UNKNOWN_FILE_EXTENSION antes de levantar el servidor.
 *
 * No es hipotético: tumbó la API entera en producción (FUNCTION_INVOCATION_FAILED
 * en todas las rutas, /health incluida) cuando el bundle se regeneró después del
 * rename del scope a @synous. Inlinearlo lo resuelve de raíz.
 */
export default defineConfig({
  format: ['esm'],
  target: 'node20',
  noExternal: ['@synous/shared'],
})
