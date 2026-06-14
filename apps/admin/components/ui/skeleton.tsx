import { cn } from "@/lib/utils"

/**
 * Skeleton — placeholder pulsante para estados de carga.
 *
 * Es PURAMENTE decorativo: por defecto se oculta a la tecnología asistiva
 * (`aria-hidden`) para que el lector de pantalla no lea las barras. El estado
 * de carga se anuncia UNA vez en el contenedor (ver <LoadingRegion>), no aquí.
 * La animación `animate-pulse` se neutraliza bajo `prefers-reduced-motion`
 * desde globals.css.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-primary/10", className)}
      {...props}
    />
  )
}

export { Skeleton }
