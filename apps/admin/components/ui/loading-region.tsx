import { cn } from "@/lib/utils"

/**
 * LoadingRegion — contenedor accesible para estados de carga con skeleton.
 *
 * El skeleton es decorativo (`aria-hidden` en cada barra). El estado de carga
 * se comunica UNA sola vez acá, en el contenedor:
 *  - `aria-busy` mientras carga.
 *  - una live region `role="status"` + `aria-live="polite"` (visualmente oculta)
 *    que anuncia el `label` una única vez al lector de pantalla.
 *
 * Patrón recomendado por la guía de skeletons (punto 7, accesibilidad): anunciar
 * "carga" una vez, ocultar las barras, no hacerlas focusables.
 *
 * Uso:
 *   <LoadingRegion loading={isPending} label="Cargando contactos…">
 *     {isPending ? <TableSkeleton /> : <ContactsTable data={data} />}
 *   </LoadingRegion>
 */
interface LoadingRegionProps extends React.HTMLAttributes<HTMLDivElement> {
  loading: boolean
  /** Texto anunciado al lector de pantalla mientras carga. */
  label?: string
}

export function LoadingRegion({
  loading,
  label = "Cargando…",
  className,
  children,
  ...props
}: LoadingRegionProps) {
  return (
    <div aria-busy={loading || undefined} className={className} {...props}>
      {loading ? (
        <span role="status" aria-live="polite" className="sr-only">
          {label}
        </span>
      ) : null}
      {children}
    </div>
  )
}

/**
 * SkeletonGroup — variante mínima cuando el skeleton ES todo el contenido del
 * estado de carga (sin convivir con contenido real). Mismo contrato de a11y.
 */
export function SkeletonGroup({
  label = "Cargando…",
  className,
  children,
  ...props
}: Omit<LoadingRegionProps, "loading">) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn(className)}
      {...props}
    >
      {children}
      <span className="sr-only">{label}</span>
    </div>
  )
}
