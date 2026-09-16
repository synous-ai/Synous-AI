'use client'

import { useId, useRef, useState } from 'react'
import { Loader2, Paperclip, X } from 'lucide-react'
import { uploadFile, FILE_PURPOSE_ACCEPT } from '@portal/lib/files'
import type { FilePurpose } from '@portal/lib/files'
import { formatSize } from '@synous/shared'
import { cn } from '@portal/lib/utils'
import type { CRUploadRef } from '@portal/lib/types'
import { Button } from '@portal/components/ui/button'

const CR_ATTACHMENT_PURPOSE: FilePurpose = 'cr_attachment'

/**
 * La lista de MIME sale del mapa compartido, no de una constante local: si el
 * backend amplía o recorta la política del purpose, el `accept` del input
 * acompaña sin que haya que acordarse de tocar también este archivo.
 */
const CR_ATTACHMENT_ACCEPT = FILE_PURPOSE_ACCEPT[CR_ATTACHMENT_PURPOSE]

interface PendingUpload {
  id: string
  name: string
  size: number
  status: 'uploading' | 'error'
  error?: string
}

/**
 * Selector de archivos con subida inmediata (intent → upload, ver
 * `@portal/lib/files`). `value`/`onChange` llevan solo los adjuntos YA
 * subidos (`CRUploadRef[]`), listos para mandar en `uploads` al crear la CR o
 * al comentar — el shape lo define `CRUploadRef` en `portal-lib/lib/types.ts`.
 */
export function AttachmentsField({
  value,
  onChange,
  disabled,
  label = 'Archivos',
}: {
  value: CRUploadRef[]
  onChange: (next: CRUploadRef[]) => void
  disabled?: boolean
  label?: string
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<PendingUpload[]>([])

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    for (const file of Array.from(files)) {
      const pendingId = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`
      setPending((prev) => [...prev, { id: pendingId, name: file.name, size: file.size, status: 'uploading' }])
      try {
        const uploaded = await uploadFile(file, { purpose: CR_ATTACHMENT_PURPOSE })
        setPending((prev) => prev.filter((p) => p.id !== pendingId))
        onChange([
          ...value,
          { storageKey: uploaded.storageKey, name: uploaded.name, mimeType: uploaded.contentType, sizeBytes: uploaded.size },
        ])
      } catch (err) {
        setPending((prev) =>
          prev.map((p) =>
            p.id === pendingId
              ? { ...p, status: 'error', error: err instanceof Error ? err.message : 'No se pudo subir el archivo.' }
              : p,
          ),
        )
      }
    }
  }

  function removeUploaded(storageKey: string) {
    onChange(value.filter((f) => f.storageKey !== storageKey))
  }

  function dismissError(id: string) {
    setPending((prev) => prev.filter((p) => p.id !== id))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span id={inputId} className="text-sm font-medium text-foreground">
          {label}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-describedby={inputId}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip className="h-3.5 w-3.5" />
          Adjuntar
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={CR_ATTACHMENT_ACCEPT}
          disabled={disabled}
          // tabIndex=-1: el botón "Adjuntar" ya es el disparador accesible por
          // teclado (le hace click a este input via ref). Sin esto, un usuario
          // de teclado encontraba DOS paradas de Tab para la misma acción —
          // el botón visible y este input sr-only inmediatamente después.
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(e) => {
            void handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {(value.length > 0 || pending.length > 0) && (
        <ul className="space-y-1.5">
          {value.map((file) => (
            <li
              key={file.storageKey}
              className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs"
            >
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-foreground/90">{file.name}</span>
              <span className="shrink-0 text-muted-foreground">{formatSize(file.sizeBytes)}</span>
              <button
                type="button"
                onClick={() => removeUploaded(file.storageKey)}
                disabled={disabled}
                aria-label={`Quitar ${file.name}`}
                className={cn(
                  'shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                )}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {pending.map((p) => (
            <li
              key={p.id}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
                p.status === 'error' ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-muted/20',
              )}
            >
              {p.status === 'uploading' ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
              ) : (
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate text-foreground/90">{p.name}</span>
              {p.status === 'error' ? (
                <>
                  <span role="alert" className="shrink-0 text-destructive">
                    {p.error}
                  </span>
                  <button
                    type="button"
                    onClick={() => dismissError(p.id)}
                    aria-label={`Quitar ${p.name}`}
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <span className="shrink-0 text-muted-foreground">{formatSize(p.size)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
