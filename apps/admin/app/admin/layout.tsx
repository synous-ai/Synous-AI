import { Providers } from '../providers'

/**
 * Layout del segmento /admin (CRM). Provee el QueryClient (TanStack Query)
 * para todas las rutas del hub. La autenticación la gestiona Clerk:
 * el middleware de Next.js protege las rutas /admin/* vía clerkMiddleware,
 * y ClerkProvider (en el root layout) expone el contexto de sesión al árbol.
 * AuthBootstrap fue eliminado al migrar de JWT propio a Clerk.
 *
 * Vive acá — NO en el root layout — para que la landing pública (/) y el
 * Portal de cliente (/portal/*) NO queden envueltos por los providers del hub.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>
}
