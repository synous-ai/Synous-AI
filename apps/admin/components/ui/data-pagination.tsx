'use client'

import { cn } from '@/lib/utils'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'

interface DataPaginationProps {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  className?: string
}

/**
 * Reusable pagination bar built on shadcn Pagination primitives.
 * Renders nothing when pageCount <= 1.
 * Shows up to 5 page numbers with ellipsis on either side.
 */
export function DataPagination({
  page,
  pageCount,
  onPageChange,
  className,
}: DataPaginationProps) {
  if (pageCount <= 1) return null

  /** Build the visible page numbers with ellipsis markers. */
  function buildPages(): (number | 'ellipsis')[] {
    const delta = 1 // pages on each side of current
    const range: (number | 'ellipsis')[] = []
    const left = Math.max(2, page - delta)
    const right = Math.min(pageCount - 1, page + delta)

    range.push(1)

    if (left > 2) range.push('ellipsis')
    for (let i = left; i <= right; i++) range.push(i)
    if (right < pageCount - 1) range.push('ellipsis')

    if (pageCount > 1) range.push(pageCount)

    return range
  }

  const pages = buildPages()

  return (
    <Pagination className={cn('mt-4', className)}>
      <PaginationContent>
        {/* Previous */}
        <PaginationItem>
          <PaginationPrevious
            href="#"
            onClick={(e) => {
              e.preventDefault()
              if (page > 1) onPageChange(page - 1)
            }}
            aria-disabled={page === 1}
            className={cn(page === 1 && 'pointer-events-none opacity-50')}
          />
        </PaginationItem>

        {/* Page numbers */}
        {pages.map((p, idx) =>
          p === 'ellipsis' ? (
            <PaginationItem key={`ellipsis-${idx}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={p}>
              <PaginationLink
                href="#"
                isActive={p === page}
                onClick={(e) => {
                  e.preventDefault()
                  onPageChange(p)
                }}
              >
                {p}
              </PaginationLink>
            </PaginationItem>
          ),
        )}

        {/* Next */}
        <PaginationItem>
          <PaginationNext
            href="#"
            onClick={(e) => {
              e.preventDefault()
              if (page < pageCount) onPageChange(page + 1)
            }}
            aria-disabled={page === pageCount}
            className={cn(page === pageCount && 'pointer-events-none opacity-50')}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
