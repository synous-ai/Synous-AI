import { DetailViewSkeleton } from '@/components/ui/skeletons'

/**
 * Skeleton de navegación para el detalle de un lead.
 * Server Component puro: no tiene lógica de cliente ni efectos de debug.
 * Muestra DetailViewSkeleton (2 paneles fieles) mientras carga el segmento.
 */
export default function LeadDetailLoading() {
  return (
    <div className="p-6">
      <DetailViewSkeleton
        label="Cargando lead…"
        fields={6}
        tabs={7}
        actions={3}
      />
    </div>
  )
}
