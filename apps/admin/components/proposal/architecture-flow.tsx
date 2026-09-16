'use client'

import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion'

type Layer = {
  label: string
  title: string
  body: string
}

/**
 * Las capas de la arquitectura como un recorrido, no como una lista.
 *
 * En escritorio las tarjetas se alternan izquierda y derecha, unidas por una
 * curva punteada que va de una a la siguiente: el argumento de la sección es
 * que cada etapa se apoya en la anterior, y una pila de tarjetas iguales no lo
 * dice — el trazo sí.
 *
 * GEOMETRÍA COMPARTIDA: las tarjetas y el trazo salen de las MISMAS constantes
 * de abajo, y el SVG usa un viewBox en píxeles reales (no una grilla de 1000
 * unidades estirada). Sin eso cada uno vive en su propio sistema de
 * coordenadas y el trazo nace y muere lejos de las tarjetas que debería unir.
 *
 * Bajo el breakpoint la curva se va y las tarjetas se apilan: a ese ancho el
 * serpenteo no entra y la lectura lineal es más clara.
 *
 * Sin número de paso en cada tarjeta: la etiqueta ya dice a qué proyecto
 * pertenece, y un "03" al lado de "PROYECTO 02" se leía como otra numeración.
 */

/** Ancho del lienzo en el que se calculan las posiciones. */
const CANVAS_WIDTH = 1000
/** Ancho de cada tarjeta — el mismo valor que usa el CSS. */
const CARD_WIDTH = 340
/** Margen lateral desde el borde del lienzo hasta la tarjeta. */
const SIDE_INSET = 40
/** Alto aproximado de una tarjeta, para anclar el trazo a su centro vertical. */
const CARD_HEIGHT = 168
/** Separación vertical entre el tope de una tarjeta y el de la siguiente. */
const STEP = 210
/** Margen superior de la primera tarjeta. */
const TOP_INSET = 24

/** Alto total: la última tarjeta completa más un respiro al pie. */
function canvasHeight(count: number): number {
  if (count < 1) return 0
  return TOP_INSET + (count - 1) * STEP + CARD_HEIGHT + 24
}

/** Centro vertical de la tarjeta `index`. */
function cardCenterY(index: number): number {
  return TOP_INSET + index * STEP + CARD_HEIGHT / 2
}

/**
 * Curva que enhebra las tarjetas. Arranca en el borde interno de una y termina
 * en el borde interno de la siguiente, así el trazo toca las dos en lugar de
 * pasar cerca.
 *
 * Los puntos de control salen hacia afuera para que el arco se lea como un
 * flujo y no como un zigzag, pero sin salirse del lienzo.
 */
function buildPath(count: number): string {
  if (count < 2) return ''

  const leftEdge = SIDE_INSET + CARD_WIDTH
  const rightEdge = CANVAS_WIDTH - SIDE_INSET - CARD_WIDTH

  let d = ''

  for (let i = 0; i < count - 1; i += 1) {
    const y = cardCenterY(i)
    const nextY = cardCenterY(i + 1)
    // Las pares están a la izquierda: el trazo sale por su borde derecho.
    const fromLeft = i % 2 === 0
    const startX = fromLeft ? leftEdge : rightEdge
    const endX = fromLeft ? rightEdge : leftEdge
    // El control se aleja hacia el lado del que viene, dando la panza del arco.
    const bend = fromLeft ? CANVAS_WIDTH - 40 : 40

    if (i === 0) d += `M ${startX} ${y}`
    d += ` C ${bend} ${y}, ${bend} ${nextY}, ${endX} ${nextY}`
  }

  return d
}

export function ArchitectureFlow({ layers }: { layers: Layer[] }) {
  const reduceMotion = useReducedMotion()
  const height = canvasHeight(layers.length)
  const path = buildPath(layers.length)

  return (
    <LazyMotion features={domAnimation}>
      <div
        className="arch-flow"
        style={{
          ['--arch-height' as string]: `${height}px`,
          ['--arch-step' as string]: `${STEP}px`,
          ['--arch-top' as string]: `${TOP_INSET}px`,
          ['--arch-card-width' as string]: `${CARD_WIDTH}px`,
          ['--arch-inset' as string]: `${SIDE_INSET}px`,
        }}
      >
        {layers.length > 1 && (
          <svg
            className="arch-flow-trail"
            viewBox={`0 0 ${CANVAS_WIDTH} ${height}`}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <m.path
              d={path}
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="7 7"
              strokeLinecap="round"
              fill="none"
              vectorEffect="non-scaling-stroke"
              {...(reduceMotion
                ? {}
                : {
                    initial: { strokeDashoffset: 0 },
                    // Múltiplo del patrón (7+7) para que el ciclo cierre sin salto.
                    animate: { strokeDashoffset: -140 },
                    transition: { duration: 4, repeat: Infinity, ease: 'linear' },
                  })}
            />
          </svg>
        )}

        {layers.map((layer, index) => (
          <article
            className={`arch-flow-card ${index % 2 === 0 ? 'is-left' : 'is-right'}`}
            key={layer.title}
            style={{ ['--arch-index' as string]: index }}
          >
            <span className="tick tick-1" aria-hidden="true" />
            <span className="tick tick-2" aria-hidden="true" />
            <span className="tick tick-3" aria-hidden="true" />
            <span className="tick tick-4" aria-hidden="true" />

            <p className="arch-flow-label">{layer.label}</p>
            <h3 className="arch-flow-title">{layer.title}</h3>
            <p className="arch-flow-body">{layer.body}</p>
          </article>
        ))}
      </div>
    </LazyMotion>
  )
}
