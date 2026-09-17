'use client'

import { useState, type FormEvent } from 'react'
import { Loader2, Send } from 'lucide-react'
import { formatDate } from '@synous/shared'
import { useCommentCR } from '@portal/lib/hooks'
import type { CRComment, CRUploadRef } from '@portal/lib/types'
import { Textarea } from '@portal/components/ui/textarea'
import { Button } from '@portal/components/ui/button'
import { Label } from '@portal/components/ui/label'
import { AttachmentsField } from '@portal/components/portal/requests/attachments-field'
import { useCanWriteChangeRequests } from '@portal/components/portal/requests/cr-status'

function CommentRow({ comment }: { comment: CRComment }) {
  return (
    <li className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{comment.authorName}</span>
        <span aria-hidden>·</span>
        <span>{comment.authorRole === 'client' ? 'Vos' : 'Equipo'}</span>
        <span aria-hidden>·</span>
        <span>{formatDate(comment.createdAt)}</span>
      </div>
      <p className="mt-1.5 whitespace-pre-line text-sm text-foreground">{comment.body}</p>
      {comment.attachments.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {comment.attachments.map((attachment) => (
            <li key={attachment.id} className="rounded-md bg-muted px-2 py-1 text-xs text-foreground/80">
              {attachment.name}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** Lista de comentarios + caja para escribir uno nuevo (con adjunto), oculta en modo solo lectura. */
export function DetailComments({ id, comments }: { id: string; comments: CRComment[] }) {
  const canWrite = useCanWriteChangeRequests()
  const commentCR = useCommentCR()
  const [body, setBody] = useState('')
  const [uploads, setUploads] = useState<CRUploadRef[]>([])
  const [touched, setTouched] = useState(false)

  const bodyError = touched && body.trim().length === 0 ? 'Escribí un comentario.' : null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (body.trim().length === 0 || commentCR.isPending) return
    try {
      await commentCR.mutateAsync({ id, body: body.trim(), uploads: uploads.length > 0 ? uploads : undefined })
      setBody('')
      setUploads([])
      setTouched(false)
    } catch {
      /* el error se muestra vía commentCR.error, abajo del formulario */
    }
  }

  return (
    <section aria-labelledby="cr-comments-title" className="space-y-3">
      <h2 id="cr-comments-title" className="eyebrow">
        Comentarios
      </h2>

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay comentarios.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((comment) => (
            <CommentRow key={comment.id} comment={comment} />
          ))}
        </ul>
      )}

      {canWrite && (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="space-y-1.5">
            <Label htmlFor="cr-comment-body">Escribir un comentario</Label>
            <Textarea
              id="cr-comment-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={commentCR.isPending}
              rows={3}
              aria-invalid={bodyError ? true : undefined}
              aria-describedby={bodyError ? 'cr-comment-body-error' : undefined}
              placeholder="Escribí tu comentario…"
            />
            {bodyError && (
              <p id="cr-comment-body-error" role="alert" className="text-xs text-destructive">
                {bodyError}
              </p>
            )}
          </div>

          <AttachmentsField value={uploads} onChange={setUploads} disabled={commentCR.isPending} label="Adjuntar archivo" />

          {commentCR.isError && (
            <p role="alert" className="text-xs text-destructive">
              No pudimos enviar tu comentario. Probá de nuevo en unos segundos.
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={commentCR.isPending}>
              {commentCR.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Enviar
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
