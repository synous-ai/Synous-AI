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
 * Páginas legales públicas (privacidad y términos). Usan la misma superficie de
 * marca que las páginas del prospecto y quedan fuera del chrome del panel: las
 * enlazan la pantalla de consentimiento de Google y el login, sin sesión.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${jakarta.variable} ${mono.variable}`}>{children}</div>
}
