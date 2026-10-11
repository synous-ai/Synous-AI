'use client'

import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { useUpdateTeamProfile } from '@/lib/hooks'
import { WORK_STATUS_OPTIONS, workStatusMeta } from '@/lib/team'
import type { WorkStatus } from '@/lib/types'
import { StatusBadge } from '@/components/ui/status-badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const NONE = 'none'

/** Estado de trabajo como badge; sin estado no muestra nada. */
export function WorkStatusBadge({ status }: { status: WorkStatus | null }): React.JSX.Element | null {
  if (!status) return null
  const { label, kind } = workStatusMeta(status)
  return <StatusBadge kind={kind}>{label}</StatusBadge>
}

/** Select inline que guarda al cambiar (PATCH del perfil). Solo para la propia persona o un owner. */
export function WorkStatusSelect({
  userId,
  value,
}: {
  userId: string
  value: WorkStatus | null
}): React.JSX.Element {
  const update = useUpdateTeamProfile()

  function onChange(v: string): void {
    const next = v === NONE ? null : (v as WorkStatus)
    update.mutate(
      { userId, input: { workStatus: next } },
      { onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo actualizar el estado') },
    )
  }

  return (
    <Select value={value ?? NONE} onValueChange={onChange} disabled={update.isPending}>
      <SelectTrigger className="h-8 w-52" aria-label="Estado de trabajo">
        <SelectValue placeholder="Sin estado" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Sin estado</SelectItem>
        {WORK_STATUS_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
