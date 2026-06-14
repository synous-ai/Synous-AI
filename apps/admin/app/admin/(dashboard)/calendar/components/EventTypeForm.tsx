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
 * No usa react-hook-form (estado local para evitar dependencia extra en esta iteración).
 */

import { useState } from 'react'
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
import { useCreateEventTypeV2, useUpdateEventTypeV2, useSchedules } from '@/lib/hooks'
import type { EventTypeV2, CustomQuestion, MeetingLocation } from '@/lib/types'

// ── Tipos internos del formulario ────────────────────────────────────────────

interface FormState {
  name: string
  slug: string
  durationMin: string
  kind: 'solo' | 'group'
  poolingType: '' | 'collective'
  maxInvitees: string
  color: string
  secret: boolean
  isActive: boolean
  description: string
  locations: MeetingLocation[]
  customQuestions: CustomQuestion[]
  startTimeIncrementMin: string
  minBookingNoticeMin: string
  bookingWindowType: 'rolling' | 'range' | 'unlimited'
  bookingWindowDays: string
  bookingWindowStart: string
  bookingWindowEnd: string
  bufferBeforeMin: string
  bufferAfterMin: string
  dailyLimit: string
  availabilityScheduleId: string
  hostIds: string // IDs separados por coma (para collective — simplificado)
}

