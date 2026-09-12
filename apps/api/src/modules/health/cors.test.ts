/**
 * CORS: qué orígenes puede usar el browser contra la API.
 *
 * Existe porque el portal de cada tenant se sirve en su propio subdominio
 * (`<slug>.synousai.com`) y una allowlist fija los dejaba a todos afuera. El
 * síntoma no era un error visible: el gate del onboarding es fail-open, así
 * que el cliente veía un portal vacío en vez de un fallo.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'

vi.mock('../../config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/env')>()
  return {
    ...actual,
    env: {
      ...actual.env,
      ADMIN_URL: 'https://app.synousai.com',
      ALLOWED_ORIGINS: 'https://admin.synousai.com,https://synous-ai-admin.vercel.app',
      TENANT_ROOT_DOMAIN: 'synousai.com',
    },
  }
})

const { buildApp } = await import('../../app')
const { closeDb } = await import('../../db')
const app = buildApp()

beforeAll(async () => { await app.ready() })
afterAll(async () => { await app.close(); await closeDb() })

const preflight = (origin: string) =>
  request(app.server)
    .options('/health')
    .set('Origin', origin)
    .set('Access-Control-Request-Method', 'GET')

describe('CORS — orígenes permitidos', () => {
  it('permite los orígenes de la lista fija', async () => {
    for (const o of ['https://app.synousai.com', 'https://admin.synousai.com', 'https://synous-ai-admin.vercel.app']) {
      const res = await preflight(o)
      expect(res.headers['access-control-allow-origin'], o).toBe(o)
    }
  })

  it('permite CUALQUIER subdominio de tenant sin enumerarlo', async () => {
    for (const o of ['https://uirtus.synousai.com', 'https://otro-cliente.synousai.com', 'https://a1.synousai.com']) {
      const res = await preflight(o)
      expect(res.headers['access-control-allow-origin'], o).toBe(o)
    }
  })

  it('rechaza dominios parecidos que NO son subdominios nuestros', async () => {
    const impostores = [
      'https://evil-synousai.com',          // prefijo pegado, sin punto
      'https://synousai.com.attacker.net',  // el dominio como subdominio ajeno
      'https://malicioso.com',
      'http://uirtus.synousai.com',         // http, no https
    ]
    for (const o of impostores) {
      const res = await preflight(o)
      expect(res.headers['access-control-allow-origin'], o).toBeUndefined()
    }
  })

  it('responde a requests sin Origin (curl / server-to-server)', async () => {
    const res = await request(app.server).get('/health')
    expect(res.status).toBe(200)
  })
})
