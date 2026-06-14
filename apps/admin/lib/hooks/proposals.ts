import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch } from '../api'
import type { Proposal, ProposalContent } from '../types'

/** Lista de propuestas del portal (vista admin). */
export function useProposals() {
  return useQuery({
    queryKey: ['proposals'],
    queryFn: () => apiGet<Proposal[]>('/api/proposals'),
  })
}

/** Detalle de una propuesta. */
export function useProposal(id: string | undefined) {
  return useQuery({
    queryKey: ['proposals', id],
    queryFn: () => apiGet<Proposal>(`/api/proposals/${id}`),
    enabled: !!id,
  })
}

/** Genera una propuesta con IA a partir de un deal. */
export function useGenerateProposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dealId: string) => apiPost<Proposal>('/api/proposals/generate', { dealId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['proposals'] })
    },
  })
}

/** Edita una propuesta (título y/o contenido). */
export function useUpdateProposal(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { title?: string; content?: ProposalContent }) =>
      apiPatch<Proposal>(`/api/proposals/${id}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['proposals'] })
      void qc.invalidateQueries({ queryKey: ['proposals', id] })
    },
  })
}

/** Aprueba una propuesta (queda lista para enviar al cliente). */
export function useAcceptProposal(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiPost<Proposal>(`/api/proposals/${id}/accept`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['proposals'] })
      void qc.invalidateQueries({ queryKey: ['proposals', id] })
    },
  })
}

/** Marca la propuesta como enviada (al copiar el link / abrir la presentación). */
export function useMarkProposalSent(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiPost<Proposal>(`/api/proposals/${id}/sent`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['proposals'] })
      void qc.invalidateQueries({ queryKey: ['proposals', id] })
    },
  })
}
