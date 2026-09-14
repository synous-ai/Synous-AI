/*
 * Clasificación de archivos por extensión, y el ícono de cada tipo.
 *
 * La comparten las secciones del portal que listan archivos: Onboarding
 * (archivos y marca) y Documentos. Antes vivía dentro de
 * `components/portal/onboarding-shared.tsx`; se movió acá para que Documentos
 * no tenga que importar de un componente de Onboarding.
 *
 * Solo extensiones: quien tenga el MIME verificado (el ledger de subidas de
 * Onboarding) debería mirarlo primero y usar esto como respaldo.
 */

import type { LucideIcon } from 'lucide-react'
import {
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  FileVideo,
  Presentation,
} from 'lucide-react'

export type AssetKind =
  | 'image'
  | 'pdf'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'video'
  | 'audio'
  | 'archive'
  | 'other'

/*
 * `document` y `presentation` se agregaron para Documentos (contratos en
 * Word, propuestas en PowerPoint). Ninguna de las extensiones nuevas es de un
 * tipo que se previsualice (imagen, pdf, video, audio), así que para
 * Onboarding solo cambia el ícono, no qué se abre en el visor.
 */
export const KIND_BY_EXTENSION: Record<string, AssetKind> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  pdf: 'pdf',
  doc: 'document',
  docx: 'document',
  odt: 'document',
  rtf: 'document',
  txt: 'document',
  xlsx: 'spreadsheet',
  xls: 'spreadsheet',
  ods: 'spreadsheet',
  numbers: 'spreadsheet',
  csv: 'spreadsheet',
  ppt: 'presentation',
  pptx: 'presentation',
  odp: 'presentation',
  key: 'presentation',
  mp4: 'video',
  mov: 'video',
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  tar: 'archive',
  gz: 'archive',
}

export const KIND_ICON: Record<AssetKind, LucideIcon> = {
  image: FileImage,
  pdf: FileText,
  document: FileType2,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  video: FileVideo,
  audio: FileAudio,
  archive: FileArchive,
  other: FileIcon,
}

/**
 * Extensión en minúsculas y sin el punto, o `null` si no hay una plausible.
 * Sirve tanto para un nombre ("brief.pdf") como para una storage key
 * ("portal/abc/uuid.pdf"): toma lo que sigue al último punto.
 */
export function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return null
  const ext = name.slice(dot + 1).toLowerCase()
  return ext.length <= 5 ? ext : null
}

export function kindForExtension(ext: string | null): AssetKind {
  return (ext && KIND_BY_EXTENSION[ext]) || 'other'
}
