import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import '../_brand/brand-tokens.css'
import './proposal-landing.css'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-proposal-sans',
  display: 'swap',
})

/**
 * Mono carries every label on the page — badges, eyebrows, phase numbers. It
 * needs real weight range to read as a deliberate voice rather than fallback
 * monospace, so 500/600 ship alongside the regular.
 */
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-proposal-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Propuesta UIRTUS | Synous',
  description: 'Convertimos metodologías en productos y operaciones en sistemas.',
  robots: { index: false, follow: false },
}

/**
 * The proposal is a full-bleed page with its own palette, so it opts out of the
 * portal chrome rather than rendering inside it.
 */
export default function ProposalLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${jakarta.variable} ${mono.variable}`}>{children}</div>
}
