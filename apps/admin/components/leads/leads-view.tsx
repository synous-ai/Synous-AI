'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Download, LayoutGrid, Table2, List, Users } from 'lucide-react'
import { useLeads, useCompanies, useUsers } from '@/lib/hooks'
import type { Contact, Company, TeamUser } from '@/lib/types'
import { cn, initials } from '@/lib/utils'
import { sourceLabel } from '@/lib/labels'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { KanbanSkeleton, TableSkeleton, ListSkeleton } from '@/components/ui/skeletons'
import { ContactDialog } from '@/components/contacts/contact-dialog'
import { LeadBoard } from './lead-board'
import { STAGE_LABELS, STAGE_DOT_CLASS } from '@/lib/status'
import { TableShell } from '@/components/ui/data-table'
import { DataPagination } from '@/components/ui/data-pagination'
import { usePagination } from '@/lib/use-pagination'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'

type ViewMode = 'board' | 'table' | 'list'
type SortMode = 'name' | 'recent'

function buildCompanyMap(companies: Company[]): Map<string, Company> {
  return new Map(companies.map((c) => [c.id, c]))
}

function buildUserMap(users: TeamUser[]): Map<string, TeamUser> {
  return new Map(users.map((u) => [u.id, u]))
}

function exportCSV(leads: Contact[], companyMap: Map<string, Company>): void {
  const headers = ['ID', 'Nombre', 'Email', 'Teléfono', 'Empresa', 'Cargo', 'Fuente', 'Etapa', 'Creado']
  const rows = leads.map((c) => [
    c.id,
    [c.firstName, c.lastName].filter(Boolean).join(' '),
    c.email ?? '',
    c.phone ?? '',
    c.companyId ? (companyMap.get(c.companyId)?.name ?? '') : '',
    c.jobTitle ?? '',
    sourceLabel((c.custom?.source as string | undefined) ?? null) ?? '',
    STAGE_LABELS[c.lifecycleStage] ?? c.lifecycleStage,
    new Date(c.createdAt).toLocaleDateString('es'),
  ])
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'leads.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Table View ────────────────────────────────────────────────────────────

function LeadsTable({
  leads,
  companyMap,
  onRowClick,
}: {
  leads: Contact[]
  companyMap: Map<string, Company>
  onRowClick: (id: string) => void
}) {
  const { page, setPage, pageCount, pageItems } = usePagination(leads)

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <TableShell
            columns={[
              { key: 'name', label: 'Nombre' },
              { key: 'email', label: 'Email' },
              { key: 'company', label: 'Empresa' },
              { key: 'jobTitle', label: 'Cargo' },
              { key: 'source', label: 'Fuente' },
              { key: 'stage', label: 'Etapa' },
            ]}
            rows={pageItems}
            emptyMessage="Sin Leads que Mostrar"
            renderRow={(c) => {
              const companyName = c.companyId ? (companyMap.get(c.companyId)?.name ?? '—') : '—'
              const source = sourceLabel((c.custom?.source as string | undefined) ?? null) ?? '—'
              return (
                <tr
                  key={c.id}
                  onClick={() => onRowClick(c.id)}
                  className="group cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/50"
                >
                  <td className="px-4 py-3 font-medium group-hover:underline group-hover:decoration-dotted group-hover:decoration-border group-hover:underline-offset-4">
                    {[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className="px-4 py-3">{c.email ?? '—'}</td>
                  <td className="px-4 py-3">{companyName}</td>
                  <td className="px-4 py-3">{c.jobTitle ?? '—'}</td>
                  <td className="px-4 py-3">{source}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn('h-1.5 w-1.5 rounded-full', STAGE_DOT_CLASS[c.lifecycleStage] ?? 'bg-muted')}
                      />
                      <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                        {STAGE_LABELS[c.lifecycleStage] ?? c.lifecycleStage}
                      </span>
                    </span>
                  </td>
                </tr>
              )
            }}
          />
        </CardContent>
      </Card>
      <DataPagination page={page} pageCount={pageCount} onPageChange={setPage} />
    </>
  )
}

// ─── List View ─────────────────────────────────────────────────────────────

function LeadsList({
  leads,
  onRowClick,
}: {
  leads: Contact[]
  onRowClick: (id: string) => void
}) {
  const { page, setPage, pageCount, pageItems } = usePagination(leads)

  return (
    <>
      <Card>
        <CardContent className="p-0">
          {leads.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyIllustration icon={Users} />
                <EmptyTitle>Sin Leads que Mostrar</EmptyTitle>
                <EmptyDescription>Ajustá los filtros o agregá el primer lead.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="divide-y divide-border">
              {pageItems.map((c) => {
                const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || `#${c.id}`
                return (
                  <li
                    key={c.id}
                    onClick={() => onRowClick(c.id)}
                    className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-signal text-xs font-bold text-signal-foreground">
                      {initials(c.firstName, c.lastName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{fullName}</p>
                      {c.email && <p className="truncate text-xs text-muted-foreground">{c.email}</p>}
                    </div>
                    <span
                      className={cn(
                        'flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                        'bg-accent text-accent-foreground',
                      )}
                    >
                      {STAGE_LABELS[c.lifecycleStage] ?? c.lifecycleStage}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <DataPagination page={page} pageCount={pageCount} onPageChange={setPage} />
    </>
  )
}

// ─── Main View ─────────────────────────────────────────────────────────────

export function LeadsView() {
  const router = useRouter()
  const { data: rawLeads = [], isLoading: leadsLoading } = useLeads()
  const { data: companies = [] } = useCompanies()
  const { data: users = [] } = useUsers()

  const [view, setView] = useState<ViewMode>('board')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortMode>('recent')
  const [newOpen, setNewOpen] = useState(false)

  const companyMap = useMemo(() => buildCompanyMap(companies), [companies])
  const userMap = useMemo(() => buildUserMap(users), [users])

  const filteredLeads = useMemo(() => {
    const q = search.toLowerCase().trim()
    let list = rawLeads.filter((c) =>
      STAGE_LABELS[c.lifecycleStage] !== undefined || ['lead', 'mql', 'sql', 'opportunity'].includes(c.lifecycleStage),
    )
    if (q) {
      list = list.filter((c) => {
        const name = [c.firstName, c.lastName].filter(Boolean).join(' ').toLowerCase()
        const email = (c.email ?? '').toLowerCase()
        const company = c.companyId ? (companyMap.get(c.companyId)?.name ?? '').toLowerCase() : ''
        return name.includes(q) || email.includes(q) || company.includes(q)
      })
    }
    if (sort === 'name') {
      list = [...list].sort((a, b) => {
        const na = [a.firstName, a.lastName].filter(Boolean).join(' ').toLowerCase()
        const nb = [b.firstName, b.lastName].filter(Boolean).join(' ').toLowerCase()
        return na.localeCompare(nb)
      })
    } else {
      list = [...list].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    }
    return list
  }, [rawLeads, search, sort, companyMap])

  function handleLeadClick(id: string) {
    // [NAV DEBUG] medir click → mostrar el detalle. Quitar cuando entendamos el timing.
    ;(window as Window & { __navT0?: number }).__navT0 = performance.now()
    // eslint-disable-next-line no-console
    console.warn(`[NAV DEBUG] 🖱️ CLICK → router.push(/admin/leads/${id})`)
    router.push(`/admin/leads/${id}`)
  }

  const VIEW_BUTTONS: { mode: ViewMode; icon: typeof LayoutGrid; label: string }[] = [
    { mode: 'board', icon: LayoutGrid, label: 'Board' },
    { mode: 'table', icon: Table2, label: 'Tabla' },
    { mode: 'list', icon: List, label: 'Lista' },
  ]

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <p className="eyebrow">Prospectos</p>
            <h1 className="text-3xl font-semibold tracking-tight">Lead Listing</h1>
          </div>
          <span className="ml-2 rounded-full bg-signal/15 px-3 py-1 text-sm font-semibold text-signal">
            {leadsLoading ? '…' : filteredLeads.length}
          </span>
        </div>
        <Button onClick={() => setNewOpen(true)}>Nuevo Lead</Button>
      </div>

      {/* Toolbar */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {/* View toggle */}
        <div className="flex rounded-lg border border-border bg-card p-1 shadow-card">
          {VIEW_BUTTONS.map(({ mode, icon: Icon, label }) => (
            <Button
              key={mode}
              variant="ghost"
              size="sm"
              onClick={() => setView(mode)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium h-auto transition-colors',
                view === mode
                  ? 'bg-accent text-accent-foreground shadow-sm hover:bg-accent'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar leads…"
            className="h-9 w-full rounded-lg border border-border bg-muted/50 pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {/* Sort */}
        <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Más reciente</SelectItem>
            <SelectItem value="name">Nombre</SelectItem>
          </SelectContent>
        </Select>

        {/* Export */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportCSV(filteredLeads, companyMap)}
          className="gap-1.5"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar
        </Button>
      </div>

      {/* Content */}
      {leadsLoading ? (
        // El skeleton varía según el view mode activo → CLS ≈ 0 en todos los modos
        view === 'board' ? (
          <KanbanSkeleton columns={4} cardsPerColumn={3} label="Cargando leads…" />
        ) : view === 'table' ? (
          <TableSkeleton columns={6} rows={8} label="Cargando leads…" />
        ) : (
          <ListSkeleton rows={8} label="Cargando leads…" />
        )
      ) : view === 'board' ? (
        <LeadBoard
          leads={filteredLeads}
          companyMap={companyMap}
          userMap={userMap}
          onLeadClick={handleLeadClick}
        />
      ) : view === 'table' ? (
        <LeadsTable leads={filteredLeads} companyMap={companyMap} onRowClick={handleLeadClick} />
      ) : (
        <LeadsList leads={filteredLeads} onRowClick={handleLeadClick} />
      )}

      <ContactDialog open={newOpen} onClose={() => setNewOpen(false)} defaultLifecycle="lead" />
    </div>
  )
}
