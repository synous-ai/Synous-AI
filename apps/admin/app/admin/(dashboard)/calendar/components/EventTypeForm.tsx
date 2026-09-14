'use client'

/**
 * EventTypeForm — Formulario completo de creación/edición de event types.
 *
 * Cubre todos los campos del modelo V2:
 *  - Básicos: nombre, slug, duración, descripción, color, activo, secreto.
 *  - Tipo: solo (1:1) / group (capacidad N) / collective (N hosts).
 *  - Locaciones: video / teléfono / presencial / custom.
 *  - Límites: buffers, aviso mínimo, ventana de reserva, incremento, límite diario.
 *  - Custom questions: constructor con label, tipo, required.
 *  - Hosts (para collective): IDs de hubUsers (simplificado — ingreso manual en V1).
 *  - Schedule: selector de availability_schedule_id (opcional).
 *
 * Diseño: una sola tarjeta scrollable, secciones separadas por dividers.
 * React Hook Form + Zod: valida en el cliente espejando el schema de la API
 * (CreateEventTypeV2Schema en apps/api) y muestra el error junto a cada campo.
 */

import { useEffect, useState } from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ApiError } from '@/lib/api'
import { useCreateEventTypeV2, useUpdateEventTypeV2, useSchedules } from '@/lib/hooks'
import type { EventTypeV2 } from '@/lib/types'

// ── Schema (espeja CreateEventTypeV2Schema de apps/api/src/modules/calendar) ──

const CustomQuestionFormSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['text', 'textarea', 'select', 'phone']),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
})

const MeetingLocationFormSchema = z.object({
  type: z.enum(['video', 'phone', 'in_person', 'custom']),
  value: z.string().optional(),
})

/** Entero positivo requerido — mirroa z.number().int().positive() de la API. */
function requiredPositiveInt(message: string) {
  return z.coerce.number({ invalid_type_error: message }).int(message).positive(message)
}

/** Entero ≥ 0 requerido — mirroa z.number().int().min(0) de la API. */
function requiredNonNegativeInt(message: string) {
  return z.coerce.number({ invalid_type_error: message }).int(message).min(0, message)
}

/**
 * Entero positivo OPCIONAL: string vacío → undefined (sin error), cualquier
 * otro valor debe ser un entero positivo válido. Mirroa los `.nullable().optional()`
 * de bookingWindowDays y dailyLimit en la API.
 */
function optionalPositiveInt(message: string) {
  return z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.coerce.number({ invalid_type_error: message }).int(message).positive(message).optional(),
  )
}

const EventTypeFormSchema = z
  .object({
    name: z.string().min(1, 'El nombre es requerido'),
    slug: z.string().optional(),
    durationMin: requiredPositiveInt('La duración debe ser un número positivo'),
    kind: z.enum(['solo', 'group']),
    poolingType: z.union([z.literal(''), z.literal('collective')]),
    maxInvitees: requiredPositiveInt('La capacidad debe ser un número positivo'),
    color: z.string().min(1, 'Elegí un color'),
    secret: z.boolean(),
    isActive: z.boolean(),
    description: z.string().optional(),
    locations: z.array(MeetingLocationFormSchema),
    customQuestions: z.array(CustomQuestionFormSchema),
    startTimeIncrementMin: requiredPositiveInt('Debe ser un número positivo'),
    minBookingNoticeMin: requiredNonNegativeInt('Debe ser un número mayor o igual a 0'),
    bookingWindowType: z.enum(['rolling', 'range', 'unlimited']),
    bookingWindowDays: optionalPositiveInt('Debe ser un número entero positivo'),
    bookingWindowStart: z.string().optional(),
    bookingWindowEnd: z.string().optional(),
    bufferBeforeMin: requiredNonNegativeInt('Debe ser un número mayor o igual a 0'),
    bufferAfterMin: requiredNonNegativeInt('Debe ser un número mayor o igual a 0'),
    dailyLimit: optionalPositiveInt('Debe ser un número entero positivo'),
    availabilityScheduleId: z.string().optional(),
    hostIds: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.poolingType === 'collective') {
      const ids = (val.hostIds ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (ids.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['hostIds'],
          message: 'Los eventos colectivos requieren al menos 2 hostIds separados por coma',
        })
      }
    }
  })

