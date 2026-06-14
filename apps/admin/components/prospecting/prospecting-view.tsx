'use client'

import { useState, useEffect } from 'react'
import {
  Sparkles,
  Building2,
  Phone,
  Globe,
  Mail,
  Star,
  MapPin,
  ArrowRight,
  X,
  Loader2,
  AlertTriangle,
  Target,
  Wand2,
  Copy,
  MessageCircle,
  HelpCircle,
  CalendarPlus,
  CheckCircle2,
  Shield,
  Play,
  Pause,
  ChevronDown,
} from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import {
  useProspectingCapabilities,
  useRunProspectSearch,
  useImportProspect,
  useDiscardProspect,
  usePortal,
  useSetterConfig,
  useProspects,
  useSetProspectingAutopilot,
} from '@/lib/hooks'
import type { Prospect, ProspectProposalType } from '@/lib/types'
import type { StatusKind } from '@/lib/status'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'

const PROPOSAL_TYPE_LABEL: Record<ProspectProposalType, string> = {
  automation: 'Automatización',
  web_app: 'Web App',
  both: 'Web App + Automatización',
}

const fmtUsd = (n: number): string =>
  new Intl.NumberFormat('es', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)

function scoreKind(score: number): StatusKind {
  if (score >= 8) return 'success'
  if (score >= 5) return 'warning'
  return 'neutral'
}

function CopyButton({ text }: { text: string }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-6 shrink-0 px-2 text-xs text-muted-foreground"
      onClick={() => {
        navigator.clipboard.writeText(text)
        toast.success('Copiado al portapapeles')
      }}
    >
      <Copy className="h-3 w-3" />
      Copiar
    </Button>
  )
}