function defaultForm(et?: EventTypeV2): FormState {
  return {
    name: et?.name ?? '',
    slug: et?.slug ?? '',
    durationMin: String(et?.durationMin ?? 30),
    kind: (et?.kind === 'group' ? 'group' : 'solo') as 'solo' | 'group',
    poolingType: et?.poolingType === 'collective' ? 'collective' : '',
    maxInvitees: String(et?.maxInvitees ?? 1),
    color: et?.color ?? '#3b82f6',
    secret: et?.secret ?? false,
    isActive: et?.isActive ?? true,
    description: et?.description ?? '',
    locations: et?.locations ?? [],
    customQuestions: et?.customQuestions ?? [],
    startTimeIncrementMin: String(et?.startTimeIncrementMin ?? 30),
    minBookingNoticeMin: String(et?.minBookingNoticeMin ?? 240),
    bookingWindowType: (et?.bookingWindowType as 'rolling' | 'range' | 'unlimited') ?? 'rolling',
    bookingWindowDays: String(et?.bookingWindowDays ?? 60),
    bookingWindowStart: et?.bookingWindowStart ?? '',
    bookingWindowEnd: et?.bookingWindowEnd ?? '',
    bufferBeforeMin: String(et?.bufferBeforeMin ?? 0),
    bufferAfterMin: String(et?.bufferAfterMin ?? 0),
    dailyLimit: String(et?.dailyLimit ?? ''),
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

// ── Componente principal ──────────────────────────────────────────────────────

interface Props {
  /** Datos iniciales para modo edición. Si no se pasa, el form crea uno nuevo. */
  initialData?: EventTypeV2
  onClose: () => void
}

export function EventTypeForm({ initialData, onClose }: Props) {
  const [form, setForm] = useState<FormState>(() => defaultForm(initialData))
  const [error, setError] = useState<string | null>(null)

  const create = useCreateEventTypeV2()
  const update = useUpdateEventTypeV2()
  const { data: schedules } = useSchedules()

  const isEditing = Boolean(initialData)
  const isPending = create.isPending || update.isPending

  // ── Actualizadores de estado ────────────────────────────────────────────────

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // Locaciones
  function addLocation(type: MeetingLocation['type']) {
    // No agregar duplicados del mismo tipo
    if (form.locations.some((l) => l.type === type)) return
    set('locations', [...form.locations, { type }])
  }

  function removeLocation(type: MeetingLocation['type']) {
    set('locations', form.locations.filter((l) => l.type !== type))
  }

  function updateLocationValue(type: MeetingLocation['type'], value: string) {
    set(
      'locations',
      form.locations.map((l) => (l.type === type ? { ...l, value } : l)),
    )
  }

  // Custom questions
  function addQuestion() {
    set('customQuestions', [
      ...form.customQuestions,
      { id: genId(), label: '', type: 'text', required: false },
    ])
  }

  function removeQuestion(id: string) {
    set('customQuestions', form.customQuestions.filter((q) => q.id !== id))
  }

  function updateQuestion<K extends keyof CustomQuestion>(
    id: string,
    key: K,
    value: CustomQuestion[K],
  ) {
    set(
      'customQuestions',
      form.customQuestions.map((q) => (q.id === id ? { ...q, [key]: value } : q)),
    )
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setError(null)

    // Validación básica del lado del cliente
    if (!form.name.trim()) return setError('El nombre es requerido')
    const dur = Number(form.durationMin)
    if (!dur || dur <= 0) return setError('La duración debe ser un número positivo')

    // Construir el payload
    const hostIds =
      form.poolingType === 'collective'
        ? form.hostIds
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined

    if (form.poolingType === 'collective' && (!hostIds || hostIds.length < 2)) {
      return setError('Los eventos colectivos requieren al menos 2 hostIds separados por coma')
    }

    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim() || undefined,
      durationMin: dur,
      kind: form.poolingType === 'collective' ? ('solo' as const) : form.kind,
      poolingType: form.poolingType === 'collective' ? ('collective' as const) : undefined,
      maxInvitees: Number(form.maxInvitees) || 1,
      color: form.color,
      secret: form.secret,
      isActive: form.isActive,
      description: form.description.trim() || undefined,
      locations: form.locations,
      customQuestions: form.customQuestions.filter((q) => q.label.trim()),
      startTimeIncrementMin: Number(form.startTimeIncrementMin) || 30,
      minBookingNoticeMin: Number(form.minBookingNoticeMin) || 240,
      bookingWindowType: form.bookingWindowType,
      bookingWindowDays:
        form.bookingWindowType === 'rolling' ? Number(form.bookingWindowDays) || 60 : undefined,
      bookingWindowStart:
        form.bookingWindowType === 'range' ? form.bookingWindowStart || null : null,
      bookingWindowEnd:
        form.bookingWindowType === 'range' ? form.bookingWindowEnd || null : null,
      bufferBeforeMin: Number(form.bufferBeforeMin) || 0,
      bufferAfterMin: Number(form.bufferAfterMin) || 0,
      dailyLimit: form.dailyLimit ? Number(form.dailyLimit) : null,
      availabilityScheduleId: form.availabilityScheduleId || null,
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
      const msg = err instanceof Error ? err.message : 'Error al guardar el tipo de evento'
      setError(msg)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <h3 className="text-base font-semibold">
          {isEditing ? 'Editar tipo de evento' : 'Nuevo tipo de evento'}
        </h3>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
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
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Discovery call"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="et-slug">
              Slug{' '}
              <span className="text-xs text-muted-foreground">(se genera automático)</span>
            </Label>
            <Input
              id="et-slug"
              value={form.slug}
              onChange={(e) => set('slug', e.target.value)}
              placeholder="discovery-call"
              className="font-mono"
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
              value={form.durationMin}
              onChange={(e) => set('durationMin', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="et-color">Color</Label>
            <div className="flex items-center gap-2">
              <input
                id="et-color"
                type="color"
                value={form.color}
                onChange={(e) => set('color', e.target.value)}
                className="h-9 w-14 cursor-pointer rounded-md border border-input bg-transparent p-1"
              />
              <Input
                value={form.color}
                onChange={(e) => set('color', e.target.value)}
                className="font-mono"
                placeholder="#3b82f6"
              />
            </div>
          </div>
        </FieldRow>

        <div className="space-y-1.5">
          <Label htmlFor="et-description">Descripción</Label>
          <Textarea
            id="et-description"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Una breve descripción para los invitados..."
            rows={2}
          />
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Switch
              id="et-active"
              checked={form.isActive}
              onCheckedChange={(v) => set('isActive', v)}
            />
            <Label htmlFor="et-active" className="cursor-pointer">
              Activo
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="et-secret"
              checked={form.secret}
              onCheckedChange={(v) => set('secret', v)}
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
                      set('poolingType', 'collective')
                      set('kind', 'solo')
                    } else if (opt.value === 'group') {
                      set('poolingType', '')
                      set('kind', 'group')
                    } else {
                      set('poolingType', '')
                      set('kind', 'solo')
                    }
                  }}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                    (opt.value === 'collective' && form.poolingType === 'collective') ||
                    (opt.value === 'group' &&
                      form.kind === 'group' &&
                      form.poolingType !== 'collective') ||
                    (opt.value === '' &&
                      form.kind === 'solo' &&
                      form.poolingType !== 'collective')
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
          {form.kind === 'group' && form.poolingType !== 'collective' && (
            <div className="max-w-xs space-y-1.5">
              <Label htmlFor="et-maxinvitees">Capacidad máxima</Label>
              <Input
                id="et-maxinvitees"
                type="number"
                min={2}
                value={form.maxInvitees}
                onChange={(e) => set('maxInvitees', e.target.value)}
              />
            </div>
          )}

          {/* Para colectivo: hostIds */}
          {form.poolingType === 'collective' && (
            <div className="space-y-1.5">
              <Label htmlFor="et-hostids">
                IDs de hosts{' '}
                <span className="text-xs text-muted-foreground">(separados por coma, mín. 2)</span>
              </Label>
              <Input
                id="et-hostids"
                value={form.hostIds}
                onChange={(e) => set('hostIds', e.target.value)}
                placeholder="cuid1abc, cuid2def"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Los IDs corresponden a los hub_user.id de los admins que participan en la reunión.
              </p>
            </div>
          )}
        </div>

        {/* ── Locaciones ── */}
        <SectionDivider label="Locaciones" />

        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {(['video', 'phone', 'in_person', 'custom'] as const).map((type) => {
              const active = form.locations.some((l) => l.type === type)
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
          {form.locations
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
            <Select
              value={form.startTimeIncrementMin}
              onValueChange={(v) => set('startTimeIncrementMin', v)}
            >
              <SelectTrigger id="et-increment">
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
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="et-notice">Aviso mínimo (min)</Label>
            <Input
              id="et-notice"
              type="number"
              min={0}
              value={form.minBookingNoticeMin}
              onChange={(e) => set('minBookingNoticeMin', e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="et-buffer-before">Buffer antes (min)</Label>
            <Input
              id="et-buffer-before"
              type="number"
              min={0}
              value={form.bufferBeforeMin}
              onChange={(e) => set('bufferBeforeMin', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="et-buffer-after">Buffer después (min)</Label>
            <Input
              id="et-buffer-after"
              type="number"
              min={0}
              value={form.bufferAfterMin}
              onChange={(e) => set('bufferAfterMin', e.target.value)}
            />
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
                onClick={() => set('bookingWindowType', opt.value as FormState['bookingWindowType'])}
                className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                  form.bookingWindowType === opt.value
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-background text-foreground hover:bg-muted'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {form.bookingWindowType === 'rolling' && (
            <div className="max-w-xs space-y-1.5">
              <Label htmlFor="et-window-days">Días disponibles hacia adelante</Label>
              <Input
                id="et-window-days"
                type="number"
                min={1}
                value={form.bookingWindowDays}
                onChange={(e) => set('bookingWindowDays', e.target.value)}
              />
            </div>
          )}

          {form.bookingWindowType === 'range' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="et-window-start">Desde</Label>
                <Input
                  id="et-window-start"
                  type="date"
                  value={form.bookingWindowStart}
                  onChange={(e) => set('bookingWindowStart', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="et-window-end">Hasta</Label>
                <Input
                  id="et-window-end"
                  type="date"
                  value={form.bookingWindowEnd}
                  onChange={(e) => set('bookingWindowEnd', e.target.value)}
                />
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
            value={form.dailyLimit}
            onChange={(e) => set('dailyLimit', e.target.value)}
            placeholder="Sin límite"
          />
        </div>

        {/* ── Schedule de disponibilidad ── */}
        <SectionDivider label="Horario de disponibilidad" />

        <div className="space-y-1.5">
          <Label htmlFor="et-schedule">Schedule asignado</Label>
          <Select
            value={form.availabilityScheduleId || '__default__'}
            onValueChange={(v) => set('availabilityScheduleId', v === '__default__' ? '' : v)}
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
          <p className="text-xs text-muted-foreground">
            Si no se selecciona, se usa el schedule marcado como default del host.
          </p>
        </div>

        {/* ── Preguntas personalizadas ── */}
        <SectionDivider label="Preguntas del formulario de reserva" />

        <div className="space-y-2">
          {form.customQuestions.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Sin preguntas adicionales. Los invitados solo proveen nombre y email.
            </p>
          )}

          {form.customQuestions.map((q, idx) => (
            <div key={q.id} className="flex items-start gap-2 rounded-md border p-3">
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={q.label}
                    onChange={(e) => updateQuestion(q.id, 'label', e.target.value)}
                    placeholder={`Pregunta ${idx + 1}`}
                    className="flex-1"
                  />
                  <Select
                    value={q.type}
                    onValueChange={(v) => updateQuestion(q.id, 'type', v as CustomQuestion['type'])}
                  >
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
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id={`q-required-${q.id}`}
                    checked={q.required}
                    onCheckedChange={(v) => updateQuestion(q.id, 'required', v)}
                  />
                  <Label htmlFor={`q-required-${q.id}`} className="cursor-pointer text-xs">
                    Obligatoria
                  </Label>
                </div>
                {/* Para preguntas de tipo 'select': opciones separadas por coma */}
                {q.type === 'select' && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Opciones (separadas por coma)
                    </Label>
                    <Input
                      value={q.options?.join(', ') ?? ''}
                      onChange={(e) =>
                        updateQuestion(
                          q.id,
                          'options',
                          e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        )
                      }
                      placeholder="Opción A, Opción B, Opción C"
                    />
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="mt-0.5 h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => removeQuestion(q.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            onClick={addQuestion}
            className="w-full"
          >
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
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear tipo'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
