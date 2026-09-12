import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import './proposal.css'

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })

export const metadata: Metadata = {
  title: 'Tu propuesta | Synous',
  description: 'Convertimos metodologías en productos y operaciones en sistemas.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${jakarta.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
