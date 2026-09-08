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
 * wizard (Orientación 1-4 · Acción 5-8, como label en la barra superior) y las
 * transiciones framer-motion entre pasos (slide + fade, con `dir` para el
 * sentido de la navegación).
 */

import type { ReactNode } from 'react'
import { motion, AnimatePresence, useReducedMotion, type Variants } from 'framer-motion'
import { ArrowLeft, type LucideIcon } from 'lucide-react'
import { cn } from '@portal/lib/utils'
import { Button } from '@portal/components/ui/button'
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
  const pct = Math.max(4, Math.round((step / TOTAL_STEPS) * 100))
  const partLabel = step <= 4 ? 'Parte 1 · Orientación' : 'Parte 2 · Acción'

  return (
    <div>
      <div className="relative flex items-center justify-between gap-4">
        {/* Decorative light sweep behind the brand mark. */}
        <span aria-hidden className="brand-sweep" />
        <span className="font-editorial relative z-10 text-2xl tracking-wide text-foreground">Synous</span>
        {/* The numeric counter lives inside the card ("Paso N de 8"); here we
            only keep the part label so the bar does not repeat it. */}
        <span className="relative z-10 hidden text-[11px] uppercase tracking-[0.18em] text-muted-foreground sm:inline">
          {partLabel}
        </span>
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
    <div className="mt-8 flex justify-center">
      <span className="glass-badge inline-flex items-center gap-2 px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/80">
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
    <div className="mb-12 flex flex-col items-center text-center">
      {eyebrow && (
        <p className="eyebrow mb-5 flex items-center justify-center gap-2">
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" strokeWidth={1.75} aria-hidden />
          {eyebrow}
        </p>
      )}
      {/* Framed title: thin rule with a dot at each vertex. The <h2> sits inside
          so the frame hugs the text. Type scale is shared by every step. */}
      <div className="blueprint-title">
        <span aria-hidden className="blueprint-dot blueprint-dot-tl" />
        <span aria-hidden className="blueprint-dot blueprint-dot-tr" />
        <span aria-hidden className="blueprint-dot blueprint-dot-bl" />
        <span aria-hidden className="blueprint-dot blueprint-dot-br" />
        <h2 className="font-editorial max-w-3xl text-[2.5rem] leading-[1.1] tracking-tight text-foreground sm:text-[3.25rem]">
          {title}
        </h2>
      </div>
      {hint && <div className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground">{hint}</div>}
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
    <div className="mt-12 flex items-center justify-between gap-3">
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
  children,
}: {
  /** Active step (1-8). Omitted in the wizard's loading/error states. */
  step?: number
  children: ReactNode
}) {
  return (
    <div className="blueprint-canvas -mx-4 -my-8 min-h-[calc(100vh-4rem)] px-4 py-10 sm:-mx-6 sm:px-6 sm:py-14">
      {/* Same 1140px rail as the header, so the frame lines up with the shell. */}
      <div className="relative z-10 mx-auto w-full max-w-[1140px]">
        {typeof step === 'number' && (
          <>
            <WizardTopBar step={step} />
            <OnboardingBadge />
          </>
        )}

        {/* Technical frame: vertical rails (::before), glow (::after), corner
            crosses and vertex dots. No radius — the square framing is part of
            the blueprint language. */}
        <div className="blueprint-frame mt-8 p-8 sm:p-14">
          <span aria-hidden className="blueprint-corner blueprint-corner-tl" />
          <span aria-hidden className="blueprint-corner blueprint-corner-tr" />
          <span aria-hidden className="blueprint-corner blueprint-corner-bl" />
          <span aria-hidden className="blueprint-corner blueprint-corner-br" />
          <span aria-hidden className="blueprint-dot blueprint-dot-tl" />
          <span aria-hidden className="blueprint-dot blueprint-dot-tr" />
          <span aria-hidden className="blueprint-dot blueprint-dot-bl" />
          <span aria-hidden className="blueprint-dot blueprint-dot-br" />
          <div className="relative z-10">{children}</div>
        </div>
      </div>
    </div>
  )
}
