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
 * El editor semanal es un formulario React Hook Form + Zod: valida cada rango
 * (formato HH:MM, fin posterior al inicio — mirroa IntervalInputSchema de la
 * API) y solo habilita "Guardar" cuando hay cambios sin guardar (isDirty).
 * El guardado es explícito (no auto-save) para evitar requests intermedios
 * con estado inválido.
 */

import { useEffect, useState } from 'react'
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormWatch,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
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
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
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

/** Formato 'HH:mm' — mirroa el regex de IntervalInputSchema / DateOverride en la API. */
const HHMM = /^\d{2}:\d{2}$/

// ── Schema del editor semanal ───────────────────────────────────────────────

const WeekTimeRangeSchema = z.object({
  startTime: z.string(),
  endTime: z.string(),
})

const WeekDaySchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    enabled: z.boolean(),
    ranges: z.array(WeekTimeRangeSchema),
  })
  .superRefine((day, ctx) => {
    // Los días deshabilitados no se envían — no tiene sentido validar sus rangos.
    if (!day.enabled) return
    day.ranges.forEach((r, i) => {
      const startOk = HHMM.test(r.startTime)
      const endOk = HHMM.test(r.endTime)
      if (!startOk) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ranges', i, 'startTime'], message: 'Formato HH:MM' })
      }
      if (!endOk) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ranges', i, 'endTime'], message: 'Formato HH:MM' })
      }
      if (startOk && endOk && r.endTime <= r.startTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ranges', i, 'endTime'],
          message: 'Debe ser posterior al inicio',
        })
      }
    })
  })

const WeekFormSchema = z.object({
  days: z.array(WeekDaySchema).length(7),
})
type WeekFormValues = z.infer<typeof WeekFormSchema>

// ── Schema del formulario de nuevo schedule ─────────────────────────────────

const CreateScheduleFormSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  timeZone: z.string().min(1, 'La zona horaria es requerida'),
})
type CreateScheduleFormValues = z.infer<typeof CreateScheduleFormSchema>

// ── Schema del formulario de date override ──────────────────────────────────

const OverrideRangeSchema = z.object({
  from: z.string(),
  to: z.string(),
})

const OverrideFormSchema = z
  .object({
    date: z.string().min(1, 'La fecha es requerida'),
    blockDay: z.boolean(),
    intervals: z.array(OverrideRangeSchema),
  })
  .superRefine((val, ctx) => {
    if (val.blockDay) return
    val.intervals.forEach((iv, i) => {
      const fromOk = HHMM.test(iv.from)
      const toOk = HHMM.test(iv.to)
      if (!fromOk) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['intervals', i, 'from'], message: 'Formato HH:MM' })
      }
      if (!toOk) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['intervals', i, 'to'], message: 'Formato HH:MM' })
      }
      if (fromOk && toOk && iv.to <= iv.from) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['intervals', i, 'to'],
          message: 'Debe ser posterior al inicio',
        })
      }
    })
  })
type OverrideFormValues = z.infer<typeof OverrideFormSchema>

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normaliza 'HH:mm:ss' → 'HH:mm' (Drizzle devuelve time con segundos) */
function normalizeTime(t: string): string {
  return t.slice(0, 5)
}

/** Convierte el schedule de DB al array `days` del formulario semanal. */
function scheduleToFormDays(schedule: AvailabilitySchedule): WeekFormValues['days'] {
  return DAYS.map((day) => {
    const dayIntervals = schedule.intervals
      .filter((i) => i.dayOfWeek === day.idx)
      .map((i) => ({
        startTime: normalizeTime(i.startTime),
        endTime: normalizeTime(i.endTime),
      }))

    return {
      dayOfWeek: day.idx,
      enabled: dayIntervals.length > 0,
      ranges: dayIntervals.length > 0 ? dayIntervals : [{ startTime: '09:00', endTime: '17:00' }],
    }
  })
}

