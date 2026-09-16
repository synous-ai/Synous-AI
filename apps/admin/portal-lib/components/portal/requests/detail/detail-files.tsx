'use client'

import { useState } from 'react'
import { Download, FileText, Loader2 } from 'lucide-react'
import { formatDate, formatSize } from '@synous/shared'
import { openFile } from '@portal/lib/files'
import type { CRAttachment } from '@portal/lib/types'

function AttachmentRow({ attachment }: { attachment: CRAttachment }) {
  const [downloading, setDownloading] = useState(false)
  const [failed, setFailed] = useState(false)

  async function handleDownload() {
    setDownloading(true)
    setFailed(false)
    try {
      await openFile(attachment.storageKey)
    } catch {
      setFailed(true)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{attachment.name}</p>
        <p className="text-xs text-muted-foreground">
          {attachment.uploadedByName ?? 'Equipo'} · {formatDate(attachment.uploadedAt)}
          {attachment.sizeBytes != null && ` · ${formatSize(attachment.sizeBytes)}`}
        </p>
      </div>
      {failed && (
        <span role="alert" className="shrink-0 text-xs text-destructive">
          No se pudo descargar
        </span>
      )}
      <button
        type="button"
        onClick={() => void handleDownload()}
        disabled={downloading}
        aria-label={`Descargar ${attachment.name}`}
        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      </button>
    </li>
  )
}

export function DetailFiles({ attachments }: { attachments: CRAttachment[] }) {
  if (attachments.length === 0) return null

  return (
    <section aria-labelledby="cr-files-title" className="space-y-3">
      <h2 id="cr-files-title" className="eyebrow">
        Archivos
      </h2>
      <ul className="space-y-2">
        {attachments.map((attachment) => (
          <AttachmentRow key={attachment.id} attachment={attachment} />
        ))}
      </ul>
    </section>
  )
}
