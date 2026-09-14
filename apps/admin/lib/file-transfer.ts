'use client'

/**
 * Módulo ÚNICO de transferencia de archivos, compartido por el admin
 * (`lib/hooks/misc.ts`) y el portal de cliente (`portal-lib/lib/files.ts`).
 * Implementa el contrato de subida/descarga acordado con el backend
 * (Vercel Blob en producción, disco local en dev):
 *
 *   1. POST {basePath}/uploads            → intent (uploadId, storageKey, mode)
 *   2. blob:   uploadPresigned() del SDK de @vercel/blob contra
 *              {basePath}/uploads/blob-token
 *      server: PUT {basePath}/uploads/:uploadId/content (multipart)
 *   3. El caller "reclama" la storageKey en el endpoint de dominio que
 *      corresponda (createDocument, library item, branding, etc.)
 *
 * Para descargas/preview: POST /api/files/access → URL temporal. Es un único
 * endpoint para ambos surfaces (la API resuelve si la sesión es de equipo o
 * de cliente); no existe una variante bajo /api/client.
 *
 * Cada surface instancia esto UNA vez con su basePath ('/api' admin,
 * '/api/client' portal) y su getter de token de Clerk — nunca se duplica
 * esta lógica por surface.
 */

import { useEffect, useRef, useState } from 'react'
import { uploadPresigned } from '@vercel/blob/client'
import { API_URL } from '@synous/shared'
import { ApiError } from '@synous/api-client'

export type FilePurpose =
  | 'deal_document'
  | 'library_item'
  | 'expense_receipt'
  | 'proposal_logo'
  | 'brand_logo'
  | 'onboarding_material'

/**
 * Listas MIME por purpose — reflejan (solo eso, la API sigue siendo la única
 * fuente de verdad de tipos/tamaños) la tabla de políticas del contrato.
 */
export const FILE_PURPOSE_ACCEPT: Record<FilePurpose, string> = {
  deal_document:
    'application/pdf,image/png,image/jpeg,image/webp,image/gif,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/zip',
  library_item:
    'application/pdf,image/png,image/jpeg,image/webp,image/gif,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/zip',
  expense_receipt: 'application/pdf,image/png,image/jpeg,image/webp',
  proposal_logo: 'image/png,image/jpeg,image/webp,image/gif',
  brand_logo: 'image/png,image/jpeg,image/webp',
  onboarding_material:
    'application/pdf,image/png,image/jpeg,image/webp,image/gif,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/zip,video/mp4,video/quicktime,audio/webm,audio/mpeg,audio/mp4,audio/ogg,audio/wav',
}

export interface UploadedFile {
  storageKey: string
  name: string
  size: number
  contentType: string
}

