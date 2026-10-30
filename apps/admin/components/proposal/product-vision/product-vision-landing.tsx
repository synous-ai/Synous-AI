import type { CSSProperties, ReactNode } from 'react'
import Aurora from '@/components/proposal/aurora/aurora'
import { FaqList } from '@/components/proposal/faq-list'
import { GlowButton } from '@/components/proposal/glow-button'
import { GradualBlur } from '@/components/proposal/gradual-blur'
import { HideOnScrollHeader } from '@/components/proposal/hide-on-scroll-header'
import { Check, CornerTicks, PricingCorners } from '@/components/proposal/proposal-landing'
import { Reveal } from '@/components/proposal/reveal'
import { SmoothScroll } from '@/components/proposal/smooth-scroll'
import { BikeMark } from './bike-mark'
import { CountUp } from './count-up'
import { InterestCta } from './interest-cta'
import { PhoneDemo } from './phone-demo'
import { ScreenBento } from './screen-bento'
import { VersionRail } from './version-rail'
import { VersionTimeline } from './version-timeline'
import { isPending, type MaybePending, type ProductVisionContent } from './product-vision-types'
import './product-vision.css'

/** Mismo fondo del hero que la plantilla clásica. */
const AURORA_STOPS: [string, string, string] = ['#181ba2', '#99c0fe', '#383cff']

/**
 * Un dato pendiente de validar. Con borrador, el link público lo muestra tal
 * cual y la vista previa interna lo marca en ámbar; sin borrador, "A confirmar".
 */
function Value({ value, preview }: { value: MaybePending; preview: boolean }) {
  if (!isPending(value)) return <>{value}</>
  if (value.draft) {
    if (!preview) return <>{value.draft}</>
    return (
      <mark className="pv-draft" title={`A confirmar antes de enviar: ${value.pending}`}>
        {value.draft}
      </mark>
    )
  }
  return (
    <span className="pv-pending" title={`Pendiente: ${value.pending}`}>
      A confirmar
    </span>
  )
}

/** Rótulo numerado de cada sección: "01 · La visión". */
function SectionLabel({ index, children }: { index: string; children: string }) {
  return (
    <p className="pv-label">
      <span className="pv-label-index">{index}</span>
      <span className="pv-label-text">{children}</span>
    </p>
  )
}

const TRAIT_ICONS: ReactNode[] = [
  // Identidad visual
  <path key="a" d="M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.5-1.5 0-1.2-1-1.5-1-2.5S13.3 15 14.5 15H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8ZM7.5 12a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm3-4a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm5 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />,
  // Dispositivos
  <path key="b" d="M3 6a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1M3 6v8a2 2 0 0 0 2 2h7M8 20h4M15 9h5a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" />,
  // Instalable
  <path key="c" d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm5 5v7m-3-3 3 3 3-3" />,
  // Dominio
  <path key="d" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3Z" />,
]

/**
 * Layout `product-vision`: la propuesta como ROADMAP de un producto digital.
 * El producto avanza por versiones (V1…V5); la construcción de la V1, por
 * pasos. La V1 es la entrega concreta de la propuesta y la sección central.
 *
 * Usa el sistema visual de la plantilla clásica (shell, header con logo,
 * Aurora, pricing, FAQ, cierre y footer) y sus clases. Lo propio vive en
 * `product-vision.css`, sobre los tokens de `.brand-surface`. Cada sección es
 * una banda con fondo propio (navy profundo, panel o claro) para que la página
 * no se lea como un solo bloque.
 *
 * `token` es el del link público; `null` en la vista previa interna, donde los
 * CTAs no envían y los borradores se marcan en ámbar.
 */
