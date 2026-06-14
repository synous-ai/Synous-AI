'use client'

/**
 * Página pública de reserva de reunión (invitee-facing).
 *
 * URL: /book/:portalId/:slug — PÚBLICA, NO requiere Clerk (solo /admin/* está
 * protegido por el middleware). El middleware actual solo intercepta /admin/*;
 * /book/* pasa sin auth de Clerk.
 *
 * Flujo:
 *  1. Carga metadata del event type vía GET /api/public/calendar/:portalId/:slug.
 *  2. Detecta timezone del invitee con Intl (con selector para cambiarlo).
 *  3. Muestra calendario mensual navegable; al elegir día pide slots a la API.
 *  4. Al elegir slot muestra form de datos: nombre, email, guests, custom questions.
 *  5. Confirma (POST .../book) → pantalla de éxito con links cancel/reschedule.
 *
 * Estética: limpia y profesional, tonos neutros. Sin dark forzado.
 */

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Clock, MapPin, Globe, CheckCircle2, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { API_URL } from '@nous/shared'

// ---------------------------------------------------------------------------
// Tipos locales (no requieren auth del admin — solo datos públicos)
// ---------------------------------------------------------------------------

interface CustomQuestion {
  id: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'phone'
  required: boolean
  options?: string[]
}

interface MeetingLocation {
  type: 'video' | 'phone' | 'in_person' | 'custom'
  value?: string
}

interface EventTypeMeta {
  id: string
  slug: string
  name: string
  durationMin: number
  description: string | null
  color: string
  locations: MeetingLocation[]
  customQuestions: CustomQuestion[]
  hosts?: string[]
}

interface Slot {
  startUtc: string
  endUtc: string
  startLocal: string
}

interface BookingResult {
  booking: {
    id: string
    guestName: string
    guestEmail: string
    startsAt: string
    endsAt: string
  }
  cancelUrl: string
  rescheduleUrl: string
}

// ---------------------------------------------------------------------------
// Zonas horarias comunes para el selector
// ---------------------------------------------------------------------------

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Buenos_Aires',
  'America/Sao_Paulo',
  'America/Mexico_City',
  'Europe/Madrid',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Rome',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
]

// ---------------------------------------------------------------------------
// Helpers de fecha
// ---------------------------------------------------------------------------

/** Formatea una fecha ISO UTC al timezone dado, mostrando fecha + hora. */
function formatInTz(isoUtc: string, tz: string, opts?: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat('es', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
      ...opts,
    }).format(new Date(isoUtc))
  } catch {
    return isoUtc
  }
}

/** Formatea solo la hora en un timezone. */
function formatTimeInTz(isoUtc: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('es', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(isoUtc))
  } catch {
    return isoUtc
  }
}

/** Devuelve YYYY-MM-DD de un objeto Date en el TZ local del invitee. */
function toLocalDate(date: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const y = parts.find((p) => p.type === 'year')?.value ?? ''
    const m = parts.find((p) => p.type === 'month')?.value ?? ''
    const d = parts.find((p) => p.type === 'day')?.value ?? ''
    return `${y}-${m}-${d}`
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

/** Obtiene YYYY-MM para el mes de una fecha. */
function toYearMonth(date: Date, tz: string): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date)
  return {
    year: Number(parts.find((p) => p.type === 'year')?.value ?? 0),
    month: Number(parts.find((p) => p.type === 'month')?.value ?? 0),
  }
}

/** Genera los días del mes para mostrar en el calendario. */
function getMonthDays(year: number, month: number): Date[] {
  const days: Date[] = []
  // month es 1-indexed
  const daysInMonth = new Date(year, month, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month - 1, d))
  }
  return days
}

/** Día de semana del primer día del mes (0=dom…6=sáb). */
function firstDayOfWeek(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay()
}

// ---------------------------------------------------------------------------
// Fetchers públicos (sin auth)
// ---------------------------------------------------------------------------

async function fetchEventMeta(portalId: string, slug: string): Promise<EventTypeMeta> {
  const res = await fetch(`${API_URL}/api/public/calendar/${portalId}/${slug}`)
  if (!res.ok) throw new Error(`No se pudo cargar el tipo de evento (${res.status})`)
  const json = await res.json() as { data: EventTypeMeta }
  return json.data
}

async function fetchSlots(
  portalId: string,
  slug: string,
  from: string,
  to: string,
  tz: string,
): Promise<Slot[]> {
  const params = new URLSearchParams({ from, to, tz })
  const res = await fetch(`${API_URL}/api/public/calendar/${portalId}/${slug}/slots?${params}`)
  if (!res.ok) return []
  const json = await res.json() as { data: { slots: Slot[] } }
  return json.data.slots ?? []
}

