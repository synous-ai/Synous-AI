import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import '@/app/portal/_brand/brand-tokens.css'
import '@/app/portal/bienvenida/proposal.css'
import '@/app/portal/propuesta/proposal-landing.css'

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

export const metadata: Metadata = {
  title: 'Vista previa de propuesta | Synous',
  robots: { index: false, follow: false },
}

/** Mismo shell que el link público (`app/p/[token]/layout.tsx`): fuentes y paleta propias. */
export default function ProposalPreviewLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${jakarta.variable} ${mono.variable}`}>{children}</div>
}
