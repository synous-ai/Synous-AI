import { cn } from '@portal/lib/utils'

/**
 * Skeleton — componente de carga pulsante para el portal de cliente.
 * Mismo patrón que el admin: div con animate-pulse y bg-primary/10.
 *
 * Decorativo: por defecto `aria-hidden` (el lector no lee las barras; el estado
 * de carga lo anuncia el contenedor vía <LoadingRegion>). `animate-pulse` se
 * neutraliza bajo `prefers-reduced-motion` desde globals.css (global a la app).
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-primary/10', className)}
      {...props}
    />
  )
}

export { Skeleton }
