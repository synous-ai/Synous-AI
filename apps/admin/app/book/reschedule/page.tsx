'use client'

/**
 * Página pública de reprogramación de booking (invitee-facing).
 *
 * URL: /book/reschedule?token=JWT — PÚBLICA, sin auth de Clerk.
 *
 * Flujo:
 *  1. Lee `?token=` de la URL.
 *  2. Resolve del token: llama POST /booking/reschedule con solo { token } (para obtener
 *     el context del booking). En su lugar, decodifica el JWT del lado client para extraer
 *     el bookingId y carga los datos necesarios. SIMPLIFICACIÓN: dado que el endpoint
 *     de reschedule requiere un nuevo slot, primero mostramos el mismo UI de selección de
 *     slots. El token se envía junto con el nuevo slot al confirmar.
 *
 *  NOTE: el backend de reschedule es POST /api/public/calendar/booking/reschedule con
 *  body { token, slotStart, inviteeTimeZone }. El endpoint espera el portalId/slug del
 *  event type, que se obtiene desde el booking. Para simplificar la UX sin un endpoint
 *  de "peek" separado, el link de reschedule incluye portalId y slug como query params
 *  adicionales (el backend los lee desde el booking, pero la UI los necesita para cargar slots).
 *
 *  Si los query params no están presentes, mostramos un error descriptivo.
 */

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, CheckCircle2, XCircle, Loader2, Globe, Clock } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { API_URL } from '@nous/shared'
import { ReschedulePageSkeleton, SlotsSkeleton } from '../_components/booking-skeletons'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface Slot {
  startUtc: string
  endUtc: string
  startLocal: string
}

interface EventTypeMeta {
  id: string
  name: string
  durationMin: number
  color: string
}

interface RescheduleResult {
  booking: {
    id: string
    startsAt: string
  }
  cancelUrl: string
  rescheduleUrl: string
}

// ---------------------------------------------------------------------------
// Zonas horarias comunes
// ---------------------------------------------------------------------------

const COMMON_TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Bogota', 'America/Lima', 'America/Santiago', 'America/Buenos_Aires',
  'America/Sao_Paulo', 'America/Mexico_City', 'Europe/Madrid', 'Europe/London',
  'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata',
  'Asia/Dubai', 'Australia/Sydney', 'UTC',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toLocalDateStr(date: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date)
    const y = parts.find((p) => p.type === 'year')?.value ?? ''
    const m = parts.find((p) => p.type === 'month')?.value ?? ''
    const d = parts.find((p) => p.type === 'day')?.value ?? ''
    return `${y}-${m}-${d}`
  } catch { return date.toISOString().slice(0, 10) }
}

function formatTimeInTz(isoUtc: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('es', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
      .format(new Date(isoUtc))
  } catch { return isoUtc }
}

function formatInTz(isoUtc: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('es', {
      timeZone: tz, weekday: 'long', year: 'numeric', month: 'long',
      day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    }).format(new Date(isoUtc))
  } catch { return isoUtc }
}

function getMonthDays(year: number, month: number): Date[] {
  const days: Date[] = []
  const daysInMonth = new Date(year, month, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month - 1, d))
  return days
}

function firstDayOfWeek(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay()
}

