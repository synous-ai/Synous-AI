'use client'

import { useState } from 'react'
import { GitPullRequest } from 'lucide-react'
import { CHANGE_REQUEST_BUCKET_LABEL, clientBucketFor, type ChangeRequestBucket } from '@synous/shared'
import { useClientChangeRequests, useCRSummary } from '@portal/lib/hooks'
import type { ChangeRequest } from '@portal/lib/types'
import { Button } from '@portal/components/ui/button'
import { CardListSkeleton } from '@portal/components/ui/skeletons'
import { EmptyIllustration } from '@portal/components/ui/empty-illustration'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@portal/components/ui/tabs'
import { RequestCard } from '@portal/components/portal/requests/request-card'
import { useCanWriteChangeRequests } from '@portal/components/portal/requests/cr-status'

type TabValue = 'all' | ChangeRequestBucket

const TAB_ORDER: TabValue[] = ['all', 'needs_action', 'in_review', 'resolved']

function tabLabel(tab: TabValue): string {
  return tab === 'all' ? 'Todas' : CHANGE_REQUEST_BUCKET_LABEL[tab]
}

/** Listado con tabs (Todas / Requieren acción / En revisión / Resueltas), contadores reales y estados de carga/error/vacío. */
export function RequestList({ onCreate }: { onCreate: () => void }) {
  const [tab, setTab] = useState<TabValue>('all')
  const listQuery = useClientChangeRequests()
  const summaryQuery = useCRSummary()
  const canWrite = useCanWriteChangeRequests()

  if (listQuery.isLoading) {
    return <CardListSkeleton count={3} label="Cargando solicitudes…" />
  }

  if (listQuery.isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-destructive">No pudimos cargar tus solicitudes.</p>
        <Button variant="outline" size="sm" onClick={() => void listQuery.refetch()}>
          Reintentar
        </Button>
      </div>
    )
  }

  const all = listQuery.data ?? []

  if (all.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <EmptyIllustration icon={GitPullRequest} />
        <div>
          <p className="font-medium text-muted-foreground">No hay solicitudes todavía.</p>
          <p className="mt-0.5 text-sm text-muted-foreground/70">
            Cuando necesites solicitar un cambio sobre el alcance del proyecto, podés hacerlo desde acá.
          </p>
        </div>
        {canWrite && (
          <Button variant="signal" size="sm" onClick={onCreate}>
            + Nueva solicitud
          </Button>
        )}
      </div>
    )
  }

  const byBucket: Record<TabValue, ChangeRequest[]> = {
    all,
    needs_action: all.filter((cr) => clientBucketFor(cr.status) === 'needs_action'),
    in_review: all.filter((cr) => clientBucketFor(cr.status) === 'in_review'),
    resolved: all.filter((cr) => clientBucketFor(cr.status) === 'resolved'),
  }
  const counts = summaryQuery.data

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
      <TabsList>
        {TAB_ORDER.map((t) => (
          <TabsTrigger key={t} value={t}>
            {tabLabel(t)}
            <span className="ml-1.5 tabular-nums text-muted-foreground/70">{counts ? counts[t] : byBucket[t].length}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      {TAB_ORDER.map((t) => (
        <TabsContent key={t} value={t} className="space-y-3">
          {byBucket[t].length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay solicitudes en “{tabLabel(t).toLowerCase()}”.
            </p>
          ) : (
            byBucket[t].map((cr) => <RequestCard key={cr.id} cr={cr} />)
          )}
        </TabsContent>
      ))}
    </Tabs>
  )
}