type FormValues = z.infer<typeof EventTypeFormSchema>

function defaultForm(et?: EventTypeV2): FormValues {
  return {
    name: et?.name ?? '',
    slug: et?.slug ?? '',
    durationMin: String(et?.durationMin ?? 30) as unknown as number,
    kind: (et?.kind === 'group' ? 'group' : 'solo') as 'solo' | 'group',
    poolingType: et?.poolingType === 'collective' ? 'collective' : '',
    maxInvitees: String(et?.maxInvitees ?? 1) as unknown as number,
    color: et?.color ?? '#3b82f6',
    secret: et?.secret ?? false,
    isActive: et?.isActive ?? true,
    description: et?.description ?? '',
    locations: et?.locations ?? [],
    customQuestions: et?.customQuestions ?? [],
    startTimeIncrementMin: String(et?.startTimeIncrementMin ?? 30) as unknown as number,
    minBookingNoticeMin: String(et?.minBookingNoticeMin ?? 240) as unknown as number,
    bookingWindowType: (et?.bookingWindowType as 'rolling' | 'range' | 'unlimited') ?? 'rolling',
    bookingWindowDays: String(et?.bookingWindowDays ?? 60) as unknown as number,
    bookingWindowStart: et?.bookingWindowStart ?? '',
    bookingWindowEnd: et?.bookingWindowEnd ?? '',
    bufferBeforeMin: String(et?.bufferBeforeMin ?? 0) as unknown as number,
    bufferAfterMin: String(et?.bufferAfterMin ?? 0) as unknown as number,
    dailyLimit: (et?.dailyLimit != null ? String(et.dailyLimit) : '') as unknown as number,
    availabilityScheduleId: et?.availabilityScheduleId ?? '',
    hostIds: et?.hosts?.join(', ') ?? '',
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Genera un id sencillo para preguntas nuevas (sin dep. de crypto) */
function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

const LOCATION_LABELS: Record<string, string> = {
  video: 'Video (enlace online)',
  phone: 'Teléfono',
  in_person: 'Presencial',
  custom: 'Personalizado',
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4">{children}</div>
}

/** Mensaje de error de campo, ya vinculado por id para aria-describedby. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

interface Props {
  /** Datos iniciales para modo edición. Si no se pasa, el form crea uno nuevo. */
  initialData?: EventTypeV2
  onClose: () => void
}

export function EventTypeForm({ initialData, onClose }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)

  const create = useCreateEventTypeV2()
  const update = useUpdateEventTypeV2()
  const { data: schedules } = useSchedules()

  const isEditing = Boolean(initialData)

  const form = useForm<FormValues>({
    resolver: zodResolver(EventTypeFormSchema),
    defaultValues: defaultForm(initialData),
  })

  const {
    register,
    control,
    watch,
    setValue,
    handleSubmit,
    formState: { errors, isDirty, isSubmitting },
  } = form

  const {
    fields: questionFields,
    append: appendQuestion,
    remove: removeQuestionAt,
  } = useFieldArray({ control, name: 'customQuestions', keyName: '_key' })

  const kind = watch('kind')
  const poolingType = watch('poolingType')
  const locations = watch('locations')
  const bookingWindowType = watch('bookingWindowType')

  // Advierte al cerrar/recargar la pestaña con cambios sin guardar.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!isDirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  function requestClose() {
    if (isDirty) {
      setDiscardConfirmOpen(true)
      return
    }
    onClose()
  }

  // ── Locaciones ───────────────────────────────────────────────────────────

  function addLocation(type: (typeof locations)[number]['type']) {
    // No agregar duplicados del mismo tipo
    if (locations.some((l) => l.type === type)) return
    setValue('locations', [...locations, { type }], { shouldDirty: true })
  }

  function removeLocation(type: (typeof locations)[number]['type']) {
    setValue(
      'locations',
      locations.filter((l) => l.type !== type),
      { shouldDirty: true },
    )
  }

  function updateLocationValue(type: (typeof locations)[number]['type'], value: string) {
    setValue(
      'locations',
      locations.map((l) => (l.type === type ? { ...l, value } : l)),
      { shouldDirty: true },
    )
  }

  // Custom questions
  function addQuestion() {
    appendQuestion({ id: genId(), label: '', type: 'text', required: false })
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function onSubmit(values: FormValues): Promise<void> {
    setError(null)

    const hostIds =
      values.poolingType === 'collective'
        ? (values.hostIds ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined

    const payload = {
      name: values.name.trim(),
      slug: values.slug?.trim() || undefined,
      durationMin: values.durationMin,
      kind: values.poolingType === 'collective' ? ('solo' as const) : values.kind,
      poolingType: values.poolingType === 'collective' ? ('collective' as const) : undefined,
      maxInvitees: values.maxInvitees,
      color: values.color,
      secret: values.secret,
      isActive: values.isActive,
      description: values.description?.trim() || undefined,
      locations: values.locations,
      customQuestions: values.customQuestions.filter((q) => q.label.trim()),
      startTimeIncrementMin: values.startTimeIncrementMin,
      minBookingNoticeMin: values.minBookingNoticeMin,
      bookingWindowType: values.bookingWindowType,
      bookingWindowDays:
        values.bookingWindowType === 'rolling' ? (values.bookingWindowDays ?? 60) : undefined,
      bookingWindowStart:
        values.bookingWindowType === 'range' ? values.bookingWindowStart || null : null,
      bookingWindowEnd:
        values.bookingWindowType === 'range' ? values.bookingWindowEnd || null : null,
      bufferBeforeMin: values.bufferBeforeMin,
      bufferAfterMin: values.bufferAfterMin,
      dailyLimit: values.dailyLimit ?? null,
      availabilityScheduleId: values.availabilityScheduleId || null,
      hostIds,
    }

    try {
      if (isEditing && initialData) {
        await update.mutateAsync({ id: initialData.id, input: payload })
      } else {
        await create.mutateAsync(payload)
      }
      onClose()
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar el tipo de evento')
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <h3 className="text-base font-semibold">
            {isEditing ? 'Editar tipo de evento' : 'Nuevo tipo de evento'}
          </h3>
          <Button variant="ghost" size="icon" type="button" className="h-8 w-8" onClick={requestClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-4 pb-6">
          {/* ── Básicos ── */}
          <SectionDivider label="Información básica" />

          <FieldRow>
            <div className="space-y-1.5">
              <Label htmlFor="et-name">Nombre *</Label>
              <Input
                id="et-name"
                placeholder="Discovery call"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'et-name-error' : undefined}
                {...register('name')}
              />
              <FieldError id="et-name-error" message={errors.name?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="et-slug">
                Slug{' '}
                <span className="text-xs text-muted-foreground">(se genera automático)</span>
              </Label>
              <Input
                id="et-slug"
                placeholder="discovery-call"
                className="font-mono"
                {...register('slug')}
              />
            </div>
          </FieldRow>

          <FieldRow>
            <div className="space-y-1.5">
              <Label htmlFor="et-duration">Duración (minutos) *</Label>
              <Input
                id="et-duration"
                type="number"
                min={5}
                aria-invalid={!!errors.durationMin}
                aria-describedby={errors.durationMin ? 'et-duration-error' : undefined}
                {...register('durationMin')}
              />
              <FieldError id="et-duration-error" message={errors.durationMin?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="et-color">Color</Label>
              <Controller
                control={control}
                name="color"
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <input
                      id="et-color"
                      type="color"
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.value)}
                      className="h-9 w-14 cursor-pointer rounded-md border border-input bg-transparent p-1"
                    />
                    <Input
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.value)}
                      className="font-mono"
                      placeholder="#3b82f6"
                    />
                  </div>
                )}
              />
            </div>
          </FieldRow>

          <div className="space-y-1.5">
            <Label htmlFor="et-description">Descripción</Label>
            <Textarea
              id="et-description"
              placeholder="Una breve descripción para los invitados..."
              rows={2}
              {...register('description')}
            />
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Controller
                control={control}
                name="isActive"
                render={({ field }) => (
                  <Switch id="et-active" checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
              <Label htmlFor="et-active" className="cursor-pointer">
                Activo
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Controller
                control={control}
                name="secret"
                render={({ field }) => (
                  <Switch id="et-secret" checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
              <Label htmlFor="et-secret" className="cursor-pointer">
                Secreto{' '}
                <span className="text-xs text-muted-foreground">(no aparece en el portal)</span>
              </Label>
            </div>
          </div>

          {/* ── Tipo de evento ── */}
          <SectionDivider label="Tipo de evento" />

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Modalidad</Label>
              <div className="flex gap-2">
                {[
                  { value: '', label: '1:1 Individual' },
                  { value: 'group', label: 'Grupal' },
                  { value: 'collective', label: 'Colectivo' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      if (opt.value === 'collective') {
                        setValue('poolingType', 'collective', { shouldDirty: true })
                        setValue('kind', 'solo', { shouldDirty: true })
                      } else if (opt.value === 'group') {
                        setValue('poolingType', '', { shouldDirty: true })
                        setValue('kind', 'group', { shouldDirty: true })
                      } else {
                        setValue('poolingType', '', { shouldDirty: true })
                        setValue('kind', 'solo', { shouldDirty: true })
                      }
                    }}
                    className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                      (opt.value === 'collective' && poolingType === 'collective') ||
                      (opt.value === 'group' && kind === 'group' && poolingType !== 'collective') ||
                      (opt.value === '' && kind === 'solo' && poolingType !== 'collective')
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border bg-background text-foreground hover:bg-muted'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Para grupal: capacidad máxima */}
            {kind === 'group' && poolingType !== 'collective' && (
              <div className="max-w-xs space-y-1.5">
                <Label htmlFor="et-maxinvitees">Capacidad máxima</Label>
                <Input
                  id="et-maxinvitees"
                  type="number"
                  min={2}
                  aria-invalid={!!errors.maxInvitees}
                  aria-describedby={errors.maxInvitees ? 'et-maxinvitees-error' : undefined}
                  {...register('maxInvitees')}
                />
                <FieldError id="et-maxinvitees-error" message={errors.maxInvitees?.message} />
              </div>
            )}

            {/* Para colectivo: hostIds */}
            {poolingType === 'collective' && (
              <div className="space-y-1.5">
                <Label htmlFor="et-hostids">
                  IDs de hosts{' '}
                  <span className="text-xs text-muted-foreground">(separados por coma, mín. 2)</span>
                </Label>
                <Input
                  id="et-hostids"
                  placeholder="cuid1abc, cuid2def"
                  className="font-mono text-xs"
                  aria-invalid={!!errors.hostIds}
                  aria-describedby={errors.hostIds ? 'et-hostids-error' : undefined}
                  {...register('hostIds')}
                />
                <p className="text-xs text-muted-foreground">
                  Los IDs corresponden a los hub_user.id de los admins que participan en la reunión.
                </p>
                <FieldError id="et-hostids-error" message={errors.hostIds?.message} />
              </div>
            )}
          </div>

          {/* ── Locaciones ── */}
          <SectionDivider label="Locaciones" />

          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {(['video', 'phone', 'in_person', 'custom'] as const).map((type) => {
                const active = locations.some((l) => l.type === type)
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => (active ? removeLocation(type) : addLocation(type))}
                    className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                      active
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border bg-background text-foreground hover:bg-muted'
                    }`}
                  >
                    {LOCATION_LABELS[type]}
                  </button>
                )
              })}
            </div>

            {/* Campo de valor para locaciones que lo requieren */}
            {locations
              .filter((l) => l.type === 'custom' || l.type === 'in_person')
              .map((loc) => (
                <div key={loc.type} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {loc.type === 'custom' ? 'URL / instrucciones custom' : 'Dirección presencial'}
                  </Label>
                  <Input
                    value={loc.value ?? ''}
                    onChange={(e) => updateLocationValue(loc.type, e.target.value)}
                    placeholder={
                      loc.type === 'custom' ? 'https://meet.example.com/...' : 'Av. Siempre Viva 742'
                    }
                  />
                </div>
              ))}
          </div>

          {/* ── Límites de reserva ── */}
          <SectionDivider label="Límites de reserva" />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="et-increment">Incremento de slots (min)</Label>
              <Controller
                control={control}
                name="startTimeIncrementMin"
                render={({ field }) => (
                  <Select value={String(field.value)} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="et-increment"
                      aria-invalid={errors.startTimeIncrementMin ? true : undefined}
                      aria-describedby={errors.startTimeIncrementMin ? 'et-increment-error' : undefined}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[5, 10, 15, 20, 30, 45, 60].map((v) => (
                        <SelectItem key={v} value={String(v)}>
                          {v} min
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError id="et-increment-error" message={errors.startTimeIncrementMin?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="et-notice">Aviso mínimo (min)</Label>
              <Input
                id="et-notice"
                type="number"
                min={0}
                aria-invalid={!!errors.minBookingNoticeMin}
                aria-describedby={errors.minBookingNoticeMin ? 'et-notice-error' : undefined}
                {...register('minBookingNoticeMin')}
              />
              <FieldError id="et-notice-error" message={errors.minBookingNoticeMin?.message} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="et-buffer-before">Buffer antes (min)</Label>
              <Input
                id="et-buffer-before"
                type="number"
                min={0}
                aria-invalid={!!errors.bufferBeforeMin}
                aria-describedby={errors.bufferBeforeMin ? 'et-buffer-before-error' : undefined}
                {...register('bufferBeforeMin')}
              />
              <FieldError id="et-buffer-before-error" message={errors.bufferBeforeMin?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="et-buffer-after">Buffer después (min)</Label>
              <Input
                id="et-buffer-after"
                type="number"
                min={0}
                aria-invalid={!!errors.bufferAfterMin}
                aria-describedby={errors.bufferAfterMin ? 'et-buffer-after-error' : undefined}
                {...register('bufferAfterMin')}
              />
              <FieldError id="et-buffer-after-error" message={errors.bufferAfterMin?.message} />
            </div>
          </div>

          {/* Ventana de reserva */}
          <div className="space-y-2">
            <Label>Ventana de reserva</Label>
            <div className="flex gap-2">
              {[
                { value: 'rolling', label: 'Días desde hoy' },
                { value: 'range', label: 'Rango de fechas' },
                { value: 'unlimited', label: 'Sin límite' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    setValue('bookingWindowType', opt.value as FormValues['bookingWindowType'], {
                      shouldDirty: true,
                    })
                  }
                  className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                    bookingWindowType === opt.value
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-background text-foreground hover:bg-muted'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {bookingWindowType === 'rolling' && (
              <div className="max-w-xs space-y-1.5">
                <Label htmlFor="et-window-days">Días disponibles hacia adelante</Label>
                <Input
                  id="et-window-days"
                  type="number"
                  min={1}
                  aria-invalid={!!errors.bookingWindowDays}
                  aria-describedby={errors.bookingWindowDays ? 'et-window-days-error' : undefined}
                  {...register('bookingWindowDays')}
                />
                <FieldError id="et-window-days-error" message={errors.bookingWindowDays?.message} />
              </div>
            )}

            {bookingWindowType === 'range' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="et-window-start">Desde</Label>
                  <Input id="et-window-start" type="date" {...register('bookingWindowStart')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="et-window-end">Hasta</Label>
                  <Input id="et-window-end" type="date" {...register('bookingWindowEnd')} />
                </div>
              </div>
            )}
          </div>

          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="et-daily-limit">
              Límite diario de reservas{' '}
              <span className="text-xs text-muted-foreground">(vacío = sin límite)</span>
            </Label>
            <Input
              id="et-daily-limit"
              type="number"
              min={1}
              placeholder="Sin límite"
              aria-invalid={!!errors.dailyLimit}
              aria-describedby={errors.dailyLimit ? 'et-daily-limit-error' : undefined}
              {...register('dailyLimit')}
            />
            <FieldError id="et-daily-limit-error" message={errors.dailyLimit?.message} />
          </div>

          {/* ── Schedule de disponibilidad ── */}
          <SectionDivider label="Horario de disponibilidad" />

          <div className="space-y-1.5">
            <Label htmlFor="et-schedule">Schedule asignado</Label>
            <Controller
              control={control}
              name="availabilityScheduleId"
              render={({ field }) => (
                <Select
                  value={field.value || '__default__'}
                  onValueChange={(v) => field.onChange(v === '__default__' ? '' : v)}
                >
                  <SelectTrigger id="et-schedule">
                    <SelectValue placeholder="Schedule default del host" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">Schedule default del host</SelectItem>
                    {(schedules ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                        {s.isDefault && ' (default)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-xs text-muted-foreground">
              Si no se selecciona, se usa el schedule marcado como default del host.
            </p>
          </div>

          {/* ── Preguntas personalizadas ── */}
          <SectionDivider label="Preguntas del formulario de reserva" />

          <div className="space-y-2">
            {questionFields.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Sin preguntas adicionales. Los invitados solo proveen nombre y email.
              </p>
            )}

            {questionFields.map((qField, idx) => {
              const qType = watch(`customQuestions.${idx}.type`)
              return (
                <div key={qField._key} className="flex items-start gap-2 rounded-md border p-3">
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        {...register(`customQuestions.${idx}.label`)}
                        placeholder={`Pregunta ${idx + 1}`}
                        className="flex-1"
                      />
                      <Controller
                        control={control}
                        name={`customQuestions.${idx}.type`}
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger className="w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">Texto corto</SelectItem>
                              <SelectItem value="textarea">Texto largo</SelectItem>
                              <SelectItem value="phone">Teléfono</SelectItem>
                              <SelectItem value="select">Selección</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Controller
                        control={control}
                        name={`customQuestions.${idx}.required`}
                        render={({ field }) => (
                          <Switch
                            id={`q-required-${qField._key}`}
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        )}
                      />
                      <Label htmlFor={`q-required-${qField._key}`} className="cursor-pointer text-xs">
                        Obligatoria
                      </Label>
                    </div>
                    {/* Para preguntas de tipo 'select': opciones separadas por coma */}
                    {qType === 'select' && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          Opciones (separadas por coma)
                        </Label>
                        <Controller
                          control={control}
                          name={`customQuestions.${idx}.options`}
                          render={({ field }) => (
                            <Input
                              value={(field.value ?? []).join(', ')}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value
                                    .split(',')
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                )
                              }
                              placeholder="Opción A, Opción B, Opción C"
                            />
                          )}
                        />
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="mt-0.5 h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeQuestionAt(idx)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            })}

            <Button variant="outline" size="sm" type="button" onClick={addQuestion} className="w-full">
              <Plus className="mr-1 h-4 w-4" />
              Agregar pregunta
            </Button>
          </div>

          {/* ── Error y acciones ── */}
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={requestClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear tipo'}
            </Button>
          </div>
        </CardContent>
      </form>

      <ConfirmDialog
        open={discardConfirmOpen}
        onOpenChange={setDiscardConfirmOpen}
        title="¿Descartar los cambios?"
        description="Vas a perder los cambios que no guardaste en este tipo de evento."
        confirmLabel="Descartar"
        destructive
        onConfirm={() => {
          setDiscardConfirmOpen(false)
          onClose()
        }}
      />
    </Card>
  )
}
