/** Bytes iniciales que hace falta leer para verificar cualquier firma de abajo. */
export const MAGIC_BYTES_LENGTH = 16

type Signature = (bytes: Buffer) => boolean

const startsWith = (prefix: number[]): Signature => (bytes) =>
  bytes.length >= prefix.length && prefix.every((b, i) => bytes[i] === b)

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0))

const ZIP = startsWith([0x50, 0x4b, 0x03, 0x04])

/**
 * Firmas por MIME. El MIME lo declara quien sube: sin esta verificación un
 * HTML subido como `image/png` quedaría guardado y servido como imagen pública
 * (logos). Los contenedores Office son ZIP; audio/video no se verifican
 * (formatos con variantes de cabecera, y nunca se sirven inline como HTML).
 */
const SIGNATURES: Record<string, Signature> = {
  'image/png': startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/jpeg': startsWith([0xff, 0xd8, 0xff]),
  'image/gif': (b) => startsWith(ascii('GIF87a'))(b) || startsWith(ascii('GIF89a'))(b),
  'image/webp': (b) => startsWith(ascii('RIFF'))(b) && b.length >= 12 && b.subarray(8, 12).toString('latin1') === 'WEBP',
  'application/pdf': startsWith(ascii('%PDF-')),
  'application/zip': ZIP,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ZIP,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ZIP,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ZIP,
}

export function hasMagicBytesCheck(contentType: string): boolean {
  return contentType in SIGNATURES
}

export function matchesMagicBytes(contentType: string, head: Buffer): boolean {
  const signature = SIGNATURES[contentType]
  return signature ? signature(head) : true
}
