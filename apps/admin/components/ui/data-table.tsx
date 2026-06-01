import { cn } from '@/lib/utils'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
} from '@/components/ui/table'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import { SearchX } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// TableShell
//
// Encapsulates the repeated pattern:
//   <Table>
//     <TableHeader>
//       <TableRow>
//         <TableHead>…
//     <TableBody>
//       {rows.map(renderRow)}
//
// Props:
//   columns   — array of { key, label, align? } that drive <TableHead> rendering
//   rows      — array of arbitrary items
//   renderRow — (item, index) => React.ReactNode — renders each <tr>
//   className — extra classes on the outer wrapper (optional)
//   emptyMessage — text shown when rows is empty (optional)
//
// Usage:
//   <TableShell
//     columns={[{ key: 'name', label: 'Nombre' }, ...]}
//     rows={items}
//     renderRow={(item) => (
//       <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
//         <td className="px-4 py-3">{item.name}</td>
//         ...
//       </tr>
//     )}
//   />
// ─────────────────────────────────────────────────────────────────────────────

export interface TableColumn {
  key: string
  label: string
  align?: 'left' | 'center' | 'right'
}

export interface TableShellProps<T> {
  columns: TableColumn[]
  rows: T[]
  renderRow: (item: T, index: number) => React.ReactNode
  className?: string
  emptyMessage?: string
}

export function TableShell<T>({
  columns,
  rows,
  renderRow,
  className,
  emptyMessage = 'Sin resultados.',
}: TableShellProps<T>) {
  if (rows.length === 0) {
    return (
      <Empty className="border-0 py-10">
        <EmptyHeader>
          <EmptyIllustration icon={SearchX} />
          <EmptyTitle>{emptyMessage}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <Table className={cn(className)}>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          {columns.map((col) => (
            <TableHead
              key={col.key}
              className={cn(
                'px-4 py-3 text-xs font-medium text-muted-foreground',
                col.align === 'center' && 'text-center',
                col.align === 'right' && 'text-right',
              )}
            >
              {col.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => renderRow(row, i))}
      </TableBody>
    </Table>
  )
}
