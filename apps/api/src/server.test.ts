/**
 * Entrypoint: en Vercel no arranca el worker de BullMQ ni instala handlers de
 * señales; en modo long-running local sí.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  listen: vi.fn(async () => 'http://0.0.0.0:3001'),
  setupReminders: vi.fn(async () => {}),
  isRedisConfigured: vi.fn(() => true),
}))

vi.mock('./app', () => ({
  buildApp: () => ({
    listen: mocks.listen,
    close: vi.fn(),
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }),
}))
vi.mock('./jobs', () => ({
  isRedisConfigured: mocks.isRedisConfigured,
  setupReminders: mocks.setupReminders,
  closeReminders: vi.fn(),
}))
vi.mock('./db', () => ({ closeDb: vi.fn() }))
vi.mock('./lib/notification-bus', () => ({ closeNotificationBus: vi.fn() }))

const originalVercel = process.env.VERCEL

async function loadServer(vercel: string | undefined): Promise<string[]> {
  if (vercel === undefined) delete process.env.VERCEL
  else process.env.VERCEL = vercel
  // Sin registrar de verdad: un SIGTERM al worker de vitest no debe llamar process.exit.
  const on = vi.spyOn(process, 'on').mockImplementation(() => process)
  vi.resetModules()
  await import('./server')
  await vi.waitFor(() => expect(mocks.listen).toHaveBeenCalled())
  await new Promise((r) => setImmediate(r))
  return on.mock.calls.map(([event]) => String(event))
}

beforeEach(() => {
  mocks.listen.mockClear()
  mocks.setupReminders.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
  if (originalVercel === undefined) delete process.env.VERCEL
  else process.env.VERCEL = originalVercel
})

describe('src/server.ts', () => {
  it('con VERCEL=1: escucha, pero no arranca el worker ni instala handlers de señales', async () => {
    const events = await loadServer('1')
    expect(mocks.listen).toHaveBeenCalledTimes(1)
    expect(mocks.setupReminders).not.toHaveBeenCalled()
    expect(events).not.toContain('SIGINT')
    expect(events).not.toContain('SIGTERM')
  })

  it('local con REDIS_URL: arranca el worker e instala el shutdown ordenado', async () => {
    const events = await loadServer(undefined)
    expect(mocks.setupReminders).toHaveBeenCalledTimes(1)
    expect(events).toEqual(expect.arrayContaining(['SIGINT', 'SIGTERM']))
  })
})
