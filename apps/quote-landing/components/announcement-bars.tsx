type BarProps = {
  items: string[]
  /** Rotation in degrees. Opposite signs make the two bars cross. */
  angle: number
  direction: 'normal' | 'reverse'
  tone: 'solid' | 'ghost'
}

/** Repeats enough so the track always overflows the bar and never shows a gap. */
const REPEATS = 8

function Bar({ items, angle, direction, tone }: BarProps) {
  // The track is rendered as two identical halves; travelling -50% lands on the
  // start of the second half, so the loop has no visible seam.
  const half = Array.from({ length: REPEATS }, () => items).flat()

  return (
    <div
      className={`announce-bar announce-${tone}`}
      style={{ transform: `translate(-50%, -50%) rotate(${angle}deg)` }}
    >
      <div className={`announce-track${direction === 'reverse' ? ' is-reverse' : ''}`}>
        {[...half, ...half].map((item, index) => (
          <span className="announce-item" key={`${item}-${index}`}>
            <span>{item}</span>
            <span className="announce-pill" />
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Two announcement bars tilted in opposite directions. Both are centred on the
 * same point, so they cross in the middle of the screen behind the letter.
 */
export function AnnouncementBars({ items }: { items: string[] }) {
  return (
    <div className="announce-layer" aria-hidden="true">
      <Bar items={items} angle={-11} direction="normal" tone="solid" />
      <Bar items={items} angle={11} direction="reverse" tone="ghost" />
    </div>
  )
}
