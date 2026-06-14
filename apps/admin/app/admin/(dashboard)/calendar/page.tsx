'use client'

/**
 * CalendarPage — Panel de administración del módulo de agenda.
 *
 * Tabs disponibles (F4a + F4b):
 *  - "Tipos de evento" (V2) — lista completa con formulario y acciones CRUD.
 *  - "Horarios" — editor de availability schedules (estilo Calendly).
 *  - "Vista semana" — grilla semanal de bookings del portal (F4b).
 *  - "Reuniones" — listado de bookings con acción de cancelar (F4b).
 *
 * El portalId real se obtiene de useHubUser() → GET /api/auth/me (F4b).
 * Se usa SOLO para mostrar la URL pública de cada event type; el CRUD
 * del admin usa el portalId del JWT en el backend (calendar.router.ts →
 * request.hubUser!.portalId).
 */

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { EventTypeList } from './components/EventTypeList'
import { MeetingHoursEditor } from './components/MeetingHoursEditor'
import { WeekView } from './components/WeekView'
import { BookingsManager } from './components/BookingsManager'
import { useHubUser } from '@/lib/hooks'

// ── Definición de tabs ────────────────────────────────────────────────────────

const TABS = [
  { value: 'tipos', label: 'Tipos de evento' },
  { value: 'horarios', label: 'Horarios' },
  { value: 'semana', label: 'Vista semana' },
  { value: 'reuniones', label: 'Reuniones' },
] as const

// ── Página principal ──────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [activeTab, setActiveTab] = useState<string>('tipos')

  /**
   * portalId del hub_user autenticado — obtenido de GET /api/auth/me.
   * Se usa para construir la URL pública del booking page en EventTypeList.
   * Mientras carga, se usa 'portal' como fallback (solo afecta el texto del link).
   */
  const { data: hubUser } = useHubUser()
  const displayPortalId = hubUser?.portalId ?? 'portal'

  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="eyebrow">Agenda</p>
        <h1 className="text-3xl font-semibold tracking-tight">Calendario</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 h-auto rounded-lg bg-muted/60 p-1">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="rounded-md px-3 py-1.5 text-sm font-medium data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Tipos de evento — F4a */}
        <TabsContent value="tipos">
          <EventTypeList portalId={displayPortalId} />
        </TabsContent>

        {/* Horarios de disponibilidad — F4a */}
        <TabsContent value="horarios">
          <MeetingHoursEditor />
        </TabsContent>

        {/* Vista semana — F4b */}
        <TabsContent value="semana">
          <WeekView />
        </TabsContent>

        {/* Reuniones con gestión — F4b (reemplaza el BookingsTab legacy) */}
        <TabsContent value="reuniones">
          <BookingsManager />
        </TabsContent>
      </Tabs>
    </div>
  )
}
