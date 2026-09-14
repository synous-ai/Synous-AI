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
  title: 'Tu propuesta | Synous',
  description: 'Convertimos metodologías en productos y operaciones en sistemas.',
  robots: { index: false, follow: false },
}

/**
 * The public proposal is a full-bleed piece with its own palette, so it opts out
 * of the app chrome rather than rendering inside it. Both stops of the link —
 * the envelope and the proposal itself — share this shell.
 */
export default function PublicProposalLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${jakarta.variable} ${mono.variable}`}>{children}</div>
}
