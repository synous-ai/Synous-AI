/**
 * The dotted arc that sits behind a section heading.
 *
 * Inlined rather than served as `/public/dots.svg` through an `<img>` on
 * purpose: an image is opaque to CSS, so its circles could never be animated
 * individually. Here each dot is a real element, and a staggered delay lights
 * them one after another down the arc.
 *
 * Coordinates come straight from the source file (89 circles, single radius),
 * stored top-to-bottom. The animation walks them in REVERSE, so the arc fills
 * from the bottom up: the lowest row lights first and each row above joins it
 * while the ones below stay lit, until the whole arc is glowing — then it all
 * fades and the fill starts over.
 */

/** Source artwork viewBox — do not rescale, the coordinates below assume it. */
const VIEW_BOX = '0 0 10165.44 2356.03'
const DOT_RADIUS = 28.17

/** One full pass of the arc, in seconds. Every dot shares it, offset by delay. */
const CYCLE_SECONDS = 6

/**
 * Share of the cycle spent filling, leaving the rest for the arc to hold its
 * full glow and fade out. Keep it below 1 or the last dots never light up.
 */
const FILL_SHARE = 0.55

const DOTS: readonly (readonly [number, number])[] = [
  [5253.41, 28.17], [6141.33, 28.17], [6999.86, 28.17], [7210.51, 28.17],
  [2743.03, 235.15], [3634.62, 235.15], [6530.82, 235.15], [7422.41, 235.15],
  [2743.03, 445.81], [3165.58, 445.81], [3634.62, 445.81], [4051.05, 445.81],
  [6114.39, 445.81], [6530.82, 445.81], [6999.86, 445.81], [7422.41, 445.81],
  [2534.85, 652.46], [2954.93, 652.46], [3165.58, 652.46], [3428.28, 652.46],
  [3843.47, 652.46], [4051.05, 652.46], [6114.39, 652.46], [6321.97, 652.46],
  [6737.16, 652.46], [6999.86, 652.46], [7210.51, 652.46], [7630.59, 652.46],
  [1700.51, 859.44], [2534.85, 859.44], [3428.28, 859.44], [5253.41, 859.44],
  [6737.16, 859.44], [7630.59, 859.44], [8464.93, 859.44], [1700.51, 1072.54],
  [2113.23, 1072.54], [2749.17, 1072.54], [7416.27, 1072.54], [8052.21, 1072.54],
  [8464.93, 1072.54], [1489.86, 1278.29], [1700.51, 1278.29], [2749.17, 1278.29],
  [2952.47, 1278.29], [3155.77, 1278.29], [4052.27, 1278.29], [4264.14, 1278.29],
  [4476.02, 1278.29], [5689.42, 1278.29], [5901.3, 1278.29], [6113.17, 1278.29],
  [7009.67, 1278.29], [7212.97, 1278.29], [7416.27, 1278.29], [8464.93, 1278.29],
  [8675.58, 1278.29], [2536.22, 1486.19], [7629.22, 1486.19], [1700.51, 1697.14],
  [2327.56, 1697.14], [2536.22, 1697.14], [7629.22, 1697.14], [7837.88, 1697.14],
  [8464.93, 1697.14], [28.17, 1906.42], [1489.86, 1906.42], [1913.61, 1906.42],
  [8251.83, 1906.42], [8675.58, 1906.42], [10137.27, 1906.42], [2536.22, 1911.17],
  [7629.22, 1911.17], [655.82, 2114.77], [1913.61, 2114.77], [2328.78, 2114.77],
  [7836.66, 2114.77], [8251.83, 2114.77], [9509.62, 2114.77], [28.17, 2327.86],
  [655.82, 2327.86], [866.48, 2327.86], [1913.61, 2327.86], [2328.78, 2327.86],
  [7836.66, 2327.86], [8251.83, 2327.86], [9298.96, 2327.86], [9509.62, 2327.86],
  [10137.27, 2327.86],
]

export function SectionDots() {
  return (
    <svg
      className="section-dots"
      viewBox={VIEW_BOX}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {DOTS.map(([cx, cy], index) => (
        <circle
          key={`${cx}-${cy}`}
          cx={cx}
          cy={cy}
          r={DOT_RADIUS}
          style={{
            // Reversed index: the LAST dot in the list is the lowest one on the
            // arc, so it gets no delay and the fill climbs from there.
            animationDelay: `${(
              ((DOTS.length - 1 - index) / DOTS.length) *
              CYCLE_SECONDS *
              FILL_SHARE
            ).toFixed(2)}s`,
          }}
        />
      ))}
    </svg>
  )
}
