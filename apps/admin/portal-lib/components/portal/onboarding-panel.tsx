'use client'

/**
 * Sección "Onboarding" del Client Portal: lo que el cliente nos compartió al
 * arrancar el proyecto (respuestas, archivos y marca), en SOLO LECTURA.
 *
 * ─── Sin endpoint propio ni copia de datos ─────────────────────────────────
 * Lee las fuentes de verdad que ya existen:
 *  - `GET /api/client/onboarding` → fila de `client_onboarding` (brief, firma,
 *    checklist de materiales) + los `client_asset` del paso 7. Es la MISMA query
 *    que usa el gate del layout (`useClientOnboarding`), así que al entrar acá
 *    llega desde la caché de TanStack sin otra request.
 *  - `GET /api/client/branding` → marca vigente (la de la empresa, o la de la
 *    cuenta si no tiene empresa). Es la misma que edita /marca.
 *
 * El deal lo resuelve la API desde el token: ninguna de las dos rutas recibe un
 * id, así que no hay nada que manipular desde el browser. Cada archivo se abre
 * con una URL de corta vida (`POST /api/files/access`) que el backend autoriza
 * por recurso — ver `apps/api/src/modules/files/files.authz.ts`.
 *
 * El modelo no guarda favicon ni tipografías: la marca muestra solo lo que
 * existe (nombre, logo, colores, archivos de marca y la respuesta del brief).
 */

import { useEffect, useState, type CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Check,
  ClipboardCheck,
  ClipboardList,
  Copy,
  Download,
  Eye,
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  FolderUp,
  Loader2,
  Palette,
  PenLine,
  RotateCw,
} from 'lucide-react'
import { Badge } from '@portal/components/ui/badge'
import { Button } from '@portal/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@portal/components/ui/card'
import { EmptyIllustration } from '@portal/components/ui/empty-illustration'
import { SkeletonGroup } from '@portal/components/ui/loading-region'
import { Skeleton } from '@portal/components/ui/skeleton'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@portal/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@portal/components/ui/tabs'
import { SectionHeader } from '@portal/components/portal/section-header'
import { useClientBranding, useClientOnboarding } from '@portal/lib/hooks'
import { getFileAccessUrl, openFile, useFileUrl } from '@portal/lib/files'
import {
  ONBOARDING_BRIEF_BLOCKS,
  ONBOARDING_DELIVERY_CHANNELS_QUESTION,
  ONBOARDING_MATERIAL_CATEGORIES,
  TOTAL_STEPS,
} from '@portal/lib/onboarding-content'
import {
  ONBOARDING_DELIVERY_CHANNELS,
  type ClientOnboarding,
  type OnboardingAsset,
  type OnboardingBriefAnswers,
  type OnboardingMaterialsState,
} from '@portal/lib/types'
import { formatDate, formatSize } from '@portal/lib/utils'

const LONG_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }

const CHANNEL_LABELS: Record<string, string> = Object.fromEntries(
  ONBOARDING_DELIVERY_CHANNELS.map((c) => [c.value, c.label]),
)

const BRAND_IDENTITY_LABEL =
  ONBOARDING_BRIEF_BLOCKS.flatMap((b) => b.fields).find((f) => f.key === 'brandIdentity')?.label ??
  '¿Ya tenés identidad de marca definida?'

/** Damero detrás de logos e imágenes: sin él, un PNG transparente se pierde en el fondo negro. */
const CHECKERBOARD: CSSProperties = {
  backgroundImage: 'repeating-conic-gradient(rgba(255,255,255,0.05) 0% 25%, transparent 0% 50%)',
  backgroundSize: '16px 16px',
}

/**
 * Tope de miniaturas en la pestaña Marca. Cada una es un `POST /api/files/access`
 * (rate limit de 120/min) más un refresco antes de que venza la URL; el resto de
 * las imágenes se muestra con ícono y se abre en el drawer igual.
 */
const THUMBNAIL_LIMIT = 12

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

// ─── Tipos de archivo ─────────────────────────────────────────────────────────

type AssetKind = 'image' | 'pdf' | 'video' | 'audio' | 'spreadsheet' | 'archive' | 'other'

const KIND_BY_EXTENSION: Record<string, AssetKind> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  pdf: 'pdf',
  mp4: 'video',
  mov: 'video',
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  xlsx: 'spreadsheet',
  csv: 'spreadsheet',
  zip: 'archive',
}