/** Convierte el array `days` validado del formulario a los intervalos que se envían a la API. */
function formDaysToIntervals(days: WeekFormValues['days']): CreateIntervalInput[] {
  const intervals: CreateIntervalInput[] = []
  for (const day of days) {
    if (!day.enabled) continue
    for (const range of day.ranges) {
      intervals.push({ dayOfWeek: day.dayOfWeek, startTime: range.startTime, endTime: range.endTime })
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

/** Fila de un día de la semana con sus rangos horarios — field array anidado (`days.{i}.ranges`). */
function DayRow({
  control,
  register,
  watch,
  dayIndex,
  day,
  errors,
}: {
  control: Control<WeekFormValues>
  register: UseFormRegister<WeekFormValues>
  watch: UseFormWatch<WeekFormValues>
  dayIndex: number
  day: (typeof DAYS)[number]
  errors: FieldErrors<WeekFormValues>
}) {
  const rangesName = `days.${dayIndex}.ranges` as const
  const { fields, append, remove } = useFieldArray({ control, name: rangesName })
  const enabled = watch(`days.${dayIndex}.enabled`)
  const ranges = watch(rangesName)
  const dayRangeErrors = errors.days?.[dayIndex]?.ranges

  function addRange() {
    // Agregar un rango vacío después del último
    const lastRange = ranges[ranges.length - 1]
    const newStart = lastRange ? lastRange.endTime : '09:00'
    // Sumar 1 hora al endTime del último rango como default
    const newEnd =
      newStart < '23:00'
        ? newStart.replace(/(\d{2}):\d{2}/, (_, h) => `${String(Number(h) + 1).padStart(2, '0')}:00`)
        : '23:00'
    append({ startTime: newStart, endTime: newEnd })
  }

  return (
    <div className="flex items-start gap-4 py-3">
      {/* Toggle del día */}
      <div className="flex w-28 items-center gap-2 pt-1.5">
        <Controller
          control={control}
          name={`days.${dayIndex}.enabled`}
          render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} id={`day-${day.idx}`} />
          )}
        />
        <Label
          htmlFor={`day-${day.idx}`}
          className={`cursor-pointer text-sm font-medium ${!enabled ? 'text-muted-foreground' : ''}`}
        >
          {day.label}
        </Label>
      </div>

      {/* Rangos o "No disponible" */}
      {enabled ? (
        <div className="flex-1 space-y-2">
          {fields.map((rangeField, idx) => {
            const fieldErrors = dayRangeErrors?.[idx]
            const rangeErrorMessage = fieldErrors?.endTime?.message ?? fieldErrors?.startTime?.message
            return (
              <div key={rangeField.id} className="space-y-1">
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    aria-invalid={!!fieldErrors?.startTime}
                    {...register(`${rangesName}.${idx}.startTime`)}
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">–</span>
                  <Input
                    type="time"
                    aria-invalid={!!fieldErrors?.endTime}
                    {...register(`${rangesName}.${idx}.endTime`)}
                    className="w-32"
                  />
                  {fields.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(idx)}
                      title="Quitar rango"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {rangeErrorMessage && <p className="text-xs text-destructive">{rangeErrorMessage}</p>}
              </div>
            )
          })}
          <Button
            variant="ghost"
            size="sm"
            type="button"
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

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<OverrideFormValues>({
    resolver: zodResolver(OverrideFormSchema),
    defaultValues: { date: '', blockDay: false, intervals: [{ from: '09:00', to: '17:00' }] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'intervals' })
  const blockDay = useWatch({ control, name: 'blockDay' })

  async function onSubmit(values: OverrideFormValues): Promise<void> {
    const input: DateOverrideInput = {
      date: values.date,
      intervals: values.blockDay ? [] : values.intervals,
    }
    // El error lo informa el toast global (MutationCache.onError); el catch evita
    // el rechazo sin manejar y deja el panel abierto con lo cargado para reintentar.
    try {
      await upsert.mutateAsync({ scheduleId, input })
      setShowAdd(false)
      reset({ date: '', blockDay: false, intervals: [{ from: '09:00', to: '17:00' }] })
    } catch {
      /* informado por el toast global */
    }
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
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-3 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="override-date">Fecha</Label>
                <Input
                  id="override-date"
                  type="date"
                  className="w-48"
                  aria-invalid={!!errors.date}
                  aria-describedby={errors.date ? 'override-date-error' : undefined}
                  {...register('date')}
                />
                {errors.date && (
                  <p id="override-date-error" className="text-xs text-destructive">
                    {errors.date.message}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Controller
                  control={control}
                  name="blockDay"
                  render={({ field }) => (
                    <Switch id="block-day" checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
                <Label htmlFor="block-day" className="cursor-pointer text-sm">
                  Día bloqueado (sin disponibilidad)
                </Label>
              </div>

              {!blockDay && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Horarios del día</Label>
                  {fields.map((f, idx) => {
                    const fieldErrors = errors.intervals?.[idx]
                    const rangeErrorMessage = fieldErrors?.to?.message ?? fieldErrors?.from?.message
                    return (
                      <div key={f.id} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            aria-invalid={!!fieldErrors?.from}
                            {...register(`intervals.${idx}.from`)}
                            className="w-32"
                          />
                          <span className="text-sm text-muted-foreground">–</span>
                          <Input
                            type="time"
                            aria-invalid={!!fieldErrors?.to}
                            {...register(`intervals.${idx}.to`)}
                            className="w-32"
                          />
                          {fields.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => remove(idx)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        {rangeErrorMessage && <p className="text-xs text-destructive">{rangeErrorMessage}</p>}
                      </div>
                    )
                  })}
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    className="h-7 px-2 text-xs"
                    onClick={() => append({ from: '09:00', to: '17:00' })}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Agregar rango
                  </Button>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" type="button" onClick={() => setShowAdd(false)}>
                  Cancelar
                </Button>
                <Button size="sm" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Guardando...' : 'Guardar excepción'}
                </Button>
              </div>
            </CardContent>
          </form>
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
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [pendingScheduleId, setPendingScheduleId] = useState<string | null>(null)

  const weekForm = useForm<WeekFormValues>({
    resolver: zodResolver(WeekFormSchema),
    defaultValues: { days: [] },
  })
  const {
    control: weekControl,
    register: weekRegister,
    watch: weekWatch,
    handleSubmit: handleWeekSubmit,
    reset: resetWeekForm,
    formState: { errors: weekErrors, isDirty: weekIsDirty, isSubmitting: weekIsSubmitting },
  } = weekForm

  // Selección automática del default schedule al cargar
  useEffect(() => {
    if (!schedules || activeScheduleId) return
    const def = schedules.find((s) => s.isDefault) ?? schedules[0]
    if (def) {
      setActiveScheduleId(def.id)
      resetWeekForm({ days: scheduleToFormDays(def) })
    }
  }, [schedules, activeScheduleId, resetWeekForm])

  // Advierte al cerrar/recargar la pestaña con cambios de horario sin guardar.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!weekIsDirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [weekIsDirty])

  // Al cambiar el schedule activo, sincronizar el formulario semanal.
  // Si hay cambios sin guardar, se pide confirmación antes de descartarlos.
  function handleSelectSchedule(id: string) {
    if (id === activeScheduleId) return
    if (weekIsDirty) {
      setPendingScheduleId(id)
      return
    }
    switchToSchedule(id)
  }

  function switchToSchedule(id: string) {
    const sched = schedules?.find((s) => s.id === id)
    if (!sched) return
    setActiveScheduleId(id)
    resetWeekForm({ days: scheduleToFormDays(sched) })
  }

  async function onSaveWeek(values: WeekFormValues): Promise<void> {
    if (!activeScheduleId) return
    const intervals = formDaysToIntervals(values.days)
    try {
      await replaceIntervals.mutateAsync({ scheduleId: activeScheduleId, intervals })
      // Reset a los valores recién guardados: limpia isDirty sin perder la data.
      resetWeekForm({ days: values.days })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch {
      // Informado por el toast global; el form queda dirty para reintentar.
    }
  }

  function handleDiscard() {
    const sched = schedules?.find((s) => s.id === activeScheduleId)
    if (!sched) return
    resetWeekForm({ days: scheduleToFormDays(sched) })
  }

  // Crear un nuevo schedule
  const [showCreateForm, setShowCreateForm] = useState(false)
  const createForm = useForm<CreateScheduleFormValues>({
    resolver: zodResolver(CreateScheduleFormSchema),
    defaultValues: { name: '', timeZone: 'America/Argentina/Buenos_Aires' },
  })

  async function onCreateSchedule(values: CreateScheduleFormValues): Promise<void> {
    try {
      const created = await createSchedule.mutateAsync({
        name: values.name.trim(),
        timeZone: values.timeZone,
        isDefault: (schedules ?? []).length === 0, // el primero es default automáticamente
      })
      setActiveScheduleId(created.id)
      resetWeekForm({ days: scheduleToFormDays({ ...created, intervals: [], dateOverrides: [] }) })
      setShowCreateForm(false)
      createForm.reset({ name: '', timeZone: 'America/Argentina/Buenos_Aires' })
    } catch {
      // Informado por el toast global; el formulario de creación queda abierto.
    }
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
          <form onSubmit={createForm.handleSubmit(onCreateSchedule)}>
            <CardContent className="flex flex-wrap items-end gap-3 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-sched-name">Nombre del schedule</Label>
                <Input
                  id="new-sched-name"
                  placeholder="Horario laboral"
                  className="w-56"
                  aria-invalid={!!createForm.formState.errors.name}
                  aria-describedby={createForm.formState.errors.name ? 'new-sched-name-error' : undefined}
                  {...createForm.register('name')}
                />
                {createForm.formState.errors.name && (
                  <p id="new-sched-name-error" className="text-xs text-destructive">
                    {createForm.formState.errors.name.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-sched-tz">Zona horaria</Label>
                <Controller
                  control={createForm.control}
                  name="timeZone"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
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
                  )}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" type="submit" disabled={createForm.formState.isSubmitting}>
                  {createForm.formState.isSubmitting ? 'Creando...' : 'Crear'}
                </Button>
                <Button variant="outline" size="sm" type="button" onClick={() => setShowCreateForm(false)}>
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </form>
        </Card>
      )}

      {/* Editor del schedule activo */}
      {activeScheduleId && activeSchedule ? (
        <Card>
          <form onSubmit={handleWeekSubmit(onSaveWeek)}>
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
                {DAYS.map((day, dayIndex) => (
                  <DayRow
                    key={day.idx}
                    control={weekControl}
                    register={weekRegister}
                    watch={weekWatch}
                    dayIndex={dayIndex}
                    day={day}
                    errors={weekErrors}
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
                  {weekIsDirty && (
                    <Button variant="outline" size="sm" type="button" onClick={handleDiscard}>
                      Descartar
                    </Button>
                  )}
                  <Button size="sm" type="submit" disabled={!weekIsDirty || weekIsSubmitting}>
                    {weekIsSubmitting ? 'Guardando...' : 'Guardar cambios'}
                  </Button>
                </div>
              </div>

              {/* Date overrides */}
              <div className="border-t pt-4">
                <DateOverridesSection scheduleId={activeScheduleId} />
              </div>
            </CardContent>
          </form>
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

      {/* Confirmación al cambiar de schedule con cambios sin guardar */}
      <ConfirmDialog
        open={pendingScheduleId != null}
        onOpenChange={(o) => !o && setPendingScheduleId(null)}
        title="¿Descartar los cambios?"
        description="Tenés cambios sin guardar en este horario. Si cambiás de schedule ahora, se van a perder."
        confirmLabel="Descartar y cambiar"
        destructive
        onConfirm={() => {
          if (pendingScheduleId) switchToSchedule(pendingScheduleId)
          setPendingScheduleId(null)
        }}
      />
    </div>
  )
}
