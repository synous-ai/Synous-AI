'use client'

/*
 * Campana de notificaciones animada — adaptación de "Notification Bell" de RareUI.
 * https://www.rareui.com/components/notificationbell
 * Fuente: github.com/swamimalode07/rare-ui — components/ui/notification-bell.tsx
 * MIT License, Copyright (c) 2026 Swami Malode (texto completo al pie).
 *
 * Cambios respecto del original:
 *  - Importa de 'framer-motion': el admin no tiene el paquete `motion`, y
 *    `motion/react` no resuelve. Es la misma API.
 *  - Colores del tema del portal (`bg-secondary`, `text-muted-foreground`,
 *    `bg-destructive`…) en vez de hex con variantes `dark:`. El shell del portal
 *    es claro siempre, pero next-themes pone `.dark` en <html> según el sistema:
 *    con `dark:` la campana salía oscura sobre el portal claro.
 *  - `count` acepta `null` = "todavía no se sabe" (la consulta no volvió). Sin
 *    esto la campana sonaba en cada carga del portal, al pasar de 0 al número
 *    real; ahora el primer valor conocido no suena y solo suena lo que llega.
 *  - Nombre accesible: el original ponía el texto en un `role="status"` DENTRO
 *    del botón, que el árbol de accesibilidad no cuenta como nombre (el botón
 *    quedaba sin nombre). Acá el botón lleva `aria-label` y la región `status`
 *    va al lado, solo para anunciar cambios. Texto en español.
 */

import { useEffect, useRef } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { Slot, Slottable } from '@radix-ui/react-slot'
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
  type AnimationPlaybackControls,
  type MotionValue,
} from 'framer-motion'
import { cn } from '@portal/lib/utils'

const SURFACE = 'bg-secondary hover:bg-accent'
const GLYPH = 'text-muted-foreground hover:text-foreground'

const COLORS = {
  destructive: 'bg-destructive text-destructive-foreground',
  primary: 'bg-primary text-primary-foreground',
  signal: 'bg-signal text-signal-foreground',
} as const

// all sizes are a fraction of the size prop
const ICON = 0.56
const BADGE = 0.38
const DOT = 0.22
const FONT = 0.21
const PAD = 0.09
// how far out the badge sits, 1 puts it right on the edge
const ORBIT = 0.9

// low damping so it keeps swinging for a bit
const SWING_SPRING = {
  type: 'spring',
  stiffness: 220,
  damping: 10,
  mass: 1,
  restDelta: 0.01,
} as const
const CLAPPER_SPRING = { stiffness: 300, damping: 14, mass: 1 }
const COLUMN_SPRING = { stiffness: 400, damping: 30, mass: 0.9 }
const ENTER_SPRING = { type: 'spring', stiffness: 600, damping: 20 } as const
const FADE = { duration: 0.15 } as const

// degrees per second
const IMPULSE = 500
const MAX_VELOCITY = 900
const BURST = 5
const CLAPPER_SWEEP = 13
const CLAPPER_VELOCITY = 450

// how many digits to keep above and below, and how far behind the spring can get
const WINDOW = 3
const LAG = 2

// a taller window would show the next digit at rest, so the fade rides velocity instead
const ROLL_FADE = 34
const ROLL_VELOCITY = 9

const clamp = (value: number, limit: number): number => Math.max(-limit, Math.min(limit, value))

const digitOf = (value: number): number => ((value % 10) + 10) % 10

function badgeMetrics(size: number, dot: boolean): { side: number; inset: number } {
  const side = size * (dot ? DOT : BADGE)
  return {
    side,
    // puts the badge on the circle so it lines up at any size
    inset: size / 2 - (ORBIT * size * Math.SQRT1_2) / 2 - side / 2,
  }
}