const KIND_ICON: Record<AssetKind, LucideIcon> = {
  image: FileImage,
  pdf: FileText,
  video: FileVideo,
  audio: FileAudio,
  spreadsheet: FileSpreadsheet,
  archive: FileArchive,
  other: FileIcon,
}

/** Formato legible para los MIME largos de Office, cuando el nombre no trae extensión. */
const FORMAT_BY_MIME: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/zip': 'ZIP',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'video/quicktime': 'MOV',
  'audio/mpeg': 'MP3',
}

function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return null
  const ext = name.slice(dot + 1).toLowerCase()
  return ext.length <= 5 ? ext : null
}

/** El MIME viene del ledger de subidas (verificado por magic bytes); la extensión es el respaldo. */
function assetKind(asset: OnboardingAsset): AssetKind {
  const mime = asset.mimeType ?? ''
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.includes('spreadsheet')) return 'spreadsheet'
  if (mime === 'application/zip') return 'archive'
  const ext = extensionOf(asset.name)
  return (ext && KIND_BY_EXTENSION[ext]) || 'other'
}

/** Solo lo que el browser sabe mostrar solo; el resto se descarga. */
function isPreviewable(kind: AssetKind): boolean {
  return kind === 'image' || kind === 'pdf' || kind === 'video' || kind === 'audio'
}

function formatLabel(asset: OnboardingAsset): string {
  const ext = extensionOf(asset.name)
  if (ext) return ext.toUpperCase()
  if (asset.mimeType) return FORMAT_BY_MIME[asset.mimeType] ?? (asset.mimeType.split('/')[1] ?? '').toUpperCase()
  return 'Archivo'
}

function assetMeta(asset: OnboardingAsset): string {
  return [formatLabel(asset), formatSize(asset.sizeBytes), `Subido el ${formatDate(asset.uploadedAt)}`]
    .filter(Boolean)
    .join(' · ')
}

/**
 * "Descargar" pide una URL de acceso temporal: un `<a href>` pelado no puede
 * (ver openFile en lib/file-transfer.ts). Mismo patrón que Documentos.
 */
function useAssetDownload(storageKey: string) {
  const [downloading, setDownloading] = useState(false)
  const [failed, setFailed] = useState(false)

  async function download() {
    setDownloading(true)
    setFailed(false)
    try {
      await openFile(storageKey)
    } catch {
      setFailed(true)
    } finally {
      setDownloading(false)
    }
  }

  return { downloading, failed, download }
}

// ─── Piezas comunes ───────────────────────────────────────────────────────────

function EmptyState({ icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <EmptyIllustration icon={icon} />
      <div>
        <p className="font-medium text-muted-foreground">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground/70">{description}</p>
      </div>
    </div>
  )
}

function Answer({ value }: { value: string | undefined }) {
  const text = value?.trim()
  if (!text) return <dd className="mt-1 text-sm italic text-muted-foreground/70">Sin respuesta</dd>
  return <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">{text}</dd>
}

function SectionCardHeader({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <CardHeader className="pb-4">
      <CardTitle className="flex items-center gap-2 text-base">
        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        {title}
      </CardTitle>
      <p className="text-sm text-muted-foreground">{description}</p>
    </CardHeader>
  )
}

// ─── Resumen ──────────────────────────────────────────────────────────────────

function SummaryItem({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 truncate text-sm font-medium text-foreground">{value}</p>
        {detail && <p className="mt-0.5 text-xs text-muted-foreground/80">{detail}</p>}
      </div>
    </div>
  )
}

function OnboardingSummary({ onboarding, fileCount }: { onboarding: ClientOnboarding; fileCount: number }) {
  const completed = onboarding.status === 'completed'
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <SummaryItem
        icon={ClipboardCheck}
        label="Estado"
        value={completed ? 'Completado' : `En curso · paso ${onboarding.currentStep} de ${TOTAL_STEPS}`}
        detail={completed && onboarding.completedAt ? `El ${formatDate(onboarding.completedAt, LONG_DATE)}` : undefined}
      />
      <SummaryItem
        icon={PenLine}
        label="Firma"
        value={onboarding.signatureName ?? 'Sin firmar'}
        detail={
          onboarding.signatureAcceptedAt
            ? `Aceptada el ${formatDate(onboarding.signatureAcceptedAt, LONG_DATE)}`
            : undefined
        }
      />
      <SummaryItem icon={FolderUp} label="Archivos" value={plural(fileCount, 'archivo', 'archivos')} />
    </div>
  )
}

// ─── Respuestas ───────────────────────────────────────────────────────────────

