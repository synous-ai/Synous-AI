'use client'

/*
 * Carpeta animada — adaptación de "Folder Component" de RareUI.
 * https://www.rareui.com/components/foldercomponent
 * Fuente: github.com/swamimalode07/rare-ui — components/ui/folder-component.tsx
 * MIT License, Copyright (c) 2026 Swami Malode (texto completo al pie).
 *
 * Cambios respecto del original:
 *  - Importa de 'framer-motion': el admin no tiene el paquete `motion`, y
 *    `motion/react` no resuelve. Es la misma API.
 *  - `open` y `hovered` se pueden controlar desde afuera. El original solo tenía
 *    estado interno y el click vivía en un <div>, sin acceso por teclado. Acá la
 *    carpeta es decorativa (aria-hidden) y la interacción la da el <button> que
 *    la envuelve, que maneja hover y foco.
 *  - Los ids de los filtros SVG salen de useId. El original los fijaba, así que
 *    varias carpetas en una misma página repetían ids.
 *  - Tamaño `xs` y tema `graphite` (el gris de la referencia "Docs").
 *  - Respeta prefers-reduced-motion: sin resorte, cambio inmediato.
 *  - Perspectiva fija (FLAP_PERSPECTIVE) y desenfoque proporcional a la escala:
 *    el original escalaba la perspectiva, lo que deformaba la solapa en
 *    cualquier tamaño distinto de `md`.
 *  - La solapa se centra con `x`/`y` de Framer y no con -translate-*-1/2: el
 *    original asume Tailwind v4; en v3 (este proyecto) la clase y Framer se
 *    pisan el `transform` y la solapa se descentra.
 */

import * as React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@portal/lib/utils'

const themes = {
  black: {
    backFill: 'black',
    backInsetShadow: 'inset 0 0 6px 2px rgba(255,255,255,0.37)',
    flapFill: '#292929',
    flapFillOpacity: 0.25,
    flapStroke: '#979797',
    flapInsetColor: '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.08 0',
    cardFill: '#F1F1F1',
    cardStroke: '#E0E0E0',
    cardLineFill: '#D4D4D4',
    cardInsetColor: '0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0',
  },
  white: {
    backFill: '#ffffff',
    backInsetShadow: 'inset 0 0 6px 2px rgba(178,178,178,0.25)',
    flapFill: '#f5f5f5',
    flapFillOpacity: 0.85,
    flapStroke: '#d4d4d4',
    flapInsetColor: '0 0 0 0 0.6 0 0 0 0 0.6 0 0 0 0 0.6 0 0 0 0.15 0',
    cardFill: '#262626',
    cardStroke: '#404040',
    cardLineFill: '#737373',
    cardInsetColor: '0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.15 0',
  },
  blue: {
    backFill: '#50B1FD',
    backInsetShadow: 'inset 0 0 6px 2px rgba(255,255,255,0.35)',
    flapFill: '#3a9ae8',
    flapFillOpacity: 0.45,
    flapStroke: '#7ec8ff',
    flapInsetColor: '0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.12 0',
    cardFill: '#F1F1F1',
    cardStroke: '#E0E0E0',
    cardLineFill: '#D4D4D4',
    cardInsetColor: '0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0',
  },
  /** Agregado local: carpeta gris con volumen, como la fila "Shortcut" de la referencia. */
  graphite: {
    backFill: '#3b3b3d',
    backInsetShadow: 'inset 0 0 6px 2px rgba(255,255,255,0.16)',
    flapFill: '#8e8e93',
    flapFillOpacity: 0.42,
    flapStroke: '#a1a1a6',
    flapInsetColor: '0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.1 0',
    cardFill: '#F1F1F1',
    cardStroke: '#E0E0E0',
    cardLineFill: '#D4D4D4',
    cardInsetColor: '0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0',
  },
} as const

const sizeScales = {
  /** Agregado local: ~83×70px, el tamaño de las carpetas de un listado de accesos. */
  xs: 0.26,
  sm: 0.65,
  md: 1,
  lg: 1.35,
} as const

type FolderTheme = (typeof themes)[keyof typeof themes]

export type FolderProps = Omit<React.ComponentProps<'div'>, 'color'> & {
  color?: keyof typeof themes
  size?: keyof typeof sizeScales
  /** Controlado: carpeta abierta. Sin prop, se abre/cierra con click (como el original). */
  open?: boolean
  /** Controlado: pose de hover. Sin prop, la maneja el mouse sobre la carpeta. */
  hovered?: boolean
}

