import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// ---------------------------------------------------------------------------
// Styling
// ---------------------------------------------------------------------------

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatCurrency(amount: string | number | null, currency = 'USD'): string {
  if (amount === null || amount === '') return '—'
  const n = typeof amount === 'string' ? Number(amount) : amount
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('es', { style: 'currency', currency }).format(n)
}

/**
 * Returns initials from a first and last name.
 * Unified signature (admin style): initials(first?, last?)
 */
export function initials(first?: string | null, last?: string | null): string {
  const a = (first ?? '').trim()[0] ?? ''
  const b = (last ?? '').trim()[0] ?? ''
  return (a + b).toUpperCase() || '?'
}

export function formatDate(iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es', opts ?? { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fullName(first?: string | null, last?: string | null, fallback?: string | null): string {
  const name = [first, last].filter(Boolean).join(' ')
  return name || fallback || '—'
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const API_URL: string = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
