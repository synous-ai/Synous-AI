'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Check, Copy, ExternalLink, Eye, Loader2, Plus, Trash2, Save, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { useProposal, useUpdateProposal, useAcceptProposal, useMarkProposalSent, uploadFile } from '@/lib/hooks'
import { API_URL } from '@/lib/config'
import type { ProposalContent } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Deck } from '@/components/proposals/proposal-deck'

/**
 * Editor de propuesta (admin). Carga la propuesta, permite ajustar todo lo que
 * generó la IA, guardar (PATCH), aprobar (deja lista para enviar) y copiar/abrir
 * el link público de presentación.
 */
export default function ProposalEditorPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading } = useProposal(id)
  const update = useUpdateProposal(id)
  const accept = useAcceptProposal(id)
  const markSent = useMarkProposalSent(id)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState<ProposalContent | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Sincronizamos el estado local cuando llega la propuesta.
  useEffect(() => {
    if (data) {
      setTitle(data.title)
      setContent(data.content)
    }
  }, [data])

  if (isLoading || !data || !content) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  const isPublic = data.status !== 'draft'
  const publicUrl = data.publicUrl

  function patch(p: Partial<ProposalContent>) {
    setContent((c) => (c ? { ...c, ...p } : c))
  }

  async function save() {
    if (!content) return
    await update.mutateAsync({ title, content })
    toast.success('Propuesta guardada')
  }

  async function approveAndSave() {
    if (!content) return
    await update.mutateAsync({ title, content })
    await accept.mutateAsync()
    toast.success('Propuesta publicada — ya podés enviar el link')
  }

  async function copyLink() {
    await navigator.clipboard.writeText(publicUrl)
    markSent.mutate() // copiar el link cuenta como "enviada" (idempotente)
    toast.success('Link copiado')
  }

  // Sube el logo del cliente y guarda su URL absoluta en el contenido.
  async function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    try {
      const { key } = await uploadFile(file)
      patch({ logoUrl: `${API_URL}/api/files/${key}` })
      toast.success('Logo subido')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir el logo')
    } finally {
      setUploadingLogo(false)
      e.target.value = ''
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Vista previa full-screen del deck (con el contenido editado en vivo). */}
      {previewOpen && content && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center justify-between border-b bg-card px-4 py-2">
            <span className="text-sm font-medium text-muted-foreground">
              Vista previa{data.status === 'draft' ? ' · borrador (todavía no enviada)' : ''}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setPreviewOpen(false)}>
              <X className="h-4 w-4" /> Cerrar
            </Button>
          </div>
          <div className="flex-1 overflow-auto">
            <Deck content={content} />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link href="/admin/proposals" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Propuestas
        </Link>
        <div className="flex items-center gap-2">
          {/* Vista previa SIEMPRE disponible (también en borrador, con tus ediciones). */}
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <Eye className="h-4 w-4" /> Vista Previa
          </Button>
          {isPublic && (
            <>
              <Button variant="outline" size="sm" onClick={copyLink}>
                <Copy className="h-4 w-4" /> Copiar Link
              </Button>
              <a href={data.publicUrl} target="_blank" rel="noreferrer" onClick={() => markSent.mutate()}>
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-4 w-4" /> Ver Presentación
                </Button>
              </a>
            </>
          )}
          <Button variant="outline" size="sm" onClick={save} disabled={update.isPending}>
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
          </Button>
          {/* Publicar solo tiene sentido en borrador; una vez publicada, alcanza con Guardar. */}
          {!isPublic && (
            <Button size="sm" onClick={approveAndSave} disabled={update.isPending || accept.isPending}>
              <Check className="h-4 w-4" /> Guardar y Publicar
            </Button>
          )}
        </div>
      </div>

      {/* Seguimiento del cliente: aprobada → enviada → vista → completada. */}
      <StatusTimeline
        steps={[
          { label: 'Publicada', at: data.acceptedAt },
          { label: 'Enviada', at: data.sentAt },
          { label: 'Vista', at: data.viewedAt },
          { label: 'Completada', at: data.completedAt },
        ]}
      />

      <div className="space-y-6">
        <Section title="Portada">
          <FieldRow label="Título de la Propuesta">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </FieldRow>
          <FieldRow label="Título (Slide de Portada)">
            <Input value={content.title} onChange={(e) => patch({ title: e.target.value })} maxLength={200} />
          </FieldRow>
          <FieldRow label="Tagline">
            <Input value={content.tagline ?? ''} onChange={(e) => patch({ tagline: e.target.value })} maxLength={200} />
          </FieldRow>
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldRow label="Cliente">
              <Input value={content.clientName} onChange={(e) => patch({ clientName: e.target.value })} maxLength={160} />
            </FieldRow>
            <FieldRow label="Empresa">
              <Input
                value={content.companyName ?? ''}
                onChange={(e) => patch({ companyName: e.target.value })}
                maxLength={160}
              />
            </FieldRow>
          </div>
          <FieldRow label="Logo del Cliente">
            <div className="flex items-center gap-3">
              {content.logoUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={content.logoUrl}
                    alt="Logo del cliente"
                    className="h-12 w-12 rounded-lg border border-border bg-card object-contain p-1"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => patch({ logoUrl: undefined })}>
                    <Trash2 className="h-4 w-4" /> Quitar
                  </Button>
                </>
              ) : (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-accent">
                  {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Subir logo
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    disabled={uploadingLogo}
                    onChange={onLogoFile}
                  />
                </label>
              )}
            </div>
          </FieldRow>
        </Section>

        <Section title="Texto">
          <FieldRow label="Resumen">
            <Textarea value={content.summary} onChange={(e) => patch({ summary: e.target.value })} rows={3} />
          </FieldRow>
          <FieldRow label="Lo que entendimos">
            <Textarea value={content.understanding} onChange={(e) => patch({ understanding: e.target.value })} rows={3} />
          </FieldRow>
          <FieldRow label="La solución">
            <Textarea value={content.solution} onChange={(e) => patch({ solution: e.target.value })} rows={4} />
          </FieldRow>
        </Section>

        <Section title="Objetivos">
          <StringList items={content.objectives} onChange={(objectives) => patch({ objectives })} placeholder="Objetivo…" />
        </Section>

        <Section title="Alcance">
          <ScopeEditor items={content.scope} onChange={(scope) => patch({ scope })} />
        </Section>

        <Section title="Plan de trabajo">
          <TimelineEditor items={content.timeline} onChange={(timeline) => patch({ timeline })} />
        </Section>

        <Section title="Inversión">
          <PricingEditor pricing={content.pricing} onChange={(pricing) => patch({ pricing })} />
        </Section>

        <Section title="Por qué nosotros">
          <StringList items={content.whyUs} onChange={(whyUs) => patch({ whyUs })} placeholder="Diferencial…" />
        </Section>

        <Section title="Cierre">
          <FieldRow label="Próximos pasos">
            <Textarea value={content.nextSteps} onChange={(e) => patch({ nextSteps: e.target.value })} rows={2} />
          </FieldRow>
          <FieldRow label="Términos (opcional)">
            <Textarea value={content.terms ?? ''} onChange={(e) => patch({ terms: e.target.value })} rows={3} />
          </FieldRow>
        </Section>
      </div>
    </div>
  )
}

