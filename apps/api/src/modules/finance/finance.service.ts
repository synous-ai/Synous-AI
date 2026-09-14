/**
 * finance.service.ts — Barrel del módulo de Finanzas del CRM Synous.
 *
 * Cubre: Facturas (multimoneda), Cobros (Payments), Gastos (Expenses),
 * Retainers (MRR) y Resúmenes financieros con filtro de período.
 *
 * La lógica vive repartida en archivos cohesivos por responsabilidad; este
 * archivo solo re-exporta lo que antes exportaba directamente, para que
 * ningún importer (routers, tests, otros módulos) tenga que cambiar.
 *
 * - finance-shared.ts     → helpers y tipos internos (interno, no se re-exporta)
 * - invoices.ts           → facturas
 * - payments.ts           → cobros
 * - expenses.ts           → gastos
 * - retainers.ts          → retainers (MRR), incl. generateRetainerInvoice
 * - reporting.ts          → financeSummary, monthlySummary, topDebtors, getDolarRates
 * - invoice-pdf.service.ts → wrapper de generación de PDF de factura
 *
 * Regla multimoneda:
 *   - `currency` + `exchange_rate` se congela al momento del movimiento.
 *   - `amount_base` = moneda base del portal (USD, `numeric(14,2)`).
 *   - Conversión: ARS → USD = amount / exchangeRate; USD → USD = amount.
 *   - Los strings `numeric(14,2)` del DB se operan como Number en el service
 *     y se devuelven como string con toDecimal() para preservar precisión.
 *
 * Todos los errores de negocio se lanzan con AppError vía Errors.*.
 * Todas las operaciones multi-tabla se envuelven en db.transaction().
 */
export * from './invoices'
export * from './payments'
export * from './expenses'
export * from './retainers'
export * from './reporting'
export * from './invoice-pdf.service'
