'use client'

/**
 * Layout del dashboard del CRM admin.
 *
 * Con Clerk como proveedor de auth, la protección de rutas sucede en el
 * middleware (clerkMiddleware → auth.protect() para /admin/*).
 * Este layout ya NO necesita el guard de Zustand: si el usuario llega acá
 * es porque el middleware validó su sesión de Clerk.
 *
 * Se mantiene como 'use client' porque Sidebar y Toaster son client components.
 */

import { Sidebar } from '@/components/sidebar'
import { Toaster } from '@/components/ui/sonner'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <Toaster position="top-right" />
    </div>
  )
}
