import { AppError } from '../errors'
import { FILE_PURPOSES, type FilePurpose } from './purposes'

export { FILE_PURPOSES, type FilePurpose }

export type StorageActorKind = 'hub' | 'client'

const MB = 1024 * 1024

/**
 * Extensión de la key según el MIME declarado. La extensión NUNCA sale del
 * nombre de archivo del usuario: modo server sirve el Content-Type por
 * extensión, y un `foto.html` declarado como image/png no puede terminar
 * guardado con `.html`.
 */
const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/zip': 'zip',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'audio/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
}

export const MIME_BY_EXTENSION: Record<string, string> = Object.fromEntries(
  Object.entries(EXTENSION_BY_MIME).map(([mime, ext]) => [ext, mime]),
)

const IMAGES = ['image/png', 'image/jpeg', 'image/webp'] as const
const OFFICE_DOCS = [
  'application/pdf',
  ...IMAGES,
  'image/gif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
] as const

export interface PurposePolicy {
  actors: readonly StorageActorKind[]
  contentTypes: readonly string[]
  maxBytes: number
}

/**
 * ÚNICO lugar donde viven tipos y tamaños permitidos.
 *
 * SVG queda fuera a propósito: puede ejecutar script, y los logos se sirven
 * públicamente. `proposal_logo` queda reservado sin uploader desde el rediseño
 * de la landing de propuestas (sigue en el CHECK de la migración 0040).
 */
export const FILE_PURPOSE_POLICIES = {
  deal_document: { actors: ['hub'], contentTypes: OFFICE_DOCS, maxBytes: 50 * MB },
  library_item: { actors: ['hub'], contentTypes: OFFICE_DOCS, maxBytes: 50 * MB },
  expense_receipt: { actors: ['hub'], contentTypes: ['application/pdf', ...IMAGES], maxBytes: 10 * MB },
  proposal_logo: { actors: ['hub'], contentTypes: [...IMAGES, 'image/gif'], maxBytes: 2 * MB },
  brand_logo: { actors: ['hub', 'client'], contentTypes: IMAGES, maxBytes: 2 * MB },
  onboarding_material: {
    actors: ['client'],
    contentTypes: [
      ...OFFICE_DOCS,
      'video/mp4',
      'video/quicktime',
      'audio/webm',
      'audio/mpeg',
      'audio/mp4',
      'audio/ogg',
      'audio/wav',
    ],
    maxBytes: 100 * MB,
  },
} as const satisfies Record<FilePurpose, PurposePolicy>

export function policyFor(purpose: FilePurpose): PurposePolicy {
  return FILE_PURPOSE_POLICIES[purpose]
}

export function extensionForContentType(contentType: string): string | null {
  return EXTENSION_BY_MIME[contentType] ?? null
}

function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / MB)} MB`
}

export function fileTooLargeError(maxBytes: number): AppError {
  return new AppError('FILE_TOO_LARGE', `El archivo supera el máximo permitido (${formatMegabytes(maxBytes)})`, 400, {
    maxSizeBytes: maxBytes,
  })
}

/**
 * El objeto real supera el tamaño declarado en el intent. El token de subida y
 * la cuota se calcularon con ese tamaño: aceptarlo dejaría subir más de lo
 * reservado.
 */
export function fileLargerThanDeclaredError(declaredBytes: number): AppError {
  return new AppError('FILE_TOO_LARGE', 'El archivo es más grande que el tamaño declarado al iniciar la subida', 400, {
    declaredSizeBytes: declaredBytes,
  })
}

export function fileTypeNotAllowedError(): AppError {
  return new AppError('FILE_TYPE_NOT_ALLOWED', 'Tipo de archivo no permitido', 400)
}

/** Valida propósito × actor × tipo × tamaño declarados. Lanza el AppError del contrato. */
export function assertUploadAllowed(
  actorKind: StorageActorKind,
  purpose: FilePurpose,
  contentType: string,
  sizeBytes: number,
): PurposePolicy {
  const policy = policyFor(purpose)
  if (!policy.actors.includes(actorKind)) {
    throw new AppError('FILE_PURPOSE_FORBIDDEN', 'No podés subir archivos para este uso', 403)
  }
  if (!policy.contentTypes.includes(contentType)) throw fileTypeNotAllowedError()
  if (sizeBytes > policy.maxBytes) throw fileTooLargeError(policy.maxBytes)
  return policy
}