function BriefAnswers({ brief }: { brief: OnboardingBriefAnswers | null }) {
  if (!brief) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Sin respuestas todavía"
        description="Cuando envíes el brief del onboarding, tus respuestas van a quedar guardadas acá."
      />
    )
  }

  const channels = brief.deliveryChannels ?? []

  return (
    <div className="space-y-4">
      {ONBOARDING_BRIEF_BLOCKS.map((block, index) => (
        <Card key={block.title}>
          <CardHeader className="pb-4">
            <p className="eyebrow">
              Bloque {index + 1} de {ONBOARDING_BRIEF_BLOCKS.length}
            </p>
            <CardTitle className="text-base">{block.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border">
              {block.fields.map((field) => (
                <div key={field.key} className="py-4 first:pt-0 last:pb-0">
                  <dt className="text-sm text-muted-foreground">{field.label}</dt>
                  <Answer value={brief[field.key]} />
                </div>
              ))}
              {/* Mismo orden que el wizard: el selector de canales va después de las preguntas del bloque. */}
              {block.withChannels && (
                <div className="py-4 last:pb-0">
                  <dt className="text-sm text-muted-foreground">{ONBOARDING_DELIVERY_CHANNELS_QUESTION}</dt>
                  <dd className="mt-2 flex flex-wrap items-center gap-1.5">
                    {channels.length === 0 ? (
                      <span className="text-sm italic text-muted-foreground/70">Sin respuesta</span>
                    ) : (
                      channels.map((c) => (
                        <Badge key={c} variant="outline" className="rounded-full font-medium">
                          {CHANNEL_LABELS[c] ?? c}
                        </Badge>
                      ))
                    )}
                    {channels.includes('otro') && brief.deliveryChannelsOther && (
                      <span className="text-sm text-muted-foreground">({brief.deliveryChannelsOther})</span>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ─── Archivos ─────────────────────────────────────────────────────────────────

function AssetRow({ asset, onPreview }: { asset: OnboardingAsset; onPreview: (asset: OnboardingAsset) => void }) {
  const { downloading, failed, download } = useAssetDownload(asset.storageKey)
  const kind = assetKind(asset)
  const Icon = KIND_ICON[kind]

  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/30">
          <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground" title={asset.name}>
            {asset.name}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{assetMeta(asset)}</p>
          {failed && (
            <p role="alert" className="mt-1 text-xs text-destructive">
              No pudimos abrir el archivo. Probá de nuevo.
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-12 sm:pl-0">
        {isPreviewable(kind) && (
          <Button variant="ghost" size="sm" onClick={() => onPreview(asset)} aria-label={`Ver ${asset.name}`}>
            <Eye />
            Ver
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => void download()}
          disabled={downloading}
          aria-label={`Descargar ${asset.name}`}
        >
          {downloading ? <Loader2 className="animate-spin" /> : <Download />}
          Descargar
        </Button>
      </div>
    </li>
  )
}

function AssetGroupCard({
  title,
  badge,
  note,
  files,
  emptyText,
  onPreview,
}: {
  title: string
  badge?: { done: boolean }
  note?: string
  files: OnboardingAsset[]
  emptyText: string
  onPreview: (asset: OnboardingAsset) => void
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-4">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base leading-snug">{title}</CardTitle>
          <p className="text-xs text-muted-foreground">{plural(files.length, 'archivo', 'archivos')}</p>
        </div>
        {badge && (
          <Badge variant={badge.done ? 'accent' : 'muted'} className="shrink-0">
            {badge.done ? 'Listo' : 'Pendiente'}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {note && (
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Tu nota</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground/90">{note}</p>
          </div>
        )}
        {files.length > 0 ? (
          <ul className="divide-y divide-border">
            {files.map((asset) => (
              <AssetRow key={asset.id} asset={asset} onPreview={onPreview} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground/70">{emptyText}</p>
        )}
      </CardContent>
    </Card>
  )
}

function MaterialsSection({
  materials,
  assets,
  onPreview,
}: {
  materials: OnboardingMaterialsState
  assets: OnboardingAsset[]
  onPreview: (asset: OnboardingAsset) => void
}) {
  const hasNotes = Object.values(materials).some((item) => item?.note?.trim())
  if (assets.length === 0 && !hasNotes) {
    return (
      <EmptyState
        icon={FolderUp}
        title="Sin archivos cargados"
        description="No subiste archivos durante el onboarding. Si tenés material para compartir, avisale al equipo."
      />
    )
  }

  // Un asset con categoría desconocida no puede quedar invisible: sigue siendo del cliente.
  const knownCategories = new Set<string>(ONBOARDING_MATERIAL_CATEGORIES.map((c) => c.key))
  const uncategorized = assets.filter((a) => !knownCategories.has(a.fieldName ?? ''))

  return (
    <div className="space-y-4">
      {ONBOARDING_MATERIAL_CATEGORIES.map((category) => {
        const item = materials[category.key]
        return (
          <AssetGroupCard
            key={category.key}
            title={category.label}
            badge={{ done: Boolean(item?.done) }}
            note={item?.note?.trim() || undefined}
            files={assets.filter((a) => a.fieldName === category.key)}
            emptyText="No subiste archivos en esta categoría."
            onPreview={onPreview}
          />
        )
      })}
      {uncategorized.length > 0 && (
        <AssetGroupCard title="Otros archivos" files={uncategorized} emptyText="" onPreview={onPreview} />
      )}
    </div>
  )
}

// ─── Marca ────────────────────────────────────────────────────────────────────

function ColorSwatch({ label, hex }: { label: string; hex: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(hex)
      setCopied(true)
    } catch {
      /* sin permiso de portapapeles: el código queda visible para copiarlo a mano */
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border p-3">
      <span aria-hidden className="h-10 w-10 shrink-0 rounded-lg border border-white/10" style={{ backgroundColor: hex }} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-mono text-sm uppercase text-foreground">{hex}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => void copy()}
        aria-label={`Copiar ${label.toLowerCase()} (${hex})`}
        title={copied ? 'Copiado' : 'Copiar'}
      >
        {copied ? <Check className="text-primary" /> : <Copy />}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? `${label} copiado` : ''}
      </span>
    </div>
  )
}

function BrandKitCard() {
  const { data, isLoading, isError, isFetching, refetch } = useClientBranding()
  const [logoBroken, setLogoBroken] = useState(false)

  useEffect(() => setLogoBroken(false), [data?.logoUrl])

  const hasBrand = Boolean(data && (data.brandName || data.logoUrl || data.brandPrimary || data.brandSecondary))

  return (
    <Card>
      <SectionCardHeader
        icon={Palette}
        title="Identidad visual"
        description="El nombre, logo y colores con los que trabajamos tu proyecto."
      />
      <CardContent>
        {/* Primero `data`: con marca en caché, un refetch fallido no tapa lo que ya se ve. */}
        {!data && (isLoading || !isError) ? (
          <SkeletonGroup label="Cargando tu marca…" className="flex flex-col gap-5 sm:flex-row">
            <Skeleton className="h-24 w-full rounded-xl sm:w-40" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          </SkeletonGroup>
        ) : !data ? (
          <div role="alert" className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-destructive">No pudimos cargar tu identidad visual.</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="animate-spin" /> : <RotateCw />}
              Reintentar
            </Button>
          </div>
        ) : !hasBrand ? (
          <p className="text-sm text-muted-foreground/70">Todavía no hay una identidad visual cargada.</p>
        ) : (
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div
              className="flex h-24 w-full shrink-0 items-center justify-center rounded-xl border border-border p-3 sm:w-40"
              style={CHECKERBOARD}
            >
              {data.logoUrl && !logoBroken ? (
                // Ruta pública de logos (redirige a una URL de corta vida): no necesita token.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.logoUrl}
                  alt={`Logo de ${data.brandName || 'tu marca'}`}
                  onError={() => setLogoBroken(true)}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="text-xs text-muted-foreground">{logoBroken ? 'No se pudo cargar el logo' : 'Sin logo'}</span>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">Nombre de la marca</p>
                <p className="mt-0.5 text-sm font-medium text-foreground">{data.brandName || 'Sin nombre'}</p>
              </div>
              {(data.brandPrimary || data.brandSecondary) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.brandPrimary && <ColorSwatch label="Color principal" hex={data.brandPrimary} />}
                  {data.brandSecondary && <ColorSwatch label="Color secundario" hex={data.brandSecondary} />}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function BrandFileTile({
  asset,
  withThumbnail,
  onPreview,
}: {
  asset: OnboardingAsset
  withThumbnail: boolean
  onPreview: (asset: OnboardingAsset) => void
}) {
  const kind = assetKind(asset)
  const Icon = KIND_ICON[kind]
  const previewable = isPreviewable(kind)
  const thumbnail = useFileUrl(withThumbnail ? asset.storageKey : null)
  const [broken, setBroken] = useState(false)
  const { downloading, failed, download } = useAssetDownload(asset.storageKey)

  const showImage = withThumbnail && thumbnail.url && !broken
  const loadingThumbnail = withThumbnail && !thumbnail.url && !thumbnail.error && !broken

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => onPreview(asset)}
        disabled={!previewable}
        aria-label={`Ver ${asset.name}`}
        className="flex aspect-[4/3] w-full items-center justify-center p-4 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default"
        style={CHECKERBOARD}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnail.url!}
            alt=""
            onError={() => setBroken(true)}
            className="max-h-full max-w-full object-contain"
          />
        ) : loadingThumbnail ? (
          <Skeleton className="h-full w-full rounded-md" />
        ) : (
          <Icon className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
        )}
      </button>
      <div className="flex items-center gap-2 border-t border-border p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground" title={asset.name}>
            {asset.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {[formatLabel(asset), formatSize(asset.sizeBytes)].filter(Boolean).join(' · ')}
          </p>
          {failed && (
            <p role="alert" className="text-xs text-destructive">
              No se pudo abrir
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void download()}
          disabled={downloading}
          aria-label={`Descargar ${asset.name}`}
        >
          {downloading ? <Loader2 className="animate-spin" /> : <Download />}
        </Button>
      </div>
    </li>
  )
}

function BrandSection({
  brief,
  assets,
  onPreview,
}: {
  brief: OnboardingBriefAnswers | null
  assets: OnboardingAsset[]
  onPreview: (asset: OnboardingAsset) => void
}) {
  const brandFiles = assets.filter((a) => a.fieldName === 'logoBrand')
  const thumbnailIds = new Set(
    brandFiles
      .filter((a) => assetKind(a) === 'image')
      .slice(0, THUMBNAIL_LIMIT)
      .map((a) => a.id),
  )

  return (
    <div className="space-y-4">
      <BrandKitCard />

      <Card>
        <SectionCardHeader
          icon={FileImage}
          title="Archivos de marca"
          description="Logo, manual y piezas que subiste en el onboarding."
        />
        <CardContent>
          {brandFiles.length === 0 ? (
            <p className="text-sm text-muted-foreground/70">No subiste archivos de marca durante el onboarding.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
              {brandFiles.map((asset) => (
                <BrandFileTile
                  key={asset.id}
                  asset={asset}
                  withThumbnail={thumbnailIds.has(asset.id)}
                  onPreview={onPreview}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <SectionCardHeader
          icon={ClipboardList}
          title="Lo que nos contaste de tu marca"
          description="Tu respuesta en el brief del onboarding."
        />
        <CardContent>
          <dl>
            <dt className="text-sm text-muted-foreground">{BRAND_IDENTITY_LABEL}</dt>
            <Answer value={brief?.brandIdentity} />
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Preview ──────────────────────────────────────────────────────────────────

/**
 * URL para el drawer, pedida UNA vez al abrir. No usa `useFileUrl` a propósito:
 * ese hook refresca la URL antes de que venza, y un `<video>` al que le cambia
 * el `src` a mitad de reproducción vuelve a empezar.
 */
function useAccessUrlOnce(storageKey: string): { url: string | null; failed: boolean } {
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({ url: null, failed: false })

  useEffect(() => {
    let cancelled = false
    setState({ url: null, failed: false })
    getFileAccessUrl(storageKey)
      .then(({ url }) => {
        if (!cancelled) setState({ url, failed: false })
      })
      .catch(() => {
        if (!cancelled) setState({ url: null, failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [storageKey])

  return state
}

function AssetPreviewBody({ asset }: { asset: OnboardingAsset }) {
  const kind = assetKind(asset)
  const access = useAccessUrlOnce(asset.storageKey)
  const [mediaFailed, setMediaFailed] = useState(false)
  const { downloading, failed, download } = useAssetDownload(asset.storageKey)

  const status = access.failed || mediaFailed ? 'error' : access.url ? 'ready' : 'loading'

  return (
    <>
      <SheetHeader>
        <SheetTitle className="truncate pr-6">{asset.name}</SheetTitle>
        <SheetDescription>{assetMeta(asset)}</SheetDescription>
      </SheetHeader>

      <div
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30"
        style={kind === 'image' ? CHECKERBOARD : undefined}
      >
        {status === 'loading' && (
          <div role="status" className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <p className="text-sm">Cargando vista previa…</p>
          </div>
        )}

        {status === 'error' && (
          <div role="alert" className="flex flex-col items-center gap-1 p-6 text-center">
            <p className="text-sm text-destructive">No pudimos mostrar la vista previa de este archivo.</p>
            <p className="text-xs text-muted-foreground">Podés descargarlo y abrirlo en tu equipo.</p>
          </div>
        )}

        {status === 'ready' && access.url && (
          <>
            {kind === 'image' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={access.url}
                alt={asset.name}
                onError={() => setMediaFailed(true)}
                className="max-h-full max-w-full object-contain"
              />
            )}
            {kind === 'pdf' && <iframe src={access.url} title={asset.name} className="h-full w-full" />}
            {kind === 'video' && (
              <video src={access.url} controls onError={() => setMediaFailed(true)} className="max-h-full w-full" />
            )}
            {kind === 'audio' && (
              <audio src={access.url} controls onError={() => setMediaFailed(true)} className="w-full max-w-md px-6" />
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {failed && (
          <p role="alert" className="text-xs text-destructive">
            No pudimos descargar el archivo. Probá de nuevo.
          </p>
        )}
        <Button variant="outline" size="sm" onClick={() => void download()} disabled={downloading}>
          {downloading ? <Loader2 className="animate-spin" /> : <Download />}
          Descargar
        </Button>
      </div>
    </>
  )
}

function AssetPreviewDrawer({ asset, onClose }: { asset: OnboardingAsset | null; onClose: () => void }) {
  // Se retiene el último archivo mientras el drawer se cierra: sin esto el
  // contenido se vacía antes de que termine la animación de salida.
  const [shown, setShown] = useState<OnboardingAsset | null>(asset)
  useEffect(() => {
    if (asset) setShown(asset)
  }, [asset])

  return (
    <Sheet
      open={asset != null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent side="right" className="flex w-full flex-col gap-3 sm:max-w-2xl" aria-label="Vista previa del archivo">
        {shown ? (
          <AssetPreviewBody key={shown.id} asset={shown} />
        ) : (
          <SheetHeader>
            <SheetTitle>Archivo</SheetTitle>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

function OnboardingPanelSkeleton() {
  return (
    <SkeletonGroup label="Cargando tu onboarding…" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[74px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-10 w-72 max-w-full rounded-full" />
      {[0, 1].map((i) => (
        <div key={i} className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-48" />
          {[0, 1].map((j) => (
            <div key={j} className="space-y-2">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      ))}
    </SkeletonGroup>
  )
}

export function OnboardingPanel() {
  const query = useClientOnboarding()
  const [previewAsset, setPreviewAsset] = useState<OnboardingAsset | null>(null)

  const header = (
    <SectionHeader
      eyebrow="Onboarding"
      title="Lo que nos compartiste"
      description="Tus respuestas, archivos y marca del arranque del proyecto. Es una vista de consulta: si algo cambió, avisale al equipo."
    />
  )

  // Con datos en caché, un refetch fallido no tapa lo que ya se ve.
  if (!query.data) {
    if (!query.isError) return <OnboardingPanelSkeleton />
    return (
      <div className="space-y-6">
        {header}
        <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-border px-6 py-12 text-center">
          <p className="text-sm text-destructive">No pudimos cargar la información de tu onboarding.</p>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
            {query.isFetching ? <Loader2 className="animate-spin" /> : <RotateCw />}
            Reintentar
          </Button>
        </div>
      </div>
    )
  }

  const { onboarding, assets } = query.data

  return (
    <div className="space-y-6">
      {header}
      <OnboardingSummary onboarding={onboarding} fileCount={assets.length} />

      <Tabs defaultValue="answers">
        {/* En mobile la tira de pestañas scrollea sola en vez de desbordar la página. */}
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList aria-label="Secciones del onboarding">
            <TabsTrigger value="answers">Respuestas</TabsTrigger>
            <TabsTrigger value="files">
              Archivos
              {assets.length > 0 && <span className="ml-1.5 tabular-nums opacity-70">{assets.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="brand">Marca</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="answers" className="mt-4">
          <BriefAnswers brief={onboarding.briefAnswers} />
        </TabsContent>
        <TabsContent value="files" className="mt-4">
          <MaterialsSection materials={onboarding.materials ?? {}} assets={assets} onPreview={setPreviewAsset} />
        </TabsContent>
        <TabsContent value="brand" className="mt-4">
          <BrandSection brief={onboarding.briefAnswers} assets={assets} onPreview={setPreviewAsset} />
        </TabsContent>
      </Tabs>

      <AssetPreviewDrawer asset={previewAsset} onClose={() => setPreviewAsset(null)} />
    </div>
  )
}
