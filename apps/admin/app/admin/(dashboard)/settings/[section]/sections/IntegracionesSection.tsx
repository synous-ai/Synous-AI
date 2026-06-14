'use client'

import { Check, X, Globe } from 'lucide-react'
import type { StatusKind } from '@/lib/status'
import { StatusBadge } from '@/components/ui/status-badge'
import { Card, CardContent } from '@/components/ui/card'

type IntegrationStatus = 'configured' | 'pending' | 'local'

interface IntegrationCard {
  id: string
  name: string
  description: string
  status: IntegrationStatus
  statusLabel: string
  detail: string
}

const INTEGRATIONS: IntegrationCard[] = [
  {
    id: 'docuseal',
    name: 'DocuSeal',
    description: 'Firma electrónica de contratos. El CRM crea una submission, DocuSeal notifica por webhook cuando el cliente firma.',
    status: 'pending',
    statusLabel: 'Pendiente',
    detail: 'Requiere DOCUSEAL_API_KEY y DOCUSEAL_WEBHOOK_SECRET en .env',
  },
  {
    id: 'fathom',
    name: 'Fathom Analytics',
    description: 'Analytics del sitio. El CRM recibe webhooks de Fathom para enriquecer las reuniones con datos de visitas.',
    status: 'pending',
    statusLabel: 'Pendiente',
    detail: 'Requiere FATHOM_WEBHOOK_SECRET en .env',
  },
  {
    id: 'resend',
    name: 'Resend (Email)',
    description: 'Envío de emails transaccionales: invitaciones al portal, notificaciones y seguimientos.',
    status: 'pending',
    statusLabel: 'Pendiente',
    detail: 'Requiere RESEND_API_KEY y FROM_EMAIL en .env',
  },
  {
    id: 'storage',
    name: 'Almacenamiento de archivos',
    description: 'Archivos subidos en el CRM (documentos, entregables, adjuntos). Actualmente en disco local.',
    status: 'local',
    statusLabel: 'Local',
    detail: 'Archivos guardados en apps/api/uploads/. Para producción: configurar R2 con CLOUDFLARE_R2_* en .env',
  },
]

const STATUS_KINDS: Record<IntegrationStatus, StatusKind> = {
  configured: 'success',
  pending: 'warning',
  local: 'info',
}

const STATUS_ICONS: Record<IntegrationStatus, typeof Check> = {
  configured: Check,
  pending: X,
  local: Globe,
}

export function IntegracionesSection() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        La configuración real se hace mediante variables de entorno en <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env</code>. Esta página es solo informativa.
      </p>
      <div className="grid gap-3">
        {INTEGRATIONS.map((integ) => {
          const Icon = STATUS_ICONS[integ.status]
          return (
            <Card key={integ.id} className="border-border/60">
              <CardContent className="flex items-start gap-4 p-4">
                <div className="flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{integ.name}</span>
                    <StatusBadge kind={STATUS_KINDS[integ.status]}>
                      <Icon className="mr-1 h-3 w-3" />
                      {integ.statusLabel}
                    </StatusBadge>
                  </div>
                  <p className="text-sm text-muted-foreground">{integ.description}</p>
                  <p className="mt-1.5 font-mono text-xs text-muted-foreground/70">{integ.detail}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