export interface UploadFileOptions {
  purpose: FilePurpose
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

interface UploadIntent {
  uploadId: string
  storageKey: string
  mode: 'blob' | 'server'
  maxSizeBytes: number
  contentType: string
}

export interface FileAccessResponse {
  url: string
  expiresAt: string
}

export interface FileTransferConfig {
  /** '/api' para el admin, '/api/client' para el portal de cliente. */
  basePath: '/api' | '/api/client'
  /** Getter async del token de Clerk vigente en el surface que instancia esto. */
  getToken: () => Promise<string | null>
}

/** Traduce códigos de error de la API (ver contrato §9) a mensajes claros en español. */
function mapFileTransferError(err: unknown): Error {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'FILE_TYPE_NOT_ALLOWED':
        return new Error('Ese tipo de archivo no está permitido.')
      case 'FILE_TOO_LARGE':
        // El backend incluye el máximo permitido en el mensaje — lo priorizamos.
        return new Error(err.message || 'El archivo supera el tamaño máximo permitido.')
      case 'FILE_PURPOSE_FORBIDDEN':
        return new Error('No tenés permiso para subir este archivo.')
      case 'FILE_NOT_UPLOADED':
        return new Error('No se pudo confirmar la subida del archivo. Probá de nuevo.')
      case 'STORAGE_UNAVAILABLE':
        return new Error('El almacenamiento no está disponible en este momento. Probá de nuevo en unos minutos.')
      case 'STORAGE_NOT_CONFIGURED':
        return new Error('La subida de archivos no está disponible en este entorno.')
      case 'UPLOAD_MODE_MISMATCH':
        return new Error('Error de configuración al subir el archivo. Contactá a soporte.')
      case 'UPLOAD_QUOTA_EXCEEDED':
        return new Error('Tenés demasiados archivos subidos sin guardar. Guardá o descartá los pendientes y probá de nuevo.')
      case 'UPLOAD_TOKEN_FORBIDDEN':
        return new Error('La subida expiró o no te pertenece. Volvé a elegir el archivo.')
      case 'UPLOAD_ALREADY_SENT':
        return new Error('Ese archivo ya se subió. Guardá los cambios para terminar.')
      case 'FILE_NOT_FOUND':
        return new Error('No se encontró el archivo.')
      default:
        return new Error(err.message || 'No se pudo completar la operación.')
    }
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return new Error('Subida cancelada.')
  }
  if (err instanceof TypeError) {
    // fetch/XHR de red caída — "Failed to fetch" en Chrome, mensajes distintos en otros motores.
    return new Error('No se pudo conectar con el servidor. Revisá tu conexión.')
  }
  if (err instanceof Error) return err
  return new Error('No se pudo completar la operación.')
}

