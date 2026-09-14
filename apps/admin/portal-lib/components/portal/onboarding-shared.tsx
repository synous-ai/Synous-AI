'use client'

/**
 * Piezas compartidas entre las pestañas "Archivos" y "Marca" de la sección
 * Onboarding del portal (`onboarding-panel.tsx` y `onboarding-brand-section.tsx`):
 * clasificación de tipo de archivo, formato legible, descarga con URL de
 * acceso temporal, y un par de piezas visuales chicas (encabezado de sección,
 * respuesta del brief). Separado a propósito para que ninguno de los dos
 * archivos tenga que importar del otro.
 */

import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'
import { KIND_BY_EXTENSION, extensionOf, type AssetKind } from '@portal/lib/file-kind'
import { CardHeader, CardTitle } from '@portal/components/ui/card'
import { EmptyIllustration } from '@portal/components/ui/empty-illustration'
import { openFile } from '@portal/lib/files'
import { formatDate, formatSize } from '@portal/lib/utils'
import type { OnboardingAsset } from '@portal/lib/types'

/** Damero detrás de logos e imágenes: sin él, un PNG transparente se pierde en el fondo negro. */
export const CHECKERBOARD: CSSProperties = {
  backgroundImage: 'repeating-conic-gradient(rgba(255,255,255,0.05) 0% 25%, transparent 0% 50%)',
  backgroundSize: '16px 16px',
}

/**
 * Tope de miniaturas en la pestaña Marca. Cada una es un `POST /api/files/access`
 * (rate limit de 120/min) más un refresco antes de que venza la URL; el resto de
 * las imágenes se muestra con ícono y se abre en el drawer igual.
 */
export const THUMBNAIL_LIMIT = 12

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

// ─── Tipos de archivo ─────────────────────────────────────────────────────────

// La clasificación por extensión y los íconos viven en `@portal/lib/file-kind`
// (compartidos con Documentos). Se reexportan para no romper a quien importa de acá.
export { KIND_ICON } from '@portal/lib/file-kind'
export type { AssetKind } from '@portal/lib/file-kind'

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

/** El MIME viene del ledger de subidas (verificado por magic bytes); la extensión es el respaldo. */
export function assetKind(asset: OnboardingAsset): AssetKind {
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
export function isPreviewable(kind: AssetKind): boolean {
  return kind === 'image' || kind === 'pdf' || kind === 'video' || kind === 'audio'
}

export function formatLabel(asset: OnboardingAsset): string {
  const ext = extensionOf(asset.name)
  if (ext) return ext.toUpperCase()
  if (asset.mimeType) return FORMAT_BY_MIME[asset.mimeType] ?? (asset.mimeType.split('/')[1] ?? '').toUpperCase()
  return 'Archivo'
}

export function assetMeta(asset: OnboardingAsset): string {
  return [formatLabel(asset), formatSize(asset.sizeBytes), `Subido el ${formatDate(asset.uploadedAt)}`]
    .filter(Boolean)
    .join(' · ')
}

/**
 * "Descargar" pide una URL de acceso temporal: un `<a href>` pelado no puede
 * (ver openFile en lib/file-transfer.ts). Mismo patrón que Documentos.
 */
export function useAssetDownload(storageKey: string) {
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

export function EmptyState({ icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
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

export function Answer({ value }: { value: string | undefined }) {
  const text = value?.trim()
  if (!text) return <dd className="mt-1 text-sm italic text-muted-foreground/70">Sin respuesta</dd>
  return <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">{text}</dd>
}

export function SectionCardHeader({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
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
