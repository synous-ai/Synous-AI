import { DetailViewSkeleton } from '@/components/ui/skeletons'

/** Skeleton de navegación para el detalle de un cliente (2 paneles fieles). */
export default function ClientDetailLoading() {
  return (
    <div className="p-6">
      <DetailViewSkeleton
        label="Cargando cliente…"
        fields={6}
        tabs={7}
        actions={3}
      />
    </div>
  )
}
