'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, PenLine, ClipboardList, FolderUp, CheckCircle2, Circle, Paperclip, Megaphone } from 'lucide-react'
import { useOnboardingDetail } from '@/lib/hooks'
import { intakeStatus } from '@/lib/status'
import { API_URL } from '@/lib/config'
import { formatSize, formatDate } from '@/lib/utils'
import { ONBOARDING_BRIEF_BLOCKS, ONBOARDING_MATERIAL_CATEGORIES } from '@portal/lib/onboarding-content'
import { ONBOARDING_DELIVERY_CHANNELS } from '@portal/lib/types'
import { StatusBadge } from '@/components/ui/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SkeletonGroup } from '@/components/ui/loading-region'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'

// Brief (5 bloques) y categorías de materiales: copy único, compartido con el
// wizard del cliente — ver portal-lib/lib/onboarding-content.ts.

const DELIVERY_CHANNEL_LABELS: Record<string, string> = Object.fromEntries(
  ONBOARDING_DELIVERY_CHANNELS.map((c) => [c.value, c.label]),
)

export default function OnboardingDetailPage() {
  const params = useParams<{ dealId: string }>()
  const dealId = params.dealId

  const { data, isLoading } = useOnboardingDetail(dealId)

  if (isLoading) {
    return (
      <div className="p-6">
        <SkeletonGroup label="Cargando onboarding…" className="space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </SkeletonGroup>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-6">
        <Empty>
          <EmptyHeader>
            <EmptyIllustration icon={ClipboardList} />
            <EmptyTitle>Onboarding no encontrado</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  const { onboarding, assets, dealName } = data
  const { kind, label } = intakeStatus(onboarding.status)
  const brief = onboarding.briefAnswers

  return (
    <div className="p-6">
      <Link href="/admin/onboarding" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" />
        Volver a Onboarding
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Post-Venta</p>
          <h1 className="text-3xl font-semibold tracking-tight">{dealName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Paso {onboarding.currentStep} de 8 ·{' '}
            <Link href={`/admin/deals/${onboarding.dealId}`} className="font-medium text-signal hover:underline">
              Ver Deal
            </Link>
          </p>
        </div>
        <StatusBadge kind={kind}>{label}</StatusBadge>
      </div>

      <div className="space-y-5">
        {/* ── Firma ────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <PenLine className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Firma</CardTitle>
          </CardHeader>
          <CardContent>
            {onboarding.signatureAcceptedAt ? (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-badge-success-fg" />
                <span className="font-medium">{onboarding.signatureName}</span>
                <span className="text-muted-foreground">
                  firmó el {formatDate(onboarding.signatureAcceptedAt, { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Circle className="h-4 w-4" />
                Todavía no firmó.
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Brief (16 respuestas, 5 bloques) ────────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Brief del proyecto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {!brief ? (
              <p className="text-sm text-muted-foreground">Todavía no completó el brief.</p>
            ) : (
              ONBOARDING_BRIEF_BLOCKS.map((block) => (
                <div
                  key={block.title}
                  className={block.marketing ? 'rounded-xl border border-signal/30 bg-signal/5 p-4' : ''}
                >
                  <div className="mb-3 flex items-center gap-2">
                    {block.marketing && <Megaphone className="h-4 w-4 text-signal" />}
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {block.title}
                      {block.marketing && <span className="ml-1.5 text-signal">· insumo de marketing</span>}
                    </p>
                  </div>
                  <dl className="space-y-3">
                    {block.fields.map((f) => (
                      <div key={f.key}>
                        <dt className="text-xs text-muted-foreground">{f.label}</dt>
                        <dd className="mt-0.5 text-sm text-foreground/90">
                          {String(brief[f.key] ?? '') || '—'}
                        </dd>
                      </div>
                    ))}
                    {block.title === 'Tu negocio y tu programa' && (
                      <div>
                        <dt className="text-xs text-muted-foreground">¿Cómo entrega hoy su programa?</dt>
                        <dd className="mt-1 flex flex-wrap gap-1.5">
                          {brief.deliveryChannels.map((c) => (
                            <span key={c} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                              {DELIVERY_CHANNEL_LABELS[c] ?? c}
                            </span>
                          ))}
                          {brief.deliveryChannels.includes('otro') && brief.deliveryChannelsOther && (
                            <span className="text-xs text-muted-foreground">({brief.deliveryChannelsOther})</span>
                          )}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* ── Materiales ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 space-y-0">
            <FolderUp className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Materiales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {ONBOARDING_MATERIAL_CATEGORIES.map((cat) => {
              const item = onboarding.materials[cat.key]
              const files = assets.filter((a) => a.fieldName === cat.key)
              return (
                <div key={cat.key} className="rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{cat.label}</p>
                    {item?.done ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-badge-success-fg">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Listo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Circle className="h-3.5 w-3.5" /> Pendiente
                      </span>
                    )}
                  </div>
                  {item?.note && <p className="mt-2 text-sm text-muted-foreground">{item.note}</p>}
                  {files.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {files.map((f) => (
                        <li key={f.id}>
                          <a
                            href={`${API_URL}/api/files/${f.storageKey}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 text-sm text-signal hover:underline"
                          >
                            <Paperclip className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{f.name}</span>
                            {f.sizeBytes != null && (
                              <span className="shrink-0 text-xs text-muted-foreground">{formatSize(f.sizeBytes)}</span>
                            )}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
