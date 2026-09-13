type Phase = {
  label: string
  title: string
  description: string
}

/** One glyph per phase, drawn to match the step rather than decorate it. */
const GLYPHS: Record<string, JSX.Element> = {
  // Contexto — a lens over a field, for reading the business first.
  '01': (
    <path d="M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm10 18-5.2-5.2M8 11h6M11 8v6" />
  ),
  // Arquitectura — stacked planes, the written structure.
  '02': <path d="M12 3 3 7.5 12 12l9-4.5L12 3ZM3 12l9 4.5L21 12M3 16.5 12 21l9-4.5" />,
  // Prototype — a frame with a focal point, the designed experience.
  '03': (
    <path d="M3 5h18v14H3zM3 9h18M8 9v10M12.5 13.5l2 2 3.5-3.5" />
  ),
  // Development — brackets, the build itself.
  '04': <path d="M8 5 3 12l5 7M16 5l5 7-5 7M14 4l-4 16" />,
  // Lanzamiento — an upward signal, the launch.
  '05': (
    <path d="M12 21V7M7 12l5-5 5 5M4 4h16" />
  ),
  // Support — a shield with a pulse, covering the launch window.
  '06': (
    <path d="M12 3 4 6v6c0 4.4 3.4 7.9 8 9 4.6-1.1 8-4.6 8-9V6l-8-3ZM8 12h2l1.5-3 2 5 1.5-2H17" />
  ),
}

/** Registration marks at the four corners of a box. */
function CornerMarks({ variant }: { variant: 'card' | 'ring' }) {
  const prefix = variant === 'card' ? 'phase-mark' : 'phase-node'
  return (
    <>
      <span className={`${prefix} ${prefix}-tl`} aria-hidden="true" />
      <span className={`${prefix} ${prefix}-tr`} aria-hidden="true" />
      <span className={`${prefix} ${prefix}-br`} aria-hidden="true" />
      <span className={`${prefix} ${prefix}-bl`} aria-hidden="true" />
    </>
  )
}

/**
 * The six phases as a card grid. Each card carries corner marks and a glyph
 * held in three nested rings, with a rotating arc tracing the middle one, so
 * the set reads as instrumentation rather than a list.
 */
export function PhaseCards({ phases }: { phases: Phase[] }) {
  return (
    <div className="phase-grid">
      {phases.map((phase) => (
        <article className="phase-card" key={phase.label}>
          <CornerMarks variant="card" />

          <div className="phase-glyph-rail">
            <div className="phase-ring-outer">
              <CornerMarks variant="ring" />
              <div className="phase-ring-mid">
                <div className="phase-ring-core">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {GLYPHS[phase.label]}
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div className="phase-content">
            <p className="phase-step">
              <span className="badge-orb" aria-hidden="true" />
              Fase {phase.label}
            </p>
            <h3>{phase.title}</h3>
            <p className="phase-text">{phase.description}</p>
          </div>
        </article>
      ))}
    </div>
  )
}
