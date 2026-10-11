import { cn, fullName, initials } from '@/lib/utils'

/** Avatar circular con iniciales de una persona del equipo. */
export function MemberAvatar({
  firstName,
  lastName,
  email,
  size = 'md',
}: {
  firstName: string | null
  lastName: string | null
  email?: string
  size?: 'md' | 'lg'
}): React.JSX.Element {
  return (
    <div
      title={fullName(firstName, lastName, email)}
      className={cn(
        'flex flex-shrink-0 items-center justify-center rounded-full bg-accent font-bold text-accent-foreground',
        size === 'lg' ? 'h-14 w-14 text-lg' : 'h-10 w-10 text-sm',
      )}
    >
      <span aria-hidden="true">{initials(firstName, lastName)}</span>
    </div>
  )
}