// Title Case en español: capitaliza cada palabra salvo conectores (de, y, la…).
const NICHE_SMALL_WORDS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', 'a', 'con', 'para'])
function titleCase(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && NICHE_SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

function SeqStep({
  n,
  icon: Icon,
  title,
  copyText,
  children,
}: {
  n: number
  icon: React.ComponentType<{ className?: string }>
  title: string
  copyText: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-md border bg-card p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-signal/15 text-[10px] font-bold text-signal">
            {n}
          </span>
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          {title}
        </p>
        <CopyButton text={copyText} />
      </div>
      {children}
    </div>
  )
}

/**
 * Acordeón reutilizable: viene CERRADO y se expande/colapsa con una transición
 * de altura suave (framer-motion). `overflow-hidden` evita que el contenido se
 * vea cortado de golpe; respeta `prefers-reduced-motion`.
 */
function Collapsible({
  title,
  icon: Icon,
  className,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  className?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()

  return (
    <div className={`rounded-lg border p-3 ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          <Icon className="h-3 w-3" />
          {title}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Shape mínimo de la secuencia de setting que generó la IA. */
interface SettingSeq {
  opener?: string
  problemQuestions?: string[]
  bookingMessage?: string
  confirmationMessage?: string
}

/** "Secuencia de Setting" como acordeón (mensajes que el setter sí envía). */
function SettingSequence({ sequence }: { sequence: SettingSeq }) {
  return (
    <Collapsible title="Secuencia de Setting" icon={Sparkles} className="bg-muted/20">
      <div className="space-y-2">
        <SeqStep n={1} icon={MessageCircle} title="Primer mensaje (opener)" copyText={sequence.opener ?? ''}>
          <p className="whitespace-pre-line text-sm text-foreground/90">{sequence.opener}</p>
        </SeqStep>

        <SeqStep
          n={2}
          icon={HelpCircle}
          title="Extraer el problema"
          copyText={(sequence.problemQuestions ?? []).join('\n')}
        >
          <ol className="space-y-1 text-sm">
            {(sequence.problemQuestions ?? []).map((q, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-muted-foreground">{i + 1}.</span>
                <span>{q}</span>
              </li>
            ))}
          </ol>
        </SeqStep>

        <SeqStep n={3} icon={CalendarPlus} title="Invitar a agendar" copyText={sequence.bookingMessage ?? ''}>
          <p className="whitespace-pre-line text-sm text-foreground/90">{sequence.bookingMessage}</p>
        </SeqStep>

        <SeqStep
          n={4}
          icon={CheckCircle2}
          title="Confirmar asistencia"
          copyText={sequence.confirmationMessage ?? ''}
        >
          <p className="whitespace-pre-line text-sm text-foreground/90">{sequence.confirmationMessage}</p>
        </SeqStep>
      </div>
    </Collapsible>
  )
}

export function ProspectingView({ embedded = false }: { embedded?: boolean } = {}) {
  const { data: caps } = useProspectingCapabilities()
  const { data: portal } = usePortal()
  const { data: setterConfig } = useSetterConfig()
  const runSearch = useRunProspectSearch()
  const importProspect = useImportProspect()
  const discardProspect = useDiscardProspect()

  const { data: allProspects, isPending: prospectsLoading } = useProspects()
  const setAutopilot = useSetProspectingAutopilot()

  const [niche, setNiche] = useState('')
  const [city, setCity] = useState('')
  const [limit, setLimit] = useState(5)
  const [ourServices, setOurServices] = useState('')

  // "Qué ofrecemos" se auto-carga desde tu OFERTA del setter (o Configuración).
  useEffect(() => {
    const def = setterConfig?.prospectingServices ?? portal?.prospectingServices
    if (def) setOurServices((prev) => (prev ? prev : def))
  }, [setterConfig, portal])

  const niches = setterConfig?.prospectingNiches ?? []
  const cities = setterConfig?.prospectingCities ?? []
  const autopilotOn = setterConfig?.prospectingAutopilot ?? false

  // Default al primer nicho/ciudad disponible (nada de tipear: solo Cantidad).
  useEffect(() => {
    if (!niche && niches.length) setNiche(titleCase(niches[0]!))
    if (!city && cities.length) setCity(cities[0]!)
  }, [niches, cities, niche, city])

  const running = runSearch.isPending

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!niche || !city) return
    runSearch.mutate(
      { query: `${niche} ${city}`, limit, ourServices: ourServices.trim() || undefined },
      {
        onSuccess: (result) =>
          toast.success(`${result.prospects.length} nuevos (los ya prospectados se omiten)`),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'La búsqueda falló'),
      },
    )
  }

  function toggleAutopilot() {
    setAutopilot.mutate(!autopilotOn, {
      onSuccess: (c) =>
        toast.success(
          c.prospectingAutopilot ? 'Autopilot encendido — corre cada 1h' : 'Autopilot apagado',
        ),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Error'),
    })
  }

  function onImport(p: Prospect) {
    importProspect.mutate(p.id, {
      onSuccess: () => toast.success(`"${p.name}" importado como Lead`),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo importar'),
    })
  }

  function onDiscard(p: Prospect) {
    discardProspect.mutate(p.id, {
      onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo descartar'),
    })
  }

  const visible = (allProspects ?? []).filter((p) => p.status !== 'discarded')

  // Render de una card (se reusa en ambas columnas del masonry).
  const renderCard = (p: Prospect) => (
    <ProspectCard
      key={p.id}
      prospect={p}
      importing={importProspect.isPending}
      onImport={() => onImport(p)}
      onDiscard={() => onDiscard(p)}
    />
  )

  return (
    <div className={embedded ? 'py-2' : 'p-6'}>
      {/* Header (oculto cuando va embebido en la sección Setter) */}
      {!embedded && (
        <div className="mb-6 flex items-center gap-3">
          <div>
            <p className="eyebrow">Generación de Leads</p>
            <h1 className="text-3xl font-semibold tracking-tight">Prospección</h1>
          </div>
          {visible.length > 0 && (
            <span className="ml-2 rounded-full bg-signal/15 px-3 py-1 text-sm font-semibold text-signal">
              {visible.length}
            </span>
          )}
        </div>
      )}

      {/* Capability banners */}
      {caps && !caps.places && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Google Places no está configurado. Agregá <code>GOOGLE_MAPS_API_KEY</code> al{' '}
            <code>.env</code> de la API para poder buscar.
          </span>
        </div>
      )}
      {caps && caps.places && !caps.ai && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            IA sin configurar (<code>GOOGLE_SERVICE_ACCOUNT_JSON</code>). Los prospectos se guardan
            con sus datos, pero sin análisis ni propuesta.
          </span>
        </div>
      )}

      {/* Search form — todo sale de tu oferta; solo Cantidad es manual */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Buscar Prospectos</CardTitle>
              <CardDescription>
                Nicho y ciudad salen de tu oferta. La IA analiza cada negocio y redacta una
                propuesta. No se envía nada.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant={autopilotOn ? 'default' : 'outline'}
              size="sm"
              onClick={toggleAutopilot}
              disabled={setAutopilot.isPending || (caps && !caps.places)}
            >
              {autopilotOn ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {autopilotOn ? 'Parar autopilot' : 'Piloto automático'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {autopilotOn && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-signal/30 bg-signal/5 px-3 py-2 text-xs text-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-signal" />
              </span>
              Autopilot activo — corre una búsqueda cada hora ciclando tus nichos × ciudades, sin
              duplicar.
            </div>
          )}
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="niche">Nicho</Label>
              {/* Input con datalist: se puede ELEGIR un nicho de la oferta o
                  ESCRIBIR uno nuevo. Las sugerencias se muestran en Title Case. */}
              <input
                id="niche"
                list="niche-options"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                disabled={running}
                placeholder="Elegí o escribí un nicho"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
              <datalist id="niche-options">
                {niches.map((n) => (
                  <option key={n} value={titleCase(n)} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">Ciudad</Label>
              <select
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                disabled={running}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="limit">Cantidad</Label>
              <select
                id="limit"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                disabled={running}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-28"
              >
                {[5, 10, 15, 20].map((n) => (
                  <option key={n} value={n}>
                    {n} negocios
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={running || !niche || !city || (caps && !caps.places)}>
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Buscando…
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Buscar tanda
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Historial acumulado de prospectos (deduplicado) */}
      {!prospectsLoading && visible.length > 0 && (
        <p className="mb-3 text-sm text-muted-foreground">
          {visible.length} prospecto{visible.length === 1 ? '' : 's'} en tu pipeline (sin duplicados)
        </p>
      )}
      {visible.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyIllustration icon={Target} />
            <EmptyTitle>Sin prospectos todavía</EmptyTitle>
            <EmptyDescription>
              Buscá una tanda o prendé el piloto automático. Lo que encuentres se acumula acá, sin
              duplicados.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        // Masonry de DOS columnas INDEPENDIENTES: al expandir un acordeón solo
        // se mueve la card de abajo en la MISMA columna, no la fila entera.
        // Reparto por paridad para conservar el orden visual (0 arriba-izq, 1
        // arriba-der, 2 debajo del 0, …).
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-4">{visible.filter((_, i) => i % 2 === 0).map(renderCard)}</div>
          <div className="flex flex-col gap-4">{visible.filter((_, i) => i % 2 === 1).map(renderCard)}</div>
        </div>
      )}
    </div>
  )
}

function ProspectCard({
  prospect: p,
  importing,
  onImport,
  onDiscard,
}: {
  prospect: Prospect
  importing: boolean
  onImport: () => void
  onDiscard: () => void
}) {
  const imported = p.status === 'imported'
  const proposal = p.aiProposal

  return (
    <Card className={cn('flex flex-col', imported && 'border-badge-success-ring')}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">{p.name}</CardTitle>
            {p.address && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{p.address}</span>
              </p>
            )}
          </div>
          {proposal && (
            <StatusBadge kind={scoreKind(proposal.opportunityScore)} className="shrink-0">
              {proposal.opportunityScore}/10
            </StatusBadge>
          )}
        </div>

        {/* Contact row */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {p.rating != null && (
            <span className="inline-flex items-center gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {p.rating}
              {p.userRatingsTotal != null && <span>({p.userRatingsTotal})</span>}
            </span>
          )}
          {p.phone && (
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {p.phone}
            </span>
          )}
          {p.email && (
            <span className="inline-flex items-center gap-1 truncate">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{p.email}</span>
            </span>
          )}
          {p.website && (
            <a
              href={p.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-foreground hover:underline"
            >
              <Globe className="h-3 w-3" />
              Web
            </a>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3 pt-0">
        {proposal ? (
          <>
            <p className="text-sm text-foreground/90">{proposal.analysis}</p>

            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge kind="info">{PROPOSAL_TYPE_LABEL[proposal.proposalType]}</StatusBadge>
              <StatusBadge kind="neutral">≈ {fmtUsd(proposal.estimatedValueUsd)}</StatusBadge>
            </div>

            {(proposal.painPoints?.length ?? 0) > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Dolores (a confirmar)
                </p>
                <ul className="space-y-0.5 text-sm">
                  {proposal.painPoints.map((pain, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-muted-foreground">•</span>
                      <span>{pain}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Propuesta (MVP)
              </p>
              <p className="text-sm">{proposal.solution}</p>
              {(proposal.mvpScope?.length ?? 0) > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-sm">
                  {proposal.mvpScope.map((feat, i) => (
                    <li key={i} className="flex gap-1.5">
                      <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-signal" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Secuencia de setting (los mensajes que SÍ se envían) — acordeón cerrado por defecto */}
            {proposal.sequence && <SettingSequence sequence={proposal.sequence} />}

            {/* Objeciones — guion interno, no se envía — acordeón cerrado por defecto */}
            {(proposal.objections?.length ?? 0) > 0 && (
              <Collapsible title="Objeciones (Guion Interno)" icon={Shield} className="border-dashed bg-card">
                <ul className="space-y-2 text-sm">
                  {proposal.objections.map((o, i) => (
                    <li key={i}>
                      <p className="font-medium">{o.objection}</p>
                      <p className="flex gap-1.5 text-foreground/80">
                        <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-signal" />
                        <span>{o.response}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              </Collapsible>
            )}
          </>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="h-4 w-4" />
            Sin análisis IA (Vertex no configurado).
          </p>
        )}

        {/* Actions */}
        <div className="mt-auto flex items-center gap-2 pt-2">
          {imported ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-badge-success-bg px-3 py-1.5 text-sm font-medium text-badge-success-fg">
              <ArrowRight className="h-4 w-4" />
              Importado a Leads
            </span>
          ) : (
            <>
              <Button size="sm" onClick={onImport} disabled={importing}>
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Convertir en Lead
              </Button>
              <Button size="sm" variant="ghost" onClick={onDiscard} className="text-muted-foreground">
                <X className="h-4 w-4" />
                Descartar
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
