export interface MeetingType {
  id: string
  name: string
  slug: string
  durationMin: number
  bufferMin: number
  location: string | null
  description: string | null
  isActive: boolean
}

export interface AvailabilityRule {
  id: string
  ownerId: string
  dayOfWeek: number
  startTime: string
  endTime: string
  timeZone: string
}

export interface Booking {
  id: string
  guestName: string
  guestEmail: string
  startsAt: string
  endsAt: string
  status: string
  meetLink: string | null
  meetingTypeName: string
}
