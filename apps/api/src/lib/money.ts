/**
 * Shared money/decimal helpers used across service modules.
 */

/**
 * Formats a number as a string with 2 decimal places.
 * Returns `undefined` if `n` is `undefined`.
 */
export function toDecimal(n?: number): string | undefined {
  return n === undefined ? undefined : n.toFixed(2)
}
