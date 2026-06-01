/**
 * Constantes reutilizables de seguridad para las definiciones Swagger/OpenAPI.
 * Importar en los routers en lugar de redefinir `const security = [{ bearerAuth: [] }]`.
 */
export const ADMIN_SECURITY = [{ bearerAuth: [] }] as const
export const CLIENT_SECURITY = [{ bearerAuth: [] }] as const
