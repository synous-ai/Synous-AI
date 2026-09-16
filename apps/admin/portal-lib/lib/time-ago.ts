/**
 * timeAgo — "ahora", "hace 5 min", "hace 2 h", "hace 3 d", y luego fecha corta.
 *
 * Extraído de `notification-bell.tsx` para reusarlo también en la sección
 * "Actividad reciente" del Home del portal (`home-panel.tsx`) — antes solo
 * vivía adentro de la campana y una segunda sección que necesitara el mismo
 * formato relativo hubiera tenido que copiarlo.
 */
export function timeAgo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 7) return `hace ${d} d`
  return new Date(iso).toLocaleDateString('es')
}

/**
 * Sello de tiempo de la línea de actividad: "Hoy · 18:32", "Ayer · 14:21",
 * "12 sep · 10:04".
 *
 * A diferencia de `timeAgo`, acá la hora SIEMPRE está presente. En un feed de
 * eventos el orden dentro del día importa ("la factura se emitió antes o
 * después de que aprobara el entregable"), y "hace 5 h" no deja reconstruirlo.
 * El día se nombra en relativo solo para hoy y ayer, que es hasta donde ese
 * atajo se lee sin ambigüedad.
 */
export function dayAndTime(iso: string): string {
  const date = new Date(iso)
  const time = date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false })

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000)

  if (days === 0) return `Hoy · ${time}`
  if (days === 1) return `Ayer · ${time}`

  const day = date.toLocaleDateString('es', { day: 'numeric', month: 'short' })
  return `${day} · ${time}`
}
