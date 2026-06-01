'use client'

import { Loader2 } from 'lucide-react'
import { useNotificationPrefs, useUpdateNotificationPref } from '@/lib/hooks'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const EVENT_LABELS: Record<string, { label: string; description: string }> = {
  deal_stage_changed: {
    label: 'Cambio de etapa en deal',
    description: 'Cuando un deal avanza o retrocede de etapa en el pipeline.',
  },
  cr_approved: {
    label: 'Change Request aprobado',
    description: 'Cuando un cliente aprueba una solicitud de cambio.',
  },
  cr_rejected: {
    label: 'Change Request rechazado',
    description: 'Cuando un cliente rechaza una solicitud de cambio.',
  },
  task_due: {
    label: 'Tarea por vencer',
    description: 'Cuando una tarea asignada a ti está próxima a vencer.',
  },
  client_message: {
    label: 'Mensaje del cliente',
    description: 'Cuando un cliente envía un comentario o mensaje desde el portal.',
  },
}

export function NotificacionesSection() {
  const { data, isLoading } = useNotificationPrefs()
  const update = useUpdateNotificationPref()

  function handleChange(eventType: string, field: 'inApp' | 'email', value: boolean) {
    const current = data?.find((p) => p.eventType === eventType)
    update.mutate({
      eventType,
      inApp: field === 'inApp' ? value : (current?.inApp ?? true),
      email: field === 'email' ? value : (current?.email ?? false),
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Controlá qué eventos generan notificaciones en la campana (in-app) o te llegan por email.
      </p>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground">Evento</TableHead>
                  <TableHead className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">In-app</TableHead>
                  <TableHead className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((pref) => {
                  const meta = EVENT_LABELS[pref.eventType]
                  return (
                    <TableRow key={pref.eventType}>
                      <TableCell className="px-4 py-4">
                        <p className="font-medium">{meta?.label ?? pref.eventType}</p>
                        {meta?.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{meta.description}</p>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-4 text-center">
                        <Switch
                          checked={pref.inApp}
                          onCheckedChange={(v) => handleChange(pref.eventType, 'inApp', v)}
                          disabled={update.isPending}
                        />
                      </TableCell>
                      <TableCell className="px-4 py-4 text-center">
                        <Switch
                          checked={pref.email}
                          onCheckedChange={(v) => handleChange(pref.eventType, 'email', v)}
                          disabled={update.isPending}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
