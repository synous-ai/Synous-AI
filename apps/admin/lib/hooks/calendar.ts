import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete, apiPatch } from '../api'
import type {
  MeetingType,
  AvailabilityRule,
  Booking,
  WeekBooking,
  AvailabilitySchedule,
  AvailabilityInterval,
  DateOverride,
  EventTypeV2,
  CreateScheduleInput,
  UpdateScheduleInput,
  CreateIntervalInput,
  DateOverrideInput,
  CreateEventTypeV2Input,
  UpdateEventTypeV2Input,
} from '../types'

// ---------------------------------------------------------------------------
// HOOKS LEGACY (mantenidos para no romper la UI existente)
// ---------------------------------------------------------------------------

export function useMeetingTypes() {
  return useQuery({ queryKey: ['meeting-types'], queryFn: () => apiGet<MeetingType[]>('/api/calendar/meeting-types') })
}

export interface MeetingTypeInput {
  name: string
  durationMin: number
  bufferMin?: number
  location?: string
  description?: string
}

export function useCreateMeetingType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: MeetingTypeInput) => apiPost<MeetingType>('/api/calendar/meeting-types', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting-types'] }),
  })
}

export function useDeleteMeetingType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/api/calendar/meeting-types/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting-types'] }),
  })
}

export function useAvailability() {
  return useQuery({ queryKey: ['availability'], queryFn: () => apiGet<AvailabilityRule[]>('/api/calendar/availability') })
}

export interface AvailabilityInput {
  dayOfWeek: number
  startTime: string
  endTime: string
}

export function useCreateAvailability() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AvailabilityInput) => apiPost<AvailabilityRule>('/api/calendar/availability', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['availability'] }),
  })
}

export function useDeleteAvailability() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/api/calendar/availability/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['availability'] }),
  })
}

export function useBookings() {
  return useQuery({ queryKey: ['bookings'], queryFn: () => apiGet<Booking[]>('/api/calendar/bookings') })
}

// ---------------------------------------------------------------------------
// F4a — Hooks para Availability Schedules V2
// ---------------------------------------------------------------------------

/**
 * Lista los schedules del usuario autenticado (con intervalos y overrides embebidos).
 */
export function useSchedules() {
  return useQuery({
    queryKey: ['schedules'],
    queryFn: () => apiGet<AvailabilitySchedule[]>('/api/calendar/schedules'),
  })
}

/**
 * Obtiene un schedule específico por id.
 */
export function useSchedule(scheduleId: string | null) {
  return useQuery({
    queryKey: ['schedules', scheduleId],
    queryFn: () => apiGet<AvailabilitySchedule>(`/api/calendar/schedules/${scheduleId}`),
    enabled: scheduleId != null,
  })
}

/**
 * Crea un nuevo schedule de disponibilidad.
 */
export function useCreateSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateScheduleInput) =>
      apiPost<AvailabilitySchedule>('/api/calendar/schedules', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules'] }),
  })
}

/**
 * Actualiza nombre, timezone o isDefault de un schedule.
 */
export function useUpdateSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateScheduleInput }) =>
      apiPatch<AvailabilitySchedule>(`/api/calendar/schedules/${id}`, input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['schedules'] })
      qc.invalidateQueries({ queryKey: ['schedules', vars.id] })
    },
  })
}

/**
 * Elimina un schedule. Los intervalos y overrides se eliminan en cascada.
 */
export function useDeleteSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/api/calendar/schedules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules'] }),
  })
}

/**
 * Agrega un intervalo semanal a un schedule.
 */
export function useAddScheduleInterval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ scheduleId, input }: { scheduleId: string; input: CreateIntervalInput }) =>
      apiPost<AvailabilityInterval>(`/api/calendar/schedules/${scheduleId}/intervals`, input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['schedules'] })
      qc.invalidateQueries({ queryKey: ['schedules', vars.scheduleId] })
    },
  })
}

/**
 * Reemplaza TODOS los intervalos de un schedule en una sola operación.
 * Útil para el guardado masivo del editor de horario semanal.
 * El endpoint PATCH /schedules/:scheduleId/intervals reemplaza atómicamente todos los intervalos.
 */
