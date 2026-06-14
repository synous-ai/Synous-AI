'use client'

import { cloneElement, useEffect, useId, useRef, useState, type ReactElement } from 'react'
import {
  ArrowRight,
  CornerDownLeft,
  SkipForward,
  Check,
  Loader2,
  Globe,
  Database,
  Workflow,
  Sparkles,
  Users,
  TrendingUp,
  Zap,
  Gauge,
  ShieldCheck,
  Rocket,
  Phone,
  FileText,
  Clock,
} from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { API_URL } from '@portal/lib/config'
import { cn } from '@portal/lib/utils'
import { Input } from '@portal/components/ui/input'
import { Label } from '@portal/components/ui/label'
import { Textarea } from '@portal/components/ui/textarea'
import SideRays from '@/components/proposals/side-rays'

type Icon = typeof Globe

interface Data {
  firstName?: string
  lastName?: string
  email?: string
  company?: string
  website?: string
  projectType?: string
  mainGoal?: string
  currentSolution?: string
  clarity?: string
  budget?: string
  startWhen?: string
  deadline?: string
  currentCrm?: string
  toAutomate?: string
  priority?: string
  preference?: string
}

const STORAGE_KEY = 'nous-onboarding-v1'
const TOTAL = 8

// Variantes de transición entre pasos (Framer Motion). `dir` = sentido de la
// navegación: +1 avanza (entra desde la derecha), -1 retrocede (desde la izq).
// Desplazamiento chico (20px) para que quede dentro del padding de la card y no
// genere scroll horizontal durante la transición.
const stepVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir >= 0 ? 20 : -20 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir >= 0 ? -20 : 20 }),
}

// Oferta de NOUS: SOFTWARE A MEDIDA (no landings ni sitios de marketing).
const PROJECT_TYPES: { value: string; label: string; desc: string; icon: Icon }[] = [
  { value: 'webapp', label: 'Web App / Plataforma', desc: 'Aplicación a medida', icon: Globe },
  { value: 'crm', label: 'CRM / Sistema de gestión', desc: 'Gestión interna a medida', icon: Database },
  { value: 'automatizacion', label: 'Automatización / Integraciones', desc: 'Conectar y automatizar procesos', icon: Workflow },
  { value: 'portal', label: 'Portal de clientes', desc: 'Área privada para tus clientes', icon: Users },
  { value: 'otro', label: 'Otro', desc: 'Algo a medida, contanos', icon: Sparkles },
]

const GOALS: { value: string; label: string; icon: Icon }[] = [
  { value: 'operacion', label: 'Ordenar y automatizar la operación', icon: Zap },
  { value: 'escalar', label: 'Escalar el negocio', icon: TrendingUp },
  { value: 'reemplazar', label: 'Reemplazar planillas/herramientas', icon: Database },
  { value: 'lanzar', label: 'Lanzar un producto', icon: Rocket },
]

const CLARITY: { value: string; label: string; desc: string; icon: Icon }[] = [
  { value: 'muy_claro', label: 'Muy claro', desc: 'Sé exactamente qué necesito', icon: ShieldCheck },
  { value: 'mas_o_menos', label: 'Más o menos', desc: 'Tengo una idea general', icon: Gauge },
  { value: 'necesito_ayuda', label: 'Necesito ayuda', desc: 'Quiero que me asesoren', icon: Sparkles },
]

const BUDGET: { value: string; label: string; desc: string; icon: Icon }[] = [
  { value: '<2000', label: 'Menos de $2.000', desc: 'Proyecto acotado', icon: TrendingUp },
  { value: '2000-5000', label: '$2.000 – $5.000', desc: 'Alcance medio', icon: TrendingUp },
  { value: '5000-10000', label: '$5.000 – $10.000', desc: 'Proyecto completo', icon: Rocket },
  { value: '10000+', label: 'Más de $10.000', desc: 'Sistema a gran escala', icon: Rocket },
]

