import { ReschedulePageSkeleton } from '../_components/booking-skeletons'

/**
 * Fallback de Suspense del segmento (RSC/streaming) antes de que monte el client
 * component de reprogramación. Mismo skeleton que el estado `!meta`.
 */
export default function Loading() {
  return <ReschedulePageSkeleton />
}
