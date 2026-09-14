'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft,
  PenLine,
  ClipboardList,
  FolderUp,
  CheckCircle2,
  Circle,
  Paperclip,
  Megaphone,
  Check,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  useOnboardingDetail,
  useAddDealBrandFile,
  useDeleteDealBrandFile,
  useUpdateDealBrandIdentity,
} from '@/lib/hooks'
import { openFile, FILE_PURPOSE_ACCEPT } from '@/lib/hooks/misc'
import { intakeStatus } from '@/lib/status'
import { formatSize, formatDate } from '@/lib/utils'
import { ONBOARDING_BRIEF_BLOCKS, ONBOARDING_MATERIAL_CATEGORIES } from '@portal/lib/onboarding-content'
import { ONBOARDING_DELIVERY_CHANNELS, type OnboardingAsset } from '@portal/lib/types'
import { useAutosaveField } from '@portal/lib/use-autosave-field'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SkeletonGroup } from '@/components/ui/loading-region'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'

// Brief (5 bloques) y categorías de materiales: copy único, compartido con el
// wizard del cliente — ver portal-lib/lib/onboarding-content.ts.

const DELIVERY_CHANNEL_LABELS: Record<string, string> = Object.fromEntries(
  ONBOARDING_DELIVERY_CHANNELS.map((c) => [c.value, c.label]),
)

/** Adjunto de materiales — pide una URL de acceso temporal, no puede ser un <a href> pelado. */
function AssetLink({ storageKey, name, sizeBytes }: { storageKey: string; name: string; sizeBytes: number | null }) {
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  async function handleOpen() {
    setLoading(true)
    setFailed(false)
    try {
      await openFile(storageKey)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleOpen()}
      disabled={loading}
      className="flex items-center gap-2 text-sm text-signal hover:underline disabled:opacity-60"
    >
      <Paperclip className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{name}</span>
      {sizeBytes != null && <span className="shrink-0 text-xs text-muted-foreground">{formatSize(sizeBytes)}</span>}
      {failed && (
        <span role="alert" className="shrink-0 text-xs text-destructive">
          No se pudo abrir
        </span>
      )}
    </button>
  )
}

/** Fila de archivo de marca (categoría "Logo y manual de marca") con opción de archivar. */
function BrandAssetRow({ asset, dealId }: { asset: OnboardingAsset; dealId: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const deleteFile = useDeleteDealBrandFile()

  return (
    <div className="flex items-center justify-between gap-2">
      <AssetLink storageKey={asset.storageKey} name={asset.name} sizeBytes={asset.sizeBytes} />
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => setConfirmOpen(true)}
        aria-label={`Eliminar ${asset.name}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Eliminar este archivo?"
        description={asset.name}
        confirmLabel="Eliminar"
        destructive
        pending={deleteFile.isPending}
        onConfirm={() =>
          deleteFile.mutate(
            { dealId, assetId: asset.id },
            { onSuccess: () => setConfirmOpen(false) },
          )
        }
      />
      {deleteFile.isError && (
        <p role="alert" className="text-xs text-destructive">
          No se pudo eliminar.
        </p>
      )}
    </div>
  )
}

/** "Agregar archivo" para la categoría de marca — mismo propósito de subida que el resto de materiales. */
function BrandFileUploader({ dealId }: { dealId: string }) {
  const addFile = useAddDealBrandFile()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      await addFile.mutateAsync({ dealId, file })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el archivo')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mt-2 space-y-1.5">
      <label className="inline-block cursor-pointer">
        <input
          ref={inputRef}
          type="file"
          accept={FILE_PURPOSE_ACCEPT.onboarding_material}
          className="sr-only"
          onChange={(e) => void handleSelect(e)}
          disabled={uploading}
        />
        <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-medium hover:bg-accent">
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Agregar archivo
        </span>
      </label>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

// ─── Identidad de marca (brief, q11) — único campo editable del brief ───────────
// El autoguardado en sí (debounce, orden de respuestas, flush al desmontar)
// vive en el hook compartido `useAutosaveField` — ver
// portal-lib/lib/use-autosave-field.ts (mismo patrón que el portal).

function BrandIdentityField({ dealId, value }: { dealId: string; value: string }) {
  const update = useUpdateDealBrandIdentity()
  const auto = useAutosaveField<string>({
    serverValue: value,
    toKey: (v) => v.trim(),
    isValid: (v) => {
      const t = v.trim()
      return t.length > 0 && t.length <= 500
    },
    save: (v) => update.mutateAsync({ dealId, brandIdentity: v.trim() }),
    debounceMs: 800,
  })

  const trimmed = auto.value.trim()

  function handleChange(next: string) {
    auto.setValue(next)
    const nextTrimmed = next.trim()
    if (nextTrimmed.length > 0 && nextTrimmed.length <= 500) auto.schedule(next)
  }

  return (
    <div className="space-y-1.5">
      <Textarea
        aria-label="¿Ya tenés identidad de marca definida (logo, colores, tipografías)?"
        value={auto.value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={auto.flush}
        rows={3}
        maxLength={500}
        className="text-sm"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        {/* UNA sola live region: antes el caso de error anidaba otro
            `role="alert"` (asertivo) adentro de este `aria-live="polite"` y
            se anunciaba dos veces. */}
        <span aria-live="polite" role="status" className="inline-flex min-h-[1rem] items-center gap-1.5 text-muted-foreground">
          {trimmed.length === 0 && <span className="text-destructive">No puede quedar vacío.</span>}
          {trimmed.length > 0 && auto.state === 'saving' && (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Guardando…
            </>
          )}
          {trimmed.length > 0 && auto.state === 'saved' && (
            <>
              <Check className="h-3 w-3 text-badge-success-fg" /> Guardado
            </>
          )}
          {trimmed.length > 0 && auto.state === 'error' && (
            <span className="inline-flex items-center gap-1.5 text-destructive">
              {auto.error}
              <button type="button" onClick={() => void auto.commit(auto.value)} className="font-medium underline underline-offset-2">
                Reintentar
              </button>
            </span>
          )}
        </span>
        <span className="tabular-nums text-muted-foreground">{auto.value.length}/500</span>
      </div>
    </div>
  )
}

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
      <Link href="/onboarding" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" />
        Volver a Onboarding
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Post-Venta</p>
          <h1 className="text-3xl font-semibold tracking-tight">{dealName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Paso {onboarding.currentStep} de 8 ·{' '}
            <Link href={`/deals/${onboarding.dealId}`} className="font-medium text-signal hover:underline">
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
                        {f.key === 'brandIdentity' ? (
                          <div className="mt-1">
                            <BrandIdentityField dealId={onboarding.dealId} value={brief.brandIdentity} />
                          </div>
                        ) : (
                          <dd className="mt-0.5 text-sm text-foreground/90">
                            {String(brief[f.key] ?? '') || '—'}
                          </dd>
                        )}
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
                      {files.map((f) =>
                        cat.key === 'logoBrand' ? (
                          <li key={f.id}>
                            <BrandAssetRow asset={f} dealId={onboarding.dealId} />
                          </li>
                        ) : (
                          <li key={f.id}>
                            <AssetLink storageKey={f.storageKey} name={f.name} sizeBytes={f.sizeBytes} />
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                  {/* Solo "Logo y manual de marca" acepta agregar archivos desde el admin — el
                      resto de las categorías son materiales que el cliente sube en el wizard. */}
                  {cat.key === 'logoBrand' && <BrandFileUploader dealId={onboarding.dealId} />}
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
