export type MockupKind = 'platform' | 'institutional' | 'placeholder'

/**
 * Abstract representation of a built product: a browser-ish frame with blocked
 * out regions, drawn entirely in markup so no screenshot is needed.
 *
 * Each variant arranges its blocks differently, so three cards side by side read
 * as three distinct products rather than the same picture repeated.
 */
export function ProjectMockup({ kind }: { kind: MockupKind }) {
  return (
    <div className={`mockup mockup-${kind}`} aria-hidden="true">
      <div className="mockup-bar">
        <span />
        <span />
        <span />
      </div>

      <div className="mockup-body">
        {kind === 'platform' && (
          <>
            <div className="mockup-side">
              <span className="mockup-pill mockup-pill-lit" />
              <span className="mockup-pill" />
              <span className="mockup-pill" />
              <span className="mockup-pill" />
            </div>
            <div className="mockup-main">
              <span className="mockup-line mockup-line-wide" />
              <div className="mockup-row">
                <span className="mockup-tile" />
                <span className="mockup-tile" />
              </div>
              <span className="mockup-line" />
              <span className="mockup-line mockup-line-short" />
            </div>
          </>
        )}

        {kind === 'institutional' && (
          <div className="mockup-main">
            <span className="mockup-hero" />
            <div className="mockup-row">
              <span className="mockup-tile" />
              <span className="mockup-tile" />
              <span className="mockup-tile" />
            </div>
            <span className="mockup-line" />
            <span className="mockup-line mockup-line-short" />
          </div>
        )}

        {kind === 'placeholder' && (
          <div className="mockup-main mockup-main-empty">
            <span className="mockup-line mockup-line-short" />
            <span className="mockup-line mockup-line-short" />
          </div>
        )}
      </div>
    </div>
  )
}
