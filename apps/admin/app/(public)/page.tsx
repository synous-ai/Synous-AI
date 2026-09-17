import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteFooter, SiteHeader } from './legal-document'
import './home.css'

export const metadata: Metadata = {
  title: 'Synous AI — Sitio en construcción',
  description:
    'Synous AI es una agencia de desarrollo web. Estamos preparando el nuevo sitio; la plataforma de proyectos para clientes sigue disponible.',
}

/**
 * Home pública del apex, en construcción.
 *
 * Mínima a propósito, pero no vacía: esta página la revisa la verificación de
 * Google del inicio de sesión, que pide que la home diga qué es la app, deje
 * ingresar y enlace la Política de Privacidad. El header y el pie ya traen los
 * enlaces legales; acá quedan la descripción de una línea y el acceso.
 */
export default function HomePage() {
  return (
    <div className="brand-surface legal-page">
      <SiteHeader withLogin />

      <main>
        <section className="home-hero">
          <p className="legal-eyebrow legal-mono">Synous AI</p>
          <h1>Sitio en construcción.</h1>
          <p className="home-lede">
            Estamos preparando el nuevo sitio de Synous AI. Mientras tanto, nuestra plataforma de
            proyectos, donde trabajamos con cada cliente, sigue disponible.
          </p>
          <div className="home-actions">
            <Link className="home-button home-button-primary" href="/login">
              Ingresar
            </Link>
            <Link className="home-button home-button-ghost" href="/privacidad">
              Política de Privacidad
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
