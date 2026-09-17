import Aurora from '@/components/proposal/aurora/aurora'
import { ArchitectureFlow } from '@/components/proposal/architecture-flow'
import { GlowButton } from '@/components/proposal/glow-button'
import { GradualBlur } from '@/components/proposal/gradual-blur'
import { HideOnScrollHeader } from '@/components/proposal/hide-on-scroll-header'
import { SectionDots } from '@/components/proposal/section-dots'
import { SmoothScroll } from '@/components/proposal/smooth-scroll'
import { WorkBento } from '@/components/proposal/work-bento'
import { PhaseCards } from '@/components/proposal/phase-cards'
import { Reveal } from '@/components/proposal/reveal'
import { FaqList } from '@/components/proposal/faq-list'
import { NAV } from '@/app/portal/propuesta/proposal-content'
import type { ResolvedProposal } from '@/app/portal/propuesta/resolve-proposal'

/** Monto en dólares con separador de miles argentino: 7800 → "USD 7.800". */
function usd(amount: number): string {
  return `USD ${amount.toLocaleString('es-AR')}`
}

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

/**
 * Un glifo por bloque del diagnóstico, dibujado para nombrar el problema y no
 * para decorar: una vitrina vacía, piezas sueltas, y las mismas piezas unidas.
 */
function OriginIcon({ variant }: { variant: 'visibility' | 'scattered' | 'system' }) {
  return (
    <span className="origin-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {variant === 'visibility' && (
          <>
            {/* Marco vacío: lo que hay no se ve. */}
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M3 9h18" />
            <path d="M9 14.5h6" strokeDasharray="1 3" />
          </>
        )}
        {variant === 'scattered' && (
          <>
            {/* Cuatro piezas sin nada que las una. */}
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="5" width="6" height="6" rx="1.5" />
            <rect x="4" y="14" width="6" height="6" rx="1.5" />
            <rect x="14" y="15" width="7" height="6" rx="1.5" />
          </>
        )}
        {variant === 'system' && (
          <>
            {/* Las mismas piezas, ahora conectadas a un centro. */}
            <circle cx="12" cy="12" r="3" />
            <circle cx="12" cy="3.5" r="1.8" />
            <circle cx="20" cy="17" r="1.8" />
            <circle cx="4" cy="17" r="1.8" />
            <path d="M12 5.3v3.7M14.6 13.6l3.8 2.2M9.4 13.6l-3.8 2.2" />
          </>
        )}
      </svg>
    </span>
  )
}

/**
 * Un glifo por garantía. Cada uno dibuja el compromiso que nombra: el avance
 * que se ve, el plano antes de construir, la llave que queda del lado del
 * cliente y el sostén después de entregar.
 */
