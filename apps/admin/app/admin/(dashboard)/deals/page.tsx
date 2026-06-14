'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDeals, usePipelines, useCompanies, useContacts } from '@/lib/hooks'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DealDialog } from '@/components/deals/deal-dialog'
import { TableShell } from '@/components/ui/data-table'
import { Skeleton } from '@/components/ui/skeleton'
import { DataPagination } from '@/components/ui/data-pagination'
import { usePagination } from '@/lib/use-pagination'

export default function DealsPage(): React.JSX.Element {
  const router = useRouter()
  const dealsQ = useDeals()
  const pipelinesQ = usePipelines()
  const companiesQ = useCompanies()
  const contactsQ = useContacts()

  const [newOpen, setNewOpen] = useState(false)

  const pipelines = pipelinesQ.data ?? []
  const companies = companiesQ.data ?? []

  const stageLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of pipelines) for (const s of p.stages) map.set(s.id, s.label)
    return map
  }, [pipelines])

  const companyName = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of companies) map.set(c.id, c.name)
    return map
  }, [companies])

  const deals = dealsQ.data ?? []
  const { page, setPage, pageCount, pageItems } = usePagination(deals)

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="eyebrow">Negocios</p>
          <h1 className="text-3xl font-semibold tracking-tight">Deals</h1>
        </div>
        <Button onClick={() => setNewOpen(true)} disabled={pipelines.length === 0}>Nuevo Deal</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {dealsQ.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
            </div>
          ) : (
            <TableShell
              columns={[
                { key: 'name', label: 'Nombre' },
                { key: 'company', label: 'Empresa' },
                { key: 'stage', label: 'Etapa' },
                { key: 'amount', label: 'Monto', align: 'right' },
              ]}
              rows={pageItems}
              emptyMessage="No hay deals todavía."
              renderRow={(d) => (
                <tr
                  key={d.id}
                  onClick={() => router.push(`/admin/deals/${d.id}`)}
                  className="cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/50"
                >
                  <td className="px-4 py-3 font-medium">{d.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{d.companyId ? companyName.get(d.companyId) ?? '—' : '—'}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                      {stageLabel.get(d.stageId) ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(d.amount, d.currency)}</td>
                </tr>
              )}
            />
          )}
        </CardContent>
      </Card>
      <DataPagination page={page} pageCount={pageCount} onPageChange={setPage} />

      <DealDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        pipeline={pipelines[0]}
        companies={companies}
        contacts={contactsQ.data ?? []}
      />
    </div>
  )
}
