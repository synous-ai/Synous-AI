import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { cn } from '@/lib/utils'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })

export const metadata: Metadata = {
  title: 'NOUS CRM — Admin',
  description: 'Portal de administración del CRM de NOUS',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /**
     * ClerkProvider cubre TODO el árbol de la app (admin + portal).
     * El portal de cliente tiene su propia auth (authenticate-client.ts),
     * por eso Clerk NO protege /portal/*: lo controla el middleware.
     * signInUrl apunta a la ruta headless del CRM, no a la UI de Clerk.
     */
    <ClerkProvider signInUrl="/admin/login">
      <html lang="es" className={cn(inter.variable, mono.variable)} suppressHydrationWarning>
        <body>
          {/* Sin `disableTransitionOnChange`: queremos que el cambio dark↔light sea
              SUAVE (las transiciones de color viven en globals.css). next-themes
              setea la clase antes del primer paint, así que no hay flash inicial. */}
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            {children}
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
