// All utilities have been moved to @devduo/shared.
// Re-exporting here so that existing @/lib/utils imports continue to work unchanged.
//
// NOTE: initials() signature changed from initials(name) to initials(first, last).
// The function was not called anywhere in client-portal beyond its definition,
// so there are no call sites to update.
export { cn, formatCurrency, initials, formatDate, fullName } from '@devduo/shared'
