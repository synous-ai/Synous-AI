'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, ExternalLink, Copy, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { useOnboardingSubmissions, useProposals, useGenerateProposal } from '@/lib/hooks'
import type { Proposal } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'

/**
 * Tabs de Onboarding y Propuestas DENTRO del detalle de un Lead/Cliente.
 *
 * En vez de secciones globales sueltas, el onboarding y las propuestas viven
 * junto al contacto: se ven y se generan desde su ficha. Filtran por contactId
 * en cliente (las listas son chicas en esta etapa).
 */

// Labels alineados a la oferta (ver onboarding.schema.ts).
const PROJECT_TYPE: Record<string, string> = {
  webapp: 'Web App / Plataforma',
  crm: 'CRM / Sistema de gestión',
  automatizacion: 'Automatización / Integraciones',
  portal: 'Portal de clientes',
  otro: 'Otro',
}
const GOAL: Record<string, string> = {
  operacion: 'Ordenar la operación',
  escalar: 'Escalar el negocio',
  reemplazar: 'Reemplazar herramientas',
  lanzar: 'Lanzar un producto',
}
const BUDGET: Record<string, string> = {
  '<2000': '< $2.000',
  '2000-5000': '$2.000 – $5.000',
  '5000-10000': '$5.000 – $10.000',
  '10000+': '> $10.000',
}
const CLARITY: Record<string, string> = {
  muy_claro: 'Muy claro',
  mas_o_menos: 'Más o menos',
  necesito_ayuda: 'Necesito ayuda',
}
const PRIORITY: Record<string, string> = {
  precio: 'Precio',
  velocidad: 'Velocidad',
  calidad: 'Calidad',
  escalabilidad: 'Escalabilidad',
}
const PREFERENCE: Record<string, string> = {
  propuesta: 'Propuesta directa',
  llamada: 'Llamada',
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

// ─── Formateo de campos `custom` del contacto ────────────────────────────────
// El onboarding/prospección guardan claves como `mainGoal: operacion` en
// contact.custom. Para mostrarlas lindas (label humano + valor capitalizado) en
// la ficha del contacto, en vez de estilo "nombre de variable".

const CUSTOM_KEY_LABELS: Record<string, string> = {
  mainGoal: 'Objetivo',
  projectType: 'Tipo de proyecto',
  channelPreference: 'Preferencia de contacto',
  budget: 'Presupuesto',
  clarity: 'Claridad',
  priority: 'Prioridad',
}
const CUSTOM_VALUE_MAPS: Record<string, Record<string, string>> = {
  mainGoal: GOAL,
  projectType: PROJECT_TYPE,
  channelPreference: PREFERENCE,
  budget: BUDGET,
  clarity: CLARITY,
  priority: PRIORITY,
}

/** camelCase / snake_case → "Texto legible" (fallback para claves desconocidas). */
function humanizeKey(k: string): string {
  const s = k
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : k
}

/** Resuelve label humano + valor mostrable para un campo `custom` del contacto. */
export function formatCustomField(key: string, value: unknown): { label: string; value: string } {
  const label = CUSTOM_KEY_LABELS[key] ?? humanizeKey(key)
  const raw = value == null || value === '' ? '—' : String(value)
  const mapped = CUSTOM_VALUE_MAPS[key]?.[raw]
  const display = mapped ?? (raw === '—' ? raw : raw.charAt(0).toUpperCase() + raw.slice(1))
  return { label, value: display }
}

/** Arma la lista de respuestas "cortas" (label → valor) salteando las vacías. */
function buildFacts(a: Record<string, unknown>): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = []
  const push = (label: string, value: string) => {
    if (value) out.push({ label, value })
  }
  push('Tipo de proyecto', PROJECT_TYPE[str(a.projectType)] ?? str(a.projectType))
  push('Objetivo principal', GOAL[str(a.mainGoal)] ?? str(a.mainGoal))
  push('Presupuesto', BUDGET[str(a.budget)] ?? str(a.budget))
  push('Claridad', CLARITY[str(a.clarity)] ?? str(a.clarity))
  push('Prioridad', PRIORITY[str(a.priority)] ?? str(a.priority))
  push('Preferencia', PREFERENCE[str(a.preference)] ?? str(a.preference))
  push('Cuándo empezar', str(a.startWhen))
  push('Fecha límite', str(a.deadline))
  push('Empresa', str(a.company))
  push('Sitio web', str(a.website))
  push('CRM / herramientas', str(a.currentCrm))
  return out
}

