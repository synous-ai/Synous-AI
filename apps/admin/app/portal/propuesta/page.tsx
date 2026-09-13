import Aurora from '@/components/proposal/aurora/aurora'
import { GlowButton } from '@/components/proposal/glow-button'
import { GradualBlur } from '@/components/proposal/gradual-blur'
import { SmoothScroll } from '@/components/proposal/smooth-scroll'
import { WorkBento } from '@/components/proposal/work-bento'
import { PhaseCards } from '@/components/proposal/phase-cards'
import { Reveal } from '@/components/proposal/reveal'
import { FaqList } from '@/components/proposal/faq-list'
import { NAV, proposal } from './proposal-content'

/** Backdrop palette: deep indigo through the brand's pale and electric blues. */
const AURORA_STOPS: [string, string, string] = ['#181ba2', '#99c0fe', '#383cff']

function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m5 12 5 5L19 7" />
    </svg>
  )
}

function Minus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 12h12" />
    </svg>
  )
}

function PathIcon({ variant }: { variant: 'modules' | 'versions' }) {
  return (
    <span className="path-card-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        {variant === 'modules' ? (
          <>
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <path d="M17.5 14v7M14 17.5h7" />
          </>
        ) : (
          <>
            <path d="M7 7h10M7 12h7M7 17h4" />
            <path d="m16 15 3 3-3 3" />
          </>
        )}
      </svg>
    </span>
  )
}

/** Bracket ticks pinned to the four corners of the element they sit in. */
function CornerTicks() {
  return (
    <>
      <span className="tick tick-1" aria-hidden="true" />
      <span className="tick tick-2" aria-hidden="true" />
      <span className="tick tick-3" aria-hidden="true" />
      <span className="tick tick-4" aria-hidden="true" />
    </>
  )
}

function PricingCorners() {
  return (
    <>
      <span className="pricing-dot pricing-dot-tl" aria-hidden="true" />
      <span className="pricing-dot pricing-dot-tr" aria-hidden="true" />
      <span className="pricing-dot pricing-dot-br" aria-hidden="true" />
      <span className="pricing-dot pricing-dot-bl" aria-hidden="true" />
    </>
  )
}

function ImportantIcon({ variant }: { variant: 'timeline' | 'scope' }) {
  return (
    <span className="important-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        {variant === 'timeline' ? (
          <>
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M8 3v4M16 3v4M3 10h18" />
            <path d="M12 14v3l2 1" />
          </>
        ) : (
          <>
            <path d="M12 3 4 6v6c0 4.4 3.4 7.9 8 9 4.6-1.1 8-4.6 8-9V6l-8-3Z" />
            <path d="M8 12h8" />
          </>
        )}
      </svg>
    </span>
  )
}