const START_WHEN = ['Ya mismo', 'Este mes', 'En 1-3 meses', 'Sin apuro']

const PRIORITY: { value: string; label: string; icon: Icon }[] = [
  { value: 'precio', label: 'Precio', icon: TrendingUp },
  { value: 'velocidad', label: 'Velocidad', icon: Gauge },
  { value: 'calidad', label: 'Calidad', icon: ShieldCheck },
  { value: 'escalabilidad', label: 'Escalabilidad', icon: Rocket },
]

function emailOk(s?: string): boolean {
  return !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

/**
 * Fila de opción al estilo de la referencia: ícono verde a la izquierda,
 * título + descripción, y una caja con flecha a la derecha que se vuelve verde
 * sólida cuando la opción está seleccionada. Sin borde de card: se apoya sobre
 * el vidrio del shell.
 */
function OptionCard({
  selected,
  onClick,
  label,
  desc,
  icon: Icon,
}: {
  selected: boolean
  onClick: () => void
  label: string
  desc?: string
  icon?: Icon
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'group flex w-full items-center gap-3.5 rounded-2xl border p-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40',
        selected ? 'border-emerald-500/40 bg-emerald-500/[0.07]' : 'border-transparent hover:bg-white/[0.04]',
      )}
    >
      {Icon && (
        <span
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition-colors',
            selected
              ? 'border-emerald-400/50 bg-emerald-500/25 text-emerald-200'
              : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold leading-snug text-white">{label}</span>
        {desc && <span className="mt-0.5 block text-sm leading-snug text-neutral-400">{desc}</span>}
      </span>
      <span
        className={cn(
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition-all',
          selected
            ? 'border-emerald-400/40 bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
            : 'border-white/10 bg-white/[0.04] text-neutral-300 group-hover:border-white/20 group-hover:text-white',
        )}
      >
        {selected ? <Check className="h-[18px] w-[18px]" /> : <ArrowRight className="h-[18px] w-[18px]" />}
      </span>
    </button>
  )
}

/** Pill dark para selección rápida (ej. "¿cuándo empezar?"). */
function Pill({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'rounded-full border px-4 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40',
        selected
          ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100'
          : 'border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white',
      )}
    >
      {children}
    </button>
  )
}

/** Cabecera de paso: ícono 3D flotante + título y subtítulo centrados. */
function StepHeader({ icon: Icon, title, hint }: { icon: Icon; title: string; hint?: string }) {
  return (
    <div className="mb-6 flex flex-col items-center text-center">
      <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-b from-neutral-700/70 to-neutral-900 shadow-lg shadow-black/50">
        <Icon className="h-7 w-7 text-emerald-400" />
      </span>
      <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
      {hint && <p className="mt-2 max-w-[19rem] text-sm leading-relaxed text-neutral-400">{hint}</p>}
    </div>
  )
}

// ─── Wizard ─────────────────────────────────────────────────────────────────

