/**
 * Layout del dashboard del CRM admin. Server Component.
 *
 * Con Clerk como proveedor de auth, la protección de rutas sucede en el
 * middleware (clerkMiddleware → auth.protect() para /admin/*).
 * Este layout ya NO necesita el guard de Zustand: si el usuario llega acá
 * es porque el middleware validó su sesión de Clerk.
 *
 * No lleva 'use client': un Server Component puede renderizar client components
 * (Sidebar y Toaster ya traen su propio 'use client'). Así el shell del layout
 * no viaja al bundle del cliente.
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
