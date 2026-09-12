import { buildApp } from './app'
import { env } from './config/env'
import { closeDb } from './db'
import { isRedisConfigured, setupReminders, closeReminders } from './jobs'

const app = buildApp()

async function start(): Promise<void> {
  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
    app.log.info(`🚀 API escuchando en http://localhost:${env.PORT}`)

    if (isRedisConfigured()) {
      await setupReminders()
      app.log.info('⏰ Reminders worker activo')
    } else {
      app.log.warn('REDIS_URL ausente, worker de recordatorios deshabilitado')
    }
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

// Shutdown ordenado
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    app.log.info(`${signal} recibido, cerrando...`)
    await closeReminders()
    await app.close()
    await closeDb()
    process.exit(0)
  })
}

void start()
