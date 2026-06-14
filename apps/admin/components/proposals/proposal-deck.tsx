'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Download, FileQuestion } from 'lucide-react'
import { API_URL } from '@/lib/config'
import { ThemeToggle } from '@/components/theme-toggle'
import { SkeletonGroup } from '@/components/ui/loading-region'
import type { PublicProposal, ProposalContent } from '@/lib/types'
import SideRays from './side-rays'

/**
 * Deck de presentación de una propuesta (estilo "PowerPoint").
 *
 * Es la vista PÚBLICA que ve el cliente en `/p/<token>`: una slide a la vez,
 * navegable por teclado (←/→), flechas y puntos. Sin login — el token de la URL
 * es la credencial; los datos vienen de `/api/public/proposals/<token>`.
 *
 * Fondo: rayos de luz animados (SideRays / ReactBits, WebGL). Lucen sobre fondo
 * oscuro; en modo claro quedan sutiles.
 */
export function ProposalDeck({ token }: { token: string }) {
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [proposal, setProposal] = useState<PublicProposal | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/api/public/proposals/${encodeURIComponent(token)}`)
        if (!res.ok) throw new Error('not found')
        const json = (await res.json()) as { data: PublicProposal }
        if (alive) {
          setProposal(json.data)
          setState('ready')
        }
      } catch {
        if (alive) setState('error')
      }
    })()
    return () => {
      alive = false
    }
  }, [token])

  if (state === 'loading') {
    // Skeleton del shell: mismo bg que el estado ready (bg-background) para evitar
    // flash de color al montar. Estructura: header (empresa + PDF + toggle) +
    // bloque central (eyebrow + título de slide) + footer (← dots →).
    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
        <SkeletonGroup label="Cargando propuesta…" className="flex flex-1 flex-col">
          {/* Header placeholder */}
          <header className="flex items-center justify-between px-5 py-4 sm:px-8">
            <div aria-hidden className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="flex items-center gap-2">
              <div aria-hidden className="h-8 w-16 animate-pulse rounded-lg bg-muted" />
              <div aria-hidden className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
            </div>
          </header>

          {/* Slide central placeholder: eyebrow + título */}
          <main className="flex flex-1 items-center justify-center px-6 py-8 sm:px-12">
            <div className="w-full max-w-3xl space-y-6 text-center">
              <div aria-hidden className="mx-auto h-3 w-20 animate-pulse rounded bg-muted" />
              <div aria-hidden className="mx-auto h-10 w-3/4 animate-pulse rounded bg-muted" />
              <div aria-hidden className="mx-auto h-5 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          </main>

          {/* Footer / nav placeholder: círculo ← + dots + círculo → */}
          <footer className="flex items-center justify-between gap-4 px-5 py-5 sm:px-8">
            <div aria-hidden className="h-10 w-10 animate-pulse rounded-full bg-muted" />
            <div className="flex gap-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
              ))}
            </div>
            <div aria-hidden className="h-10 w-10 animate-pulse rounded-full bg-muted" />
          </footer>
        </SkeletonGroup>
      </div>
    )
  }

  if (state === 'error' || !proposal) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <FileQuestion className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Propuesta no disponible</h1>
        {/* role="alert": el router llega a este branch después de una promesa, así
            que lectores de pantalla necesitan el anuncio explícito del error. */}
        <p role="alert" className="max-w-sm text-sm text-muted-foreground">
          El enlace no es válido o la propuesta todavía no está lista. Verificá el link con quien te lo envió.
        </p>
      </div>
    )
  }

  return (
    <Deck
      content={proposal.content}
      pdfUrl={`${API_URL}/api/public/proposals/${encodeURIComponent(token)}/pdf`}
      completedUrl={`${API_URL}/api/public/proposals/${encodeURIComponent(token)}/completed`}
    />
  )
}

// ─── Construcción de slides ──────────────────────────────────────────────────

interface Slide {
  eyebrow: string
  node: ReactNode
}

function buildSlides(c: ProposalContent): Slide[] {
  const slides: Slide[] = []

  // 1 · Portada
  slides.push({
    eyebrow: 'Propuesta',
    node: (
      <div className="flex flex-col items-center text-center">
        {c.logoUrl && (
          // Logo del cliente — su marca encabeza la propuesta.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.logoUrl}
            alt={c.companyName || c.clientName}
            className="mb-8 h-16 w-auto max-w-[180px] object-contain"
          />
        )}
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">NOUS</p>
        <h1 className="mt-6 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">{c.title}</h1>
        {c.tagline && <p className="mt-5 max-w-xl text-lg text-muted-foreground">{c.tagline}</p>}
        <p className="mt-10 text-sm text-muted-foreground">
          Preparada para{' '}
          <span className="font-medium text-foreground">{c.companyName || c.clientName}</span>
        </p>
      </div>
    ),
  })

  // 2 · Resumen
  if (c.summary)
    slides.push({ eyebrow: 'Resumen', node: <BigText title="En pocas palabras">{c.summary}</BigText> })

  // 3 · Entendimiento
  if (c.understanding)
    slides.push({ eyebrow: 'Tu situación', node: <BigText title="Lo que entendimos">{c.understanding}</BigText> })

  // 4 · Objetivos
  if (c.objectives.length)
    slides.push({
      eyebrow: 'Objetivos',
      node: (
        <SlideBody title="Qué buscamos lograr">
          <ul className="space-y-4">
            {c.objectives.map((o, i) => (
              <li key={i} className="flex gap-4 text-lg">
                <span className="font-mono text-primary">{String(i + 1).padStart(2, '0')}</span>
                <span>{o}</span>
              </li>
            ))}
          </ul>
        </SlideBody>
      ),
    })

  // 5 · Solución
  if (c.solution)
    slides.push({ eyebrow: 'Propuesta', node: <BigText title="Lo que vamos a construir">{c.solution}</BigText> })

  // 6 · Alcance
  if (c.scope.length)
    slides.push({
      eyebrow: 'Alcance',
      node: (
        <SlideBody title="Qué incluye">
          <div className="grid gap-4 sm:grid-cols-2">
            {c.scope.map((s, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-5">
                <p className="font-semibold">{s.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
              </div>
            ))}
          </div>
        </SlideBody>
      ),
    })

  // 7 · Timeline
  if (c.timeline.length)
    slides.push({
      eyebrow: 'Plan',
      node: (
        <SlideBody title="Cómo lo encaramos">
          <ol className="space-y-5 border-l border-border pl-6">
            {c.timeline.map((t, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full bg-primary" />
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <p className="font-semibold">{t.phase}</p>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.duration}</p>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{t.detail}</p>
              </li>
            ))}
          </ol>
        </SlideBody>
      ),
    })

  // 8 · Inversión
  slides.push({
    eyebrow: 'Inversión',
    node: (
      <SlideBody title="La inversión">
        <div className="rounded-2xl border border-border bg-card p-6">
          {c.pricing.items.length > 0 && (
            <ul className="divide-y divide-border">
              {c.pricing.items.map((it, i) => (
                <li key={i} className="flex items-center justify-between gap-4 py-3">
                  <span className="text-sm">{it.label}</span>
                  <span className="font-mono text-sm">{formatMoney(it.amount, c.pricing.currency)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <span className="text-lg font-semibold">Total</span>
            <span className="font-mono text-2xl font-bold">
              {formatMoney(c.pricing.total, c.pricing.currency)}
            </span>
          </div>
          {c.pricing.note && <p className="mt-3 text-sm text-muted-foreground">{c.pricing.note}</p>}
        </div>
      </SlideBody>
    ),
  })

  // 9 · Por qué nosotros
  if (c.whyUs.length)
    slides.push({
      eyebrow: 'NOUS',
      node: (
        <SlideBody title="Por qué nosotros">
          <ul className="space-y-4">
            {c.whyUs.map((w, i) => (
              <li key={i} className="flex gap-3 text-lg">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </SlideBody>
      ),
    })

  // 10 · Próximos pasos
  if (c.nextSteps)
    slides.push({ eyebrow: 'Cierre', node: <BigText title="Próximos pasos">{c.nextSteps}</BigText> })

  // 11 · Términos
  if (c.terms)
    slides.push({
      eyebrow: 'Condiciones',
      node: (
        <SlideBody title="Términos">
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{c.terms}</p>
        </SlideBody>
      ),
    })

  return slides
}

// ─── Deck navegable ──────────────────────────────────────────────────────────

/**
 * Render del deck a partir del contenido. `pdfUrl` opcional: si no se pasa (p.ej.
 * en la vista previa de un borrador), no se muestra el botón de PDF.
 */
export function Deck({
  content,
  pdfUrl,
  completedUrl,
}: {
  content: ProposalContent
  pdfUrl?: string | null
  completedUrl?: string | null
}) {
  const slides = useMemo(() => buildSlides(content), [content])
  const [idx, setIdx] = useState(0)
  const [dir, setDir] = useState(1)
  const reduce = useReducedMotion()
  const total = slides.length
  const completedSentRef = useRef(false)

  // Cuando el cliente llega al ÚLTIMO paso, avisamos una sola vez (si hay URL).
  useEffect(() => {
    if (!completedUrl || completedSentRef.current) return
    if (idx === total - 1) {
      completedSentRef.current = true
      void fetch(completedUrl, { method: 'POST' }).catch(() => {})
    }
  }, [idx, total, completedUrl])

  const go = useCallback(
    (next: number) => {
      setIdx((cur) => {
        const target = Math.max(0, Math.min(total - 1, next))
        setDir(target >= cur ? 1 : -1)
        return target
      })
    },
    [total],
  )

  // Navegación por teclado (←/→, espacio).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        go(idx + 1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        go(idx - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [idx, go])

  const slide = slides[idx] ?? slides[0]
  if (!slide) return null

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      {/* Fondo de rayos animados (ReactBits / WebGL). */}
      <div aria-hidden className="absolute inset-0 z-0">
        <SideRays
          speed={2.5}
          rayColor1="#fdfdfd"
          rayColor2="#b9b9b9"
          intensity={2}
          spread={2}
          origin="top-right"
          tilt={0}
          saturation={1.5}
          blend={0.75}
          falloff={1.6}
          opacity={1}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <span className="text-sm font-semibold tracking-tight">{content.companyName || content.clientName}</span>
        <div className="flex items-center gap-2">
          {pdfUrl && (
            <a
              href={pdfUrl}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">PDF</span>
            </a>
          )}
          <ThemeToggle />
        </div>
      </header>

      {/* Slide */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-8 sm:px-12">
        <AnimatePresence mode="popLayout" custom={dir}>
          <motion.section
            key={idx}
            custom={dir}
            initial={reduce ? false : { opacity: 0, x: dir >= 0 ? 40 : -40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? undefined : { opacity: 0, x: dir >= 0 ? -40 : 40 }}
            transition={reduce ? { duration: 0 } : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-3xl"
          >
            <p className="mb-6 text-center text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              {slide.eyebrow}
            </p>
            {slide.node}
          </motion.section>
        </AnimatePresence>
      </main>

      {/* Nav */}
      <footer className="relative z-10 flex items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <button
          type="button"
          onClick={() => go(idx - 1)}
          disabled={idx === 0}
          aria-label="Anterior"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card disabled:opacity-30"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ir a la slide ${i + 1}`}
              onClick={() => go(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === idx ? 'w-6 bg-primary' : 'w-1.5 bg-border hover:bg-muted-foreground'
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => go(idx + 1)}
          disabled={idx === total - 1}
          aria-label="Siguiente"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card disabled:opacity-30"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </footer>
    </div>
  )
}

// ─── Helpers de layout ───────────────────────────────────────────────────────

function BigText({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="text-center">
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">{children}</p>
    </div>
  )
}

function SlideBody({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-8 text-center text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {children}
    </div>
  )
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString('es')}`
  }
}