function GuaranteeIcon({
  variant,
}: {
  variant: 'progress' | 'blueprint' | 'ownership' | 'support'
}) {
  return (
    <span className="guarantee-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {variant === 'progress' && (
          <>
            {/* Hitos sobre una línea de avance. */}
            <path d="M3 18h18" />
            <path d="M6 18V9M12 18V5M18 18v-7" />
            <circle cx="6" cy="9" r="1.6" />
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="18" cy="11" r="1.6" />
          </>
        )}
        {variant === 'blueprint' && (
          <>
            {/* Un plano con su escuadra: lo escrito antes de construir. */}
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M8 4v16M3 10h5" />
            <path d="M12 9h5M12 13h7" />
          </>
        )}
        {variant === 'ownership' && (
          <>
            {/* Llave: el acceso queda de su lado. */}
            <circle cx="8" cy="12" r="4" />
            <path d="M12 12h9M17.5 12v3.5M20.5 12v2.5" />
          </>
        )}
        {variant === 'support' && (
          <>
            {/* Una mano sosteniendo lo entregado. */}
            <path d="M4 14v3a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-3" />
            <path d="M12 3v10M8.5 9.5 12 13l3.5-3.5" />
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

/**
 * La landing de la propuesta. Recibe el contenido ya resuelto (plantilla +
 * lo que traiga el cliente), así la misma pieza sirve al preview interno y al
 * link público `/p/<token>`.
 */
export function ProposalLanding({ proposal }: { proposal: ResolvedProposal }) {
  const {
    meta,
    hero,
    origin,
    milestone,
    architecture,
    handoff,
    method,
    // team — la sección "Quiénes somos" está oculta más abajo.
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
          bounds, and they step outward when the header is hovered. Hides on
          scroll down and comes back on scroll up. */}
      <HideOnScrollHeader className="proposal-header">
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
      </HideOnScrollHeader>

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
              <GlowButton href="#de-donde-partimos">{hero.primaryCta}</GlowButton>
            </div>
          </div>
        </section>

        {/* ── De dónde partimos ────────────────────────────────────────── */}
        {/* El diagnóstico antes de la propuesta: primero demostramos que
            entendimos el momento, después proponemos. */}
        <section className="section shell" id="de-donde-partimos">
          <Reveal>
            <div className="section-head">
              <p className="section-eyebrow"><span className="badge-orb" aria-hidden="true" />{origin.eyebrow}</p>
              <h2>{origin.heading}</h2>
              <p className="section-lede">{origin.lede}</p>
            </div>
          </Reveal>
          <div className="card-grid">
            {origin.blocks.map((block, index) => (
              <Reveal key={block.title} delay={index * 0.08}>
                <article className="card card-accent origin-card">
                  <OriginIcon variant={block.icon} />
                  <h3>{block.title}</h3>
                  <p>{block.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── El primer hito ───────────────────────────────────────────── */}
        {/* La fecha del evento ordena las prioridades del proyecto, así que
            tiene sección propia en vez de ser una línea perdida en los plazos. */}
        <section className="section shell milestone-section" id="primer-hito">
          {/* Mismo panel que el cierre: la luz vive DENTRO de la caja, recortada
              por su borde redondeado. El archivo trae su propio fondo oscuro, y
              suelto sobre la página se le ve el recorte contra el navy. */}
          <div className="light-panel">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="section-light" src="/light3.webp" alt="" aria-hidden="true" />
            <Reveal>
              <div className="section-head section-head-center">
                <p className="section-eyebrow"><span className="badge-orb" aria-hidden="true" />{milestone.eyebrow}</p>
                <h2>{milestone.heading}</h2>
                <p className="section-lede">{milestone.lede}</p>
              </div>
            </Reveal>
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
                {phase.note && <p className="scope-phase-note">{phase.note}</p>}
              </article>
            ))}
          </div>

          <div className="scope-paths">
            <h3 className="subheading">{scope.pathsHeading}</h3>
            <p className="subheading-lede">{scope.pathsLede}</p>
            <div className="card-grid card-grid-two">
              {scope.paths.map((path) => (
                <article className="card path-card" key={path.title}>
                  <PathIcon variant={path.icon} />
                  <h3>{path.title}</h3>
                  <p>{path.body}</p>
                </article>
              ))}
            </div>
            <p className="scope-future-note">{scope.pathsNote}</p>
          </div>
        </section>

        {/* ── Cómo se conecta todo ─────────────────────────────────────── */}
        {/* La arquitectura conceptual, en capas: responde a avanzar por partes
            sin rehacer lo ya construido. */}
        <section className="section shell architecture-section" id="arquitectura">
          <Reveal>
            <div className="section-head section-head-center">
              <p className="section-eyebrow"><span className="badge-orb" aria-hidden="true" />{architecture.eyebrow}</p>
              <h2>{architecture.heading}</h2>
              <p className="section-lede">{architecture.lede}</p>
            </div>
          </Reveal>

          <Reveal>
            <ArchitectureFlow layers={architecture.layers} />
          </Reveal>
        </section>

        {/* ── Inversión ────────────────────────────────────────────────── */}
        <section className="section shell investment-section" id="inversion">
          <div className="pricing-orbit" aria-hidden="true" />
          <Reveal>
            <div className="section-head section-head-center">
              <p className="section-eyebrow"><span className="badge-orb" aria-hidden="true" />{investment.eyebrow}</p>
              <h2>{investment.heading}</h2>
              <p className="section-lede">{investment.lede}</p>
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

                {phase.note && <p className="tier-note">{phase.note}</p>}

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

          {/* La opción recomendada, después de las individuales: el número se
              lee contra los dos que el lector acaba de ver. */}
          <Reveal>
            <article className="combo-card">
              <PricingCorners />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="combo-light" src="/light4.webp" alt="" aria-hidden="true" />

              <div className="combo-copy">
                <p className="combo-label">
                  <span className="badge-orb" aria-hidden="true" />
                  {investment.combo.label}
                </p>
                <h3 className="combo-title">{investment.combo.title}</h3>
                <p className="combo-body">{investment.combo.body}</p>
                <ul className="combo-benefits">
                  {investment.combo.benefits.map((line) => (
                    <li key={line}>
                      <Check />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="combo-options">
                {investment.combo.options.map((option) => {
                  const separate = option.sitePrice + option.platformPrice
                  return (
                    <div className="combo-option" key={option.label}>
                      <p className="combo-option-label">{option.label}</p>
                      <p className="combo-option-price">{usd(option.price)}</p>
                      {/* Cada forma de pago se compara contra su propio precio por
                          separado: una sola comparación para las dos mentía en una. */}
                      <p className="combo-option-compare">
                        <span className="combo-compare-label">{investment.combo.separateLabel}</span>
                        <s className="combo-strike">{usd(separate)}</s>
                        <span className="combo-saving">
                          {investment.combo.savingLabel} {usd(separate - option.price)}
                        </span>
                      </p>
                      <p className="combo-option-breakdown">
                        {investment.combo.siteLabel} {usd(option.sitePrice)} + {investment.combo.platformLabel}{' '}
                        {usd(option.platformPrice)}
                      </p>
                      <p className="combo-option-terms">{option.terms}</p>
                    </div>
                  )
                })}
              </div>
            </article>
          </Reveal>

          <p className="section-closing">{investment.note}</p>
        </section>

        {/* ── Cómo trabajamos ──────────────────────────────────────────── */}
        {/* Full-bleed section: the backdrop video spans the viewport while the
            content stays inside its own shell. */}
        <section className="section method-section" id="como-trabajamos">
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

            {/* El video envuelve a la grilla en vez de colgar de la sección:
                así su posición la fija la primera fila de tarjetas y no cambia
                cuando el titular crece o se acorta. */}
            <div className="method-stage">
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

              <Reveal>
                <PhaseCards phases={method.phases} />
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── Garantías: van después del precio, donde la duda aparece ─── */}
        <section className="section shell guarantees-section" id="garantias">
          {/* Dotted arc rising behind the heading, from the reference set. */}
          <SectionDots />
          <Reveal>
            <div className="section-head section-head-center">
              <p className="section-eyebrow"><span className="badge-orb" aria-hidden="true" />{guarantees.eyebrow}</p>
              <h2>{guarantees.heading}</h2>
            </div>
          </Reveal>
          <div className="guarantee-bento">
            {guarantees.blocks.map((block) => (
              <article className="card card-accent guarantee-card" key={block.title}>
                <GuaranteeIcon variant={block.icon} />
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
        {/* Oculta por ahora. El contenido sigue en `proposal-content.ts`:
            volver a mostrarla es descomentar este bloque y la línea `team`
            del destructuring de arriba. */}
        {/*
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
        */}

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
                <p>
                  <strong className="important-label">{important.terms.bodyLabel}</strong> {important.terms.body}
                </p>
                {important.terms.notes.map((note) => (
                  <p className="important-note" key={note.label}>
                    <strong className="important-label">{note.label}</strong> {note.text}
                  </p>
                ))}
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
                <p className="exclusion-note">{important.exclusionsNote}</p>
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

        {/* ── El siguiente paso ────────────────────────────────────────── */}
        {/* La página cierra pidiendo una decisión concreta: sin esto el lector
            termina el FAQ y no sabe qué se espera de él. */}
        <section className="section shell handoff-section" id="siguiente-paso">
          {/* The light lives INSIDE this panel, clipped to its rounded box. The
              artwork carries its own dark ground, so letting it bleed over the
              page would show a visible edge against the navy. */}
          <div className="light-panel handoff-panel">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="section-light" src="/light4.webp" alt="" aria-hidden="true" />
            <Reveal>
              <div className="section-head section-head-center handoff-head">
                <p className="section-eyebrow"><span className="badge-orb" aria-hidden="true" />{handoff.eyebrow}</p>
                <h2>{handoff.heading}</h2>

                <div className="cta-row handoff-cta">
                  <GlowButton href={handoff.whatsappUrl} external>
                    {handoff.primaryCta}
                  </GlowButton>
                </div>
              </div>
            </Reveal>
          </div>
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
