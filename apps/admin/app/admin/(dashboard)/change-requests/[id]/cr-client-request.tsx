import { ListOrdered } from 'lucide-react'
import type { ChangeRequest, CRItem } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/**
 * "Lo que pidió el cliente" — separado visualmente de "nuestra propuesta"
 * (ver CRProposalSection). Descripción, motivo/contexto y los ítems tal como
 * se cargó la CR originalmente; nunca se edita acá.
 */
export function CRClientRequest({ cr, items }: { cr: ChangeRequest; items: CRItem[] }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-6">
        <p className="eyebrow mb-3">Lo que pidió el cliente</p>

        <p className="whitespace-pre-wrap text-sm text-foreground">{cr.description}</p>

        {cr.context && (
          <div className="mt-3 rounded-lg bg-muted/60 px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Motivo / contexto
            </p>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{cr.context}</p>
          </div>
        )}

        {cr.originalScopeRef && (
          <div className="mt-3 rounded-lg bg-muted/60 px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Scope original de referencia
            </p>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{cr.originalScopeRef}</p>
          </div>
        )}

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ítems solicitados ({items.length})
          </p>
          {items.length === 0 ? (
            <Empty className="border-dashed py-6">
              <EmptyHeader>
                <EmptyIllustration icon={ListOrdered} />
                <EmptyTitle>Sin ítems</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="px-3 py-2.5 text-xs font-medium text-muted-foreground">Descripción</TableHead>
                    <TableHead className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">Hs.</TableHead>
                    <TableHead className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">P. Unit.</TableHead>
                    <TableHead className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">Cant.</TableHead>
                    <TableHead className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="px-3 py-2.5 text-sm">{it.description}</TableCell>
                      <TableCell className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">
                        {it.hours ?? '—'}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-right font-mono text-xs">
                        {formatCurrency(it.unitPrice, cr.currency)}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">
                        {it.quantity}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-right font-mono text-xs font-semibold">
                        {it.subtotal ? formatCurrency(it.subtotal, cr.currency) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
