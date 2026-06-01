'use client'

import { useState, useEffect, useMemo } from 'react'

export interface UsePaginationResult<T> {
  page: number
  setPage: (page: number) => void
  pageCount: number
  pageItems: T[]
}

/**
 * Client-side pagination hook.
 * Resets to page 1 whenever the total item count changes (e.g. after a search filter).
 *
 * @param items  Full array of items (already filtered / sorted).
 * @param perPage  Items per page (default 15).
 */
export function usePagination<T>(items: T[], perPage = 15): UsePaginationResult<T> {
  const [page, setPage] = useState(1)

  // Reset to page 1 whenever the list length changes (filter / search applied).
  useEffect(() => {
    setPage(1)
  }, [items.length])

  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(items.length / perPage)),
    [items.length, perPage],
  )

  const pageItems = useMemo(
    () => items.slice((page - 1) * perPage, page * perPage),
    [items, page, perPage],
  )

  // Guard: if the current page is out of range after list shrinks, reset.
  const safePage = Math.min(page, pageCount)
  const safeSetPage = (p: number) => setPage(Math.max(1, Math.min(p, pageCount)))

  return {
    page: safePage,
    setPage: safeSetPage,
    pageCount,
    pageItems,
  }
}
