'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AlertTriangle, ArrowLeft, Check, Copy, Eye, ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useProposal, useAcceptProposal, useMarkProposalSent, useUpdateProposal } from '@/lib/hooks'
import {
  PROPOSAL_TEMPLATE_KEYS,
  PROPOSAL_TEMPLATES,
  isProposalTemplate,
  templateOf,
} from '@/components/proposal/proposal-templates'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Detalle de una propuesta (admin): estado, link público y aprobación.
 *
 * La edición por campos quedó fuera a propósito. La landing pública cambió de
 * forma y su estructura todavía se está definiendo con propuestas reales;
 * construir el editor contra un shape que va a moverse deja formularios que hay
 * que rehacer. La landing muestra la PLANTILLA que elige cada propuesta (layout
 * + copy en código, ver `components/proposal/proposal-templates.ts`) e ignora
 * `proposal.content`: editar ese JSON no cambia lo que ve el cliente.
 */
export default function ProposalDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading } = useProposal(id)
  const accept = useAcceptProposal(id)
  const markSent = useMarkProposalSent(id)
  const update = useUpdateProposal(id)
  const [copied, setCopied] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!data) {
    return <p className="p-6 text-sm text-muted-foreground">Propuesta no encontrada.</p>
  }

  const isDraft = data.status === 'draft'
  const template = templateOf(data.template)
  const pending = PROPOSAL_TEMPLATES[template].pending

  function changeTemplate(value: string) {
    if (!isProposalTemplate(value) || value === template) return
    update.mutate(
      { template: value },
      {
        onSuccess: () => toast.success('Plantilla actualizada'),
        onError: () => toast.error('No se pudo cambiar la plantilla'),
      },
    )
  }

  async function copyLink() {
    if (!data) return
    await navigator.clipboard.writeText(data.publicUrl)
    setCopied(true)
    toast.success('Link copiado')
    // El link se copia para enviarlo: registrarlo como enviada evita que el
    // estado quede rezagado respecto de lo que ya pasó.
    if (data.status === 'accepted') markSent.mutate()
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/proposals">
          <Button variant="ghost" size="icon" aria-label="Volver">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold">{data.title}</h1>
          <p className="text-sm text-muted-foreground">
            {data.content.clientName} · {data.status}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div>
            <label htmlFor="proposal-template" className="text-sm font-medium">
              Plantilla
            </label>
            <p className="mt-1 text-sm text-muted-foreground">
              Define qué landing ve el cliente en su link. El copy de cada una vive en el código.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                id="proposal-template"
                value={template}
                disabled={update.isPending}
                onChange={(event) => changeTemplate(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {PROPOSAL_TEMPLATE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {PROPOSAL_TEMPLATES[key].label}
                  </option>
                ))}
              </select>
              <a href={`/admin/proposal-preview/${template}`} target="_blank" rel="noreferrer noopener">
                <Button variant="outline" size="sm">
                  <Eye className="mr-2 h-4 w-4" />
                  Vista previa
                </Button>
              </a>
            </div>
          </div>

          {pending.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Confirmar antes de aprobar y enviar
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-muted-foreground">
                {pending.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Los datos sin validar se muestran como “A confirmar” en la landing.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div>
            <p className="text-sm font-medium">Link para el cliente</p>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{data.publicUrl}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={copyLink} disabled={isDraft} variant="outline" size="sm">
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              Copiar link
            </Button>

            <a href={data.publicUrl} target="_blank" rel="noreferrer noopener">
              <Button disabled={isDraft} variant="outline" size="sm">
                <ExternalLink className="mr-2 h-4 w-4" />
                Abrir
              </Button>
            </a>

            {isDraft && (
              <Button onClick={() => accept.mutate()} disabled={accept.isPending} size="sm">
                {accept.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Aprobar
              </Button>
            )}
          </div>

          {isDraft && (
            <p className="text-sm text-muted-foreground">
              El link no funciona hasta aprobar la propuesta.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <p className="text-sm font-medium">Contenido</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Generado por IA desde el onboarding. Es referencia interna: la landing no lo muestra.
          </p>
          <pre className="mt-4 max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs">
            {JSON.stringify(data.content, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}