const CANONICAL_TYPE_BY_EXTENSION: Record<string, string> = {
  zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

/**
 * La API valida contra tipos MIME canónicos, pero los browsers no siempre los
 * reportan así: en Windows un ZIP llega como `application/x-zip-compressed`, y
 * algunos sistemas dejan `file.type` vacío para documentos de Office. Sin
 * normalizar, archivos válidos se rechazaban como "tipo no permitido".
 */
function canonicalContentType(file: File): string {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const byExtension = CANONICAL_TYPE_BY_EXTENSION[extension]
  if (byExtension && (file.type === '' || file.type === 'application/x-zip-compressed')) return byExtension
  return file.type
}

export function createFileTransfer(config: FileTransferConfig) {
  const { basePath, getToken } = config

  async function authHeaders(): Promise<Record<string, string>> {
    const token = await getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const headers = await authHeaders()
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
      signal,
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      const apiErr = (json as { error?: { code?: string; message?: string } } | null)?.error
      throw new ApiError(apiErr?.code ?? 'ERROR', apiErr?.message ?? 'Error de red', res.status)
    }
    return (json as { data: T }).data
  }

  /**
   * Modo server (dev local sin Blob): PUT multipart directo. Se usa XHR (no
   * fetch) porque es la única API del browser que expone progreso de subida.
   */
  function putServerContent(
    uploadId: string,
    file: File,
    headers: Record<string, string>,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', `${API_URL}${basePath}/uploads/${uploadId}/content`)
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
      xhr.withCredentials = true
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve()
          return
        }
        let code = 'ERROR'
        let message = 'Error de red'
        try {
          const json = JSON.parse(xhr.responseText) as { error?: { code?: string; message?: string } }
          code = json.error?.code ?? code
          message = json.error?.message ?? message
        } catch {
          /* respuesta no-JSON — usamos el fallback genérico */
        }
        reject(new ApiError(code, message, xhr.status))
      }
      xhr.onerror = () => reject(new TypeError('Failed to fetch'))
      xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'))
      if (signal) {
        if (signal.aborted) xhr.abort()
        else signal.addEventListener('abort', () => xhr.abort(), { once: true })
      }
      const fd = new FormData()
      fd.append('file', file)
      xhr.send(fd)
    })
  }

  /**
   * Sube un archivo siguiendo el contrato de 3 pasos y devuelve la storageKey
   * lista para pasarle al endpoint de dominio que la "reclama" (createDocument,
   * library item, branding, etc — ver claimUpload en el backend).
   */
  async function uploadFile(file: File, options: UploadFileOptions): Promise<UploadedFile> {
    try {
      const intent = await postJson<UploadIntent>(
        `${basePath}/uploads`,
        { purpose: options.purpose, fileName: file.name, contentType: canonicalContentType(file), sizeBytes: file.size },
        options.signal,
      )

      const headers = await authHeaders()
      if (intent.mode === 'blob') {
        await uploadPresigned(intent.storageKey, file, {
          access: 'private',
          handleUploadUrl: `${API_URL}${basePath}/uploads/blob-token`,
          headers,
          contentType: intent.contentType,
          multipart: file.size > 8 * 1024 * 1024,
          abortSignal: options.signal,
          onUploadProgress: options.onProgress
            ? (evt) => options.onProgress!(Math.round(evt.percentage))
            : undefined,
        })
      } else {
        await putServerContent(intent.uploadId, file, headers, options.onProgress, options.signal)
      }

      return { storageKey: intent.storageKey, name: file.name, size: file.size, contentType: intent.contentType }
    } catch (err) {
      throw mapFileTransferError(err)
    }
  }

  /** Pide una URL de acceso temporal (descarga/preview) para una storageKey ya adjunta. */
  async function getFileAccessUrl(storageKey: string): Promise<FileAccessResponse> {
    try {
      // Sin basePath a propósito: el acceso autoriza por recurso a cualquiera de
      // las dos sesiones en una sola ruta. Bajo /api/client daba 404 y rompía
      // todas las descargas y previews del portal.
      return await postJson<FileAccessResponse>('/api/files/access', { storageKey })
    } catch (err) {
      throw mapFileTransferError(err)
    }
  }

  /**
   * Abre un archivo en una pestaña nueva. La ventana se abre SINCRÓNICAMENTE,
   * dentro del gesto del usuario (click), y recién después se le asigna la URL
   * real — si esperáramos a la respuesta del backend para hacer window.open(),
   * el navegador lo trataría como popup y lo bloquearía. Si la request falla,
   * cerramos la ventana vacía y relanzamos el error para que el caller lo muestre.
   */
  async function openFile(storageKey: string): Promise<void> {
    const win = window.open('', '_blank')
    try {
      const { url } = await getFileAccessUrl(storageKey)
      if (win) win.location.href = url
      else window.location.href = url // popup bloqueado igual: navegamos en la misma pestaña
    } catch (err) {
      win?.close()
      throw err
    }
  }

  /**
   * Hook para previews de imagen (`<img src>`). Pide la URL firmada y la
   * refresca ANTES de `expiresAt` (las presigned GET de blob duran 5 min) para
   * que una preview abierta un rato no se rompa a mitad de sesión.
   */
  function useFileUrl(storageKey: string | null | undefined): { url: string | null; error: string | null } {
    const [url, setUrl] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (!storageKey) {
        setUrl(null)
        setError(null)
        return
      }

      let cancelled = false

      async function load(key: string) {
        try {
          const res = await getFileAccessUrl(key)
          if (cancelled) return
          setUrl(res.url)
          setError(null)
          const msUntilExpiry = new Date(res.expiresAt).getTime() - Date.now()
          const delay = Math.max(msUntilExpiry - 10_000, 1_000)
          timerRef.current = setTimeout(() => void load(key), delay)
        } catch (err) {
          if (!cancelled) {
            setUrl(null)
            setError(err instanceof Error ? err.message : 'No se pudo cargar la imagen')
          }
        }
      }

      void load(storageKey)

      return () => {
        cancelled = true
        if (timerRef.current) clearTimeout(timerRef.current)
      }
    }, [storageKey])

    return { url, error }
  }

  return { uploadFile, getFileAccessUrl, openFile, useFileUrl }
}