/** Botón para generar una propuesta con IA desde un deal del contacto. */
function GenerateButton({ dealId }: { dealId: string }) {
  const router = useRouter()
  const generate = useGenerateProposal()
  return (
    <Button
      size="sm"
      disabled={generate.isPending}
      onClick={async () => {
        try {
          const p = await generate.mutateAsync(dealId)
          toast.success('Propuesta generada')
          router.push(`/admin/proposals/${p.id}`)
        } catch {
          toast.error('No se pudo generar la propuesta')
        }
      }}
    >
      {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      Generar propuesta
    </Button>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  )
}

// ─── Tab: Onboarding del contacto ────────────────────────────────────────────

export function ContactOnboardingTab({ contactId, dealId }: { contactId: string; dealId?: string }) {
  const { data } = useOnboardingSubmissions()
  const { data: allProposals } = useProposals()
  const subs = (data ?? []).filter((s) => s.contactId === contactId)
  // Propuesta(s) ya generada(s) para este contacto (la más reciente primero).
  const proposals = (allProposals ?? []).filter((p) => p.contactId === contactId)

  if (!subs.length) {
    return <p className="text-sm text-muted-foreground">Este contacto todavía no completó el onboarding.</p>
  }

  return (
    <div className="space-y-4">
      {subs.map((s) => {
        const a = s.answers
        const facts = buildFacts(a)
        return (
          <div key={s.id} className="space-y-4 rounded-xl border p-4">
            {/* Cabecera: routing + acción de generar */}
            <div className="flex items-center justify-between gap-2">
              <StatusBadge kind={s.decision === 'call' ? 'warning' : 'info'}>
                {s.decision === 'call' ? 'Sugerido: Llamada' : 'Sugerido: Propuesta directa'}
              </StatusBadge>
              {dealId && proposals.length === 0 && <GenerateButton dealId={dealId} />}
            </div>

            {/* TODAS las respuestas cortas */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              {facts.map((f) => (
                <Fact key={f.label} label={f.label} value={f.value} />
              ))}
            </dl>

            {/* Respuestas largas */}
            <LongAnswer label="Cómo lo resuelve hoy" value={str(a.currentSolution)} />
            <LongAnswer label="Qué quiere automatizar" value={str(a.toAutomate)} />
          </div>
        )
      })}

      {/* Propuesta generada (si existe) — se ve acá mismo, en el onboarding */}
      {proposals.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Propuesta generada</p>
          {proposals.map((p) => (
            <ProposalRow key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  )
}

function LongAnswer({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="whitespace-pre-line text-sm text-foreground/90">{value}</p>
    </div>
  )
}

// ─── Tab: Propuestas del contacto ────────────────────────────────────────────

export function ContactProposalsTab({ contactId, dealId }: { contactId: string; dealId?: string }) {
  const { data } = useProposals()
  const proposals = (data ?? []).filter((p) => p.contactId === contactId)

  return (
    <div className="space-y-4">
      {dealId && <GenerateButton dealId={dealId} />}
      {!proposals.length ? (
        <p className="text-sm text-muted-foreground">Sin propuestas para este contacto todavía.</p>
      ) : (
        <div className="space-y-3">
          {proposals.map((p) => (
            <ProposalRow key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  )
}

function ProposalRow({ p }: { p: Proposal }) {
  const isPublic = p.status !== 'draft'
  const kind = p.status === 'draft' ? 'neutral' : p.status === 'viewed' ? 'success' : 'info'

  async function copyLink() {
    await navigator.clipboard.writeText(p.publicUrl)
    toast.success('Link copiado')
  }

  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{p.title}</p>
        <StatusBadge kind={kind}>{p.status}</StatusBadge>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <Link
          href={`/admin/proposals/${p.id}`}
          className="inline-flex items-center gap-1 font-medium text-signal hover:underline"
        >
          Revisar / Editar <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        {isPublic && (
          <>
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" /> Copiar link
            </button>
            <a
              href={p.publicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Ver
            </a>
          </>
        )}
      </div>
    </div>
  )
}
