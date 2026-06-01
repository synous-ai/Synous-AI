'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useDeals, usePipelines, useCompanies } from '@/lib/hooks'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import { FolderOpen } from 'lucide-react'

export default function ProjectsPage(): React.JSX.Element {
  const router = useRouter()
  const dealsQ = useDeals()
  const pipelinesQ = usePipelines()
  const companiesQ = useCompanies()

  const pipelines = pipelinesQ.data ?? []
  const companies = companiesQ.data ?? []

  // Un "proyecto" = deal en una etapa ganada (is_won).
  const wonStageIds = useMemo(() => {
    const ids = new Set<string>()
    for (const p of pipelines) for (const s of p.stages) if (s.isWon) ids.add(s.id)
    return ids
  }, [pipelines])

  const companyName = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies])
  const stageLabel = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of pipelines) for (const s of p.stages) m.set(s.id, s.label)
    return m
  }, [pipelines])

  const projects = (dealsQ.data ?? []).filter((d) => wonStageIds.has(d.stageId))

  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="eyebrow">Producción</p>
        <h1 className="text-3xl font-semibold tracking-tight">Proyectos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Deals ganados que están en producción. Entrá a uno para ver tareas, entregables, formularios y change requests.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {dealsQ.isLoading || pipelinesQ.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
            </div>
          ) : projects.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyIllustration icon={FolderOpen} />
                <EmptyTitle>Sin Proyectos Todavía</EmptyTitle>
                <EmptyDescription>Un proyecto aparece aquí cuando un deal llega a una etapa ganada.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Proyecto</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Empresa</TableHead>
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Etapa</TableHead>
                  <TableHead className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((d) => (
                  <TableRow
                    key={d.id}
                    onClick={() => router.push(`/deals/${d.id}`)}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                  >
                    <TableCell className="px-4 py-3 font-medium">{d.name}</TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">{d.companyId ? companyName.get(d.companyId) ?? '—' : '—'}</TableCell>
                    <TableCell className="px-4 py-3">
                      <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">{stageLabel.get(d.stageId) ?? '—'}</span>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right font-mono">{formatCurrency(d.amount, d.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
