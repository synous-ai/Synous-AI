import { cn } from '@portal/lib/utils'

/**
 * Skeleton — componente de carga pulsante para el portal de cliente.
 * Mismo patrón que el admin: div con animate-pulse y bg-primary/10.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-primary/10', className)}
      {...props}
    />
  )
}

export { Skeleton }
