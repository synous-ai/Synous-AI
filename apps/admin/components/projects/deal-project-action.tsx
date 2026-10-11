'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FolderKanban, FolderPlus } from 'lucide-react'
import { useProjects } from '@/lib/hooks'
import { Button } from '@/components/ui/button'
import { ProjectDialog } from '@/components/projects/project-dialog'

/**
 * Acción del detalle de un deal: si ya tiene proyecto, link a él; si no,
 * "Crear proyecto" abre el diálogo precargado con deal, empresa y nombre.
 * La API no filtra por dealId, así que se busca en el listado completo
 * (useProjects sigue el cursor hasta agotarlo).
 */
export function DealProjectAction({
  dealId,
  dealName,
  companyId,
}: {
  dealId: string
  dealName: string
  companyId: string | null
}): React.JSX.Element | null {
  const router = useRouter()
  const { data, isLoading, isError } = useProjects()
  const [open, setOpen] = useState(false)

  if (isLoading) return null
  // Sin poder consultar los proyectos no ofrecemos crear uno: podría duplicar el existente.
  if (isError) return null

  const existing = (data ?? []).find((p) => p.dealId === dealId)

  if (existing) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-signal/10 px-3 py-2">
        <FolderKanban className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-signal" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Proyecto</p>
          <Link href={`/projects/${existing.id}`} className="block truncate text-xs font-medium text-primary hover:underline">
            {existing.name}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <>
      <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setOpen(true)}>
        <FolderPlus className="h-3.5 w-3.5" />
        Crear proyecto
      </Button>
      <ProjectDialog
        open={open}
        onClose={() => setOpen(false)}
        defaults={{ dealId, companyId: companyId ?? undefined, name: dealName }}
        onSaved={(created) => router.push(`/projects/${created.id}`)}
      />
    </>
  )
}
