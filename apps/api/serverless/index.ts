import type { IncomingMessage, ServerResponse } from 'node:http'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Fuente del entrypoint serverless de Vercel. `buildApp()` ya está desacoplado
 * de `.listen()` (se usa así en los tests vía supertest(app.server)) — acá lo
 * reutilizamos sin abrir un puerto, cacheando la instancia entre invocaciones
 * cálidas del mismo contenedor. `app.server` es un `http.Server` real que
 * nunca hizo `.listen()`; alimentarlo directo con el req/res de Vercel vía
 * `emit('request', ...)` es el patrón documentado por Fastify para deploys
 * serverless.
 *
 * `src/server.ts` (con `.listen()` + workers de BullMQ) sigue siendo el
 * entrypoint de `pnpm dev` local — no se toca acá.
 *
 * IMPORTANTE: este archivo NO se deploya tal cual. `pnpm build:vercel-api`
 * (tsup) lo bundlea a un único api/index.js sin imports relativos sin
 * resolver, que es lo que Vercel realmente deploya — evita en un solo golpe
 * el typecheck de @vercel/node sobre todo el repo (que revienta con errores
 * de tipos preexistentes ajenos a este archivo) y el bug de resolución ESM
 * de imports relativos sin extensión (`../src/app` sin bundlear falla en
 * runtime con ERR_MODULE_NOT_FOUND). api/index.js SÍ está commiteado a
 * propósito — regenerarlo con build:vercel-api después de tocar cualquier
 * cosa que buildApp() importe transitivamente.
 */
let app: FastifyInstance | undefined

async function getApp(): Promise<FastifyInstance> {
  if (!app) {
    app = buildApp()
    await app.ready()
  }
  return app
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const instance = await getApp()
  instance.server.emit('request', req, res)
}
