/**
 * Helpers de fecha PUROS compartidos por las páginas públicas de reserva
 * (`/book/[portalId]/[slug]`) y reprogramación (`/book/reschedule`) — antes
 * duplicados byte a byte en ambos archivos. Carpeta `_lib` → privada en App
 * Router (no genera ruta).
 *
 * NO se extrae `COMMON_TIMEZONES`: las dos páginas tienen listas distintas
 * (la de booking incluye Europe/Rome y Pacific/Auckland, la de reschedule no)
 * — no es el mismo dato, así que unificarla sería un cambio de comportamiento,
 * no una extracción pura.
 */

/** Formatea una fecha ISO UTC al timezone dado, mostrando fecha + hora. */
export function formatInTz(isoUtc: string, tz: string, opts?: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat('es', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
      ...opts,
    }).format(new Date(isoUtc))
  } catch {
    return isoUtc
  }
}

/** Formatea solo la hora en un timezone. */
export function formatTimeInTz(isoUtc: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('es', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(isoUtc))
  } catch {
    return isoUtc
  }
}

/** Devuelve YYYY-MM-DD de un objeto Date en el TZ dado. */
export function toLocalDate(date: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const y = parts.find((p) => p.type === 'year')?.value ?? ''
    const m = parts.find((p) => p.type === 'month')?.value ?? ''
    const d = parts.find((p) => p.type === 'day')?.value ?? ''
    return `${y}-${m}-${d}`
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

/** Día de semana (0=dom…6=sáb) del primer día del mes. */
export function firstDayOfWeek(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay()
}

export interface MonthDay {
  /** Para render (número de día, etc.) — NO usar sus getters para comparar fechas. */
  date: Date
  /**
   * YYYY-MM-DD construido directamente de los enteros año/mes/día del calendario
   * mensual, NO de `date.getFullYear()/getMonth()/getDate()`: esos getters leen
   * el TZ del NAVEGADOR, no el del invitee. Comparado contra un `todayStr`
   * calculado en el TZ del invitee (`toLocalDate`), esa mezcla podía marcar un
   * día como pasado o disponible incorrectamente cerca de la medianoche cuando
   * ambos TZ no coincidían.
   */
  ds: string
}

/** Genera los días del mes para el calendario, con su `ds` (string de fecha) ya resuelto. */
export function getMonthDays(year: number, month: number): MonthDay[] {
  const days: MonthDay[] = []
  // month es 1-indexed
  const daysInMonth = new Date(year, month, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    days.push({ date: new Date(year, month - 1, d), ds })
  }
  return days
}
