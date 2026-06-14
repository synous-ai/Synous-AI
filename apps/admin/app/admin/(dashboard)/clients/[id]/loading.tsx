import { Skeleton } from '@/components/ui/skeleton'

/** Skeleton con la forma del detalle (panel izquierdo + panel derecho). */
export default function ClientDetailLoading() {
  return (
    <div className="flex flex-col gap-6 p-6 lg:flex-row">
      <Skeleton className="h-96 w-full rounded-2xl lg:w-80 lg:flex-shrink-0" />
      <Skeleton className="h-96 min-w-0 flex-1 rounded-2xl" />
    </div>
  )
}
