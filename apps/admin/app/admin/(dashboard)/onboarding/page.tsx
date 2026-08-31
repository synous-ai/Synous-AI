'use client'

import Link from 'next/link'
import { ClipboardCheck, ArrowRight } from 'lucide-react'
import { useOnboardingList } from '@/lib/hooks'
import type { AdminOnboardingListItemDTO } from '@/lib/types'
import { TOTAL_STEPS } from '@portal/lib/onboarding-content'
import { intakeStatus } from '@/lib/status'
import { formatDate } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import { CardGridSkeleton } from '@/components/ui/skeletons'

function OnboardingCard({ item }: { item: AdminOnboardingListItemDTO }) {
  const { kind, label } = intakeStatus(item.status)
  const doneSteps = Object.keys(item.stepsCompleted ?? {}).length

  return (
    <Link href={`/admin/onboarding/${item.dealId}`}>
      <Card className="h-full transition-colors hover:border-primary/40">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">{item.dealName}</p>
              <p className="truncate text-sm text-muted-foreground">{item.clientEmail}</p>
            </div>
            <StatusBadge kind={kind} className="shrink-0">
              {label}
            </StatusBadge>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Paso {item.currentStep} de {TOTAL_STEPS}
              </span>
              <span>{doneSteps}/8 completados</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(100, (doneSteps / TOTAL_STEPS) * 100)}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
            <span>
              {item.completedAt ? `Completado el ${formatDate(item.completedAt)}` : `Actualizado el ${formatDate(item.updatedAt)}`}
            </span>
            <span className="inline-flex items-center gap-1 font-medium text-signal">
              Ver detalle
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

export default function OnboardingPage() {
  const { data, isLoading } = useOnboardingList()

  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="eyebrow">Post-Venta</p>
        <h1 className="text-3xl font-semibold tracking-tight">Onboarding</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Progreso del onboarding de 8 pasos que cada cliente completa en su Portal, apenas gana el deal.
        </p>
      </div>

      {isLoading ? (
        <CardGridSkeleton count={4} label="Cargando onboardings…" className="gap-4 lg:grid-cols-2" cardClassName="h-44" />
      ) : !data || data.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyIllustration icon={ClipboardCheck} />
            <EmptyTitle>Sin onboardings aún</EmptyTitle>
            <EmptyDescription>
              Cuando un deal se gane, el cliente arranca automáticamente el onboarding en su Portal y va a aparecer acá.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((item) => (
            <OnboardingCard key={item.dealId} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
