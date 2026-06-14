import { buildApp } from './app'
import { env } from './config/env'
import { closeDb } from './db'
import { isRedisConfigured, setupReminders, closeReminders } from './jobs'
import { setupSetterWorker, closeSetterQueues } from './modules/setter/queue/setter.queue'
import { setupProspectingAutopilot, closeProspectingAutopilot } from './modules/prospecting/prospecting.autopilot'

const app = buildApp()

async function start(): Promise<void> {
  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
    app.log.info(`🚀 API escuchando en http://localhost:${env.PORT}`)

    if (isRedisConfigured()) {
      await setupReminders()
      app.log.info('⏰ Reminders worker activo')
      // Worker del setter (cola BullMQ: mensajes entrantes de WhatsApp → agente IA)
      setupSetterWorker()
      app.log.info('🤖 Setter worker activo')
      // Autopilot de prospecting (escaneo periódico de búsquedas activas con IA)
      await setupProspectingAutopilot()
      app.log.info('🔍 Prospecting autopilot activo')
    } else {
      app.log.warn('REDIS_URL ausente, workers de recordatorios / setter / autopilot deshabilitados')
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
    // Cierre de colas del setter y autopilot de prospecting antes de cerrar el proceso
    await closeSetterQueues()
    await closeProspectingAutopilot()
    await app.close()
    await closeDb()
    process.exit(0)
  })
}

void start()
