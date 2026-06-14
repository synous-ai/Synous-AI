'use client'

import Link from 'next/link'
import { FileText, ArrowRight, ExternalLink, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { useProposals } from '@/lib/hooks'
import type { Proposal } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import { Skeleton } from '@/components/ui/skeleton'

// Etiqueta + color del badge por estado de la propuesta.
const STATUS: Record<string, { label: string; kind: 'neutral' | 'info' | 'success' | 'warning' }> = {
  draft: { label: 'Borrador', kind: 'neutral' },
  accepted: { label: 'Publicada', kind: 'info' },
  sent: { label: 'Enviada', kind: 'warning' },
  viewed: { label: 'Vista', kind: 'success' },
}

function money(amount: string | null, currency: string): string {
  if (!amount) return '—'
  const n = Number(amount)
  try {
    return new Intl.NumberFormat('es', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
  } catch {
    return `${currency} ${n.toLocaleString('es')}`
  }
}

function ProposalCard({ p }: { p: Proposal }) {
  const st = STATUS[p.status] ?? STATUS.draft!
  const isPublic = p.status !== 'draft'

  async function copyLink() {
    await navigator.clipboard.writeText(p.publicUrl)
    toast.success('Link copiado')
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{p.title}</p>
            <p className="text-sm text-muted-foreground">
              {money(p.amount, p.currency)}
              {p.model ? ` · ${p.model}` : ''}
            </p>
          </div>
          <StatusBadge kind={st.kind} className="shrink-0">
            {st.label}
          </StatusBadge>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
          <Link
            href={`/admin/proposals/${p.id}`}
            className="inline-flex items-center gap-1 font-medium text-signal hover:underline"
          >
            Revisar / Editar
            <ArrowRight className="h-3.5 w-3.5" />
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
                <ExternalLink className="h-3.5 w-3.5" /> Ver presentación
              </a>
            </>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {new Date(p.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

export default function ProposalsPage() {
  const { data, isLoading } = useProposals()

  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="eyebrow">Pre-Venta</p>
        <h1 className="text-3xl font-semibold tracking-tight">Propuestas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Propuestas generadas con IA desde el onboarding. Revisá, editá y aprobá antes de enviar.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : !data || data.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyIllustration icon={FileText} />
            <EmptyTitle>Sin propuestas aún</EmptyTitle>
            <EmptyDescription>
              Generá una propuesta desde un deal o desde una submission de onboarding.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((p) => (
            <ProposalCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  )
}