export function ProductVisionLanding({
  content,
  token,
  scopeHref,
}: {
  content: ProductVisionContent
  token: string | null
  /** Descarga del documento de alcance (PDF). Sin él, no se muestra el botón. */
  scopeHref?: string
}) {
  const { hero, vision, roadmap, v1, process, investment, after, faq, close } = content
  const preview = token === null

  return (
    <div className="brand-surface proposal-page pv" id="top">
      <SmoothScroll />
      <GradualBlur height="6rem" strength={2} divCount={6} />

      <HideOnScrollHeader className="proposal-header">
        <CornerTicks />
        <a className="header-logo-link" href="#top" aria-label="Inicio">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="header-logo" src="/brand/logotipo.svg" alt="Synous AI" />
        </a>
        <nav className="header-nav" aria-label="Secciones de la propuesta">
          <ul>
            {content.nav.map((item) => (
              <li key={item.href}>
                <a href={item.href}>{item.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </HideOnScrollHeader>

      <VersionRail versions={roadmap.versions} label={content.rail.label} cta={content.rail.cta} href="#roadmap" />

      <main>
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="hero pv-hero" id="pv-hero">
          <div className="hero-backdrop" aria-hidden="true">
            <Aurora colorStops={AURORA_STOPS} blend={0.5} amplitude={1} speed={0.5} />
          </div>

          <div className="shell hero-inner">
            <p className="eyebrow badge-lg">
              <span className="badge-orb" aria-hidden="true" />
              {hero.eyebrow}
            </p>
            <p className="pv-for">{hero.forLine}</p>
            <h1>
              {hero.headline.lead} <span className="accent-text">{hero.headline.accent}</span>
            </h1>
            <p className="lede">{hero.lede}</p>

            <ol className="pv-hero-track" aria-label="Versiones del roadmap">
              {roadmap.versions.map((version, index) => (
                <li
                  key={version.code}
                  className={version.current ? 'is-on' : ''}
                  style={{ '--i': index } as CSSProperties}
                >
                  <span className="pv-hero-dot" aria-hidden="true" />
                  <span className="pv-hero-code">{version.code}</span>
                  {version.current && <span className="pv-sr-only">: {version.tag}</span>}
                </li>
              ))}
            </ol>

            <div className="cta-row pv-hero-ctas">
              <GlowButton href={hero.primaryCta.href}>{hero.primaryCta.label}</GlowButton>
            </div>
          </div>
        </section>

        {/* ── 01 Visión ────────────────────────────────────────────────── */}
        <section className="pv-band is-deep" id="vision">
          <div className="shell">
            <div className="pv-vision-head">
              <Reveal>
                <div className="pv-head">
                  <SectionLabel index="01">{vision.label}</SectionLabel>
                  <h2>
                    {vision.headline.lead} <span className="accent-text">{vision.headline.accent}</span>
                  </h2>
                  {vision.paragraphs.map((paragraph) => (
                    <p className="pv-lede" key={paragraph}>
                      {paragraph}
                    </p>
                  ))}
                </div>
              </Reveal>
              <Reveal className="pv-vision-art" delay={0.1}>
                <BikeMark />
              </Reveal>
            </div>
            <div className="pv-pillars">
              {vision.pillars.map((pillar, index) => (
                <Reveal key={pillar.title} delay={index * 0.08}>
                  <article className="pv-pillar">
                    <span className="pv-pillar-index">0{index + 1}</span>
                    <h3>{pillar.title}</h3>
                    <p>{pillar.body}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── 02 Roadmap ───────────────────────────────────────────────── */}
        <section className="pv-band is-panel" id="roadmap">
          <div className="shell">
            <Reveal>
              <div className="pv-head">
                <SectionLabel index="02">{roadmap.label}</SectionLabel>
                <h2>{roadmap.headline}</h2>
                <p className="pv-lede">{roadmap.lede}</p>
              </div>
            </Reveal>
            <VersionTimeline versions={roadmap.versions} />
          </div>
        </section>

        {/* ── 03 Tu V1 ─────────────────────────────────────────────────── */}
        <section className="pv-band is-light" id="v1">
          <div className="shell">
            <Reveal>
              <div className="pv-head">
                <SectionLabel index="03">{v1.label}</SectionLabel>
                <h2>
                  {v1.headline.lead} <span className="pv-light-accent">{v1.headline.accent}</span>
                </h2>
                <p className="pv-lede">{v1.lede}</p>
              </div>
            </Reveal>

            <div className="pv-v1-intro">
              <Reveal className="pv-v1-what">
                <h3 className="pv-subhead">{v1.what.title}</h3>
                <p className="pv-v1-body">{v1.what.body}</p>
                <ul className="pv-traits">
                  {v1.what.traits.map((trait, index) => (
                    <li key={trait}>
                      <span className="pv-trait-icon" aria-hidden="true">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          {TRAIT_ICONS[index % TRAIT_ICONS.length]}
                        </svg>
                      </span>
                      {trait}
                    </li>
                  ))}
                </ul>
              </Reveal>

              <div className="pv-v1-demo" id="demo">
                <p className="pv-demo-title">{v1.demo.title}</p>
                <p className="pv-demo-body">{v1.demo.body}</p>
                <PhoneDemo app={v1.demo.app} />
                <p className="pv-disclaimer">{v1.demo.disclaimer}</p>
              </div>
            </div>

            <div className="pv-screens">
              <Reveal>
                <h3 className="pv-subhead">{v1.screensTitle}</h3>
                <p className="pv-v1-body">{v1.screensLede}</p>
              </Reveal>
              <ScreenBento screens={v1.screens} />
            </div>

            <div className="pv-v1-split">
              <Reveal className="pv-sheet">
                <h3 className="pv-subhead">{v1.delivery.title}</h3>
                <ol className="pv-delivery">
                  {v1.delivery.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </Reveal>
              <Reveal className="pv-sheet is-muted" delay={0.08}>
                <h3 className="pv-subhead">{v1.notYet.title}</h3>
                <ul className="pv-not-yet">
                  {v1.notYet.items.map((item) => (
                    <li key={item.label}>
                      <span>{item.label}</span>
                      <em className={item.version.startsWith('V') ? 'is-version' : ''}>{item.version}</em>
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>

          </div>
        </section>

        {/* ── 04 Cómo la construimos ───────────────────────────────────── */}
        <section className="pv-band is-deep" id="pasos">
          <div className="shell">
            <Reveal>
              <div className="pv-head">
                <SectionLabel index="04">{process.label}</SectionLabel>
                <h2>{process.headline}</h2>
                <p className="pv-lede">{process.lede}</p>
              </div>
            </Reveal>

            <ol className="pv-steps">
              {process.steps.map((step, index) => (
                <li key={step.title} className="pv-step">
                  <Reveal delay={index * 0.08}>
                    <span className="pv-step-node" aria-hidden="true">
                      {index + 1}
                    </span>
                    <p className="pv-step-kicker">
                      Paso {index + 1} · <Value value={step.time} preview={preview} />
                    </p>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </Reveal>
                </li>
              ))}
            </ol>

            <p className="pv-total">
              <span>{process.totalLabel}</span>
              <strong>
                <Value value={process.total} preview={preview} />
              </strong>
            </p>
          </div>
        </section>

        {/* ── 05 Inversión ─────────────────────────────────────────────── */}
        <section className="pv-band is-panel investment-section" id="inversion">
          <div className="pricing-orbit" aria-hidden="true" />
          <div className="shell">
            <Reveal>
              <div className="pv-head is-center">
                <SectionLabel index="05">{investment.label}</SectionLabel>
                <h2>{investment.headline}</h2>
                <p className="pv-lede">{investment.lede}</p>
              </div>
            </Reveal>

            <Reveal>
              <article className="pricing-card pricing-card-featured pv-price-card">
                <PricingCorners />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="pricing-light" src="/light3.webp" alt="" aria-hidden="true" />
                <div className="pricing-dot-field" aria-hidden="true" />

                <p className="tier-name">
                  <span className="badge-orb" aria-hidden="true" />
                  {investment.cardTitle}
                </p>

                <div className="pv-price-options">
                  {investment.options.map((option) => (
                    <div className="pv-price-option" key={option.label}>
                      <p className="pv-price-label">{option.label}</p>
                      <p className="pv-price-amount">
                        <CountUp value={option.amount} />
                      </p>
                      <p className="pv-price-detail">
                        <Value value={option.detail} preview={preview} />
                      </p>
                    </div>
                  ))}
                </div>

                <p className="pv-price-includes-label">{investment.includesLabel}</p>
                <ul className="tier-includes pv-price-includes">
                  {investment.includes.map((line) => (
                    <li key={line}>
                      <Check />
                      {line}
                    </li>
                  ))}
                </ul>
              </article>
            </Reveal>

            {scopeHref && (
              <div className="pv-scope">
                <a className="pv-scope-link" href={scopeHref} download>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                    <path d="M14 3v5h5M12 11v6m-3-3 3 3 3-3" />
                  </svg>
                  {investment.scopeDownload.label}
                </a>
                <p>{investment.scopeDownload.note}</p>
              </div>
            )}

            <p className="pv-next">{investment.next}</p>
          </div>
        </section>

        {/* ── 06 Después de la V1 ──────────────────────────────────────── */}
        <section className="pv-band is-deep" id="despues">
          <div className="shell">
            <Reveal>
              <div className="pv-head">
                <SectionLabel index="06">{after.label}</SectionLabel>
                <h2>{after.headline}</h2>
                <p className="pv-lede">{after.lede}</p>
              </div>
            </Reveal>
            <div className="pv-signals">
              {after.signals.map((signal, index) => (
                <Reveal key={signal.title} delay={index * 0.08}>
                  <article className="pv-signal">
                    <span className="pv-signal-bars" aria-hidden="true">
                      {[0, 1, 2, 3].map((bar) => (
                        <i key={bar} className={bar <= index + 1 ? 'is-on' : ''} />
                      ))}
                    </span>
                    <h3>{signal.title}</h3>
                    <p>{signal.body}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── 07 Preguntas frecuentes ──────────────────────────────────── */}
        <section className="pv-band is-panel" id="preguntas">
          <div className="shell pv-faq">
            <Reveal>
              <div className="pv-head">
                <SectionLabel index="07">{faq.label}</SectionLabel>
                <h2>{faq.headline}</h2>
              </div>
            </Reveal>
            <FaqList entries={faq.entries} />
          </div>
        </section>

        {/* ── Cierre ───────────────────────────────────────────────────── */}
        <section className="section shell handoff-section" id="cierre">
          <div className="light-panel handoff-panel">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="section-light" src="/light4.webp" alt="" aria-hidden="true" />
            <Reveal>
              <div className="section-head section-head-center handoff-head">
                <h2>{close.headline}</h2>
                <p className="section-lede">{close.lede}</p>
                <InterestCta copy={close} token={token} />
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="proposal-footer">
        <div className="shell proposal-footer-inner">
          <div className="footer-sign">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="footer-logo" src="/brand/logotipo.svg" alt="Synous AI" />
            <span className="footer-meta">
              {content.envelope.recipient} · {content.envelope.dateLabel}
            </span>
          </div>
          <p className="footer-copyright">{content.footer}</p>
        </div>
      </footer>
    </div>
  )
}