// ─── Sub-componentes del editor ──────────────────────────────────────────────

/** Línea de tiempo del seguimiento: aprobada → enviada → vista → completada. */
function StatusTimeline({ steps }: { steps: { label: string; at: string | null }[] }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-card px-4 py-3 text-sm">
      {steps.map((s) => (
        <div key={s.label} className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${s.at ? 'bg-signal' : 'bg-border'}`} />
          <span className="font-medium">{s.label}</span>
          <span className="text-xs text-muted-foreground">
            {s.at
              ? new Date(s.at).toLocaleString('es', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        {children}
      </CardContent>
    </Card>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  )
}

/** Lista editable de strings (objetivos, diferenciales). */
function StringList({
  items,
  onChange,
  placeholder,
}: {
  items: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={it}
            placeholder={placeholder}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <RemoveButton onClick={() => onChange(items.filter((_, j) => j !== i))} />
        </div>
      ))}
      <AddButton onClick={() => onChange([...items, ''])} />
    </div>
  )
}

function ScopeEditor({
  items,
  onChange,
}: {
  items: ProposalContent['scope']
  onChange: (v: ProposalContent['scope']) => void
}) {
  const set = (i: number, p: Partial<ProposalContent['scope'][number]>) =>
    onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x)))
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="flex gap-2">
          <div className="flex-1 space-y-2">
            <Input value={it.title} placeholder="Entregable" onChange={(e) => set(i, { title: e.target.value })} />
            <Textarea
              value={it.description}
              placeholder="Descripción"
              rows={2}
              onChange={(e) => set(i, { description: e.target.value })}
            />
          </div>
          <RemoveButton onClick={() => onChange(items.filter((_, j) => j !== i))} />
        </div>
      ))}
      <AddButton onClick={() => onChange([...items, { title: '', description: '' }])} />
    </div>
  )
}

function TimelineEditor({
  items,
  onChange,
}: {
  items: ProposalContent['timeline']
  onChange: (v: ProposalContent['timeline']) => void
}) {
  const set = (i: number, p: Partial<ProposalContent['timeline'][number]>) =>
    onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x)))
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="flex gap-2">
          <div className="flex-1 space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={it.phase} placeholder="Fase" onChange={(e) => set(i, { phase: e.target.value })} />
              <Input value={it.duration} placeholder="Duración" onChange={(e) => set(i, { duration: e.target.value })} />
            </div>
            <Textarea
              value={it.detail}
              placeholder="Detalle"
              rows={2}
              onChange={(e) => set(i, { detail: e.target.value })}
            />
          </div>
          <RemoveButton onClick={() => onChange(items.filter((_, j) => j !== i))} />
        </div>
      ))}
      <AddButton onClick={() => onChange([...items, { phase: '', duration: '', detail: '' }])} />
    </div>
  )
}

function PricingEditor({
  pricing,
  onChange,
}: {
  pricing: ProposalContent['pricing']
  onChange: (v: ProposalContent['pricing']) => void
}) {
  const setItem = (i: number, p: Partial<ProposalContent['pricing']['items'][number]>) =>
    onChange({ ...pricing, items: pricing.items.map((x, j) => (j === i ? { ...x, ...p } : x)) })
  return (
    <div className="space-y-3">
      {pricing.items.map((it, i) => (
        <div key={i} className="flex gap-2">
          <Input value={it.label} placeholder="Concepto" onChange={(e) => setItem(i, { label: e.target.value })} />
          <Input
            type="number"
            value={it.amount}
            placeholder="0"
            className="w-32"
            onChange={(e) => setItem(i, { amount: Number(e.target.value) || 0 })}
          />
          <RemoveButton onClick={() => onChange({ ...pricing, items: pricing.items.filter((_, j) => j !== i) })} />
        </div>
      ))}
      <AddButton onClick={() => onChange({ ...pricing, items: [...pricing.items, { label: '', amount: 0 }] })} />

      <div className="grid gap-3 border-t pt-3 sm:grid-cols-3">
        <FieldRow label="Total">
          <Input
            type="number"
            value={pricing.total}
            onChange={(e) => onChange({ ...pricing, total: Number(e.target.value) || 0 })}
          />
        </FieldRow>
        <FieldRow label="Moneda">
          <Input
            value={pricing.currency}
            maxLength={3}
            onChange={(e) => onChange({ ...pricing, currency: e.target.value.toUpperCase() })}
          />
        </FieldRow>
        <FieldRow label="Nota de pago">
          <Input
            value={pricing.note ?? ''}
            placeholder="50% al inicio…"
            onChange={(e) => onChange({ ...pricing, note: e.target.value })}
          />
        </FieldRow>
      </div>
    </div>
  )
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-sm font-medium text-signal hover:underline"
    >
      <Plus className="h-3.5 w-3.5" /> Agregar
    </button>
  )
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Quitar"
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-destructive"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}
