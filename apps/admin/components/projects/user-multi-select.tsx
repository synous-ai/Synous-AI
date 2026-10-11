'use client'

import { ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn, fullName, initials } from '@/lib/utils'
import type { TeamUser } from '@/lib/types'

/**
 * Selector múltiple de usuarios del equipo (popover con checkboxes).
 * Controlado: `value` = ids seleccionados.
 */
export function UserMultiSelect({
  users,
  value,
  onChange,
  placeholder = 'Sin asignar',
  disabled = false,
  id,
  className,
}: {
  users: readonly TeamUser[]
  value: readonly string[]
  onChange: (ids: string[]) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  className?: string
}): React.JSX.Element {
  const selected = users.filter((u) => value.includes(u.id))
  const label =
    selected.length === 0
      ? placeholder
      : selected.map((u) => fullName(u.firstName, u.lastName, u.email)).join(', ')

  function toggle(userId: string, checked: boolean): void {
    onChange(checked ? [...value, userId] : value.filter((v) => v !== userId))
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            selected.length === 0 && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="start">
        {users.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">No hay usuarios.</p>
        ) : (
          <ul className="max-h-64 overflow-y-auto" role="group" aria-label="Usuarios del equipo">
            {users.map((u) => {
              const name = fullName(u.firstName, u.lastName, u.email)
              const checkId = `user-opt-${u.id}`
              return (
                <li key={u.id}>
                  <label
                    htmlFor={checkId}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <Checkbox
                      id={checkId}
                      checked={value.includes(u.id)}
                      onCheckedChange={(c) => toggle(u.id, c === true)}
                    />
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-accent-foreground">
                      {initials(u.firstName, u.lastName)}
                    </span>
                    <span className="truncate">{name}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
