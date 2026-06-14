'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useContacts, useCompanies, useDeals, usePipelines } from '@/lib/hooks'
import type { Deal } from '@/lib/types'
import { KanbanBoard } from '@/components/pipeline/kanban-board'
import { DealDialog } from '@/components/deals/deal-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import { Kanban } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function PipelinePage(): React.JSX.Element {
  const router = useRouter()
  const pipelinesQ = usePipelines()
  const dealsQ = useDeals()
  const companiesQ = useCompanies()
  const contactsQ = useContacts()
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  const pipelines = pipelinesQ.data ?? []
  const activePipeline = useMemo(
    () => pipelines.find((p) => p.id === selectedPipelineId) ?? pipelines[0],
    [pipelines, selectedPipelineId],
  )

  const dealsForPipeline = useMemo(
    () => (dealsQ.data ?? []).filter((d) => d.pipelineId === activePipeline?.id),
    [dealsQ.data, activePipeline],
  )

  function openDetail(deal: Deal): void {
    router.push(`/admin/deals/${deal.id}`)
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="eyebrow">{activePipeline?.label ?? 'Ventas'}</p>
          <h1 className="font-display text-3xl font-bold tracking-tight">Pipeline</h1>
        </div>
        <div className="flex items-center gap-3">
          {pipelines.length > 1 && (
            <Select
              value={String(activePipeline?.id ?? '')}
              onValueChange={(v) => setSelectedPipelineId(v)}
            >
              <SelectTrigger className="h-9 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => setNewOpen(true)} disabled={!activePipeline}>Nuevo Deal</Button>
        </div>
      </div>

      {pipelinesQ.isLoading || dealsQ.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      ) : !activePipeline ? (
        <Empty>
          <EmptyHeader>
            <EmptyIllustration icon={Kanban} />
            <EmptyTitle>Sin Pipelines Todavía</EmptyTitle>
            <EmptyDescription>Corré el seed de la API (<code>pnpm --filter api db:seed</code>) para crear el pipeline inicial.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <KanbanBoard stages={activePipeline.stages} deals={dealsForPipeline} onDealClick={openDetail} />
      )}

      {/* Crear deal */}
      <DealDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        pipeline={activePipeline}
        companies={companiesQ.data ?? []}
        contacts={contactsQ.data ?? []}
      />
    </div>
  )
}
