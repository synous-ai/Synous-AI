type CaseStudy = {
  name: string
  kind: string
  description: string
  proves: string
}

type CaseVisual = {
  images: readonly [string, string]
  light?: string
}

const CASE_VISUALS: Record<string, CaseVisual> = {
  'Consciencia MCE': {
    images: ['/mockup-mce1.png', '/mockup-mce2.png'],
    light: '/light4.webp',
  },
  CASC: {
    images: ['/mockup-casc1.png', '/mockup-casc2.png'],
    light: '/light3.webp',
  },
  'Aura Studio': {
    images: ['/mockup-aura1.png', '/mockup-aura2.png'],
  },
}

/** Filled dots pinned inside the four corners of a bento cell. */
function CellDots() {
  return (
    <>
      <span className="bento-dot bento-dot-1" aria-hidden="true" />
      <span className="bento-dot bento-dot-2" aria-hidden="true" />
      <span className="bento-dot bento-dot-3" aria-hidden="true" />
      <span className="bento-dot bento-dot-4" aria-hidden="true" />
    </>
  )
}

function CaseBody({ item }: { item: CaseStudy }) {
  return (
    <div className="bento-copy">
      <p className="case-kind">
        <span className="badge-orb" aria-hidden="true" />
        {item.kind}
      </p>
      <h3>{item.name}</h3>
      <p>{item.description}</p>
    </div>
  )
}

function PortfolioBackdrop({ name, delay }: { name: string; delay: number }) {
  const visual = CASE_VISUALS[name]
  if (!visual) return null

  return (
    <div className={`bento-stage portfolio-backdrop portfolio-backdrop-delay-${delay}`} aria-hidden="true">
      {visual.images.map((src, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={`portfolio-mockup portfolio-mockup-${index + 1}`}
          src={src}
          alt=""
          key={src}
        />
      ))}
      {visual.light && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="portfolio-light" src={visual.light} alt="" />
      )}
    </div>
  )
}

/**
 * The portfolio cases laid out on the same bento the outcome section uses, so
 * both read as one system. The signal cell opens the row; each case then gets a
 * cell sized to how much it has to say.
 */
export function WorkBento({ cases }: { cases: CaseStudy[] }) {
  const [first, second, third] = cases

  return (
    <div className="bento">
      <div className="bento-row">
        <div className="bento-cell bento-cell-signal">
          <CellDots />
          <div className="bento-rings" aria-hidden="true">
            <span className="bento-ring" />
            <span className="bento-ring bento-ring-2" />
            <span className="bento-ring bento-ring-3" />
            <span className="bento-ring bento-ring-4" />
            <span className="bento-ring-core">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/logo-synous.svg" alt="" />
            </span>
          </div>
        </div>

        {first && (
          <article className="bento-cell bento-cell-lead portfolio-card">
            <CellDots />
            <PortfolioBackdrop name={first.name} delay={0} />
            <CaseBody item={first} />
          </article>
        )}
      </div>

      <div className="bento-row">
        {second && (
          <article className="bento-cell bento-cell-wide portfolio-card">
            <CellDots />
            <PortfolioBackdrop name={second.name} delay={1} />
            <CaseBody item={second} />
          </article>
        )}

        {third && (
          <article className="bento-cell bento-cell-narrow portfolio-card">
            <CellDots />
            <PortfolioBackdrop name={third.name} delay={2} />
            <CaseBody item={third} />
          </article>
        )}
      </div>
    </div>
  )
}
