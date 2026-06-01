/**
 * Error de aplicación. TODOS los errores de negocio deben lanzarse con esto.
 * El error handler de Fastify lo mapea a `{ error: { code, message } }`.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

/** Helpers para los errores más comunes. */
export const Errors = {
  badRequest: (message = 'Solicitud inválida', details?: unknown) =>
    new AppError('BAD_REQUEST', message, 400, details),
  unauthorized: (message = 'No autenticado') =>
    new AppError('UNAUTHORIZED', message, 401),
  forbidden: (message = 'No autorizado') =>
    new AppError('FORBIDDEN', message, 403),
  notFound: (message = 'Recurso no encontrado') =>
    new AppError('NOT_FOUND', message, 404),
  conflict: (message = 'Conflicto con el estado actual') =>
    new AppError('CONFLICT', message, 409),
  internal: (message = 'Error interno') =>
    new AppError('INTERNAL', message, 500),
}
