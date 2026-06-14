import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { Providers } from '@portal/providers'
import './portal-theme.css'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-portal-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'NOUS — Portal de Clientes',
  description: 'Tu portal de seguimiento de proyectos con NOUS',
}

export default function PortalRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`portal-theme ${jakarta.variable}`}>
      <Providers>{children}</Providers>
    </div>
  )
}
