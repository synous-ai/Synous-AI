'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@portal/components/ui/button'
import { SectionHeader } from '@portal/components/portal/section-header'
import { RequestList } from '@portal/components/portal/requests/request-list'
import { CreateRequestSheet } from '@portal/components/portal/requests/create-request-sheet'
import { useCanWriteChangeRequests } from '@portal/components/portal/requests/cr-status'

/**
 * Entrada del módulo de Solicitudes (Change Requests) del portal de cliente.
 * El header vive ACÁ (no en la page) porque lleva el CTA "+ Nueva solicitud",
 * que necesita el estado del sheet de creación — mismo patrón que
 * `DocumentsPanel`, que también arma su propio `SectionHeader` con acciones.
 */
export function RequestsPanel() {
  const [createOpen, setCreateOpen] = useState(false)
  const canWrite = useCanWriteChangeRequests()

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Tu proyecto"
        title="Solicitudes"
        description="Cambios, ampliaciones o ajustes sobre el alcance acordado."
        actions={
          canWrite ? (
            <Button variant="signal" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Nueva solicitud
            </Button>
          ) : undefined
        }
      />

      <RequestList onCreate={() => setCreateOpen(true)} />

      <CreateRequestSheet open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
