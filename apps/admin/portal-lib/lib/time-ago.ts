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
