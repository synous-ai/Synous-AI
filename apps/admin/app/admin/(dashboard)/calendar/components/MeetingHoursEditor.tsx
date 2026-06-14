'use client'

/**
 * MeetingHoursEditor — Editor de horarios de disponibilidad (estilo Calendly).
 *
 * Funcionalidad:
 *  - Selector de schedule activo (con botón para crear uno nuevo).
 *  - Por cada día de la semana: toggle "Disponible" / "No disponible".
 *  - Para los días disponibles: N rangos de horario con botones + / ×.
 *  - Selector de timezone IANA (lista de las principales zonas).
 *  - Sección de date overrides: fechas puntuales con horario especial o bloqueadas.
 *  - Botón "Guardar cambios" que hace un PATCH de todos los intervalos en una sola request.
 *
 * El estado local refleja el schedule seleccionado. El guardado es explícito (no auto-save)
 * para evitar requests intermedios con estado inválido.
 */

import { useState, useEffect } from 'react'
import { Plus, X, ChevronDown, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useSchedules,
  useCreateSchedule,
  useUpdateSchedule,
  useReplaceScheduleIntervals,
  useUpsertDateOverride,
  useDeleteDateOverride,
} from '@/lib/hooks'
import type { AvailabilitySchedule, CreateIntervalInput, DateOverrideInput } from '@/lib/types'

// ── Constantes ────────────────────────────────────────────────────────────────

const DAYS = [
  { idx: 1, label: 'Lunes' },
  { idx: 2, label: 'Martes' },
  { idx: 3, label: 'Miércoles' },
  { idx: 4, label: 'Jueves' },
  { idx: 5, label: 'Viernes' },
  { idx: 6, label: 'Sábado' },
  { idx: 0, label: 'Domingo' },
]

/**
 * Zonas horarias comunes en Latinoamérica + España + US para el selector.
 * Lista reducida — cubrimos el 95% de los casos de uso de la agencia.
 */
const TIMEZONES = [
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Mexico_City',
  'America/Lima',
  'America/Santiago',
  'America/Caracas',
  'America/Guayaquil',
  'America/La_Paz',
  'America/Asuncion',
  'America/Montevideo',
  'America/Havana',
  'America/Santo_Domingo',
  'America/Puerto_Rico',
  'America/Panama',
  'America/Costa_Rica',
  'America/Guatemala',
  'America/El_Salvador',
  'America/Tegucigalpa',
  'America/Managua',
  'America/Belize',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'America/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'Europe/Madrid',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'UTC',
]

// ── Tipos internos ────────────────────────────────────────────────────────────

interface TimeRange {
  /** ID del intervalo en DB (si ya existe) — undefined para rangos nuevos no guardados */
  id?: string
  startTime: string // 'HH:mm'
  endTime: string   // 'HH:mm'
}

/** Estado local del editor: un mapa de dayOfWeek → { enabled, ranges } */
type DayState = {
  enabled: boolean
  ranges: TimeRange[]
}

type WeekState = Record<number, DayState>

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normaliza 'HH:mm:ss' → 'HH:mm' (Drizzle devuelve time con segundos) */
function normalizeTime(t: string): string {
  return t.slice(0, 5)
}

/** Convierte el schedule de DB al estado local del editor */
function scheduleToWeekState(schedule: AvailabilitySchedule): WeekState {
  const state: WeekState = {}
  for (const day of DAYS) {
    const dayIntervals = schedule.intervals
      .filter((i) => i.dayOfWeek === day.idx)
      .map((i) => ({
        id: i.id,
        startTime: normalizeTime(i.startTime),
        endTime: normalizeTime(i.endTime),
      }))

    state[day.idx] = {
      enabled: dayIntervals.length > 0,
      ranges: dayIntervals.length > 0 ? dayIntervals : [{ startTime: '09:00', endTime: '17:00' }],
    }
  }
  return state
}