/** `total` null = todavía no se sabe: el primer valor conocido no hace sonar la campana. */
function useBellRing(
  total: number | null,
  reduced: boolean,
): { swing: MotionValue<number>; clapper: MotionValue<number> } {
  const swing = useMotionValue(0)
  const swingVelocity = useVelocity(swing)
  // clapper follows the bell's speed, so it lags behind on its own
  const clapperLag = useTransform(
    swingVelocity,
    [-CLAPPER_VELOCITY, 0, CLAPPER_VELOCITY],
    [CLAPPER_SWEEP, 0, -CLAPPER_SWEEP],
    { clamp: true },
  )
  const clapper = useSpring(clapperLag, CLAPPER_SPRING)
  const previous = useRef<number | null>(total)
  const ringing = useRef<AnimationPlaybackControls | null>(null)

  useEffect(() => {
    const before = previous.current
    previous.current = total
    if (before === null || total === null) return
    const delta = total - before
    if (delta <= 0 || reduced) return

    const weight = 0.7 + (0.6 * Math.min(delta, BURST)) / BURST
    const moving = swing.getVelocity()
    // push it the way it is already moving so it swings harder
    const along = moving > 1 ? 1 : -1

    ringing.current = animate(swing, 0, {
      ...SWING_SPRING,
      velocity: clamp(moving + along * IMPULSE * weight, MAX_VELOCITY),
    })
  }, [total, reduced, swing])

  useEffect(() => () => ringing.current?.stop(), [])

  return { swing, clapper }
}

function BellIcon({
  side,
  swing,
  clapper,
}: {
  side: number
  swing: MotionValue<number>
  clapper: MotionValue<number>
}) {
  return (
    <motion.svg
      viewBox="0 0 18 18"
      fill="currentColor"
      aria-hidden
      width={side}
      height={side}
      // the bell hangs from the top, spinning from the middle looks wrong
      style={{ rotate: swing, transformOrigin: '50% 12%' }}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fillOpacity={0.55}
        d="M3.5 6.5C3.5 3.46279 5.96279 1 9 1C12.0372 1 14.5 3.46279 14.5 6.5V10.75C14.5 11.4408 15.0592 12 15.75 12C16.1642 12 16.5 12.3358 16.5 12.75C16.5 13.1642 16.1642 13.5 15.75 13.5H2.25C1.83579 13.5 1.5 13.1642 1.5 12.75C1.5 12.3358 1.83579 12 2.25 12C2.94079 12 3.5 11.4408 3.5 10.75V6.5Z"
      />
      <motion.path
        style={{
          rotate: clapper,
          transformBox: 'fill-box',
          transformOrigin: '50% 0%',
        }}
        d="M10.2 15H7.80099C7.64999 15 7.50799 15.068 7.41299 15.185C7.31799 15.302 7.28099 15.456 7.31199 15.603C7.48499 16.425 8.17999 17 9.00099 17C9.82199 17 10.517 16.425 10.69 15.603C10.721 15.456 10.684 15.302 10.589 15.185C10.494 15.068 10.351 15 10.2 15Z"
      />
    </motion.svg>
  )
}

// this only moves the way the count moved, so the digits roll the right way
function DigitColumn({ value, reduced }: { value: number; reduced: boolean }) {
  const position = useSpring(value, COLUMN_SPRING)
  const y = useTransform(position, (p) => `${-p * 100}%`)
  const velocity = useVelocity(position)
  const mask = useTransform(velocity, (v) => {
    const fade = Math.min(ROLL_FADE, (Math.abs(v) / ROLL_VELOCITY) * ROLL_FADE)
    return `linear-gradient(to bottom, transparent 0%, #000 ${fade}%, #000 ${100 - fade}%, transparent 100%)`
  })

  useEffect(() => {
    const gap = value - position.get()
    // on a big jump, move it closer first so there are still digits to show
    if (Math.abs(gap) > LAG) position.jump(value - Math.sign(gap) * LAG)
    if (reduced) position.jump(value)
    else position.set(value)
  }, [value, reduced, position])

  return (
    <motion.span
      className="relative inline-block h-[1em] overflow-hidden"
      style={{
        width: '1ch',
        maskImage: reduced ? undefined : mask,
        WebkitMaskImage: reduced ? undefined : mask,
      }}
    >
      <motion.span className="absolute inset-0" style={{ y }}>
        {Array.from({ length: WINDOW * 2 + 1 }, (_, i) => {
          const tile = value - WINDOW + i
          return (
            <span key={tile} className="absolute inset-x-0 flex justify-center" style={{ top: `${tile * 100}%` }}>
              {digitOf(tile)}
            </span>
          )
        })}
      </motion.span>
    </motion.span>
  )
}

