'use client'

import { useState } from 'react'
import { ArrowDownCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useInvoices, useCompanies } from '@/lib/hooks'
import { EmptyState } from './shared'
import { InvoiceRow } from './InvoiceRow'
import { RegisterPaymentDialog } from './dialogs'
import { DataPagination } from '@/components/ui/data-pagination'
import { usePagination } from '@/lib/use-pagination'

export function CobrarSection() {
  const router = useRouter()
  const { data: sent } = useInvoices('sent')
  const { data: overdue } = useInvoices('overdue')
  const [payInvoiceId, setPayInvoiceId] = useState<string | undefined>()
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const { data: allInvoices } = useInvoices()
  const { data: companies } = useCompanies()

  const all = [...(sent ?? []), ...(overdue ?? [])]
  const { page, setPage, pageCount, pageItems } = usePagination(all)

  function handleRegisterPayment(id: string) {
    setPayInvoiceId(id)
    setPayDialogOpen(true)
  }

  return (
    <div>
      <div className="mb-6">
        <p className="eyebrow">Finanzas</p>
        <h1 className="text-3xl font-semibold tracking-tight">Cuentas por cobrar</h1>
        <p className="mt-1 text-sm text-muted-foreground">Facturas enviadas o vencidas con saldo pendiente.</p>
      </div>

      {all.length === 0 ? (
        <EmptyState icon={ArrowDownCircle} message="Sin Cuentas por Cobrar" hint="Todas las facturas están al día." />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {pageItems.map((inv) => (
              <InvoiceRow
                key={inv.id}
                invoice={inv}
                companies={companies}
                onRegisterPayment={handleRegisterPayment}
                onOpen={(id) => router.push(`/admin/invoices/${id}`)}
              />
            ))}
          </div>
          <DataPagination page={page} pageCount={pageCount} onPageChange={setPage} />
        </>
      )}

      <RegisterPaymentDialog
        open={payDialogOpen}
        onClose={() => setPayDialogOpen(false)}
        preselectedInvoiceId={payInvoiceId}
        invoices={allInvoices ?? []}
      />
    </div>
  )
}
