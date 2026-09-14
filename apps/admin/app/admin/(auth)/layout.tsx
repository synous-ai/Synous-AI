import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'

/**
 * Las pantallas de acceso usan la tipografía de marca, no la del panel: son lo
 * primero que se ve y comparten lenguaje con las páginas públicas. El resto de
 * /admin sigue con las fuentes del root layout.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-proposal-sans',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-proposal-mono',
  display: 'swap',
})

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${jakarta.variable} ${mono.variable}`}>{children}</div>
}
