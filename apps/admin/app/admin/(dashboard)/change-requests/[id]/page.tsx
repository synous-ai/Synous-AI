'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ListOrdered, History } from 'lucide-react'
import { toast } from 'sonner'
import { useCRDetail, useCRTransition, useCRComment } from '@/lib/hooks'
import { crStatus } from '@/lib/status'
import { formatCurrency } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SkeletonGroup } from '@/components/ui/loading-region'
import { Skeleton } from '@/components/ui/skeleton'
import { TableSkeleton, ListSkeleton } from '@/components/ui/skeletons'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'

// ─── Transition matrix (admin-visible transitions per status) ──────────────────

type CRStatus =
  | 'draft'
  | 'sent'
  | 'approved'
  | 'rejected'
  | 'negotiating'
  | 'approved_verbally'
  | 'disputed'
  | 'completed'

const TRANSITIONS: Record<CRStatus, { value: string; label: string }[]> = {
  draft: [{ value: 'sent', label: 'Enviar al cliente' }],
  sent: [
    { value: 'approved', label: 'Marcar aprobado' },
    { value: 'approved_verbally', label: 'Aprobado verbalmente' },
    { value: 'negotiating', label: 'Marcar en negociación' },
    { value: 'disputed', label: 'Marcar disputado' },
    { value: 'rejected', label: 'Rechazar' },
  ],
  negotiating: [
    { value: 'approved', label: 'Marcar aprobado' },
    { value: 'approved_verbally', label: 'Aprobado verbalmente' },
    { value: 'disputed', label: 'Marcar disputado' },
    { value: 'rejected', label: 'Rechazar' },
    { value: 'sent', label: 'Reenviar al cliente' },
  ],
  approved_verbally: [
    { value: 'approved', label: 'Confirmar aprobación' },
    { value: 'completed', label: 'Marcar completado' },
  ],
  approved: [{ value: 'completed', label: 'Marcar completado' }],
  disputed: [
    { value: 'negotiating', label: 'Pasar a negociación' },
    { value: 'rejected', label: 'Rechazar' },
  ],
  rejected: [],
  completed: [],
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ChangeRequestDetailPage(): React.JSX.Element {
  const params = useParams<{ id: string }>()
  const id = params.id

  const { data, isLoading } = useCRDetail(id)
  const transition = useCRTransition()
  const comment = useCRComment()

  const [selectedTransition, setSelectedTransition] = useState('')
  const [transitionComment, setTransitionComment] = useState('')
  const [commentBody, setCommentBody] = useState('')

  const cr = data?.changeRequest
  const items = data?.items ?? []
  const comments = data?.comments ?? []
  const history = data?.history ?? []

  const availableTransitions = cr
    ? (TRANSITIONS[cr.status as CRStatus] ?? [])
    : []

  async function applyTransition(): Promise<void> {
    if (!selectedTransition) return
    try {
      await transition.mutateAsync({
        id,
        status: selectedTransition,
        comment: transitionComment.trim() || undefined,
      })
      toast.success('Estado actualizado')
      setSelectedTransition('')
      setTransitionComment('')
    } catch {
      toast.error('No se pudo cambiar el estado')
    }
  }

  async function submitComment(): Promise<void> {
    if (!commentBody.trim()) return
    try {
      await comment.mutateAsync({ id, body: commentBody.trim() })
      toast.success('Comentario agregado')
      setCommentBody('')
    } catch {
      toast.error('No se pudo agregar el comentario')
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  // Skeleton fiel al layout real: breadcrumb + header card (full-width) +
  // 2 columnas (izq: descripción+ítems+historial / der: acciones+comentarios).
  if (isLoading) {
    return (
      <SkeletonGroup label="Cargando change request…" className="p-6">
        {/* Breadcrumb */}
        <Skeleton className="mb-6 h-4 w-36 rounded" />

        {/* Header card: CR#N + badge + título + monto */}
        <div className="mb-6 space-y-2 rounded-2xl border bg-card p-6">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-4 w-32" />
        </div>

        {/* Layout 2 columnas */}
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* ── Izquierda: descripción + ítems + historial ── */}
          <div className="min-w-0 flex-1 space-y-6">
            {/* Descripción */}
            <div className="space-y-2 rounded-2xl border bg-card p-6">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
            {/* Ítems (tabla: descripción / hs / precio / cant / subtotal) */}
            <div className="space-y-3 rounded-2xl border bg-card p-6">
              <Skeleton className="h-3 w-16" />
              <TableSkeleton columns={5} rows={3} label="Cargando ítems…" />
            </div>
            {/* Historial de transiciones */}
            <div className="space-y-3 rounded-2xl border bg-card p-6">
              <Skeleton className="h-3 w-20" />
              <ListSkeleton rows={3} rowClassName="h-12 rounded-xl" label="Cargando historial…" />
            </div>
          </div>

          {/* ── Derecha: cambiar estado + comentarios ── */}
          <div className="w-full space-y-6 lg:w-80 lg:flex-shrink-0">
            {/* Card de transición */}
            <div className="space-y-3 rounded-2xl border bg-card p-6">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
            {/* Card de comentarios */}
            <div className="space-y-3 rounded-2xl border bg-card p-6">
              <Skeleton className="h-3 w-24" />
              <ListSkeleton rows={2} rowClassName="h-16 rounded-xl" label="Cargando comentarios…" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </SkeletonGroup>
    )
  }

  // ── Not found ─────────────────────────────────────────────────────────────

  if (!cr) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">No se encontró la change request.</p>
        <Link href="/admin/deals" className="mt-2 text-sm text-primary underline">
          ← Volver a Deals
        </Link>
      </div>
    )
  }

  // ── Breadcrumb destination ────────────────────────────────────────────────
  const backHref = `/deals/${cr.dealId}`
  const backLabel = `Deal / CR#${cr.number}`

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={backHref} className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" />
          {backLabel}
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">{cr.title}</span>
      </nav>

      {/* Header card */}
      <Card className="mb-6 rounded-2xl">
        <CardContent className="p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground">CR#{cr.number}</span>
                {(() => {
                  const { kind, label } = crStatus(cr.status)
                  return <StatusBadge kind={kind}>{label}</StatusBadge>
                })()}
              </div>
              <h1 className="mt-1 text-2xl font-bold leading-tight">{cr.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {cr.totalAmount && (
                  <span className="font-mono font-semibold text-foreground">
                    {formatCurrency(cr.totalAmount)}
                  </span>
                )}
                {cr.timelineImpactDays > 0 && (
                  <span>+{cr.timelineImpactDays} días</span>
                )}
                <span className="font-mono text-xs">
                  {new Date(cr.createdAt).toLocaleDateString('es', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Two-column layout on larger screens */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* ── Left: description + items + transitions ──────────────────── */}
        <div className="min-w-0 flex-1 space-y-6">
          {/* Descripción */}
          <Card className="rounded-2xl">
            <CardContent className="p-6">
              <p className="eyebrow mb-3">Descripción</p>
              <p className="whitespace-pre-wrap text-sm text-foreground">{cr.description}</p>
              {cr.originalScopeRef && (
                <div className="mt-3 rounded-lg bg-muted/60 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Scope original
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">
                    {cr.originalScopeRef}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ítems */}
          <Card className="rounded-2xl">
            <CardContent className="p-6">
              <p className="eyebrow mb-3">Ítems ({items.length})</p>
              {items.length === 0 ? (
                <Empty className="border-dashed py-8">
                  <EmptyHeader>
                    <EmptyIllustration icon={ListOrdered} />
                    <EmptyTitle>Sin Ítems</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right">Hs.</TableHead>
                      <TableHead className="text-right">P. Unit.</TableHead>
                      <TableHead className="text-right">Cant.</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell className="text-sm">{it.description}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {it.hours ?? '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatCurrency(it.unitPrice)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {it.quantity}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold">
                          {it.subtotal ? formatCurrency(it.subtotal) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Historial de estados */}
          <Card className="rounded-2xl">
            <CardContent className="p-6">
              <p className="eyebrow mb-3">Historial ({history.length})</p>
              {history.length === 0 ? (
                <Empty className="border-dashed py-8">
                  <EmptyHeader>
                    <EmptyIllustration icon={History} />
                    <EmptyTitle>Sin Historial de Estados</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ol className="space-y-3">
                  {history.map((h) => {
                    const { kind: toKind, label: toLabel } = crStatus(h.toStatus)
                    return (
                      <li key={h.id} className="flex gap-3 text-sm">
                        <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-signal" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {h.fromStatus && (
                              <>
                                {(() => {
                                  const { kind, label } = crStatus(h.fromStatus)
                                  return <StatusBadge kind={kind}>{label}</StatusBadge>
                                })()}
                                <span className="text-xs text-muted-foreground">→</span>
                              </>
                            )}
                            <StatusBadge kind={toKind}>{toLabel}</StatusBadge>
                            <span className="ml-auto font-mono text-xs text-muted-foreground">
                              {new Date(h.changedAt).toLocaleString('es', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          {h.comment && (
                            <p className="mt-1 text-xs text-muted-foreground">{h.comment}</p>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right: transitions + comments ─────────────────────────────── */}
        <div className="w-full space-y-6 lg:w-80 lg:flex-shrink-0">
          {/* Cambiar estado */}
          {availableTransitions.length > 0 && (
            <Card className="rounded-2xl">
              <CardContent className="p-6">
                <p className="eyebrow mb-3">Cambiar estado</p>
                <div className="space-y-2">
                  <Select value={selectedTransition} onValueChange={setSelectedTransition}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar transición…" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTransitions.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTransition && (
                    <Textarea
                      value={transitionComment}
                      onChange={(e) => setTransitionComment(e.target.value)}
                      placeholder="Comentario opcional para el historial…"
                      rows={2}
                    />
                  )}
                  <Button
                    size="sm"
                    onClick={() => void applyTransition()}
                    disabled={!selectedTransition || transition.isPending}
                    className="w-full"
                  >
                    {transition.isPending ? 'Actualizando…' : 'Aplicar cambio'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Comentarios */}
          <Card className="rounded-2xl">
            <CardContent className="p-6">
              <p className="eyebrow mb-3">Comentarios ({comments.length})</p>
              {comments.length > 0 && (
                <div className="mb-4 space-y-2">
                  {comments.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-xl border bg-background/60 px-3 py-2.5"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          {c.authorUser ? 'Admin' : 'Cliente'}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {new Date(c.createdAt).toLocaleString('es', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-foreground">{c.body}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <Textarea
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Escribí un comentario…"
                  rows={2}
                />
                <Button
                  size="sm"
                  onClick={() => void submitComment()}
                  disabled={!commentBody.trim() || comment.isPending}
                  className="w-full"
                >
                  {comment.isPending ? 'Enviando…' : 'Comentar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
