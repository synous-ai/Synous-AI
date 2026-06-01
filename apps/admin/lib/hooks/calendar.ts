import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete } from '../api'
import type { MeetingType, AvailabilityRule, Booking } from '../types'

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