const BASE_WIDTH = 321
const BASE_HEIGHT = 270
/**
 * Perspectiva de la solapa, en unidades LOCALES (las del dibujo de 321×241).
 * El original usaba `800 * scale`, pero el contenedor que la declara ya está
 * escalado: la perspectiva se mide en su espacio local, donde la solapa mide
 * siempre lo mismo. Multiplicarla por la escala la achicaba en tamaños chicos
 * y deformaba la solapa: en `xs` (208) el borde superior en hover se
 * proyectaba ~5,5× más ancho. Fija en 800 = la geometría de la demo en `md`.
 */
const FLAP_PERSPECTIVE = 800
/** Desenfoque del vidrio a escala `md`. Se multiplica por la escala: el navegador no lo achica con el transform. */
const FLAP_BLUR = 6

const FLAP_PATH =
  'M0 25C0 11.1929 11.1929 0 25 0H136.084C143.044 0 149.689 2.90139 154.42 8.00608L178.08 33.5343C182.811 38.639 189.456 41.5404 196.416 41.5404H296C309.807 41.5404 321 52.7333 321 66.5404V216C321 229.807 309.807 241 296 241H25C11.1929 241 0 229.807 0 216V25Z'

/** Posiciones de las hojas que asoman, de atrás hacia adelante: [cerrada, hover, abierta]. */
const SHEETS = [
  { id: 1, y: [-10, -30, -160], x: [40, 40, 70], rotate: [10, 14, 18], delay: [0, 0.12, 0.1] },
  { id: 2, y: [-20, -35, -180], x: [3, 3, 0], rotate: [2, -1, -3], delay: [0, 0.06, 0.05] },
  { id: 3, y: [-22, -44, -170], x: [-40, -40, -65], rotate: [-5, -9, -14], delay: [0, 0, 0] },
] as const

