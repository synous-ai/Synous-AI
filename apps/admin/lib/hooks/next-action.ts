import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../api'

export interface NextAction {
  action: string
  source: 'ai' | 'rules'
}

/**
 * Próxima acción sugerida por IA para un contacto. Se llama solo cuando hace
 * falta (p.ej. cuando no hay tarea agendada) vía `enabled`. Cachea 5 min y no
 * refetchea al enfocar la ventana: la llamada al LLM es cara.
 */
export function useNextAction(contactId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['next-action', contactId],
    queryFn: () => apiGet<NextAction>(`/api/contacts/${contactId}/next-action`),
    enabled: !!contactId && enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
}
