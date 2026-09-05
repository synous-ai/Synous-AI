'use client'

/**
 * Shell visual compartido del wizard de onboarding post-venta.
 *
 * RESTYLE editorial oscuro (referencia "K100"): negro casi puro + textura de
 * puntos (heredado del scope `.portal-editorial` en portal-theme.css, que
 * envuelve todo `(app)/layout.tsx`), serif display para títulos, top bar con
 * marca + contador "0X / 08" + línea de progreso fina, badge pill centrado, y
 * botón primario en pill blanco con flecha. Dark-only a propósito — no
 * depende del theme toggle (que además ya no existe en el shell del portal).
 *
 * Lo que se conserva de versiones anteriores: el patrón de dos partes del
 * wizard (Orientación 1-4 · Acción 5-8, ahora como label junto al contador),
 * las transiciones framer-motion entre pasos (slide + fade, con `dir` para el
 * sentido de la navegación) y el link para saltar la introducción (pasos
 * 1-4), que reusa el PATCH /progress existente vía el callback `onSkip` que
 * le pasa `client-onboarding-wizard.tsx`.
 */

import type { ReactNode } from 'react'
import { motion, AnimatePresence, useReducedMotion, type Variants } from 'framer-motion'
import { ArrowLeft, type LucideIcon } from 'lucide-react'
import { cn } from '@portal/lib/utils'
import { Button } from '@portal/components/ui/button'
import { useBranding } from '@portal/components/branding/branding-provider'
import { TOTAL_STEPS } from '@portal/lib/onboarding-content'

export { TOTAL_STEPS }

// Transición entre pasos: entra desde la derecha al avanzar, desde la
// izquierda al retroceder. Mismo patrón que el wizard viejo.
export const stepVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir >= 0 ? 24 : -24 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir >= 0 ? -24 : 24 }),
}

// ─── Top bar: marca a la izquierda, parte + contador mono a la derecha, ─────
// ─── línea de progreso fina (2px) debajo ─────────────────────────────────────

function WizardTopBar({ step }: { step: number }) {
  const { brand } = useBranding()
  const pct = Math.max(4, Math.round((step / TOTAL_STEPS) * 100))
  const partLabel = step <= 4 ? 'Parte 1 · Orientación' : 'Parte 2 · Acción'

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <span className="font-editorial text-xl italic tracking-wide text-foreground">
          {brand?.brandName ?? 'NOUS'}
        </span>
        <div className="flex items-center gap-3">
          <span className="hidden text-[11px] uppercase tracking-[0.18em] text-muted-foreground sm:inline">
            {partLabel}
          </span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {String(step).padStart(2, '0')} / {String(TOTAL_STEPS).padStart(2, '0')}
          </span>
        </div>
      </div>
      <div className="mt-4 h-[2px] w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─── Badge pill centrado bajo la top bar ─────────────────────────────────────

function OnboardingBadge() {
  return (
    <div className="mt-7 flex justify-center">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/[0.03] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
        Onboarding
      </span>
    </div>
  )
}

// ─── Cabecera de paso: eyebrow (+ ícono chico) + título serif + copy ─────────

export function StepHeader({
  icon: Icon,
  eyebrow,
  title,
  hint,
}: {
  icon: LucideIcon
  eyebrow?: string
  title: string
  hint?: ReactNode
}) {
  return (
    <div className="mb-9 flex flex-col items-center text-center">
      {eyebrow && (
        <p className="eyebrow mb-4 flex items-center justify-center gap-2">
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" strokeWidth={1.75} aria-hidden />
          {eyebrow}
        </p>
      )}
      <h2 className="font-editorial max-w-lg text-[2rem] leading-[1.15] tracking-tight text-foreground sm:text-[2.25rem]">
        {title}
      </h2>
      {hint && <div className="mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">{hint}</div>}
    </div>
  )
}

// ─── Contenedor animado de un paso (AnimatePresence + slide) ────────────────

export function StepStage({ step, direction, children }: { step: number; direction: number; children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion()
  return (
    <AnimatePresence mode="popLayout" custom={direction}>
      <motion.div
        key={step}
        custom={direction}
        variants={stepVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="outline-none"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Pie de navegación: "Atrás" uniforme + slot de acción primaria del paso ──

export function WizardNav({
  onBack,
  backDisabled,
  children,
}: {
  onBack?: () => void
  backDisabled?: boolean
  children: ReactNode
}) {
  return (
    <div className="mt-9 flex items-center justify-between gap-3">
      {onBack ? (
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={backDisabled}
          className="gap-1.5 rounded-full text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Atrás
        </Button>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

// ─── Marco general del wizard: top bar + badge + card + link de salto ───────

export function WizardFrame({
  step,
  onSkip,
  children,
}: {
  /** Paso activo (1-8). Se omite en los estados de carga/error del wizard. */
  step?: number
  /** Si viene y `step` es 1-4, muestra "Saltar la introducción" al pie. */
  onSkip?: () => void
  children: ReactNode
}) {
  return (
    <div className="-mx-4 -my-8 min-h-[calc(100vh-4rem)] px-4 py-10 sm:-mx-6 sm:px-6 sm:py-14">
      <div className="mx-auto w-full max-w-xl">
        {typeof step === 'number' && (
          <>
            <WizardTopBar step={step} />
            <OnboardingBadge />
          </>
        )}

        <div className="editorial-sheen relative mt-7 overflow-hidden rounded-[28px] border border-border bg-card p-7 shadow-card sm:p-10">
          <div className="relative">{children}</div>
        </div>

        {typeof step === 'number' && step <= 4 && onSkip && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-muted-foreground/50 underline-offset-4 transition-colors hover:text-muted-foreground hover:underline"
            >
              Saltar la introducción
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
