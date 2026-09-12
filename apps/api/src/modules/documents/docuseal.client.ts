/**
 * docuseal.client.ts — Cliente HTTP de la API de DocuSeal.
 *
 * REGLA DE ORO (CLAUDE.md): la URL del PDF firmado EXPIRA A LOS 40 MINUTOS.
 * Este cliente la devuelve pero NUNCA se persiste: se pide en el momento en que
 * hace falta, con `fetchSubmissionDocuments`. Lo único que se guarda en `document`
 * es el `docuseal_submission_id`.
 *
 * Auth: header `X-Auth-Token` con DOCUSEAL_API_KEY (así lo espera DocuSeal, tanto
 * el cloud como el self-hosted).
 */
import { env } from '../../config/env'
import { Errors } from '../../lib/errors'

/** ¿Está configurada la integración? Si no, los endpoints responden 503. */
export function isDocusealConfigured(): boolean {
  return Boolean(env.DOCUSEAL_API_KEY)
}

/** Base de la API REST. */
function apiBase(): string {
  return env.DOCUSEAL_API_URL.replace(/\/+$/, '')
}

/** Base de la app pública, de donde sale el link de firma. NO es la de la API. */
function appBase(): string {
  return env.DOCUSEAL_URL.replace(/\/+$/, '')
}

async function docusealFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!isDocusealConfigured()) {
    throw Errors.badRequest('DocuSeal no está configurado (falta DOCUSEAL_API_KEY)')
  }

  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      'X-Auth-Token': env.DOCUSEAL_API_KEY,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    // El body de error de DocuSeal puede traer detalle útil, pero NO se propaga
    // al cliente tal cual: se loguea y se devuelve un mensaje genérico.
    const detail = await res.text().catch(() => '')
    console.error('[docuseal] Error de la API', { path, status: res.status, detail: detail.slice(0, 500) })
    throw Errors.internal(`DocuSeal respondió ${res.status}`)
  }

  return (await res.json()) as T
}

// ── Tipos de la API ──────────────────────────────────────────────────────────

export interface DocusealSubmitterInput {
  email: string
  name?: string
  /** Campos a pre-cargar en el documento (claves = nombres de campo del template). */
  fields?: { name: string; default_value: string }[]
}

/** Fila que devuelve POST /submissions — una por submitter. */
export interface DocusealSubmitter {
  id: number
  submission_id: number
  email: string
  slug: string
  status: string
}

export interface DocusealDocument {
  name: string
  /** URL FIRMADA Y EFÍMERA: vive 40 minutos. Nunca persistirla. */
  url: string
}

export interface DocusealSubmissionDetail {
  id: number
  status: string
  documents: DocusealDocument[]
}

// ── Operaciones ──────────────────────────────────────────────────────────────

/**
 * Crea una submission a partir de un template y devuelve los submitters.
 *
 * `send_email: false` a propósito: el email al firmante lo manda el CRM con su
 * propia marca (ver docuseal.service), no DocuSeal con la suya.
 */
export async function createSubmission(
  templateId: number,
  submitters: DocusealSubmitterInput[],
): Promise<DocusealSubmitter[]> {
  return docusealFetch<DocusealSubmitter[]>('/submissions', {
    method: 'POST',
    body: JSON.stringify({
      template_id: templateId,
      send_email: false,
      submitters,
    }),
  })
}

/**
 * Trae los documentos de una submission con URLs FRESCAS.
 *
 * Se llama en el momento exacto en que se necesita el link, nunca antes: las
 * URLs caducan a los 40 minutos, así que guardarlas produce links rotos.
 */
export async function fetchSubmissionDocuments(submissionId: number): Promise<DocusealDocument[]> {
  const detail = await docusealFetch<DocusealSubmissionDetail>(`/submissions/${submissionId}/documents`)
  return detail.documents ?? []
}

/** URL pública donde el firmante completa el documento. */
export function signingUrl(submitterSlug: string): string {
  return `${appBase()}/s/${submitterSlug}`
}
