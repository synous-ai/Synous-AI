import { cn, fullName, initials } from '@/lib/utils'

export interface PersonLike {
  id: string
  firstName: string | null
  lastName: string | null
  email?: string
}

/** Pila de avatares con iniciales (máx. `max`, el resto como "+N"). */
export function MemberAvatars({
  members,
  max = 4,
  size = 'md',
  emptyLabel,
  className,
}: {
  members: readonly PersonLike[]
  max?: number
  size?: 'sm' | 'md'
  /** Texto cuando no hay miembros (si se omite, un círculo "?" tenue). */
  emptyLabel?: string
  className?: string
}): React.JSX.Element {
  const dim = size === 'sm' ? 'h-5 w-5 text-[9px]' : 'h-6 w-6 text-[10px]'
  if (members.length === 0) {
    return emptyLabel ? (
      <span className={cn('text-xs text-muted-foreground', className)}>{emptyLabel}</span>
    ) : (
      <span
        title="Sin asignar"
        className={cn('flex items-center justify-center rounded-full bg-muted text-muted-foreground', dim, className)}
      >
        ?
      </span>
    )
  }
  const shown = members.slice(0, max)
  const rest = members.length - shown.length
  return (
    <ul className={cn('flex items-center -space-x-1.5', className)} aria-label="Responsables">
      {shown.map((m) => {
        const name = fullName(m.firstName, m.lastName, m.email)
        return (
          <li
            key={m.id}
            title={name}
            className={cn(
              'flex items-center justify-center rounded-full border-2 border-card bg-accent font-bold text-accent-foreground',
              dim,
            )}
          >
            <span aria-hidden="true">{initials(m.firstName, m.lastName)}</span>
            <span className="sr-only">{name}</span>
          </li>
        )
      })}
      {rest > 0 && (
        <li
          className={cn(
            'flex items-center justify-center rounded-full border-2 border-card bg-muted font-semibold text-muted-foreground',
            dim,
          )}
        >
          +{rest}
        </li>
      )}
    </ul>
  )
}