export function Folder({
  color = 'black',
  size = 'md',
  open: openProp,
  hovered: hoveredProp,
  className,
  ...props
}: FolderProps) {
  const theme = themes[color] ?? themes.black
  const scale = sizeScales[size]
  const [hoveredState, setHoveredState] = React.useState(false)
  const [openState, setOpenState] = React.useState(false)
  const reduceMotion = useReducedMotion()
  // useId devuelve ":r0:" — los dos puntos rompen las referencias `url(#…)` de SVG.
  const uid = React.useId().replace(/:/g, '')

  const openControlled = openProp !== undefined
  const hoverControlled = hoveredProp !== undefined
  const isOpen = openProp ?? openState
  const isHovered = hoveredProp ?? hoveredState
  const pose = isOpen ? 2 : isHovered ? 1 : 0

  const spring = (damping: number, delay = 0) =>
    reduceMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 120, damping, delay }

  const flapFilterId = `${uid}-flap`

  return (
    <div
      data-slot="folder"
      aria-hidden
      className={cn('relative flex h-full w-full items-center justify-center', className)}
      {...props}
    >
      <div
        className={cn('relative select-none', !openControlled && 'cursor-pointer')}
        style={{
          width: BASE_WIDTH * scale,
          height: BASE_HEIGHT * scale,
          touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent',
        }}
        onMouseEnter={hoverControlled ? undefined : () => setHoveredState(true)}
        onMouseLeave={
          hoverControlled
            ? undefined
            : () => {
                setHoveredState(false)
                if (!openControlled) setOpenState(false)
              }
        }
        onClick={openControlled ? undefined : () => setOpenState((current) => !current)}
      >
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            width: BASE_WIDTH,
            height: BASE_HEIGHT,
            transform: `translate(-50%, -50%) scale(${scale})`,
            perspective: FLAP_PERSPECTIVE,
          }}
        >
          {/* Fondo de la carpeta */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div
              style={{
                width: BASE_WIDTH,
                height: BASE_HEIGHT,
                borderRadius: 25,
                backgroundColor: theme.backFill,
                boxShadow: theme.backInsetShadow,
              }}
            />
          </div>

          {/* Hojas */}
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
            {SHEETS.map((sheet) => (
              <motion.div
                key={sheet.id}
                className="absolute"
                animate={{ y: sheet.y[pose], x: sheet.x[pose], rotate: sheet.rotate[pose] }}
                transition={spring(13, sheet.delay[pose])}
              >
                <FolderSheet filterId={`${uid}-sheet-${sheet.id}`} theme={theme} />
              </motion.div>
            ))}
          </div>

          {/* Solapa frontal (vidrio esmerilado).
              El centrado va por `x`/`y` de Framer y NO por las clases
              -translate-*-1/2: en Tailwind v3 esas clases escriben `transform`,
              y Framer pisa `transform` inline al animar `rotateX`, así que la
              solapa perdía el centrado y quedaba corrida abajo a la derecha.
              (El original es para Tailwind v4, donde -translate usa la
              propiedad `translate`, que sí compone con `transform`.) */}
          <motion.div
            className="absolute left-1/2 top-1/2 mt-4"
            style={{
              x: '-50%',
              y: '-50%',
              transformOrigin: 'bottom center',
              transformStyle: 'preserve-3d',
              width: 321,
              height: 241,
            }}
            animate={{ rotateX: isOpen ? -55 : isHovered ? -45 : -15 }}
            transition={spring(14)}
          >
            <div
              className="absolute inset-0"
              style={{
                backdropFilter: `blur(${FLAP_BLUR * scale}px)`,
                WebkitBackdropFilter: `blur(${FLAP_BLUR * scale}px)`,
                clipPath: `path('${FLAP_PATH}')`,
                WebkitClipPath: `path('${FLAP_PATH}')`,
                transform: 'translateZ(0)',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                willChange: 'transform',
              }}
            />
            <svg
              className="absolute inset-0"
              width="321"
              height="241"
              viewBox="0 0 321 241"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <g filter={`url(#${flapFilterId})`}>
                <path d={FLAP_PATH} fill={theme.flapFill} fillOpacity={theme.flapFillOpacity} />
                <path
                  d="M25 0.5H136.084C142.905 0.5 149.417 3.3431 154.054 8.3457L177.713 33.874C182.539 39.0808 189.317 42.04 196.416 42.04H296C309.531 42.04 320.5 53.0092 320.5 66.54V216C320.5 229.531 309.531 240.5 296 240.5H25C11.469 240.5 0.5 229.531 0.5 216V25C0.5 11.469 11.469 0.5 25 0.5Z"
                  stroke={theme.flapStroke}
                />
              </g>
              <defs>
                <filter
                  id={flapFilterId}
                  x="-25.4"
                  y="-25.4"
                  width="371.8"
                  height="291.8"
                  filterUnits="userSpaceOnUse"
                  colorInterpolationFilters="sRGB"
                >
                  <feFlood floodOpacity="0" result="BackgroundImageFix" />
                  <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
                  <feColorMatrix
                    in="SourceAlpha"
                    type="matrix"
                    values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                    result="hardAlpha"
                  />
                  <feOffset />
                  <feGaussianBlur stdDeviation="2.65" />
                  <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
                  <feColorMatrix type="matrix" values={theme.flapInsetColor} />
                  <feBlend mode="normal" in2="shape" result="effect1_innerShadow" />
                </filter>
              </defs>
            </svg>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

/** Renglones de texto simulados de cada hoja: [y columna izquierda, y columna derecha]. */
const SHEET_ROWS = [
  [60.9939, 60.9617],
  [75.1122, 75.0801],
  [89.2306, 89.1985],
  [103.349, 103.317],
  [117.467, 117.435],
  [131.586, 131.554],
  [145.704, 145.672],
  [159.823, 159.79],
  [173.941, 173.909],
] as const

function FolderSheet({ filterId, theme }: { filterId: string; theme: FolderTheme }) {
  return (
    <div data-slot="folder-card">
      <svg width="164" height="214" viewBox="0 0 164 214" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g filter={`url(#${filterId})`}>
          <rect width="163.078" height="213.262" rx="20" fill={theme.cardFill} />
        </g>
        <rect x="0.5" y="0.5" width="162.078" height="212.262" rx="19.5" stroke={theme.cardStroke} />
        <rect x="14.1193" y="31.2091" width="134.84" height="11.8892" rx="5.94459" fill={theme.cardLineFill} />
        {SHEET_ROWS.map(([leftY, rightY]) => (
          <React.Fragment key={leftY}>
            <rect
              width="64.5183"
              height="5.88276"
              rx="2.94138"
              transform={`matrix(1 -0.000409158 0.00201956 0.999998 14.8253 ${leftY})`}
              fill={theme.cardLineFill}
            />
            <rect
              width="64.5183"
              height="5.88276"
              rx="2.94138"
              transform={`matrix(1 -0.000461045 0.00179228 0.999998 84.4303 ${rightY})`}
              fill={theme.cardLineFill}
            />
          </React.Fragment>
        ))}
        <defs>
          <filter
            id={filterId}
            x="0"
            y="0"
            width="166.078"
            height="218.262"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha"
            />
            <feMorphology radius="2" operator="erode" in="SourceAlpha" result="effect1_innerShadow" />
            <feOffset dx="3" dy="5" />
            <feGaussianBlur stdDeviation="3.05" />
            <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
            <feColorMatrix type="matrix" values={theme.cardInsetColor} />
            <feBlend mode="normal" in2="shape" result="effect1_innerShadow" />
          </filter>
        </defs>
      </svg>
    </div>
  )
}

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
