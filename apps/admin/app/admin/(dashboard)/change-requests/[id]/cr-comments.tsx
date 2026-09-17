'use client'

import { useState } from 'react'
import { MessageSquare, Paperclip, X } from 'lucide-react'
import { toast } from 'sonner'
import { uploadFile, openFile, FILE_PURPOSE_ACCEPT } from '@/lib/hooks/misc'
import { useCRComment } from '@/lib/hooks'
import type { CRComment } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { StatusBadge } from '@/components/ui/status-badge'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'

function initialsFor(name: string | null, role: 'admin' | 'client'): string {
  if (name) {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('')
  }
  return role === 'client' ? 'CL' : 'EQ'
}

/** Conversación de la CR: comentarios con autor · rol · fecha, responder, adjuntar. */
export function CRComments({ id, comments }: { id: string; comments: CRComment[] }) {
  const comment = useCRComment()
  const [body, setBody] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [attaching, setAttaching] = useState(false)

  async function submit(): Promise<void> {
    if (!body.trim()) return
    setAttaching(true)
    try {
      const uploads = pendingFile
        ? [
            await uploadFile(pendingFile, { purpose: 'cr_attachment' }).then((u) => ({
              storageKey: u.storageKey,
            })),
          ]
        : undefined
      await comment.mutateAsync({ id, body: body.trim(), uploads })
      setBody('')
      setPendingFile(null)
      toast.success('Comentario agregado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo agregar el comentario')
    } finally {
      setAttaching(false)
    }
  }

  const pending = comment.isPending || attaching

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-6">
        <p className="eyebrow mb-3">Comentarios ({comments.length})</p>

        {comments.length === 0 ? (
          <Empty className="border-dashed py-6">
            <EmptyHeader>
              <EmptyIllustration icon={MessageSquare} />
              <EmptyTitle>Sin comentarios todavía</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="mb-4 space-y-3">
            {comments.map((c) => (
              <li key={c.id} className="flex gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="text-xs">{initialsFor(c.authorName, c.authorRole)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 rounded-xl border bg-background/60 px-3 py-2.5">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">{c.authorName ?? (c.authorRole === 'client' ? 'Cliente' : 'Equipo')}</span>
                    <StatusBadge kind={c.authorRole === 'client' ? 'info' : 'neutral'}>
                      {c.authorRole === 'client' ? 'Cliente' : 'Equipo'}
                    </StatusBadge>
                    <span className="font-mono text-[11px] text-muted-foreground">{formatDate(c.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{c.body}</p>
                  {c.attachments.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {c.attachments.map((a) => (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => void openFile(a.storageKey)}
                            className="inline-flex items-center gap-1 text-xs text-signal hover:underline focus-visible:underline focus-visible:outline-none"
                          >
                            <Paperclip className="h-3 w-3" aria-hidden="true" />
                            {a.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escribí un comentario…"
            rows={2}
            aria-label="Nuevo comentario"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2.5 text-xs text-muted-foreground hover:bg-accent/50">
              <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
              {pendingFile ? pendingFile.name.slice(0, 24) : 'Adjuntar'}
              <input
                type="file"
                accept={FILE_PURPOSE_ACCEPT.cr_attachment}
                className="sr-only"
                onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {pendingFile && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPendingFile(null)}
                aria-label="Quitar archivo adjunto"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="sm" onClick={() => void submit()} disabled={!body.trim() || pending} className="ml-auto">
              {pending ? 'Enviando…' : 'Comentar'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
