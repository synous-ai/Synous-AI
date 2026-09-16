'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Check, Copy, ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useProposal, useAcceptProposal, useMarkProposalSent } from '@/lib/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Detalle de una propuesta (admin): estado, link público y aprobación.
 *
 * La edición por campos quedó fuera a propósito. La landing pública cambió de
 * forma y su estructura todavía se está definiendo con propuestas reales;
 * construir el editor contra un shape que va a moverse deja formularios que hay
 * que rehacer. Hoy la landing muestra siempre la plantilla del código
 * (`app/portal/propuesta/proposal-content.ts`) e ignora `proposal.content`:
 * editar ese JSON no cambia lo que ve el cliente.
 */
export default function ProposalDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading } = useProposal(id)
  const accept = useAcceptProposal(id)
  const markSent = useMarkProposalSent(id)
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
            Lo que no esté cargado acá se completa con la plantilla al mostrarse.
          </p>
          <pre className="mt-4 max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs">
            {JSON.stringify(data.content, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}
