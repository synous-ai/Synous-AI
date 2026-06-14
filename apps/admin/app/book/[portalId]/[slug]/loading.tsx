import { BookingPageSkeleton } from '../../_components/booking-skeletons'

/**
 * Fallback de Suspense del segmento (RSC/streaming) antes de que monte el client
 * component de la reserva. Mismo skeleton que el estado `!meta` → sin doble flash.
 */
export default function Loading() {
  return <BookingPageSkeleton />
}
