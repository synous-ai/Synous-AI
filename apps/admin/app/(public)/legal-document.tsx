import Link from 'next/link'
import type { ReactNode } from 'react'

export const LEGAL_CONTACT_EMAIL = 'synous.ai@gmail.com'
export const LEGAL_UPDATED_AT = '13 de septiembre de 2026'

type LegalDocId = 'privacidad' | 'terminos'

const DOCS: { id: LegalDocId; href: string; label: string }[] = [
  { id: 'privacidad', href: '/privacidad', label: 'Privacidad' },
  { id: 'terminos', href: '/terminos', label: 'Términos' },
]

export interface LegalSection {
  id: string
  title: string
  body: ReactNode
}

export function ContactEmail() {
  return <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>
}

export function SiteHeader({ current, withLogin = false }: { current?: LegalDocId; withLogin?: boolean }) {
  return (
    <header className={`legal-header${withLogin ? ' legal-header-has-login' : ''}`}>
      <Link className="legal-header-home" href="/" aria-label="Synous AI, inicio">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="legal-header-logo" src="/brand/logotipo.svg" alt="Synous AI" />
      </Link>
      <nav className="legal-header-nav legal-mono" aria-label="Sitio">
        {DOCS.map((doc) => (
          <Link
            key={doc.id}
            className="legal-header-doc"
            href={doc.href}
            aria-current={doc.id === current ? 'page' : undefined}
          >
            {doc.label}
          </Link>
        ))}
        {withLogin && (
          <Link className="legal-header-login" href="/login">
            Ingresar
          </Link>
        )}
      </nav>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="legal-footer">
      <div className="legal-footer-inner">
        <span>© {new Date().getFullYear()} Synous AI</span>
        <nav className="legal-footer-links" aria-label="Documentos legales">
          {DOCS.map((doc) => (
            <Link key={doc.id} href={doc.href}>
              {doc.label}
            </Link>
          ))}
          <ContactEmail />
        </nav>
      </div>
    </footer>
  )
}

export function LegalDocument({
  current,
  eyebrow,
  title,
  lede,
  sections,
}: {
  current: LegalDocId
  eyebrow: string
  title: string
  lede: string
  sections: LegalSection[]
}) {
  return (
    <div className="brand-surface legal-page">
      <SiteHeader current={current} />

      <main className="legal-shell">
        <p className="legal-eyebrow legal-mono">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="legal-lede">{lede}</p>
        <p className="legal-updated legal-mono">Última actualización: {LEGAL_UPDATED_AT}</p>

        <nav className="legal-toc" aria-label="Contenido">
          <p className="legal-toc-title legal-mono">Contenido</p>
          <ol>
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{section.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        {sections.map((section, i) => (
          <section key={section.id} id={section.id} className="legal-section">
            <p className="legal-index legal-mono">{String(i + 1).padStart(2, '0')}</p>
            <h2>{section.title}</h2>
            <div className="legal-prose">{section.body}</div>
          </section>
        ))}
      </main>

      <SiteFooter />
    </div>
  )
}
