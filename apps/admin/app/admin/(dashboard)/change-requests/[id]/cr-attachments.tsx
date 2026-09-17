'use client'

import { useState } from 'react'
import { Paperclip, Download, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { uploadFile, openFile, FILE_PURPOSE_ACCEPT } from '@/lib/hooks/misc'
import { useUploadCRAttachment } from '@/lib/hooks'
import type { CRAttachment } from '@/lib/types'
import { formatSize, formatDate } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'

/** Archivos de la CR: ver/descargar los ya subidos, subir nuevos. */
export function CRAttachments({ id, attachments }: { id: string; attachments: CRAttachment[] }) {
  const upload = useUploadCRAttachment()
  const [uploading, setUploading] = useState(false)

  async function handleFile(file: File | null): Promise<void> {
    if (!file) return
    setUploading(true)
    try {
      const { storageKey } = await uploadFile(file, { purpose: 'cr_attachment' })
      await upload.mutateAsync({ id, uploads: [{ storageKey }] })
      toast.success('Archivo adjuntado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir el archivo')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-6">
        <div className="mb-3 flex items-center justify-between">
          <p className="eyebrow">Archivos ({attachments.length})</p>
          <label
            className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 text-xs font-medium hover:bg-accent/50 ${uploading ? 'pointer-events-none opacity-60' : ''}`}
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            {uploading ? 'Subiendo…' : 'Subir archivo'}
            <input
              type="file"
              accept={FILE_PURPOSE_ACCEPT.cr_attachment}
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                void handleFile(e.target.files?.[0] ?? null)
                e.target.value = ''
              }}
            />
          </label>
        </div>

        {attachments.length === 0 ? (
          <Empty className="border-dashed py-6">
            <EmptyHeader>
              <EmptyIllustration icon={Paperclip} />
              <EmptyTitle>Sin archivos</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="space-y-2">
            {attachments.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-xl border bg-background/60 px-3 py-2.5"
              >
                <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{a.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.uploadedByName ?? (a.uploadedRole === 'client' ? 'Cliente' : 'Equipo')} · {formatDate(a.uploadedAt)}
                    {a.sizeBytes != null && ` · ${formatSize(a.sizeBytes)}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => void openFile(a.storageKey)}
                  aria-label={`Descargar ${a.name}`}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
