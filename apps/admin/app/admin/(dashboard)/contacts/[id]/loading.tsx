import { DetailViewSkeleton } from '@/components/ui/skeletons'

/** Skeleton de navegación para el detalle de un contacto (2 paneles fieles). */
export default function ContactDetailLoading() {
  return (
    <div className="p-6">
      <DetailViewSkeleton
        label="Cargando contacto…"
        fields={6}
        tabs={7}
        actions={3}
      />
    </div>
  )
}
