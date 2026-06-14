'use client'

import { useState } from 'react'
import { Plus, FileText } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useInvoices, useCompanies } from '@/lib/hooks'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from './shared'
import { InvoiceRow } from './InvoiceRow'
import { CreateInvoiceDialog, RegisterPaymentDialog } from './dialogs'
import { DataPagination } from '@/components/ui/data-pagination'
import { usePagination } from '@/lib/use-pagination'
import { cn } from '@/lib/utils'

// ─── Tabs de facturas ─────────────────────────────────────────────────────────
// Mapean al parámetro ?tab= del backend. "Cuentas por cobrar" ya no es sección
// propia — es el tab "por_cobrar" aquí.

const TABS: { key: string | undefined; label: string }[] = [
  { key: undefined,      label: 'Todas' },
  { key: 'por_cobrar',   label: 'Por cobrar' },
  { key: 'vencidas',     label: 'Vencidas' },
  { key: 'pagadas',      label: 'Pagadas' },
  { key: 'borradores',   label: 'Borradores' },
]

export function FacturasSection() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<string | undefined>(undefined)
  const { data: invoices, isLoading } = useInvoices(activeTab)
  const { data: companies } = useCompanies()
  const [createOpen, setCreateOpen] = useState(false)
  const [payInvoiceId, setPayInvoiceId] = useState<string | undefined>()
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const { page, setPage, pageCount, pageItems } = usePagination(invoices ?? [])

  function handleRegisterPayment(id: string) {
    setPayInvoiceId(id)
    setPayDialogOpen(true)
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="eyebrow">Finanzas</p>
          <h1 className="text-3xl font-semibold tracking-tight">Facturas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Facturas emitidas del portal.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" /> Nueva Factura
        </Button>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 border-b">
        {TABS.map((tab) => (
          <button
            key={String(tab.key)}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === tab.key
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : !invoices || invoices.length === 0 ? (
        <EmptyState icon={FileText} message="No hay facturas en este filtro" hint='Cambiá de tab o creá una nueva factura.' />
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

      <CreateInvoiceDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <RegisterPaymentDialog
        open={payDialogOpen}
        onClose={() => setPayDialogOpen(false)}
        preselectedInvoiceId={payInvoiceId}
        invoices={invoices ?? []}
      />
    </div>
  )
}
