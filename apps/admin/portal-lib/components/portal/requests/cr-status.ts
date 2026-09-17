import { CHANGE_REQUEST_STATUS_META, type ChangeRequestStatus, type ChangeRequestTone } from '@synous/shared'
import { usePortalViewer } from '@portal/lib/hooks'
import type { ChangeRequest } from '@portal/lib/types'
import type { BadgeProps } from '@portal/components/ui/badge'

/**
 * Tono semántico del catálogo compartido (`@synous/shared`) → variante visual
 * del `Badge` del portal. Mapeo ÚNICO acá: ningún card ni vista de detalle
 * vuelve a decidir qué variante corresponde a qué estado — agregar un estado
 * nuevo al catálogo (o cambiarle el tono) no obliga a tocar componentes.
 */
const TONE_TO_BADGE_VARIANT: Record<ChangeRequestTone, NonNullable<BadgeProps['variant']>> = {
  neutral: 'muted',
  info: 'default',
  warning: 'signal',
  success: 'accent',
  danger: 'destructive',
}

export function crBadgeVariant(status: ChangeRequestStatus): NonNullable<BadgeProps['variant']> {
  return TONE_TO_BADGE_VARIANT[CHANGE_REQUEST_STATUS_META[status].tone]
}

export function crClientLabel(status: ChangeRequestStatus): string {
  return CHANGE_REQUEST_STATUS_META[status].clientLabel
}

/**
 * "Solicitado por" con fallback honesto: el backend puede no resolver un
 * nombre (datos viejos, cuenta sin nombre cargado) y ahora manda
 * `requestedByName: null` en vez de un string vacío. En ese caso mostramos
 * quién lo pidió por ROL — "Vos" si fue este mismo cliente, "Equipo" si fue
 * alguien de la agencia — en vez de dejar la fila en blanco.
 */
export function requestedByDisplayName(cr: Pick<ChangeRequest, 'requestedByName' | 'requestedByRole'>): string {
  if (cr.requestedByName) return cr.requestedByName
  return cr.requestedByRole === 'client' ? 'Vos' : 'Equipo'
}

/**
 * ¿Puede el viewer actual escribir (crear/decidir/comentar) en Solicitudes?
 *
 * Un admin del equipo mirando el portal de un cliente (`X-Portal-View`) está
 * en solo lectura — la API rechaza cualquier escritura con 403. Antes de que
 * la query de `usePortalViewer` resuelva, se asume que SÍ se puede escribir
 * (es el caso normal: un cliente real): recién se oculta/deshabilita cuando
 * hay confirmación positiva de que el caller es un viewer, nunca por el
 * default `isPortalView === false` de una query todavía en vuelo.
 */
export function useCanWriteChangeRequests(): boolean {
  const { isPortalView, isSuccess } = usePortalViewer()
  return !(isSuccess && isPortalView)
}
