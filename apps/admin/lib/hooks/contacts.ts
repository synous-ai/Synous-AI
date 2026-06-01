import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiList, apiPatch, apiPost, apiDelete } from '../api'
import type { Contact, ContactDetail } from '../types'

export function useInvalidatePeople() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['leads'] })
    qc.invalidateQueries({ queryKey: ['clients'] })
    qc.invalidateQueries({ queryKey: ['contacts'] })
    qc.invalidateQueries({ queryKey: ['deals'] })
  }
}

export function useLeads() {
  return useQuery({
    queryKey: ['leads'],
    queryFn: async () => (await apiList<Contact[]>('/api/leads?limit=100')).data,
  })
}

export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: async () => (await apiList<Contact[]>('/api/clients?limit=100')).data,
  })
}

/** Búsqueda avanzada de contactos (filterBranch). Activa solo si hay filtro. */
export function useContactSearch(filter: unknown) {
  return useQuery({
    queryKey: ['contacts', 'search', filter],
    queryFn: () => apiPost<Contact[]>('/api/contacts/search', { filter }),
    enabled: filter != null,
  })
}

/** Detalle enriquecido para el User Detail (contacto + deals + historial). */
export function useContactDetail(scope: 'leads' | 'clients' | 'contacts', id: string | null) {
  return useQuery({
    queryKey: [scope, 'detail', id],
    queryFn: () =>
      apiGet<ContactDetail>(scope === 'contacts' ? `/api/contacts/${id}/detail` : `/api/${scope}/${id}`),
    enabled: id != null,
  })
}

export function useContacts() {
  return useQuery({
    queryKey: ['contacts'],
    queryFn: async () => (await apiList<Contact[]>('/api/contacts?limit=100')).data,
  })
}

export interface ContactInput {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  jobTitle?: string
  companyId?: string
  lifecycleStage?: string
  custom?: Record<string, unknown>
}

export function useCreateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ContactInput) => apiPost<Contact>('/api/contacts', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['clients'] })
    },
  })
}

export function useUpdateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ContactInput }) => apiPatch<Contact>(`/api/contacts/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['clients'] })
    },
  })
}

export function useArchiveContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/api/contacts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['clients'] })
    },
  })
}
