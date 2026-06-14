'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { useCompanies, useArchiveCompany } from '@/lib/hooks'
import type { Company } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TableSkeleton } from '@/components/ui/skeletons'
import { CompanyDialog } from '@/components/companies/company-dialog'
import { DataPagination } from '@/components/ui/data-pagination'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import { Building2 } from 'lucide-react'

export default function CompaniesPage() {
  const { data, isLoading } = useCompanies()
  const archive = useArchiveCompany()
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Company | undefined>(undefined)

  const rows = useMemo(() => data ?? [], [data])

  function openNew() {
    setEditing(undefined)
    setDialogOpen(true)
  }
  function openEdit(c: Company) {
    setEditing(c)
    setDialogOpen(true)
  }
  async function onArchive(c: Company) {
    if (window.confirm(`¿Archivar la empresa "${c.name}"?`)) {
      await archive.mutateAsync(c.id)
    }
  }

  const columns = useMemo<ColumnDef<Company>[]>(
    () => [
      { header: 'Nombre', accessorKey: 'name' },
      { header: 'Dominio', id: 'domain', accessorFn: (c) => c.domain ?? '—' },
      { header: 'Industria', id: 'industry', accessorFn: (c) => c.industry ?? '—' },
      { header: 'Teléfono', id: 'phone', accessorFn: (c) => c.phone ?? '—' },
      {
        header: '',
        id: 'actions',
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                openEdit(row.original)
              }}
            >
              Editar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                void onArchive(row.original)
              }}
            >
              Archivar
            </Button>
          </div>
        ),
      },
    ],
    [],
  )

  const PAGE_SIZE = 15
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PAGE_SIZE, pageIndex: 0 } },
  })

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="eyebrow">Cuentas</p>
          <h1 className="font-display text-3xl font-bold tracking-tight">Empresas</h1>
        </div>
        <Button onClick={openNew}>Nueva Empresa</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            // TableSkeleton con thead + col acciones: Nombre / Dominio / Industria / Teléfono / Acciones (5 col, CLS ≈ 0)
            <TableSkeleton columns={5} rows={6} label="Cargando empresas…" />
          ) : rows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyIllustration icon={Building2} />
                <EmptyTitle>Sin empresas todavía</EmptyTitle>
                <EmptyDescription>Registrá la primera empresa para asociarla con tus deals y contactos.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={() => setDialogOpen(true)}>Nueva Empresa</Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id} className="bg-muted/40 hover:bg-muted/40">
                    {hg.headers.map((h) => (
                      <TableHead key={h.id} className="px-4 py-3 text-xs font-medium text-muted-foreground">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/admin/companies/${row.original.id}`)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="px-4 py-3">
                        {cell.column.columnDef.cell
                          ? flexRender(cell.column.columnDef.cell, cell.getContext())
                          : (cell.getValue() as React.ReactNode)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <DataPagination
        page={table.getState().pagination.pageIndex + 1}
        pageCount={table.getPageCount()}
        onPageChange={(p) => table.setPageIndex(p - 1)}
      />

      <CompanyDialog open={dialogOpen} onClose={() => setDialogOpen(false)} company={editing} />
    </div>
  )
}
