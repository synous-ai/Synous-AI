import { defineConfig } from 'tsup'

/**
 * Config de `build:bundle` (`tsup src/server.ts --clean` → `dist/server.js`).
 * Es el build que corre Vercel antes de deployar (`buildCommand` +
 * `outputDirectory: dist` en vercel.json): el entrypoint que detecta el preset
 * de Fastify es `dist/server.js`, no el `.ts`.
 *
 * Por qué bundle y no el `src/server.ts` directo: @vercel/node transpila cada
 * `.ts` por separado y NO reescribe imports relativos sin extensión
 * (`./app` → ERR_MODULE_NOT_FOUND en ESM), ni el `exports` de @synous/shared,
 * que apunta a un `.ts`. Las dos cosas ya tumbaron producción.
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
