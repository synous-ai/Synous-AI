'use client'

import * as React from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

// ─────────────────────────────────────────────────────────────────────────────
// DateField
//
// Reusable date-picker built on Popover + Calendar (react-day-picker).
// Returns an ISO date string (YYYY-MM-DD) or undefined.
//
// Props:
//   value       — ISO date string or undefined (controlled)
//   onChange    — called with ISO string on select, or undefined on clear
//   placeholder — placeholder text when no date is selected (default: "Elegí una fecha")
//   disabled    — disables the trigger button
//   className   — extra classes on the trigger button
// ─────────────────────────────────────────────────────────────────────────────

interface DateFieldProps {
  value?: string
  onChange: (iso: string | undefined) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function DateField({
  value,
  onChange,
  placeholder = 'Elegí una fecha',
  disabled = false,
  className,
}: DateFieldProps): React.ReactElement {
  const [open, setOpen] = React.useState(false)

  // Parse the ISO string → Date for DayPicker
  const selected: Date | undefined = value ? parseISO(value) : undefined

  function handleSelect(day: Date | undefined): void {
    if (day) {
      // Return YYYY-MM-DD only (no time zone shift)
      onChange(format(day, 'yyyy-MM-dd'))
    } else {
      onChange(undefined)
    }
    setOpen(false)
  }

  const displayLabel = selected
    ? format(selected, 'dd MMM yyyy', { locale: es })
    : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
          {displayLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          defaultMonth={selected}
        />
      </PopoverContent>
    </Popover>
  )
}
