import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { Providers } from '@portal/providers'
import { PortalScope } from '@portal/components/ui/portal-scope'
import './portal-theme.css'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-portal-sans',
  display: 'swap',
})

// Título genérico: el de la parte autenticada suma la marca del tenant en
// (app)/layout.tsx. Acá no se lee la cookie a propósito — este layout también
// envuelve páginas públicas (login, propuesta, bienvenida) que perderían el
// render estático y esperarían un fetch que no usan.
export const metadata: Metadata = {
  title: 'Synous — Portal de Clientes',
  description: 'Tu portal de seguimiento de proyectos con Synous',
}

export default function PortalRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalScope className={`portal-theme ${jakarta.variable}`}>
      <Providers>{children}</Providers>
    </PortalScope>
  )
}
