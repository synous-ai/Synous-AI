import Fastify, { type FastifyError, type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUI from '@fastify/swagger-ui'
import fastifyWebsocket from '@fastify/websocket'
import fastifyMultipart from '@fastify/multipart'
import { ZodError } from 'zod'
import { env } from './config/env'
import { AppError } from './lib/errors'
import { healthRoutes } from './modules/health/health.router'
import { authRoutes } from './modules/auth/auth.router'
import { contactsRoutes } from './modules/contacts/contacts.router'
import { companiesRoutes } from './modules/companies/companies.router'
import { dealsRoutes } from './modules/deals/deals.router'
import { pipelinesRoutes } from './modules/pipelines/pipelines.router'
import { leadsRoutes } from './modules/leads/leads.router'
import { clientsRoutes } from './modules/clients/clients.router'
import { notesRoutes } from './modules/activities/notes.router'
import { tasksRoutes } from './modules/activities/tasks.router'
import { dashboardRoutes } from './modules/dashboard/dashboard.router'
import { calendarRoutes } from './modules/calendar/calendar.router'
import { usersRoutes } from './modules/users/users.router'
import { settingsRoutes } from './modules/settings/settings.router'
import { clientAuthRoutes } from './modules/client-auth/client-auth.router'
import { deliverablesRoutes } from './modules/deliverables/deliverables.router'
import { clientRoutes } from './modules/client/client.router'
import { intakeRoutes } from './modules/intake/intake.router'
import { clientIntakeRoutes } from './modules/intake/client-intake.router'
import { notificationsRoutes } from './modules/notifications/notifications.router'
import { notificationsWsRoutes } from './modules/notifications/notifications.ws'
import { filesRoutes, clientFilesRoutes } from './modules/files/files.router'
import { crRoutes } from './modules/change-requests/cr.router'
import { clientCrRoutes } from './modules/change-requests/client-cr.router'
import { libraryRoutes } from './modules/library/library.router'
import { workItemsRoutes } from './modules/work-items/work-items.router'
import { financeRoutes } from './modules/finance/finance.router'
import { notificationPrefsRoutes } from './modules/notification-prefs/notification-prefs.router'
import { customFieldsRoutes } from './modules/custom-fields/custom-fields.router'
import { timelineRoutes } from './modules/timeline/timeline.router'
import { focusRoutes } from './modules/focus/focus.router'
import { reportsRoutes } from './modules/reports/reports.router'
import { webhooksRoutes } from './modules/webhooks/webhooks.router'
import { emailTrackingRoutes } from './modules/email-tracking/email-tracking.router'
import { documentsRoutes } from './modules/documents/documents.router'

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty' } }
        : env.NODE_ENV === 'test'
          ? false
          : true,
  })

  // Integración Zod ↔ Fastify (validación + serialización tipadas)
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.register(cors, { origin: true, credentials: true })
  app.register(cookie)
  app.register(fastifyWebsocket)
  app.register(fastifyMultipart, { limits: { fileSize: 25 * 1024 * 1024 } })

  // OpenAPI / Swagger — se registra ANTES que las rutas para poder capturarlas.
  app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'API CRM DevDúo',
        description:
          'Documentación de la API del CRM interno de DevDúo. Todos los endpoints (salvo autenticación y salud) requieren un Bearer token de hub_user. Las respuestas siguen el formato `{ data, meta? }` y los errores `{ error: { code, message } }`.',
        version: '1.0.0',
      },
      servers: [{ url: 'http://localhost:3001', description: 'Desarrollo local' }],
      tags: [
        { name: 'Dashboard', description: 'Métricas y resumen del portal' },
        { name: 'Autenticación', description: 'Login, refresh, logout y usuario actual' },
        { name: 'Contactos', description: 'CRUD de contactos' },
        { name: 'Leads', description: 'Contactos en etapa de prospecto + detalle' },
        { name: 'Clientes', description: 'Contactos convertidos en clientes + detalle' },
        { name: 'Empresas', description: 'CRUD de empresas' },
        { name: 'Notas', description: 'Notas asociadas a contactos/deals/empresas' },
        { name: 'Tareas', description: 'Tareas con responsable, vencimiento y estado' },
        { name: 'Calendario', description: 'Tipos de reunión, disponibilidad y reuniones agendadas' },
        { name: 'Usuarios', description: 'Gestión del equipo (hub_user)' },
        { name: 'Configuración', description: 'Ajustes del portal' },
        { name: 'Entregables', description: 'Entregables asociados a deals' },
        { name: 'Client Portal', description: 'Autenticación del portal de clientes (token separado)' },
        { name: 'Intake Forms', description: 'Plantillas de onboarding y asignación a deals' },
        { name: 'Notificaciones', description: 'Notificaciones del usuario (REST + WebSocket en /ws/notifications)' },
        { name: 'Archivos', description: 'Subida/descarga de archivos (almacenamiento local)' },
        { name: 'Change Requests', description: 'Solicitudes de cambio de alcance (admin + cliente)' },
        { name: 'Biblioteca', description: 'Documentos, SOPs, plantillas y recursos de la agencia' },
        { name: 'Operaciones', description: 'Bugs, mejoras, roadmap interno y procesos del equipo' },
        { name: 'Finanzas', description: 'Facturas, pagos y métricas financieras del portal' },
        { name: 'Deals', description: 'CRUD de deals y cambios de etapa' },
        { name: 'Pipelines', description: 'Pipelines y sus etapas' },
        { name: 'Salud', description: 'Health checks de la API' },
        { name: 'Actividades', description: 'Timeline unificado: llamadas, reuniones, emails, notas, tareas e historial' },
        { name: 'Seguimientos', description: 'Follow-ups (tareas vencidas/hoy/próximos 7 días) y deals sin próxima acción o sin actividad reciente' },
        { name: 'Reportes', description: 'Reportes de gestión: embudo, riesgo, conversión, actividad y cerrados/ganados' },
        { name: 'Webhooks', description: 'Webhooks de integraciones externas (Fathom)' },
        { name: 'Tracking', description: 'Pixel de apertura y redirect de click para email tracking' },
        { name: 'Documentos', description: 'Documentos asociados a deals (contratos, propuestas, facturas)' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
    transform: jsonSchemaTransform,
  })
  app.register(fastifySwaggerUI, { routePrefix: '/docs' })

  // Error handler central → siempre responde { error: { code, message } }
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      })
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos', details: error.flatten() },
      })
    }

    // Errores de validación del schema de Fastify
    if (error.validation) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: error.message, details: error.validation },
      })
    }

    request.log.error(error)
    return reply.status(error.statusCode ?? 500).send({
      error: { code: 'INTERNAL', message: 'Error interno del servidor' },
    })
  })

  // Rutas
  app.register(healthRoutes)
  app.register(authRoutes, { prefix: '/api/auth' })
  app.register(dashboardRoutes, { prefix: '/api/dashboard' })
  app.register(contactsRoutes, { prefix: '/api/contacts' })
  app.register(leadsRoutes, { prefix: '/api/leads' })
  app.register(clientsRoutes, { prefix: '/api/clients' })
  app.register(companiesRoutes, { prefix: '/api/companies' })
  app.register(notesRoutes, { prefix: '/api/notes' })
  app.register(tasksRoutes, { prefix: '/api/tasks' })
  app.register(dealsRoutes, { prefix: '/api/deals' })
  app.register(pipelinesRoutes, { prefix: '/api/pipelines' })
  app.register(calendarRoutes, { prefix: '/api/calendar' })
  app.register(usersRoutes, { prefix: '/api/users' })
  app.register(settingsRoutes, { prefix: '/api/settings' })
  app.register(deliverablesRoutes, { prefix: '/api/deliverables' })
  app.register(clientAuthRoutes, { prefix: '/api/client-auth' })
  app.register(clientRoutes, { prefix: '/api/client' })
  app.register(intakeRoutes, { prefix: '/api/intake' })
  app.register(clientIntakeRoutes, { prefix: '/api/client/intakes' })
  app.register(notificationsRoutes, { prefix: '/api/notifications' })
  app.register(notificationsWsRoutes)
  app.register(filesRoutes, { prefix: '/api/files' })
  app.register(clientFilesRoutes, { prefix: '/api/client/files' })
  app.register(crRoutes, { prefix: '/api/change-requests' })
  app.register(clientCrRoutes, { prefix: '/api/client/change-requests' })
  app.register(libraryRoutes, { prefix: '/api/library' })
  app.register(workItemsRoutes, { prefix: '/api/work-items' })
  app.register(financeRoutes, { prefix: '/api/finance' })
  app.register(notificationPrefsRoutes, { prefix: '/api/notification-prefs' })
  app.register(customFieldsRoutes, { prefix: '/api/custom-fields' })
  app.register(timelineRoutes, { prefix: '/api/timeline' })
  app.register(focusRoutes, { prefix: '/api/focus' })
  app.register(reportsRoutes, { prefix: '/api/reports' })
  app.register(webhooksRoutes, { prefix: '/webhooks' })
  app.register(emailTrackingRoutes, { prefix: '/track' })
  app.register(documentsRoutes, { prefix: '/api/documents' })

  return app
}

/** Instancia tipada con Zod, para usar dentro de los routers. */
export type App = FastifyInstance & { withTypeProvider: () => ZodTypeProvider }
