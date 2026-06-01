'use client'

import { useState } from 'react'
import { Trash2, Plus, Clock, MapPin, CalendarX, ShieldCheck, CalendarRange } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import {
  useMeetingTypes,
  useCreateMeetingType,
  useDeleteMeetingType,
  useAvailability,
  useCreateAvailability,
  useDeleteAvailability,
  useBookings,
} from '@/lib/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const TABS = [
  { value: 'tipos', label: 'Tipos de reunión' },
  { value: 'disponibilidad', label: 'Disponibilidad' },
  { value: 'reuniones', label: 'Reuniones' },
] as const

function MeetingTypesTab() {
  const { data, isLoading } = useMeetingTypes()
  const create = useCreateMeetingType()
  const del = useDeleteMeetingType()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [duration, setDuration] = useState('30')

  async function add() {
    if (!name.trim()) return
    await create.mutateAsync({ name: name.trim(), durationMin: Number(duration) || 30 })
    setName('')
    setDuration('30')
    setOpen(false)
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setOpen((o) => !o)}>{open ? 'Cancelar' : 'Nuevo Tipo'}</Button>
      </div>
      {open && (
        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="mtname">Nombre</Label>
              <Input id="mtname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Discovery call" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mtdur">Duración (min)</Label>
              <Input id="mtdur" type="number" className="w-32" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
            <Button size="sm" onClick={add} disabled={!name.trim() || create.isPending}>Guardar</Button>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="p-2">
          {isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
            </div>
          ) : (data ?? []).length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyIllustration icon={CalendarRange} />
                <EmptyTitle>Sin Tipos de Reunión</EmptyTitle>
                <EmptyDescription>Creá el primero con el formulario de arriba.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="divide-y">
              {data!.map((t) => (
                <li key={t.id} className="group flex items-center gap-3 px-3 py-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {t.durationMin} min</span>
                      {t.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {t.location}</span>}
                      <span className="font-mono">/{t.slug}</span>
                    </p>
                  </div>
                  {!t.isActive && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">inactivo</span>}
                  <Button variant="ghost" size="icon" onClick={() => del.mutate(t.id)} className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive" aria-label="Eliminar tipo">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AvailabilityTab() {
  const { data, isLoading } = useAvailability()
  const create = useCreateAvailability()
  const del = useDeleteAvailability()
  const [day, setDay] = useState('1')
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('17:00')

  async function add() {
    await create.mutateAsync({ dayOfWeek: Number(day), startTime: start, endTime: end })
  }

  return (
    <div>
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1.5">
            <Label>Día</Label>
            <Select value={day} onValueChange={setDay}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS.map((d, i) => (
                  <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st">Desde</Label>
            <Input id="st" type="time" className="w-32" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="et">Hasta</Label>
            <Input id="et" type="time" className="w-32" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <Button size="sm" onClick={add} disabled={create.isPending}>
            <Plus className="h-4 w-4" /> Agregar
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-2">
          {isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
            </div>
          ) : (data ?? []).length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyIllustration icon={ShieldCheck} />
                <EmptyTitle>Sin Reglas de Disponibilidad</EmptyTitle>
                <EmptyDescription>Agregá un horario disponible con el formulario de arriba.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="divide-y">
              {data!.map((r) => (
                <li key={r.id} className="group flex items-center gap-3 px-3 py-3">
                  <span className="w-28 text-sm font-medium">{DAYS[r.dayOfWeek]}</span>
                  <span className="font-mono text-sm text-muted-foreground">{r.startTime.slice(0, 5)} – {r.endTime.slice(0, 5)}</span>
                  <div className="flex-1" />
                  <Button variant="ghost" size="icon" onClick={() => del.mutate(r.id)} className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive" aria-label="Eliminar disponibilidad">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function BookingsTab() {
  const { data, isLoading } = useBookings()
  return (
    <Card>
      <CardContent className="p-2">
        {isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-12 rounded-lg" />
            <Skeleton className="h-12 rounded-lg" />
          </div>
        ) : (data ?? []).length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyIllustration icon={CalendarX} />
              <EmptyTitle>Sin Reuniones Agendadas</EmptyTitle>
              <EmptyDescription>Las reservas de clientes aparecerán aquí.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y">
            {data!.map((b) => (
              <li key={b.id} className="flex items-center justify-between px-3 py-3">
                <div>
                  <p className="text-sm font-medium">{b.guestName} · {b.meetingTypeName}</p>
                  <p className="font-mono text-xs text-muted-foreground">{new Date(b.startsAt).toLocaleString('es')}</p>
                </div>
                <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">{b.status}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export default function CalendarPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="eyebrow">Agenda</p>
        <h1 className="text-3xl font-semibold tracking-tight">Calendario</h1>
      </div>

      <Tabs defaultValue="tipos">
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
        <TabsContent value="tipos"><MeetingTypesTab /></TabsContent>
        <TabsContent value="disponibilidad"><AvailabilityTab /></TabsContent>
        <TabsContent value="reuniones"><BookingsTab /></TabsContent>
      </Tabs>
    </div>
  )
}