function CountBadge({
  total,
  max,
  size,
  color,
  dot,
  reduced,
}: {
  total: number
  max: number
  size: number
  color: keyof typeof COLORS
  dot: boolean
  reduced: boolean
}) {
  const { side, inset } = badgeMetrics(size, dot)
  const clamped = total > max
  const places = clamped ? 0 : String(total).length

  return (
    <AnimatePresence initial={false}>
      {total > 0 && (
        <motion.span
          key="badge"
          // motion does not turn layout animation off for reduced motion, so we do it here
          layout={!reduced}
          aria-hidden
          className={cn('pointer-events-none absolute z-10 grid place-items-center rounded-full', COLORS[color])}
          style={{
            top: inset,
            right: inset,
            height: side,
            minWidth: side,
            paddingInline: dot ? 0 : size * PAD,
            fontSize: size * FONT,
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={reduced ? FADE : ENTER_SPRING}
        >
          {!dot && (
            <span
              className="flex font-semibold leading-none tracking-tight"
              // digits need the same width or the columns shift
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {clamped
                ? `${max}+`
                : Array.from({ length: places }, (_, i) => {
                    const place = places - 1 - i
                    return <DigitColumn key={place} value={Math.floor(total / 10 ** place)} reduced={reduced} />
                  })}
            </span>
          )}
        </motion.span>
      )}
    </AnimatePresence>
  )
}

export type NotificationBellProps = Omit<
  ComponentProps<'button'>,
  'children' | 'color' | 'onAnimationStart' | 'onDrag' | 'onDragStart' | 'onDragEnd'
> & {
  /** Sin leer. `null` mientras no se sabe: sin badge y sin sonar al llegar el primer valor. */
  count?: number | null
  max?: number
  variant?: 'count' | 'dot'
  size?: number
  color?: keyof typeof COLORS
  asChild?: boolean
  children?: ReactNode
}

export function NotificationBell({
  count = 0,
  max = 99,
  variant = 'count',
  size = 48,
  color = 'destructive',
  asChild = false,
  className,
  style,
  children,
  ...props
}: NotificationBellProps) {
  const reduced = useReducedMotion() ?? false
  const known = count === null ? null : Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  const total = known ?? 0
  // use the sanitized value so a weird count cannot ring the bell
  const { swing, clapper } = useBellRing(known, reduced)

  const badge = (
    <CountBadge total={total} max={max} size={size} color={color} dot={variant === 'dot'} reduced={reduced} />
  )

  const labelText = total > 0 ? `Notificaciones, ${total} sin leer` : 'Notificaciones'
  // Al lado del botón y no adentro: un `role="status"` dentro del botón queda
  // como nodo propio del árbol de accesibilidad y el botón se queda sin nombre.
  // El nombre lo da `aria-label`; esta región solo anuncia cuando la cuenta cambia.
  const status = (
    <span role="status" className="sr-only">
      {labelText}
    </span>
  )

  if (asChild) {
    return (
      <>
        <Slot
          data-slot="notification-bell"
          aria-label={labelText}
          className={cn('relative', className)}
          style={style}
          {...props}
        >
          <Slottable>{children}</Slottable>
          {badge}
        </Slot>
        {status}
      </>
    )
  }

  return (
    <>
      <button
        type="button"
        data-slot="notification-bell"
        className={cn(
          'relative grid place-items-center rounded-full outline-none transition-[transform,background-color,color] active:scale-90 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:active:scale-100',
          SURFACE,
          GLYPH,
          className,
        )}
        style={{ width: size, height: size, ...style }}
        aria-label={labelText}
        {...props}
      >
        <BellIcon side={size * ICON} swing={swing} clapper={clapper} />
        {badge}
      </button>
      {status}
    </>
  )
}

export default NotificationBell

/*
 * MIT License
 *
 * Copyright (c) 2026 Swami Malode
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