export function useReplaceScheduleIntervals() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      scheduleId,
      intervals,
    }: {
      scheduleId: string
      intervals: CreateIntervalInput[]
    }) =>
      apiPatch<AvailabilityInterval[]>(
        `/api/calendar/schedules/${scheduleId}/intervals`,
        { intervals },
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['schedules'] })
      qc.invalidateQueries({ queryKey: ['schedules', vars.scheduleId] })
    },
  })
}

/** Elimina un intervalo individual de un schedule. */
export function useDeleteScheduleInterval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ scheduleId, intervalId }: { scheduleId: string; intervalId: string }) =>
      apiDelete<{ success: boolean }>(
        `/api/calendar/schedules/${scheduleId}/intervals/${intervalId}`,
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['schedules'] })
      qc.invalidateQueries({ queryKey: ['schedules', vars.scheduleId] })
    },
  })
}

/**
 * Crea o actualiza un date override para una fecha (upsert).
 * intervals=[] bloquea el día.
 */
export function useUpsertDateOverride() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      scheduleId,
      input,
    }: {
      scheduleId: string
      input: DateOverrideInput
    }) =>
      apiPost<DateOverride>(`/api/calendar/schedules/${scheduleId}/overrides`, input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['schedules'] })
      qc.invalidateQueries({ queryKey: ['schedules', vars.scheduleId] })
    },
  })
}

/** Elimina un date override de un schedule. */
export function useDeleteDateOverride() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ scheduleId, overrideId }: { scheduleId: string; overrideId: string }) =>
      apiDelete<{ success: boolean }>(
        `/api/calendar/schedules/${scheduleId}/overrides/${overrideId}`,
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['schedules'] })
      qc.invalidateQueries({ queryKey: ['schedules', vars.scheduleId] })
    },
  })
}

// ---------------------------------------------------------------------------
// F4a — Hooks para Event Types V2
// ---------------------------------------------------------------------------

/**
 * Lista todos los event types del portal con sus hosts.
 * Incluye activos e inactivos (es un listado de admin).
 */
export function useEventTypesV2() {
  return useQuery({
    queryKey: ['event-types-v2'],
    queryFn: () => apiGet<EventTypeV2[]>('/api/calendar/event-types'),
  })
}

/**
 * Obtiene un event type específico por id.
 */
export function useEventTypeV2(id: string | null) {
  return useQuery({
    queryKey: ['event-types-v2', id],
    queryFn: () => apiGet<EventTypeV2>(`/api/calendar/event-types/${id}`),
    enabled: id != null,
  })
}

/**
 * Crea un event type completo con todos los campos V2.
 */
export function useCreateEventTypeV2() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateEventTypeV2Input) =>
      apiPost<EventTypeV2>('/api/calendar/event-types', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['event-types-v2'] }),
  })
}

/**
 * Actualiza un event type (campos parciales).
 */
export function useUpdateEventTypeV2() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateEventTypeV2Input }) =>
      apiPatch<EventTypeV2>(`/api/calendar/event-types/${id}`, input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['event-types-v2'] })
      qc.invalidateQueries({ queryKey: ['event-types-v2', vars.id] })
    },
  })
}

/**
 * Elimina un event type.
 */
export function useDeleteEventTypeV2() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/api/calendar/event-types/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['event-types-v2'] }),
  })
}

// ---------------------------------------------------------------------------
// F4b — Vista semanal y gestión de bookings desde el admin
// ---------------------------------------------------------------------------

/**
 * Lista los bookings del portal en un rango de fechas (vista semanal).
 * from y to en formato YYYY-MM-DD.
 */
export function useWeekBookings(from: string, to: string) {
  return useQuery({
    queryKey: ['bookings-week', from, to],
    queryFn: () =>
      apiGet<WeekBooking[]>(`/api/calendar/bookings/week?from=${from}&to=${to}`),
    enabled: Boolean(from && to),
  })
}

/**
 * Cancela un booking desde el panel de admin (por id, sin token de invitado).
 * Libera el slot y envía email al invitee.
 */
export function useCancelAdminBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (bookingId: string) =>
      apiPost<{ bookingId: string }>(`/api/calendar/bookings/${bookingId}/cancel`, {}),
    onSuccess: () => {
      // Invalida la vista de bookings legacy + la vista semanal de admin
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['bookings-week'] })
    },
  })
}
