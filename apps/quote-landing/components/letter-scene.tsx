'use client'

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import TextType from '@/components/text-type/text-type'

function DiagonalArrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6 18 18 6M6 6h12v12" />
    </svg>
  )
}

/** Maximum tilt of the envelope, in degrees, at the edges of the scene. */
const MAX_TILT = 9

type Pointer = { x: number; y: number }

export type LetterSceneProps = {
  href: string
  /** Shown in the sheet header, opposite the logo. */
  dateLabel: string
  /** Client or company the proposal is addressed to; typed out on screen. */
  recipient: string
  /** Closing line above the signature. */
  statement: string
}

/**
 * The envelope: a light sheet tucked deep into a navy pocket, revealing only the
 * header until hover slides it out.
 *
 * The composition tilts toward the pointer and carries a badge pinned to the
 * cursor. Both read from a single pointermove handler — they need the same
 * coordinates, so splitting them would duplicate work per frame.
 */
export function LetterScene({ href, dateLabel, recipient, statement }: LetterSceneProps) {
  const sceneRef = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState<Pointer>({ x: 0, y: 0 })
  const [badge, setBadge] = useState<Pointer | null>(null)

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const scene = sceneRef.current
    if (!scene) return

    const rect = scene.getBoundingClientRect()
    // Normalise to -1..1 around the centre of the scene.
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1
    const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1

    setTilt({ x: nx, y: ny })
    setBadge({ x: event.clientX - rect.left, y: event.clientY - rect.top })
  }

  function handlePointerLeave() {
    setTilt({ x: 0, y: 0 })
    setBadge(null)
  }

  return (
    <div
      ref={sceneRef}
      className="letter-scene"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div className="scene-glow" aria-hidden="true" />

      <a
        className="envelope-composition"
        href={href}
        aria-label={`Ver la propuesta para ${recipient}`}
        style={{
          // rotateX is inverted: a pointer below centre tips the top toward you.
          transform: `translateY(-50%) rotateY(${tilt.x * MAX_TILT}deg) rotateX(${-tilt.y * MAX_TILT}deg)`,
        }}
      >
        <span className="envelope-back" />

        <span className="letter-sheet">
          <span className="sheet-header">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="sheet-logo" src="/brand/logotipo-ink.svg" alt="Synous" />
            <span>{dateLabel}</span>
          </span>

          <span className="sheet-title">
            <span className="sheet-title-lead">Propuesta para</span>
            <TextType
              as="span"
              className="sheet-recipient"
              text={recipient}
              typingSpeed={70}
              initialDelay={600}
              loop={false}
              showCursor
              cursorCharacter="_"
              cursorClassName="sheet-caret"
            />
          </span>

          <span className="sheet-rule" />

          <span className="sheet-body">{statement}</span>

          <span className="sheet-signature">El equipo de Synous ↗</span>
        </span>

        <span className="envelope-front">
          <span className="envelope-fold" />
        </span>

        <span className="envelope-seal">
          <span className="seal-glyph">
            <DiagonalArrow />
          </span>
        </span>
      </a>

      {badge && (
        <span
          className="cursor-badge"
          aria-hidden="true"
          style={{ transform: `translate3d(${badge.x}px, ${badge.y}px, 0)` }}
        >
          Ver propuesta
        </span>
      )}
    </div>
  )
}
