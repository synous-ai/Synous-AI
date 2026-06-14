'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Contact } from '@/lib/types'
import { lifecycleStage as lifecycleStageStatus } from '@/lib/status'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ContactDialog } from '@/components/contacts/contact-dialog'
import { TableShell } from '@/components/ui/data-table'
import { Skeleton } from '@/components/ui/skeleton'
import { DataPagination } from '@/components/ui/data-pagination'
import { usePagination } from '@/lib/use-pagination'

export function PeopleSection({
  scope,
  eyebrow,
  title,
  newLabel,
  defaultLifecycle,
  items,
  isLoading,
  toolbar,
}: {
  scope: 'leads' | 'clients' | 'contacts'
  eyebrow: string
  title: string
  newLabel: string
  defaultLifecycle: 'lead' | 'customer'
  items: Contact[]
  isLoading: boolean
  toolbar?: React.ReactNode
}) {
  const router = useRouter()
  const [newOpen, setNewOpen] = useState(false)
  const { page, setPage, pageCount, pageItems } = usePagination(items)

  function openDetail(id: string) {
    router.push(`/admin/${scope}/${id}`)
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        </div>
        <Button onClick={() => setNewOpen(true)}>{newLabel}</Button>
      </div>

      {toolbar}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
            </div>
          ) : (
            <TableShell
              columns={[
                { key: 'name', label: 'Nombre' },
                { key: 'email', label: 'Email' },
                { key: 'jobTitle', label: 'Cargo' },
                { key: 'stage', label: 'Etapa' },
              ]}
              rows={pageItems}
              emptyMessage="Nada por acá todavía."
              renderRow={(c) => (
                <tr
                  key={c.id}
                  onClick={() => openDetail(c.id)}
                  className="group cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/50"
                >
                  <td className="px-4 py-3 font-medium group-hover:underline group-hover:decoration-dotted group-hover:decoration-border group-hover:underline-offset-4">
                    {[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className="px-4 py-3">{c.email ?? '—'}</td>
                  <td className="px-4 py-3">{c.jobTitle ?? '—'}</td>
                  <td className="px-4 py-3">
                    {(() => {
                      const { kind, label } = lifecycleStageStatus(c.lifecycleStage)
                      return <StatusBadge kind={kind}>{label}</StatusBadge>
                    })()}
                  </td>
                </tr>
              )}
            />
          )}
        </CardContent>
      </Card>
      <DataPagination page={page} pageCount={pageCount} onPageChange={setPage} />

      <ContactDialog open={newOpen} onClose={() => setNewOpen(false)} defaultLifecycle={defaultLifecycle} />
    </div>
  )
}
