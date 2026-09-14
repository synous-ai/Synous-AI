import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import '../portal/_brand/brand-tokens.css'
import './legal.css'

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

/**
 * Sitio público en el apex (home, privacidad y términos). Usa la misma
 * superficie de marca que las páginas del prospecto y queda fuera del chrome del
 * panel: lo revisa la verificación de Google y se ve sin sesión.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${jakarta.variable} ${mono.variable}`}>{children}</div>
}
