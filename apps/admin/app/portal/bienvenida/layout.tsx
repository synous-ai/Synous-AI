import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import '../_brand/brand-tokens.css'
import './proposal.css'

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
  title: 'Tu propuesta | Synous',
  description: 'Convertimos metodologías en productos y operaciones en sistemas.',
  robots: { index: false, follow: false },
}

/**
 * The proposal is a full-bleed piece with its own palette, so it opts out of the
 * portal chrome rather than rendering inside it.
 */
export default function ProposalLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${jakarta.variable} ${mono.variable}`}>{children}</div>
}