function dayStr(day: Date): string {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

async function fetchEventMeta(portalId: string, slug: string): Promise<EventTypeMeta> {
  const res = await fetch(`${API_URL}/api/public/calendar/${portalId}/${slug}`)
  if (!res.ok) throw new Error(`No se pudo cargar el evento (${res.status})`)
  const json = await res.json() as { data: EventTypeMeta }
  return json.data
}

async function fetchSlots(portalId: string, slug: string, from: string, to: string, tz: string): Promise<Slot[]> {
  const params = new URLSearchParams({ from, to, tz })
  const res = await fetch(`${API_URL}/api/public/calendar/${portalId}/${slug}/slots?${params}`)
  // Lanzamos el error en vez de silenciarlo: el catch del useEffect setea `slotsError`
  // para distinguir un fallo de red de un día sin horarios disponibles.
  if (!res.ok) throw new Error(`Error al cargar horarios (${res.status})`)
  const json = await res.json() as { data: { slots: Slot[] } }
  return json.data.slots ?? []
}

async function postReschedule(token: string, slotStart: string, inviteeTz: string): Promise<RescheduleResult> {
  const res = await fetch(`${API_URL}/api/public/calendar/booking/reschedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newStartsAt: slotStart, inviteeTimeZone: inviteeTz }),
  })
  const json = await res.json() as { data?: RescheduleResult; error?: { message: string } }
  if (!res.ok) throw new Error(json.error?.message ?? 'Error al reprogramar')
  return json.data!
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function ReschedulePage() {
  const [token, setToken] = useState<string>('')
  const [portalId, setPortalId] = useState<string>('')
  const [slug, setSlug] = useState<string>('')
  const [initError, setInitError] = useState<string | null>(null)

  const [meta, setMeta] = useState<EventTypeMeta | null>(null)
  const [inviteeTz, setInviteeTz] = useState<string>(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'UTC' }
  })
  const [currentMonth, setCurrentMonth] = useState<{ year: number; month: number }>(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  })
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  // Distingue error de red/API del caso legítimo "día sin horarios" (slots vacíos).
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<RescheduleResult | null>(null)

  // Leer query params al montar
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const t = params.get('token') ?? ''
    const p = params.get('portalId') ?? ''
    const s = params.get('slug') ?? ''

    if (!t) {
      setInitError('Token de reprogramación no encontrado en la URL')
      return
    }
    // portalId y slug son opcionales en la URL; el backend los puede resolver desde el token.
    // Pero los necesitamos para cargar slots en el front. Si no están presentes, informamos.
    if (!p || !s) {
      setInitError('Parámetros de evento no encontrados. Usá el link del email de confirmación.')
      return
    }

    setToken(t)
    setPortalId(p)
    setSlug(s)
  }, [])

  // Cargar metadata cuando tenemos portalId + slug
  useEffect(() => {
    if (!portalId || !slug) return
    fetchEventMeta(portalId, slug)
      .then(setMeta)
      .catch((e: unknown) => setInitError(e instanceof Error ? e.message : 'Error al cargar el evento'))
  }, [portalId, slug])

  // Cargar slots al seleccionar día.
  // Distinguimos explícitamente el error de red/API del vacío legítimo
  // (día sin horarios), para no mostrar "sin disponibilidad" ante un fallo.
  useEffect(() => {
    if (!selectedDay || !portalId || !slug) return
    setLoadingSlots(true)
    setSlots([])
    setSlotsError(null)
    setSelectedSlot(null)
    fetchSlots(portalId, slug, selectedDay, selectedDay, inviteeTz)
      .then(setSlots)
      .catch(() => setSlotsError('No se pudieron cargar los horarios. Intentá de nuevo.'))
      .finally(() => setLoadingSlots(false))
  }, [portalId, slug, selectedDay, inviteeTz])

  const prevMonth = useCallback(() => {
    setCurrentMonth(({ year, month }) =>
      month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 },
    )
    setSelectedDay(null)
    setSelectedSlot(null)
  }, [])

  const nextMonth = useCallback(() => {
    setCurrentMonth(({ year, month }) =>
      month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 },
    )
    setSelectedDay(null)
    setSelectedSlot(null)
  }, [])

  const todayStr = toLocalDateStr(new Date(), inviteeTz)

  async function handleReschedule() {
    if (!selectedSlot || !token) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await postReschedule(token, selectedSlot.startUtc, inviteeTz)
      setResult(res)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Error al reprogramar')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Error de inicialización ──────────────────────────────────────────────
  if (initError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg text-center">
          <XCircle className="mx-auto mb-4 h-12 w-12 text-red-400" />
          <h1 className="mb-2 text-xl font-bold text-gray-900">Link inválido</h1>
          {/* role="alert": error crítico que aparece en lugar del contenido esperado;
              lectores de pantalla lo anuncian inmediatamente sin esperar foco. */}
          <p role="alert" className="text-sm text-gray-500">{initError}</p>
        </div>
      </div>
    )
  }

  // ── Éxito ────────────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg text-center">
          <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-green-500" />
          <h1 className="mb-2 text-2xl font-bold text-gray-900">¡Reprogramado!</h1>
          <p className="text-gray-500 text-sm">
            {formatInTz(result.booking.startsAt, inviteeTz)}
          </p>
          <p className="mt-3 text-xs text-gray-400">Recibirás un email de confirmación.</p>
        </div>
      </div>
    )
  }

  // ── Cargando metadata ────────────────────────────────────────────────────
  if (!meta) {
    // Skeleton fiel (header + calendario) en vez de un spinner suelto.
    return <ReschedulePageSkeleton />
  }

  const { year, month } = currentMonth
  const days = getMonthDays(year, month)
  const firstDay = firstDayOfWeek(year, month)
  const monthName = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1),
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          {/* Header */}
          <div className="mb-6 flex items-center gap-3">
            <div
              className="h-3 w-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: meta.color ?? '#3b82f6' }}
            />
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                Reprogramar reunión
              </p>
              <h1 className="text-xl font-bold text-gray-900">{meta.name}</h1>
            </div>
          </div>

          <div className="mb-1 flex items-center gap-2 text-gray-500 text-sm">
            <Clock className="h-4 w-4" />
            <span>{meta.durationMin} minutos</span>
          </div>

          {/* Timezone selector */}
          <div className="mb-6 flex items-center gap-3">
            <Globe className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <Select value={inviteeTz} onValueChange={setInviteeTz}>
              <SelectTrigger className="h-8 text-sm w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMON_TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz} className="text-sm">{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!selectedSlot ? (
            <>
              {/* Calendario */}
              <div className="mb-6">
                <div className="mb-4 flex items-center justify-between">
                  <button onClick={prevMonth} className="rounded-full p-1.5 hover:bg-gray-100 transition-colors">
                    <ChevronLeft className="h-5 w-5 text-gray-600" />
                  </button>
                  <span className="text-sm font-semibold capitalize text-gray-800">{monthName}</span>
                  <button onClick={nextMonth} className="rounded-full p-1.5 hover:bg-gray-100 transition-colors">
                    <ChevronRight className="h-5 w-5 text-gray-600" />
                  </button>
                </div>

                <div className="grid grid-cols-7 mb-1">
                  {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((d) => (
                    <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
                  {days.map((day) => {
                    const ds = dayStr(day)
                    const past = ds < todayStr
                    const selected = ds === selectedDay
                    return (
                      <button
                        key={ds}
                        disabled={past}
                        onClick={() => setSelectedDay(ds)}
                        className={[
                          'aspect-square rounded-full text-sm font-medium transition-colors',
                          past ? 'cursor-not-allowed text-gray-300'
                          : selected ? 'text-white'
                          : 'hover:bg-gray-100 text-gray-700',
                        ].join(' ')}
                        style={selected ? { backgroundColor: meta.color ?? '#3b82f6' } : undefined}
                      >
                        {day.getDate()}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Slots */}
              {selectedDay && (
                <div>
                  <h2 className="mb-3 text-sm font-semibold text-gray-700">
                    Horarios disponibles —{' '}
                    {new Intl.DateTimeFormat('es', {
                      weekday: 'long', day: 'numeric', month: 'long', timeZone: inviteeTz,
                    }).format(new Date(selectedDay + 'T12:00:00Z'))}
                  </h2>
                  {loadingSlots ? (
                    // Misma grilla/altura que los slots reales → sin colapso ni salto.
                    <SlotsSkeleton />
                  ) : slotsError ? (
                    // Error de red o API — distinto al caso "día sin horarios".
                    <p role="alert" className="text-center py-6 text-sm text-red-500">
                      {slotsError}
                    </p>
                  ) : slots.length === 0 ? (
                    <p className="text-center py-6 text-sm text-gray-400">No hay horarios disponibles.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {slots.map((slot) => (
                        <button
                          key={slot.startUtc}
                          onClick={() => setSelectedSlot(slot)}
                          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors"
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
            /* Confirmación del nuevo slot */
            <div className="rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">
                Nuevo horario
              </p>
              <p className="font-semibold text-gray-900 mb-4">
                {formatInTz(selectedSlot.startUtc, inviteeTz)}
              </p>

              {submitError && (
                <p className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                  {submitError}
                </p>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => { setSelectedSlot(null); setSubmitError(null) }}
                  disabled={submitting}
                >
                  Cambiar
                </Button>
                <Button
                  onClick={handleReschedule}
                  disabled={submitting}
                  style={{ backgroundColor: meta.color ?? '#3b82f6' }}
                >
                  {submitting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reprogramando...</>
                  ) : (
                    'Confirmar nuevo horario'
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
