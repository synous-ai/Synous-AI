'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Inbox, ArrowRight, Phone, FileText, Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useOnboardingSubmissions, useGenerateProposal } from '@/lib/hooks'
import type { OnboardingSubmission } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import { CardGridSkeleton } from '@/components/ui/skeletons'

// Labels alineados a la oferta de software a medida (ver onboarding.schema.ts).
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
  reemplazar: 'Reemplazar planillas/herramientas',
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

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function Fact({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  )
}

function SubmissionCard({ s }: { s: OnboardingSubmission }) {
  const a = s.answers
  const isCall = s.decision === 'call'
  const router = useRouter()
  const generate = useGenerateProposal()

  // Genera la propuesta con IA desde el deal de esta submission y abre el editor.
  async function onGenerate() {
    if (!s.dealId) return
    try {
      const proposal = await generate.mutateAsync(s.dealId)
      toast.success('Propuesta generada')
      router.push(`/admin/proposals/${proposal.id}`)
    } catch {
      toast.error('No se pudo generar la propuesta')
    }
  }
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">{s.fullName}</p>
            <p className="text-sm text-muted-foreground">
              {s.email}
              {s.company ? ` · ${s.company}` : ''}
            </p>
          </div>
          <StatusBadge kind={isCall ? 'warning' : 'info'} className="shrink-0">
            {isCall ? (
              <>
                <Phone className="h-3 w-3" /> Llamada
              </>
            ) : (
              <>
                <FileText className="h-3 w-3" /> Propuesta Directa
              </>
            )}
          </StatusBadge>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Fact label="Tipo" value={PROJECT_TYPE[str(a.projectType)] ?? str(a.projectType)} />
          <Fact label="Objetivo" value={GOAL[str(a.mainGoal)] ?? str(a.mainGoal)} />
          <Fact label="Presupuesto" value={BUDGET[str(a.budget)] ?? str(a.budget)} />
          <Fact label="Claridad" value={CLARITY[str(a.clarity)] ?? str(a.clarity)} />
          <Fact label="Prioridad" value={PRIORITY[str(a.priority)] ?? str(a.priority)} />
          <Fact label="Empezar" value={str(a.startWhen)} />
        </div>

        {str(a.currentSolution) && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Cómo lo resuelve hoy
            </p>
            <p className="text-sm text-foreground/90">{str(a.currentSolution)}</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t pt-3 text-sm">
          <span className="text-xs text-muted-foreground">
            {new Date(s.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <div className="flex items-center gap-3">
            {s.dealId && (
              <button
                type="button"
                onClick={onGenerate}
                disabled={generate.isPending}
                className="inline-flex items-center gap-1 font-medium text-signal hover:underline disabled:opacity-50"
              >
                {generate.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Generar propuesta
              </button>
            )}
            {s.dealId && (
              <Link href={`/deals/${s.dealId}`} className="inline-flex items-center gap-1 font-medium text-signal hover:underline">
                Ver Deal
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function OnboardingPage() {
  const { data, isLoading } = useOnboardingSubmissions()

  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="eyebrow">Pre-Venta</p>
        <h1 className="text-3xl font-semibold tracking-tight">Onboarding</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Respuestas del wizard público. Cada una creó un lead y un deal automáticamente.
        </p>
      </div>

      {isLoading ? (
        // CardGridSkeleton: grilla de submissions de onboarding (nombre/email/tipo/respuestas), 2 col + cards h-48
        <CardGridSkeleton count={4} label="Cargando submissions…" className="gap-4 lg:grid-cols-2" cardClassName="h-48" />
      ) : !data || data.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyIllustration icon={Inbox} />
            <EmptyTitle>Sin Submissions Aún</EmptyTitle>
            <EmptyDescription>
              Cuando un prospecto complete el wizard de onboarding, va a aparecer acá.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((s) => (
            <SubmissionCard key={s.id} s={s} />
          ))}
        </div>
      )}
    </div>
  )
}
