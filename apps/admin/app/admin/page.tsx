import { redirect } from 'next/navigation'

/**
 * Índice de /admin.
 *
 * Los grupos de ruta (auth) y (dashboard) no aportan segmento de URL, por lo que
 * no existía una página en /admin exacto → GET /admin devolvía 404.
 *
 * Redirige al dashboard. Si no hay sesión de Clerk, el middleware protege
 * /admin/dashboard y rebota a /admin/login automáticamente.
 */
export default function AdminIndexPage(): never {
  redirect('/admin/dashboard')
}
