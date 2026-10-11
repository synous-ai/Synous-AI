import Link from 'next/link'
import { FileText, Receipt, PackageCheck, Download } from 'lucide-react'
import { openFile } from '@/lib/hooks/misc'
import type { CRDetail } from '@/lib/types'
import { documentType } from '@/lib/status'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'

/**
 * Vínculos de solo lectura: documentos, facturas y entregables relacionados a
 * esta CR. Nunca se genera nada acá — es navegación hacia dónde vive cada
 * cosa de verdad (facturas tienen detalle propio; documentos y entregables
 * viven en las pestañas del deal).
 */
export function CRLinks({ dealId, links }: { dealId: string; links: CRDetail['links'] }) {
  const total = links.documents.length + links.invoices.length + links.deliverables.length

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-6">
        <p className="eyebrow mb-3">Vínculos</p>

        {total === 0 ? (
          <p className="text-sm text-muted-foreground">Sin documentos, facturas ni entregables asociados.</p>
        ) : (
          <div className="space-y-3">
            {links.documents.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Documentos</p>
                <ul className="space-y-1">
                  {links.documents.map((d) => {
                    const { kind, label } = documentType(d.type)
                    return (
                      <li key={d.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent/50">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <Link
                          href={`/deals/${dealId}`}
                          className="min-w-0 flex-1 truncate hover:underline focus-visible:underline focus-visible:outline-none"
                        >
                          {d.name}
                        </Link>
                        <StatusBadge kind={kind}>{label}</StatusBadge>
                        {d.storageKey && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => void openFile(d.storageKey!)}
                            aria-label={`Descargar ${d.name}`}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {links.invoices.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Facturas</p>
                <ul className="space-y-1">
                  {links.invoices.map((inv) => (
                    <li key={inv.id}>
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
                      >
                        <Receipt className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 flex-1">Factura #{inv.number}</span>
                        <span className="font-mono text-xs text-muted-foreground">{formatCurrency(inv.total, inv.currency)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {links.deliverables.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Entregables</p>
                <ul className="space-y-1">
                  {links.deliverables.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/deals/${dealId}`}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
                      >
                        <PackageCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{d.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