export function OnboardingWizard() {
  const [step, setStep] = useState(0) // 0 = intro · 1..8 pasos · 10 = resultado
  const [direction, setDirection] = useState(1) // sentido de la animación entre pasos
  const [data, setData] = useState<Data>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<'call' | 'proposal' | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Vinculación por token: si el lead llegó por un link de invitación
  // (`/onboarding?t=…`), guardamos el token y marcamos los datos como
  // pre-cargados (nombre/email vienen del CRM y quedan de solo lectura).
  const [token, setToken] = useState<string | null>(null)
  const [prefilled, setPrefilled] = useState(false)
  // `prefillPending`: true mientras se resuelve el token de invitación.
  // Solo aplica cuando hay `?t=` en la URL; sin token empieza en false (sin bloqueo).
  const [prefillPending, setPrefillPending] = useState(false)
  const prefersReducedMotion = useReducedMotion()

  // Restaurar progreso guardado
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setData({ ...JSON.parse(raw) })
    } catch {
      /* ignore */
    }
  }, [])

  // Resolver el token de invitación (si vino en la URL) para pre-cargar el lead.
  // Leemos de window.location en vez de useSearchParams para no forzar Suspense
  // ni volver dinámica la página.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('t')
    if (!t) return
    setToken(t)
    // Hay token → bloqueamos "Empezar" hasta que el resolve termine (o falle).
    setPrefillPending(true)
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/api/public/onboarding/resolve?t=${encodeURIComponent(t)}`)
        if (!res.ok) return
        const json = (await res.json()) as {
          data: { firstName: string; lastName: string; email: string; company: string | null }
        }
        setData((d) => ({
          ...d,
          firstName: json.data.firstName || d.firstName,
          lastName: json.data.lastName || d.lastName,
          email: json.data.email || d.email,
          company: json.data.company ?? d.company,
        }))
        setPrefilled(true)
      } catch {
        /* token inválido/expirado: seguimos como funnel frío */
      } finally {
        // Sea éxito o error, desbloqueamos el botón "Empezar".
        setPrefillPending(false)
      }
    })()
  }, [])

  // Autosave
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      /* ignore */
    }
  }, [data])

  function set<K extends keyof Data>(key: K, value: Data[K]) {
    setData((d) => ({ ...d, [key]: value }))
  }

  function canNext(): boolean {
    switch (step) {
      case 1:
        return (
          (data.firstName?.trim().length ?? 0) >= 2 &&
          (data.lastName?.trim().length ?? 0) >= 2 &&
          emailOk(data.email)
        )
      case 2:
        return !!data.projectType && !!data.mainGoal
      case 3:
        return !!data.clarity
      case 4:
        return !!data.budget
      case 7:
        return !!data.priority
      case 8:
        return !!data.preference
      default:
        return true
    }
  }

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/public/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Si hay token, viaja con el resto: el backend vincula la submission al
        // lead existente en vez de buscar/crear por email.
        body: JSON.stringify({ ...data, token: token ?? undefined }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        throw new Error(e?.error?.message ?? 'No se pudo enviar el formulario')
      }
      const json = (await res.json()) as { data: { decision: 'call' | 'proposal' } }
      setResult(json.data.decision)
      localStorage.removeItem(STORAGE_KEY)
      setStep(10)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al enviar')
    } finally {
      setSubmitting(false)
    }
  }

  function next() {
    if (step === 8) {
      void submit()
      return
    }
    setDirection(1)
    setStep((s) => s + 1)
  }

  function back() {
    setDirection(-1)
    setStep((s) => Math.max(1, s - 1))
  }

  // A11y: al terminar la animación de entrada del paso, llevamos el foco a su
  // contenedor (ver onAnimationComplete del motion.div) para que lectores de
  // pantalla y teclado no pierdan el contexto al cambiar de paso.
  const stepRef = useRef<HTMLDivElement>(null)

  function onFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canNext() || submitting) return
    next()
  }

  const emailInvalid = !!data.email?.trim() && !emailOk(data.email)

  // ── Intro ──
  if (step === 0) {
    return (
      <Shell>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            prefersReducedMotion ? { duration: 0 } : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }
          }
          className="flex flex-col items-center text-center"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-b from-neutral-700/70 to-neutral-900 shadow-lg shadow-black/50">
            <Sparkles className="h-7 w-7 text-emerald-400" />
          </span>
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-white">Contanos sobre tu proyecto</h1>
          <p className="mt-3 max-w-md text-neutral-400">
            Son 8 pasos cortos (2 minutos). Con esto entendemos qué necesitás y te preparamos la
            mejor propuesta. Tu progreso se guarda solo.
          </p>
          {/* Botón "Empezar" deshabilitado mientras se pre-llena el token de
              invitación. Sin token (funnel frío) `prefillPending` es false → no bloquea. */}
          <button
            type="button"
            onClick={() => {
              setDirection(1)
              setStep(1)
            }}
            disabled={prefillPending}
            aria-busy={prefillPending}
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 disabled:cursor-wait disabled:opacity-70"
          >
            {prefillPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando…
              </>
            ) : (
              <>
                Empezar
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </motion.div>
      </Shell>
    )
  }

  // ── Resultado ──
  if (step === 10 && result) {
    return (
      <Shell>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            prefersReducedMotion ? { duration: 0 } : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }
          }
          className="flex flex-col items-center text-center"
        >
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={
              prefersReducedMotion ? { duration: 0 } : { delay: 0.1, type: 'spring', stiffness: 220, damping: 18 }
            }
            className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
          >
            <Check className="h-8 w-8" />
          </motion.span>
          {result === 'call' ? (
            <>
              <h1 className="mt-6 text-3xl font-bold tracking-tight text-white">
                ¡Gracias{data.firstName ? `, ${data.firstName}` : ''}!
              </h1>
              <p className="mt-3 max-w-md text-neutral-400">
                Por lo que nos contaste, lo mejor es que lo charlemos en una llamada corta para
                armarte algo a medida. Te vamos a contactar a la brevedad para coordinarla.
              </p>
            </>
          ) : (
            <>
              <h1 className="mt-6 text-3xl font-bold tracking-tight text-white">
                ¡Listo{data.firstName ? `, ${data.firstName}` : ''}!
              </h1>
              <p className="mt-3 max-w-md text-neutral-400">
                Ya tenemos todo lo que necesitábamos. Te preparamos una propuesta a medida y te la
                enviamos a <strong className="text-white">{data.email}</strong>.
              </p>
            </>
          )}
        </motion.div>
      </Shell>
    )
  }

  // ── Pasos ──
  return (
    <Shell>
      {/* Progress: segmentos tipo guion; verde el actual/completados, gris los próximos. */}
      <div
        className="mb-7 flex items-center justify-center gap-1.5"
        role="progressbar"
        aria-valuenow={step}
        aria-valuemin={0}
        aria-valuemax={TOTAL}
        aria-label={`Progreso del formulario: paso ${step} de ${TOTAL}`}
      >
        {Array.from({ length: TOTAL }).map((_, i) => {
          const n = i + 1
          const done = n <= step
          const current = n === step
          return (
            <span
              key={n}
              className={cn(
                'h-1 rounded-full transition-all duration-500',
                current
                  ? 'w-7 bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]'
                  : done
                    ? 'w-7 bg-emerald-400/70'
                    : 'w-4 bg-white/15',
              )}
            />
          )
        })}
      </div>

      {/* Pasos + navegación dentro de un <form> (submit nativo + Enter).
          `relative` para que el paso saliente (absoluto con popLayout) se ubique
          bien sobre el entrante. */}
      <form onSubmit={onFormSubmit} noValidate className="relative">
        {/* popLayout (no "wait"): el paso entrante toma su lugar en el flujo de
            inmediato mientras el saliente se va por encima → sin colapso de alto
            ni parpadeo entre pasos. */}
        <AnimatePresence mode="popLayout" custom={direction}>
          <motion.div
            key={step}
            ref={stepRef}
            tabIndex={-1}
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={
              prefersReducedMotion ? { duration: 0 } : { duration: 0.26, ease: [0.22, 1, 0.36, 1] }
            }
            onAnimationComplete={() => {
              if (step >= 1 && step <= 8) stepRef.current?.focus()
            }}
            className="outline-none"
          >
        {step === 1 && (
          <>
            <StepHeader icon={Users} title="Empecemos por lo básico" />
            {prefilled && (
              <p className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200/90">
                Te identificamos por tu invitación. Confirmá tus datos y seguí.
              </p>
            )}
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ob-firstname">
                    Nombre{' '}
                    <span className="text-emerald-400">
                      <span aria-hidden="true">*</span>
                      <span className="sr-only">(requerido)</span>
                    </span>
                  </Label>
                  <Input
                    id="ob-firstname"
                    autoComplete="given-name"
                    aria-required="true"
                    maxLength={60}
                    readOnly={prefilled}
                    value={data.firstName ?? ''}
                    onChange={(e) => set('firstName', e.target.value)}
                    placeholder="Tu nombre"
                    className={prefilled ? 'cursor-not-allowed opacity-70' : undefined}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ob-lastname">
                    Apellido{' '}
                    <span className="text-emerald-400">
                      <span aria-hidden="true">*</span>
                      <span className="sr-only">(requerido)</span>
                    </span>
                  </Label>
                  <Input
                    id="ob-lastname"
                    autoComplete="family-name"
                    aria-required="true"
                    maxLength={60}
                    readOnly={prefilled}
                    value={data.lastName ?? ''}
                    onChange={(e) => set('lastName', e.target.value)}
                    placeholder="Tu apellido"
                    className={prefilled ? 'cursor-not-allowed opacity-70' : undefined}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-email">
                  Email{' '}
                  <span className="text-emerald-400">
                    <span aria-hidden="true">*</span>
                    <span className="sr-only">(requerido)</span>
                  </span>
                </Label>
                <Input
                  id="ob-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  aria-required="true"
                  aria-invalid={emailInvalid || undefined}
                  aria-describedby={emailInvalid ? 'ob-email-error' : undefined}
                  maxLength={254}
                  readOnly={prefilled}
                  value={data.email ?? ''}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="tu@email.com"
                  className={prefilled ? 'cursor-not-allowed opacity-70' : undefined}
                />
                {emailInvalid && (
                  <p id="ob-email-error" role="alert" className="text-xs text-destructive">
                    Ingresá un email válido.
                  </p>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Empresa / Marca">
                  <Input
                    autoComplete="organization"
                    maxLength={160}
                    value={data.company ?? ''}
                    onChange={(e) => set('company', e.target.value)}
                    placeholder="Opcional"
                  />
                </Field>
                <Field label="Sitio web">
                  <Input
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    maxLength={200}
                    value={data.website ?? ''}
                    onChange={(e) => set('website', e.target.value)}
                    placeholder="Si tenés"
                  />
                </Field>
              </div>
              {/* La pregunta "¿Cómo llegaste a nosotros?" se quitó a propósito:
                  la fuente del lead ya se conoce (se setea al crearlo en su canal
                  de origen). Preguntarla acá era redundante. */}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <StepHeader icon={Workflow} title="¿Qué estás buscando?" />
            <div className="space-y-5">
              <div className="grid gap-2 sm:grid-cols-2">
                {PROJECT_TYPES.map((t) => (
                  <OptionCard key={t.value} selected={data.projectType === t.value} onClick={() => set('projectType', t.value)} label={t.label} desc={t.desc} icon={t.icon} />
                ))}
              </div>
              <div>
                <Label className="mb-2 block">¿Cuál es el principal objetivo?</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {GOALS.map((g) => (
                    <OptionCard key={g.value} selected={data.mainGoal === g.value} onClick={() => set('mainGoal', g.value)} label={g.label} icon={g.icon} />
                  ))}
                </div>
              </div>
              <Field label="¿Cómo lo resolvés o gestionás esto hoy?">
                <Textarea
                  maxLength={600}
                  value={data.currentSolution ?? ''}
                  onChange={(e) => set('currentSolution', e.target.value)}
                  placeholder="Contanos cómo lo venís manejando…"
                  rows={2}
                />
              </Field>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <StepHeader icon={Gauge} title="¿Qué tan claro lo tenés?" hint="No hay respuesta incorrecta. Esto nos ayuda a acompañarte mejor." />
            <div className="space-y-2">
              {CLARITY.map((c) => (
                <OptionCard key={c.value} selected={data.clarity === c.value} onClick={() => set('clarity', c.value)} label={c.label} desc={c.desc} icon={c.icon} />
              ))}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <StepHeader icon={TrendingUp} title="¿Qué inversión tenés pensada?" hint="Nos sirve para proponerte algo realista, sin vueltas." />
            <div className="space-y-2">
              {BUDGET.map((b) => (
                <OptionCard key={b.value} selected={data.budget === b.value} onClick={() => set('budget', b.value)} label={b.label} desc={b.desc} icon={b.icon} />
              ))}
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <StepHeader icon={Clock} title="¿Para cuándo?" />
            <div className="space-y-5">
              <div>
                <Label className="mb-2 block">¿Cuándo te gustaría empezar?</Label>
                <div className="flex flex-wrap gap-2">
                  {START_WHEN.map((s) => (
                    <Pill key={s} selected={data.startWhen === s} onClick={() => set('startWhen', s)}>
                      {s}
                    </Pill>
                  ))}
                </div>
              </div>
              <Field label="¿Tenés alguna fecha límite?">
                <Input
                  maxLength={160}
                  value={data.deadline ?? ''}
                  onChange={(e) => set('deadline', e.target.value)}
                  placeholder="Ej: antes de fin de mes (opcional)"
                />
              </Field>
            </div>
          </>
        )}

        {step === 6 && (
          <>
            <StepHeader icon={Zap} title="Automatización y herramientas" hint="Si no aplica a tu proyecto, podés saltearlo." />
            <div className="space-y-4">
              <Field label="¿Usás algún CRM o herramienta de gestión?">
                <Input
                  maxLength={160}
                  value={data.currentCrm ?? ''}
                  onChange={(e) => set('currentCrm', e.target.value)}
                  placeholder="Cuál, o ninguno"
                />
              </Field>
              <Field label="¿Qué te gustaría automatizar?">
                <Textarea
                  maxLength={600}
                  value={data.toAutomate ?? ''}
                  onChange={(e) => set('toAutomate', e.target.value)}
                  placeholder="Tareas repetitivas que te comen tiempo…"
                  rows={2}
                />
              </Field>
            </div>
          </>
        )}

        {step === 7 && (
          <>
            <StepHeader icon={ShieldCheck} title="¿Qué es lo más importante para vos?" />
            <div className="grid gap-2 sm:grid-cols-2">
              {PRIORITY.map((p) => (
                <OptionCard key={p.value} selected={data.priority === p.value} onClick={() => set('priority', p.value)} label={p.label} icon={p.icon} />
              ))}
            </div>
          </>
        )}

        {step === 8 && (
          <>
            <StepHeader icon={Phone} title="¿Cómo querés seguir?" />
            <div className="space-y-2">
              <OptionCard
                selected={data.preference === 'propuesta'}
                onClick={() => set('preference', 'propuesta')}
                label="Recibir una propuesta directa"
                desc="Te mandamos todo por escrito a tu email"
                icon={FileText}
              />
              <OptionCard
                selected={data.preference === 'llamada'}
                onClick={() => set('preference', 'llamada')}
                label="Prefiero una llamada"
                desc="Coordinamos una charla corta"
                icon={Phone}
              />
            </div>
          </>
        )}
          </motion.div>
        </AnimatePresence>

        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}

        {/* Anuncio de envío para lectores de pantalla. El botón ya tiene el Loader2
            visual; este span invisible garantiza que AT anuncie el cambio de estado. */}
        <span role="status" className="sr-only">
          {submitting ? 'Enviando formulario…' : ''}
        </span>

        {/* Nav: dos pills glass con badge de ícono (keycap) a la izquierda, al
            estilo de la referencia (Back · Skip). El derecho adapta su label
            según el paso: Saltar (opcionales 5/6) · Enviar (último) · Continuar. */}
        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={back}
            disabled={step === 1 || submitting}
            className="inline-flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] py-1.5 pl-1.5 pr-4 text-sm font-medium text-neutral-300 transition-colors hover:border-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:pointer-events-none disabled:opacity-40"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06]">
              <CornerDownLeft className="h-3.5 w-3.5" />
            </span>
            Atrás
          </button>

          {(() => {
            const isOptional = step === 5 || step === 6
            const label = submitting ? 'Enviando…' : step === 8 ? 'Enviar' : isOptional ? 'Saltar' : 'Continuar'
            const BadgeIcon = submitting ? Loader2 : step === 8 ? Check : isOptional ? SkipForward : ArrowRight
            return (
              <button
                type="submit"
                disabled={!canNext() || submitting}
                className="inline-flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] py-1.5 pl-1.5 pr-4 text-sm font-medium text-neutral-300 transition-colors hover:border-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:pointer-events-none disabled:opacity-40"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06]">
                  <BadgeIcon className={cn('h-3.5 w-3.5', submitting && 'animate-spin')} />
                </span>
                {label}
              </button>
            )
          })()}
        </div>
      </form>
    </Shell>
  )
}

/**
 * Contenedor con el fondo de rayos (SideRays / ReactBits, reutilizado de la
 * propuesta) y la card glassmorphic dark de la referencia. Forzamos `.dark`
 * para que los tokens de los inputs resuelvan en oscuro sin importar el tema.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-4 py-10">
      {/* Fondo: rayos de luz animados (WebGL), BLANCOS/GRISES (el verde es solo
          del stepper y los íconos). Full-screen con origen arriba-izquierda: el
          punto brillante queda en la esquina superior-izquierda sobre el fondo
          negro a la izquierda de la card (como la referencia). Colores tomados
          de reactbits: rayColor1=#fdfdfd · rayColor2=#636161.
          `backgroundColor` como fallback mientras el shader WebGL compila:
          evita el flash blanco/transparente del canvas antes de que GL inicie. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0" style={{ backgroundColor: '#000' }}>
        <SideRays
          speed={2.5}
          rayColor1="#fdfdfd"
          rayColor2="#636161"
          intensity={3}
          spread={2}
          origin="top-left"
          tilt={0}
          saturation={1.5}
          blend={0}
          falloff={1.6}
          opacity={1}
        />
      </div>

      <div className="relative z-10 w-full max-w-md">

        {/* Card glassmorphic: panel oscuro esmerilado. Capas (de atrás hacia
            adelante): superficie con leve gradiente → textura de puntos → glow
            verde que nace del stepper y se derrama hacia abajo → highlight de
            borde superior. overflow-hidden contiene el slide de los pasos. */}
        <div className="relative overflow-hidden rounded-[32px] border border-white/[0.08] bg-neutral-900/75 shadow-[0_50px_120px_-24px_rgba(0,0,0,0.92)] backdrop-blur-2xl">
          {/* Superficie: leve gradiente (más claro arriba) para el look de vidrio. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.05] via-transparent to-black/40" />
          {/* Textura de puntos sutil en toda la card. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.10]"
            style={{
              backgroundImage: 'radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          />
          {/* Glow verde del stepper: nace arriba-centro y se derrama hacia abajo. */}
          <div aria-hidden className="pointer-events-none absolute -top-16 left-1/2 h-40 w-56 -translate-x-1/2 rounded-full bg-emerald-500/25 blur-[60px]" />
          {/* Highlight de borde superior (blanco, glass). */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
          <div className="relative p-7 sm:p-8">{children}</div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: ReactElement
}) {
  const id = useId()
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="text-emerald-400">
            {' '}
            <span aria-hidden="true">*</span>
            <span className="sr-only">(requerido)</span>
          </span>
        )}
      </Label>
      {cloneElement(children, { id, 'aria-required': required || undefined })}
    </div>
  )
}