/** Convierte el estado local a los intervalos que se envían a la API */
function weekStateToIntervals(weekState: WeekState): CreateIntervalInput[] {
  const intervals: CreateIntervalInput[] = []
  for (const day of DAYS) {
    const dayState = weekState[day.idx]
    if (!dayState?.enabled) continue
    for (const range of dayState.ranges) {
      if (range.startTime && range.endTime && range.endTime > range.startTime) {
        intervals.push({
          dayOfWeek: day.idx,
          startTime: range.startTime,
          endTime: range.endTime,
        })
      }
    }
  }
  return intervals
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function ScheduleSelector({
  schedules,
  activeId,
  onSelect,
  onCreate,
}: {
  schedules: AvailabilitySchedule[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
}) {
  return (
    <div className="flex items-center gap-3">
      <Select value={activeId ?? ''} onValueChange={onSelect}>
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Seleccionar schedule..." />
        </SelectTrigger>
        <SelectContent>
          {schedules.length === 0 ? (
            // Sin schedules: evitamos el popover vacío mostrando una pista.
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No hay schedules todavía. Creá uno con &ldquo;Nuevo schedule&rdquo;.
            </div>
          ) : (
            schedules.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
                {s.isDefault && (
                  <span className="ml-1 text-xs text-muted-foreground">(default)</span>
                )}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" onClick={onCreate}>
        <Plus className="mr-1 h-4 w-4" />
        Nuevo schedule
      </Button>
    </div>
  )
}

/** Fila de un día de la semana con sus rangos horarios */
function DayRow({
  day,
  dayState,
  onChange,
}: {
  day: (typeof DAYS)[0]
  dayState: DayState
  onChange: (newState: DayState) => void
}) {
  function setEnabled(v: boolean) {
    onChange({ ...dayState, enabled: v })
  }

  function addRange() {
    // Agregar un rango vacío después del último
    const lastRange = dayState.ranges[dayState.ranges.length - 1]
    const newStart = lastRange ? lastRange.endTime : '09:00'
    // Sumar 1 hora al endTime del último rango como default
    const newEnd = newStart < '23:00' ? newStart.replace(/(\d{2}):\d{2}/, (_, h) => `${String(Number(h) + 1).padStart(2, '0')}:00`) : '23:00'
    onChange({
      ...dayState,
      ranges: [...dayState.ranges, { startTime: newStart, endTime: newEnd }],
    })
  }

  function removeRange(idx: number) {
    const newRanges = dayState.ranges.filter((_, i) => i !== idx)
    onChange({
      ...dayState,
      // Si quedan 0 rangos al borrar el último, deshabilitar el día
      enabled: newRanges.length > 0,
      ranges: newRanges.length > 0 ? newRanges : [{ startTime: '09:00', endTime: '17:00' }],
    })
  }

  function updateRange(idx: number, field: 'startTime' | 'endTime', value: string) {
    onChange({
      ...dayState,
      ranges: dayState.ranges.map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
    })
  }

  return (
    <div className="flex items-start gap-4 py-3">
      {/* Toggle del día */}
      <div className="flex w-28 items-center gap-2 pt-1.5">
        <Switch checked={dayState.enabled} onCheckedChange={setEnabled} id={`day-${day.idx}`} />
        <Label
          htmlFor={`day-${day.idx}`}
          className={`cursor-pointer text-sm font-medium ${!dayState.enabled ? 'text-muted-foreground' : ''}`}
        >
          {day.label}
        </Label>
      </div>

      {/* Rangos o "No disponible" */}
      {dayState.enabled ? (
        <div className="flex-1 space-y-2">
          {dayState.ranges.map((range, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                type="time"
                value={range.startTime}
                onChange={(e) => updateRange(idx, 'startTime', e.target.value)}
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">–</span>
              <Input
                type="time"
                value={range.endTime}
                onChange={(e) => updateRange(idx, 'endTime', e.target.value)}
                className="w-32"
              />
              {dayState.ranges.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeRange(idx)}
                  title="Quitar rango"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={addRange}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Agregar horario
          </Button>
        </div>
      ) : (
        <p className="pt-2 text-sm text-muted-foreground">No disponible</p>
      )}
    </div>
  )
}

/** Editor de date overrides (fechas puntuales con horario especial o bloqueadas) */
function DateOverridesSection({ scheduleId }: { scheduleId: string }) {
  const { data: schedules } = useSchedules()
  const schedule = schedules?.find((s) => s.id === scheduleId)
  const overrides = schedule?.dateOverrides ?? []

  const upsert = useUpsertDateOverride()
  const del = useDeleteDateOverride()

  const [showAdd, setShowAdd] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newIntervals, setNewIntervals] = useState<Array<{ from: string; to: string }>>([
    { from: '09:00', to: '17:00' },
  ])
  const [blockDay, setBlockDay] = useState(false)

  async function handleSaveOverride() {
    if (!newDate) return
    const input: DateOverrideInput = {
      date: newDate,
      intervals: blockDay ? [] : newIntervals.filter((iv) => iv.to > iv.from),
    }
    await upsert.mutateAsync({ scheduleId, input })
    setShowAdd(false)
    setNewDate('')
    setNewIntervals([{ from: '09:00', to: '17:00' }])
    setBlockDay(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Excepciones por fecha</h4>
        <Button variant="outline" size="sm" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? 'Cancelar' : (
            <>
              <Calendar className="mr-1 h-4 w-4" />
              Agregar excepción
            </>
          )}
        </Button>
      </div>

      {/* Formulario de nueva excepción */}
      {showAdd && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-48"
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="block-day"
                checked={blockDay}
                onCheckedChange={setBlockDay}
              />
              <Label htmlFor="block-day" className="cursor-pointer text-sm">
                Día bloqueado (sin disponibilidad)
              </Label>
            </div>

            {!blockDay && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Horarios del día</Label>
                {newIntervals.map((iv, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={iv.from}
                      onChange={(e) =>
                        setNewIntervals((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, from: e.target.value } : p)),
                        )
                      }
                      className="w-32"
                    />
                    <span className="text-sm text-muted-foreground">–</span>
                    <Input
                      type="time"
                      value={iv.to}
                      onChange={(e) =>
                        setNewIntervals((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, to: e.target.value } : p)),
                        )
                      }
                      className="w-32"
                    />
                    {newIntervals.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setNewIntervals((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() =>
                    setNewIntervals((prev) => [...prev, { from: '09:00', to: '17:00' }])
                  }
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Agregar rango
                </Button>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>
                Cancelar
              </Button>
              <Button size="sm" disabled={!newDate || upsert.isPending} onClick={handleSaveOverride}>
                {upsert.isPending ? 'Guardando...' : 'Guardar excepción'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de overrides existentes */}
      {overrides.length === 0 && !showAdd && (
        <p className="text-xs text-muted-foreground">
          Sin excepciones. El horario semanal aplica para todas las fechas.
        </p>
      )}

      {overrides.map((ov) => (
        <div
          key={ov.id}
          className="flex items-center justify-between rounded-md border px-3 py-2.5"
        >
          <div>
            <p className="text-sm font-medium">{ov.date}</p>
            {ov.intervals.length === 0 ? (
              <p className="text-xs text-muted-foreground">Día bloqueado</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {ov.intervals.map((iv) => `${iv.from}–${iv.to}`).join(', ')}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            disabled={del.isPending}
            onClick={() => del.mutate({ scheduleId, overrideId: ov.id })}
            title="Eliminar excepción"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function MeetingHoursEditor() {
  const { data: schedules, isLoading } = useSchedules()
  const createSchedule = useCreateSchedule()
  const updateSchedule = useUpdateSchedule()
  const replaceIntervals = useReplaceScheduleIntervals()

  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null)
  const [weekState, setWeekState] = useState<WeekState>({})
  const [dirty, setDirty] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Selección automática del default schedule al cargar
  useEffect(() => {
    if (!schedules || activeScheduleId) return
    const def = schedules.find((s) => s.isDefault) ?? schedules[0]
    if (def) {
      setActiveScheduleId(def.id)
      setWeekState(scheduleToWeekState(def))
    }
  }, [schedules, activeScheduleId])

  // Al cambiar el schedule activo, sincronizar el weekState
  function handleSelectSchedule(id: string) {
    const sched = schedules?.find((s) => s.id === id)
    if (!sched) return
    setActiveScheduleId(id)
    setWeekState(scheduleToWeekState(sched))
    setDirty(false)
  }

  function handleDayChange(dayIdx: number, newState: DayState) {
    setWeekState((prev) => ({ ...prev, [dayIdx]: newState }))
    setDirty(true)
    setSaveSuccess(false)
  }

  async function handleSave() {
    if (!activeScheduleId) return
    const intervals = weekStateToIntervals(weekState)
    await replaceIntervals.mutateAsync({ scheduleId: activeScheduleId, intervals })
    setDirty(false)
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 3000)
  }

  // Crear un nuevo schedule
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newScheduleName, setNewScheduleName] = useState('')
  const [newScheduleTz, setNewScheduleTz] = useState('America/Argentina/Buenos_Aires')

  async function handleCreateSchedule() {
    if (!newScheduleName.trim()) return
    const created = await createSchedule.mutateAsync({
      name: newScheduleName.trim(),
      timeZone: newScheduleTz,
      isDefault: (schedules ?? []).length === 0, // el primero es default automáticamente
    })
    setActiveScheduleId(created.id)
    setWeekState(scheduleToWeekState({ ...created, intervals: [], dateOverrides: [] }))
    setShowCreateForm(false)
    setNewScheduleName('')
    setDirty(false)
  }

  const activeSchedule = schedules?.find((s) => s.id === activeScheduleId)

  // ── Render ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Selector de schedule */}
      <ScheduleSelector
        schedules={schedules ?? []}
        activeId={activeScheduleId}
        onSelect={handleSelectSchedule}
        onCreate={() => setShowCreateForm((v) => !v)}
      />

      {/* Formulario de creación de schedule */}
      {showCreateForm && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-sched-name">Nombre del schedule</Label>
              <Input
                id="new-sched-name"
                value={newScheduleName}
                onChange={(e) => setNewScheduleName(e.target.value)}
                placeholder="Horario laboral"
                className="w-56"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-sched-tz">Zona horaria</Label>
              <Select value={newScheduleTz} onValueChange={setNewScheduleTz}>
                <SelectTrigger id="new-sched-tz" className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!newScheduleName.trim() || createSchedule.isPending}
                onClick={handleCreateSchedule}
              >
                {createSchedule.isPending ? 'Creando...' : 'Crear'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowCreateForm(false)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Editor del schedule activo */}
      {activeScheduleId && activeSchedule ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <h3 className="text-base font-semibold">{activeSchedule.name}</h3>
              <p className="text-xs text-muted-foreground">
                Zona horaria: {activeSchedule.timeZone}
              </p>
            </div>

            {/* Selector de timezone inline */}
            <div className="flex items-center gap-2">
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
              <Select
                value={activeSchedule.timeZone}
                onValueChange={(tz) =>
                  updateSchedule.mutate({ id: activeScheduleId, input: { timeZone: tz } })
                }
              >
                <SelectTrigger className="h-8 w-48 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz} className="text-xs">
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent className="space-y-0">
            {/* Días de la semana */}
            <div className="divide-y">
              {DAYS.map((day) => (
                <DayRow
                  key={day.idx}
                  day={day}
                  dayState={
                    weekState[day.idx] ?? { enabled: false, ranges: [{ startTime: '09:00', endTime: '17:00' }] }
                  }
                  onChange={(newState) => handleDayChange(day.idx, newState)}
                />
              ))}
            </div>

            {/* Acciones de guardado */}
            <div className="flex items-center justify-between border-t pt-4">
              <p
                className={`text-xs transition-opacity ${
                  saveSuccess ? 'text-green-600 opacity-100' : 'opacity-0'
                }`}
              >
                Cambios guardados
              </p>
              <div className="flex gap-2">
                {dirty && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setWeekState(scheduleToWeekState(activeSchedule))
                      setDirty(false)
                    }}
                  >
                    Descartar
                  </Button>
                )}
                <Button
                  size="sm"
                  disabled={!dirty || replaceIntervals.isPending}
                  onClick={handleSave}
                >
                  {replaceIntervals.isPending ? 'Guardando...' : 'Guardar cambios'}
                </Button>
              </div>
            </div>

            {/* Date overrides */}
            <div className="border-t pt-4">
              <DateOverridesSection scheduleId={activeScheduleId} />
            </div>
          </CardContent>
        </Card>
      ) : (
        !showCreateForm && (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Sin schedules configurados.</p>
                <p className="text-xs text-muted-foreground">
                  Creá tu primer schedule con el botón &quot;Nuevo schedule&quot;.
                </p>
              </div>
            </CardContent>
          </Card>
        )
      )}
    </div>
  )
}