export default function ProposalPage() {
  const {
    meta,
    hero,
    method,
    team,
    work,
    scope,
    guarantees,
    investment,
    important,
    faq,
    closing,
  } = proposal

  return (
    <div className="brand-surface proposal-page" id="top">
      <SmoothScroll />
      {/* Sits under the film grain (9999) so the texture stays on top. */}
      <GradualBlur height="7rem" strength={2} divCount={6} />
      {/* Floating pill rather than a full-width bar: corner ticks mark its
          bounds, and they step outward when the header is hovered. */}
      <header className="proposal-header">
        <CornerTicks />
        <a className="header-logo-link" href="#top" aria-label="Inicio">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="header-logo" src="/brand/logotipo.svg" alt="Synous AI" />
        </a>
        <nav className="header-nav" aria-label="Secciones de la propuesta">
          <ul>
            {NAV.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`}>{item.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main>
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="hero">
          {/* Inert so the CTAs underneath stay clickable. */}
          <div className="hero-backdrop" aria-hidden="true">
            <Aurora colorStops={AURORA_STOPS} blend={0.5} amplitude={1} speed={0.5} />
          </div>

          <div className="shell hero-inner">
            <p className="eyebrow badge-lg">
              <span className="badge-orb" aria-hidden="true" />
              {hero.eyebrow}
            </p>
            <h1>
              {hero.headline} <span className="accent-text">{hero.headlineHighlight}</span>
            </h1>
            <p className="lede">{hero.lede}</p>

            <div className="cta-row">
              <GlowButton href="#alcance">{hero.primaryCta}</GlowButton>
            </div>
          </div>
        </section>

        {/* ── Alcance solicitado ───────────────────────────────────────── */}
        <section className="section shell" id="alcance">
          <Reveal>
            <div className="section-head section-head-center">
              <p className="section-eyebrow"><span className="badge-orb" aria-hidden="true" />{scope.eyebrow}</p>
              <h2>{scope.heading}</h2>
              <p className="section-lede">{scope.lede}</p>
            </div>
          </Reveal>
          <div className="card-grid card-grid-two">
            {scope.phases.map((phase) => (
              <article className="card scope-phase-card" key={phase.title}>
                <p className="phase-badge"><span className="badge-orb" aria-hidden="true" />{phase.label}</p>
                <h3>{phase.title}</h3>
                <p>{phase.body}</p>
              </article>
            ))}
          </div>

          <div className="scope-paths">
            <h3 className="subheading">{scope.pathsHeading}</h3>
            <div className="card-grid card-grid-two">
              {scope.paths.map((path) => (
                <article className="card path-card" key={path.title}>
                  <PathIcon variant={path.icon} />
                  <h3>{path.title}</h3>
                  <p>{path.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Inversión ────────────────────────────────────────────────── */}
        <section className="section shell investment-section" id="inversion">
          <div className="pricing-orbit" aria-hidden="true" />
          <Reveal>
            <div className="section-head section-head-center">
              <p className="section-eyebrow"><span className="badge-orb" aria-hidden="true" />{investment.eyebrow}</p>
              <h2>{investment.heading}</h2>
            </div>
          </Reveal>

          <div className="tier-grid">
            {investment.phases.map((phase) => (
              <article className={`tier pricing-card${phase.options ? ' pricing-card-featured' : ''}`} key={phase.name}>
                <PricingCorners />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="pricing-light" src="/light3.webp" alt="" aria-hidden="true" />
                <div className="pricing-dot-field" aria-hidden="true" />

                <p className="tier-name"><span className="badge-orb" aria-hidden="true" />{phase.name}</p>

                <ul className="tier-includes">
                  {phase.includes.map((line) => (
                    <li key={line}>
                      <Check />
                      {line}
                    </li>
                  ))}
                </ul>

                {phase.price && (
                  <div className="pricing-single">
                    <p className="tier-price">{phase.price}</p>
                    {phase.payment && (
                      <p className="tier-payment">
                        <span>Pago</span>
                        {phase.payment}
                      </p>
                    )}
                  </div>
                )}

                {phase.options && (
                  <div className="option-list">
                    {phase.options.map((option) => (
                      <div className="option" key={option.label}>
                        <p className="option-label">{option.label}</p>
                        <p className="option-price">{option.price}</p>
                        <p className="option-terms">{option.terms}</p>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>

          <p className="section-closing">{investment.note}</p>
        </section>

        {/* ── Cómo trabajamos ──────────────────────────────────────────── */}
        {/* Full-bleed section: the backdrop video spans the viewport while the
            content stays inside its own shell. */}
        <section className="section method-section" id="como-trabajamos">
          <video
            className="method-backdrop"
            autoPlay
            muted
            loop
            playsInline
            poster="/VIDEOBENEFICTSFALLBACK.webp"
            aria-hidden="true"
          >
            <source src="/VIDEOBENEFICTS.mp4" type="video/mp4" />
          </video>

          <div className="shell method-inner">
            <Reveal>
              <div className="section-head method-head">
                <p className="method-badge badge-lg">
                  <span className="badge-orb" aria-hidden="true" />
                  {method.eyebrow}
                </p>
                <h2>{method.heading}</h2>
              </div>
            </Reveal>
            <Reveal>
              <PhaseCards phases={method.phases} />
            </Reveal>
          </div>
        </section>

        {/* ── Garantías: van después del precio, donde la duda aparece ─── */}
        <section className="section shell guarantees-section" id="garantias">
          {/* Dotted arc rising behind the heading, from the reference set. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="section-dots" src="/dots.svg" alt="" aria-hidden="true" />
          <Reveal>
            <div className="section-head section-head-center">
              <p className="section-eyebrow"><span className="badge-orb" aria-hidden="true" />{guarantees.eyebrow}</p>
              <h2>{guarantees.heading}</h2>
            </div>
          </Reveal>
          <div className="guarantee-bento">
            {guarantees.blocks.map((block) => (
              <article className="card card-accent" key={block.title}>
                <span className="card-rule" />
                <h3>{block.title}</h3>
                <p>{block.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── Proyectos ────────────────────────────────────────────────── */}
        <section className="section shell" id="proyectos">
          <Reveal>
            <div className="section-head section-head-center">
              <p className="section-eyebrow"><span className="badge-orb" aria-hidden="true" />{work.eyebrow}</p>
              <h2>{work.heading}</h2>
            </div>
          </Reveal>
          <Reveal>
            <WorkBento cases={work.cases} />
          </Reveal>
        </section>

        {/* ── Quiénes somos ────────────────────────────────────────────── */}
        <section className="section shell" id="quienes-somos">
          <Reveal>
            <div className="section-head">
              <p className="section-eyebrow"><span className="badge-orb" aria-hidden="true" />{team.eyebrow}</p>
              <h2>{team.heading}</h2>
            </div>
          </Reveal>
          <div className="team-body">
            {team.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <div className="card-grid card-grid-two">
            {team.members.map((member) => (
              <article className="card" key={member.name}>
                <h3>{member.name}</h3>
                <p className="team-member-title">{member.title}</p>
                <p>{member.description}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── Información importante ───────────────────────────────────── */}
        {/* Terms and exclusions gathered into one block after pricing: what
            governs the dates, and what the quote does not cover. */}
        <section className="section shell" id="informacion-importante">
          <Reveal>
            <div className="section-head section-head-center">
              <p className="section-eyebrow"><span className="badge-orb" aria-hidden="true" />{important.eyebrow}</p>
              <h2>{important.heading}</h2>
            </div>
          </Reveal>

          <Reveal>
            <div className="important-grid">
              <article className="important-card">
                <ImportantIcon variant="timeline" />
                <h3>{important.terms.title}</h3>
                <p>{important.terms.body}</p>
              </article>

              <article className="important-card">
                <ImportantIcon variant="scope" />
                <h3>{important.exclusionsTitle}</h3>
                <ul className="exclusion-list">
                  {important.exclusions.map((item) => (
                    <li key={item}>
                      <Minus />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </Reveal>
        </section>

        {/* ── Dudas ────────────────────────────────────────────────────── */}
        <section className="section shell" id="dudas">
          <Reveal>
            <div className="section-head">
              <p className="section-eyebrow"><span className="badge-orb" aria-hidden="true" />{faq.eyebrow}</p>
              <h2>{faq.heading}</h2>
            </div>
          </Reveal>
          <FaqList entries={faq.entries} />
        </section>

      </main>

      <footer className="proposal-footer" id="cierre">
        <div className="shell proposal-footer-inner">
          <div className="footer-sign">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="footer-logo" src="/brand/logotipo.svg" alt="Synous AI" />
            <span className="footer-meta">
              {meta.client} · {meta.date}
            </span>
          </div>

          <p className="footer-copyright">{closing.copyright}</p>
        </div>
      </footer>
    </div>
  )
}
