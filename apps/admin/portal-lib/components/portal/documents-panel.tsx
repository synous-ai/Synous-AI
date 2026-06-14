'use client'

import { useClientDocuments } from '@portal/lib/hooks'
import type { ClientDocument } from '@portal/lib/types'
import { Card, CardContent } from '@portal/components/ui/card'
import { Badge } from '@portal/components/ui/badge'
import { FileText, Loader2, Download } from 'lucide-react'
import { API_URL } from '@portal/lib/config'
import { EmptyIllustration } from '@portal/components/ui/empty-illustration'

// ─── Type label helpers ────────────────────────────────────────────────────────

const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  contract: 'Contrato',
  proposal: 'Propuesta',
  invoice: 'Factura',
  other: 'Otro',
}

const DOCUMENT_TYPE_VARIANT: Record<string, 'default' | 'signal' | 'accent' | 'destructive' | 'muted'> = {
  contract: 'default',
  proposal: 'muted',
  invoice: 'accent',
  other: 'muted',
}

function formatDateShort(dateStr: string): string {
  return new Intl.DateTimeFormat('es', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateStr))
}

// ─── Document Row ─────────────────────────────────────────────────────────────

function DocumentRow({ doc }: { doc: ClientDocument }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4">
        {/* Name + type */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{doc.name}</span>
          <Badge variant={DOCUMENT_TYPE_VARIANT[doc.type] ?? 'default'}>
            {DOCUMENT_TYPE_LABEL[doc.type] ?? doc.type}
          </Badge>
        </div>

        {/* Date */}
        <span className="text-xs text-muted-foreground">{formatDateShort(doc.createdAt)}</span>

        {/* Download */}
        {doc.storageKey && (
          <a
            href={`${API_URL}/api/files/${doc.storageKey}`}
            target="_blank"
            rel="noreferrer"
            className="ml-auto flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent/50"
          >
            <Download className="h-3.5 w-3.5" />
            Descargar
          </a>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function DocumentsPanel() {
  const query = useClientDocuments()
  const docs = query.data ?? []

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando documentos…
      </div>
    )
  }

  if (query.isError) {
    return (
      <p className="py-8 text-sm text-destructive">
        No se pudieron cargar los documentos.
      </p>
    )
  }

  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <EmptyIllustration icon={FileText} />
        <div>
          <p className="font-medium text-muted-foreground">Sin Documentos</p>
          <p className="mt-0.5 text-sm text-muted-foreground/70">
            Los contratos y documentos de tus proyectos aparecerán acá cuando el equipo los suba.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {docs.map((doc) => (
        <DocumentRow key={doc.id} doc={doc} />
      ))}
    </div>
  )
}
