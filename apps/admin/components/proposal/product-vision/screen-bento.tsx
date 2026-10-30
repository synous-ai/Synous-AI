'use client'

import type { PointerEvent } from 'react'
import type { ScreenMockup, V1Screen } from './product-vision-types'

/**
 * Mini pantallas dibujadas con HTML: ilustran cada pantalla de la V1 sin
 * imágenes. Son decorativas (el texto de la tarjeta dice lo mismo), por eso
 * van con `aria-hidden`.
 */
function Mockup({ kind }: { kind: ScreenMockup }) {
  if (kind === 'access') {
    return (
      <div className="pv-mock pv-mock-access" aria-hidden="true">
        <span className="pv-mock-lock">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </span>
        <span className="pv-mock-field">ana@ejemplo.com</span>
        <span className="pv-mock-field is-secret">••••••••</span>
        <span className="pv-mock-cta">Ingresar</span>
        <span className="pv-mock-link">¿Olvidaste tu contraseña?</span>
      </div>
    )
  }

  if (kind === 'home') {
    return (
      <div className="pv-mock pv-mock-home" aria-hidden="true">
        <span className="pv-mock-greet">Buen día, Ana.</span>
        <span className="pv-mock-title">Tu transformación empieza con lo que hacés hoy.</span>
        <span className="pv-mock-checkin">
          <b>¿Cómo te sentís hoy?</b>
          <span className="pv-mock-chips">
            <i>Con energía</i>
            <i>Me está costando</i>
          </span>
        </span>
        <span className="pv-mock-pills">
          <i>Entrenamiento</i>
          <i>Nutrición</i>
          <i>Mentalidad</i>
        </span>
      </div>
    )
  }

  if (kind === 'guide') {
    return (
      <div className="pv-mock pv-mock-guide" aria-hidden="true">
        <span className="pv-mock-bubble is-guide">¿En qué te gustaría enfocarte hoy?</span>
        <span className="pv-mock-bubble is-student">Me está costando arrancar con el entrenamiento.</span>
        <span className="pv-mock-bubble is-guide">
          Probemos achicar el primer paso: unos minutos suaves y vemos cómo te sentís.
        </span>
        <span className="pv-mock-typing">
          <i />
          <i />
          <i />
        </span>
      </div>
    )
  }

  if (kind === 'profile') {
    return (
      <div className="pv-mock pv-mock-profile" aria-hidden="true">
        <span className="pv-mock-avatar">A</span>
        <span className="pv-mock-name">Ana Ruiz</span>
        <span className="pv-mock-goal">
          <b>Mi objetivo</b>
          Mi primera salida de 80 km
        </span>
      </div>
    )
  }

  return (
    <div className="pv-mock pv-mock-admin" aria-hidden="true">
      <span className="pv-mock-admin-head">
        <b>Alumnos</b>
        <i>+ Alta</i>
      </span>
      <span className="pv-mock-stats">
        <span>
          <b>24</b>
          activos
        </span>
        <span>
          <b>132</b>
          consultas a la guía
        </span>
      </span>
      {[
        ['Ana Ruiz', true],
        ['Martín Gómez', true],
        ['Lucía Pérez', false],
      ].map(([name, active]) => (
        <span key={String(name)} className="pv-mock-row">
          <span className="pv-mock-row-avatar">{String(name)[0]}</span>
          <span className="pv-mock-row-name">{name}</span>
          <span className={`pv-mock-toggle${active ? ' is-on' : ''}`} />
        </span>
      ))}
    </div>
  )
}

/** Lleva la posición del puntero a la tarjeta, para el brillo que la sigue. */
function trackPointer(event: PointerEvent<HTMLElement>) {
  const card = event.currentTarget
  const rect = card.getBoundingClientRect()
  card.style.setProperty('--mx', `${event.clientX - rect.left}px`)
  card.style.setProperty('--my', `${event.clientY - rect.top}px`)
}

export function ScreenBento({ screens }: { screens: V1Screen[] }) {
  return (
    <ul className="pv-bento">
      {screens.map((screen) => (
        <li key={screen.mockup} className={`pv-bento-card is-${screen.mockup}`} onPointerMove={trackPointer}>
          <div className="pv-bento-visual">
            <Mockup kind={screen.mockup} />
          </div>
          <div className="pv-bento-copy">
            <h4>{screen.title}</h4>
            <ul>
              {screen.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        </li>
      ))}
    </ul>
  )
}
