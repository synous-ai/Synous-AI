import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteFooter, SiteHeader } from './legal-document'
import './home.css'

export const metadata: Metadata = {
  title: 'Synous AI — Plataforma de proyectos',
  description:
    'Synous AI es una agencia de desarrollo web. Su plataforma reúne el avance de cada proyecto, propuestas, entregables, documentos y reuniones con sus clientes.',
}

const FEATURES: { title: string; body: string }[] = [
  {
    title: 'Portal de clientes',
    body: 'Cada cliente ve cómo avanza su proyecto: hitos, demos, próximos pasos y documentación importante.',
  },
  {
    title: 'Propuestas y documentos',
    body: 'Propuestas comerciales, contratos con firma electrónica y facturas, disponibles en un solo lugar.',
  },
  {
    title: 'Entregables y cambios',
    body: 'Revisión y aprobación de entregables, y pedidos de cambio con su historial completo.',
  },
  {
    title: 'Reuniones',
    body: 'Reserva de reuniones con el equipo y recordatorios automáticos antes de cada una.',
  },
]

export default function HomePage() {
  return (
    <div className="brand-surface legal-page">
      <SiteHeader withLogin />

      <main>
        <section className="home-hero">
          <p className="legal-eyebrow legal-mono">Synous AI · Plataforma de proyectos</p>
          <h1>Convertimos metodologías en productos y operaciones en sistemas.</h1>
          <p className="home-lede">
            Synous AI es una agencia de desarrollo web. Esta plataforma es el espacio donde trabajamos
            con cada cliente: el avance del proyecto, las propuestas, los entregables, los documentos y
            las reuniones, todo en un solo lugar.
          </p>
          <div className="home-actions">
            <Link className="home-button home-button-primary" href="/login">
              Ingresar
            </Link>
            <Link className="home-button home-button-ghost" href="/privacidad">
              Política de Privacidad
            </Link>
          </div>
          <p className="home-note legal-mono">
            Acceso solo por invitación: el equipo de Synous AI crea las cuentas de su equipo y sus clientes.
          </p>
        </section>

        <section className="home-section" aria-labelledby="home-features">
          <p className="legal-index legal-mono">Qué hace la plataforma</p>
          <h2 id="home-features">Todo el proyecto, en un mismo lugar</h2>
          <div className="home-grid">
            {FEATURES.map((feature, i) => (
              <article key={feature.title} className="home-card">
                <p className="home-card-index legal-mono">{String(i + 1).padStart(2, '0')}</p>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section home-google" aria-labelledby="home-google">
          <p className="legal-index legal-mono">Acceso</p>
          <h2 id="home-google">Inicio de sesión con Google</h2>
          <p>
            Podés ingresar con tu email y contraseña o con tu cuenta de Google. Si usás Google, solo
            recibimos tu nombre, tu email y tu foto de perfil, y los usamos únicamente para identificarte
            y darte acceso a tu cuenta. No los usamos para publicidad ni los vendemos.
          </p>
          <p>
            El detalle de qué datos tratamos y cómo ejercer tus derechos está en la{' '}
            <Link href="/privacidad">Política de Privacidad</Link>, y las reglas de uso, en las{' '}
            <Link href="/terminos">Condiciones del Servicio</Link>.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
