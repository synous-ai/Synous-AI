import { buildApp } from './app'
import { env } from './config/env'
import { closeDb } from './db'
import { isRedisConfigured, setupReminders, closeReminders } from './jobs'
import { closeNotificationBus } from './lib/notification-bus'

/**
 * Entrypoint de la API: `pnpm dev` (tsx) y producción en Vercel, donde se
 * deploya compilado a `dist/server.js` (ver apps/api/vercel.json y la sección
 * de deploy de docs/ARCHITECTURE.md). Vercel intercepta el `listen()`.
 *
 * En Vercel la plataforma maneja el ciclo de vida de la instancia: no se
 * arranca el worker de BullMQ (una instancia congelada entre requests no
 * procesa una cola de forma fiable; los recordatorios los dispara Vercel Cron
 * contra GET /api/cron/reminders) ni se instalan handlers de señales que
 * llamen a process.exit (cortarían requests y sockets vivos de la instancia).
 */
const onVercel = Boolean(process.env.VERCEL)

const app = buildApp()

async function start(): Promise<void> {
  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
    app.log.info(`🚀 API escuchando en http://localhost:${env.PORT}`)

    if (onVercel) return

    if (isRedisConfigured()) {
      // Aislado del listen: un Redis caído apaga los recordatorios, no la API.
      // Dentro del try de arriba, el process.exit(1) tiraba un server que ya
      // estaba atendiendo requests.
      try {
        await setupReminders()
        app.log.info('⏰ Reminders worker activo')
      } catch (err) {
        app.log.error({ err }, 'No se pudo iniciar el worker de recordatorios; la API sigue sin recordatorios')
      }
    } else {
      app.log.warn('REDIS_URL ausente, worker de recordatorios deshabilitado')
    }
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

if (!onVercel) {
  // Shutdown ordenado
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, async () => {
      app.log.info(`${signal} recibido, cerrando...`)
      await closeReminders()
      await closeNotificationBus()
      await app.close()
      await closeDb()
      process.exit(0)
    })
  }
}

void start()