async function postBooking(
  portalId: string,
  slug: string,
  body: Record<string, unknown>,
): Promise<BookingResult> {
  const res = await fetch(`${API_URL}/api/public/calendar/${portalId}/${slug}/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json() as { data?: BookingResult; error?: { message: string } }
  if (!res.ok) throw new Error(json.error?.message ?? 'Error al reservar')
  return json.data!
}

// ---------------------------------------------------------------------------
// Componente de localización del tipo (icono de locación)
// ---------------------------------------------------------------------------

function locationLabel(loc: MeetingLocation): string {
  switch (loc.type) {
    case 'video': return loc.value ? `Video: ${loc.value}` : 'Videollamada'
    case 'phone': return loc.value ? `Teléfono: ${loc.value}` : 'Llamada telefónica'
    case 'in_person': return loc.value ? `Presencial: ${loc.value}` : 'Presencial'
    case 'custom': return loc.value ?? 'Otro'
  }
}

// ---------------------------------------------------------------------------
// Pantalla de éxito
// ---------------------------------------------------------------------------

function SuccessScreen({
  result,
  eventName,
  inviteeTz,
}: {
  result: BookingResult
  eventName: string
  inviteeTz: string
}) {
  // cancelUrl y rescheduleUrl vienen del API con la base del frontend ya incluida.
  // Extraemos solo el path + query para hacer links relativos (evitar problemas de
  // dominio en dev donde API = :3001 y frontend = :3000).
  function toRelativePath(url: string): string {
    try {
      const parsed = new URL(url)
      return parsed.pathname + parsed.search
    } catch {
      return url
    }
  }

  const cancelPath = toRelativePath(result.cancelUrl)
  const reschedulePath = toRelativePath(result.rescheduleUrl)

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg text-center">
        <div className="mb-4 flex justify-center">
          <CheckCircle2 className="h-16 w-16 text-green-500" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-gray-900">¡Reserva confirmada!</h1>
        <p className="mb-1 text-gray-600 font-medium">{eventName}</p>
        <p className="mb-6 text-gray-500 text-sm">
          {formatInTz(result.booking.startsAt, inviteeTz)}
        </p>
        <p className="mb-6 text-sm text-gray-500">
          Recibirás un email de confirmación con todos los detalles.
        </p>
        <div className="flex flex-col gap-2">
          <a
            href={cancelPath}
            className="text-sm text-gray-400 hover:text-gray-600 underline"
          >
            Cancelar reserva
          </a>
          <a
            href={reschedulePath}
            className="text-sm text-gray-400 hover:text-gray-600 underline"
          >
            Reprogramar
          </a>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function BookingPage({
  params,
}: {
  params: { portalId: string; slug: string }
}) {
  const { portalId, slug } = params

  // Estado de carga de metadata
  const [meta, setMeta] = useState<EventTypeMeta | null>(null)
  const [metaError, setMetaError] = useState<string | null>(null)

  // Timezone del invitee: detectado con Intl, modificable por el usuario
  const [inviteeTz, setInviteeTz] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      return 'UTC'
    }
  })

  // Navegación del calendario
  const [currentMonth, setCurrentMonth] = useState<{ year: number; month: number }>(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  })
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  // Slots del día seleccionado
  const [slots, setSlots] = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)

  // Formulario de datos del invitee
  const [form, setForm] = useState<Record<string, string>>({
    name: '',
    email: '',
    guests: '',
  })
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<BookingResult | null>(null)

  // Cargar metadata del event type
  useEffect(() => {
    fetchEventMeta(portalId, slug)
      .then(setMeta)
      .catch((e: unknown) =>
        setMetaError(e instanceof Error ? e.message : 'No se pudo cargar el evento'),
      )
  }, [portalId, slug])

  // Cargar slots cuando cambia el día seleccionado o el timezone
  useEffect(() => {
    if (!selectedDay) return
    setLoadingSlots(true)
    setSlots([])
    setSelectedSlot(null)
    fetchSlots(portalId, slug, selectedDay, selectedDay, inviteeTz)
      .then((s) => setSlots(s))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false))
  }, [portalId, slug, selectedDay, inviteeTz])

  // Navegar el mes
  const prevMonth = useCallback(() => {
    setCurrentMonth(({ year, month }) => {
      if (month === 1) return { year: year - 1, month: 12 }
      return { year, month: month - 1 }
    })
    setSelectedDay(null)
    setSelectedSlot(null)
  }, [])

  const nextMonth = useCallback(() => {
    setCurrentMonth(({ year, month }) => {
      if (month === 12) return { year: year + 1, month: 1 }
      return { year, month: month + 1 }
    })
    setSelectedDay(null)
    setSelectedSlot(null)
  }, [])

  // Determinar si un día está en el pasado (relativo al TZ del invitee)
  const todayStr = toLocalDate(new Date(), inviteeTz)
  function isDayPast(day: Date): boolean {
    const dayStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    return dayStr < todayStr
  }
  function dayStr(day: Date): string {
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
  }

  // Enviar booking
  async function handleBook() {
    if (!selectedSlot || !meta) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const answersArr = Object.entries(answers).map(([id, value]) => ({ id, value }))
      const guestEmails = form.guests
        ? form.guests
            .split(',')
            .map((g) => g.trim())
            .filter(Boolean)
        : []

      const res = await postBooking(portalId, slug, {
        slotStart: selectedSlot.startUtc,
        inviteeName: form.name,
        inviteeEmail: form.email,
        inviteeTimeZone: inviteeTz,
        guestEmails,
        answers: answersArr,
      })
      setResult(res)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Error al confirmar la reserva')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Pantalla de éxito ────────────────────────────────────────────────────
  if (result && meta) {
    return <SuccessScreen result={result} eventName={meta.name} inviteeTz={inviteeTz} />
  }

  // ── Estado de carga / error de metadata ─────────────────────────────────
  if (metaError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="rounded-2xl bg-white p-8 shadow text-center max-w-sm w-full">
          <p className="text-red-600 font-medium">No se pudo cargar este evento</p>
          <p className="mt-2 text-sm text-gray-500">{metaError}</p>
        </div>
      </div>
    )
  }

  if (!meta) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  const { year, month } = currentMonth
  const days = getMonthDays(year, month)
  const firstDay = firstDayOfWeek(year, month)
  const monthName = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1),
  )

  // ── Layout principal ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[320px_1fr]">

          {/* ── Panel izquierdo: info del evento ── */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            {/* Color indicator + nombre */}
            <div className="mb-1 flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: meta.color ?? '#3b82f6' }}
              />
              <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
                Reservá una reunión
              </span>
            </div>
            <h1 className="mb-3 text-2xl font-bold text-gray-900 leading-tight">{meta.name}</h1>

            {/* Duración */}
            <div className="flex items-center gap-2 mb-2 text-gray-600">
              <Clock className="h-4 w-4" />
              <span className="text-sm">{meta.durationMin} minutos</span>
            </div>

            {/* Locaciones */}
            {meta.locations.length > 0 && (
              <div className="flex flex-col gap-1 mb-4">
                {meta.locations.map((loc, i) => (
                  <div key={i} className="flex items-start gap-2 text-gray-600">
                    <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{locationLabel(loc)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Descripción */}
            {meta.description && (
              <p className="mb-4 text-sm text-gray-500 leading-relaxed">{meta.description}</p>
            )}

            {/* Selector de timezone */}
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-2 text-gray-500">
                <Globe className="h-4 w-4" />
                <span className="text-xs font-medium">Tu zona horaria</span>
              </div>
              <Select value={inviteeTz} onValueChange={setInviteeTz}>
                <SelectTrigger className="w-full text-sm h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz} className="text-sm">
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Panel derecho: calendario + slots + form ── */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">

            {!selectedSlot ? (
              <>
                {/* Calendario mensual */}
                <div className="mb-6">
                  <div className="mb-4 flex items-center justify-between">
                    <button
                      onClick={prevMonth}
                      className="rounded-full p-1.5 hover:bg-gray-100 transition-colors"
                    >
                      <ChevronLeft className="h-5 w-5 text-gray-600" />
                    </button>
                    <span className="text-sm font-semibold capitalize text-gray-800">{monthName}</span>
                    <button
                      onClick={nextMonth}
                      className="rounded-full p-1.5 hover:bg-gray-100 transition-colors"
                    >
                      <ChevronRight className="h-5 w-5 text-gray-600" />
                    </button>
                  </div>

                  {/* Encabezado de días */}
                  <div className="grid grid-cols-7 mb-1">
                    {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((d) => (
                      <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* Días del mes */}
                  <div className="grid grid-cols-7 gap-1">
                    {/* Espacios vacíos antes del primer día */}
                    {Array.from({ length: firstDay }).map((_, i) => (
                      <div key={`empty-${i}`} />
                    ))}
                    {days.map((day) => {
                      const ds = dayStr(day)
                      const past = isDayPast(day)
                      const selected = ds === selectedDay
                      return (
                        <button
                          key={ds}
                          disabled={past}
                          onClick={() => setSelectedDay(ds)}
                          className={[
                            'aspect-square rounded-full text-sm font-medium transition-colors',
                            past
                              ? 'cursor-not-allowed text-gray-300'
                              : selected
                              ? 'text-white'
                              : 'hover:bg-gray-100 text-gray-700',
                          ].join(' ')}
                          style={
                            selected
                              ? { backgroundColor: meta.color ?? '#3b82f6' }
                              : undefined
                          }
                        >
                          {day.getDate()}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Slots del día seleccionado */}
                {selectedDay && (
                  <div>
                    <h2 className="mb-3 text-sm font-semibold text-gray-700">
                      Horarios disponibles —{' '}
                      {new Intl.DateTimeFormat('es', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        timeZone: inviteeTz,
                      }).format(new Date(selectedDay + 'T12:00:00Z'))}
                    </h2>
                    {loadingSlots ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                      </div>
                    ) : slots.length === 0 ? (
                      <p className="text-center py-6 text-sm text-gray-400">
                        No hay horarios disponibles para este día.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {slots.map((slot) => (
                          <button
                            key={slot.startUtc}
                            onClick={() => setSelectedSlot(slot)}
                            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-transparent hover:text-white"
                            style={{ '--hover-bg': meta.color ?? '#3b82f6' } as React.CSSProperties}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = meta.color ?? '#3b82f6'
                              e.currentTarget.style.color = 'white'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = ''
                              e.currentTarget.style.color = ''
                            }}
                          >
                            {formatTimeInTz(slot.startUtc, inviteeTz)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!selectedDay && (
                  <p className="text-center py-6 text-sm text-gray-400">
                    Seleccioná un día para ver los horarios disponibles.
                  </p>
                )}
              </>
            ) : (
              /* ── Formulario de booking ── */
              <div>
                {/* Slot seleccionado + botón volver */}
                <div className="mb-6 flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">
                      Horario seleccionado
                    </p>
                    <p className="font-semibold text-gray-900">
                      {formatInTz(selectedSlot.startUtc, inviteeTz, {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZoneName: 'short',
                      })}
                    </p>
                  </div>
                  <button
                    onClick={() => { setSelectedSlot(null); setSubmitError(null) }}
                    className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
                    aria-label="Cambiar horario"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Nombre */}
                  <div>
                    <Label htmlFor="name" className="text-sm font-medium">
                      Nombre <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Tu nombre completo"
                      className="mt-1"
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <Label htmlFor="email" className="text-sm font-medium">
                      Email <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="tu@email.com"
                      className="mt-1"
                    />
                  </div>

                  {/* Guests */}
                  <div>
                    <Label htmlFor="guests" className="text-sm font-medium text-gray-700">
                      Invitados adicionales{' '}
                      <span className="text-gray-400 font-normal">(opcional)</span>
                    </Label>
                    <Input
                      id="guests"
                      value={form.guests}
                      onChange={(e) => setForm((f) => ({ ...f, guests: e.target.value }))}
                      placeholder="email1@x.com, email2@x.com"
                      className="mt-1"
                    />
                  </div>

                  {/* Custom questions */}
                  {meta.customQuestions.map((q) => (
                    <div key={q.id}>
                      <Label htmlFor={`q-${q.id}`} className="text-sm font-medium">
                        {q.label}
                        {q.required && <span className="text-red-500 ml-1">*</span>}
                      </Label>
                      {q.type === 'textarea' ? (
                        <Textarea
                          id={`q-${q.id}`}
                          value={answers[q.id] ?? ''}
                          onChange={(e) =>
                            setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                          }
                          className="mt-1"
                          rows={3}
                        />
                      ) : q.type === 'select' && q.options ? (
                        <Select
                          value={answers[q.id] ?? ''}
                          onValueChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
                        >
                          <SelectTrigger className="mt-1 w-full">
                            <SelectValue placeholder="Seleccioná una opción" />
                          </SelectTrigger>
                          <SelectContent>
                            {q.options.map((o) => (
                              <SelectItem key={o} value={o}>
                                {o}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id={`q-${q.id}`}
                          type={q.type === 'phone' ? 'tel' : 'text'}
                          value={answers[q.id] ?? ''}
                          onChange={(e) =>
                            setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                          }
                          className="mt-1"
                        />
                      )}
                    </div>
                  ))}

                  {/* Error */}
                  {submitError && (
                    <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                      {submitError}
                    </p>
                  )}

                  {/* CTA */}
                  <Button
                    onClick={handleBook}
                    disabled={submitting || !(form['name'] ?? '').trim() || !(form['email'] ?? '').trim()}
                    className="w-full"
                    style={{
                      backgroundColor: meta.color ?? '#3b82f6',
                      borderColor: meta.color ?? '#3b82f6',
                    }}
                  >
                    {submitting ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Confirmando...</>
                    ) : (
                      'Confirmar reserva'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
