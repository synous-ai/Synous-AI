'use client'

/**
 * Página pública de cancelación de booking (invitee-facing).
 *
 * URL: /book/cancel?token=JWT — PÚBLICA, sin auth de Clerk.
 *
 * Flujo:
 *  1. Lee el `?token=` de la URL.
 *  2. POST /api/public/calendar/booking/cancel { token } al montar.
 *  3. Muestra confirmación de cancelación o error.
 *
 * El token viaja en el BODY (no en la URL del endpoint) por seguridad:
 * JWT en URL queda en logs de servidor/proxy.
 */

import { useState, useEffect } from 'react'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { API_URL } from '@nous/shared'

async function cancelBooking(token: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/public/calendar/booking/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  const json = await res.json() as { error?: { message: string } }
  if (!res.ok) throw new Error(json.error?.message ?? 'No se pudo cancelar la reunión')
}

export default function CancelPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState<string>('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token') ?? ''

    if (!token) {
      setErrorMsg('Token de cancelación no encontrado en la URL')
      setStatus('error')
      return
    }

    cancelBooking(token)
      .then(() => setStatus('success'))
      .catch((e: unknown) => {
        setErrorMsg(e instanceof Error ? e.message : 'Error al cancelar')
        setStatus('error')
      })
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      {/* aria-live="polite": anuncia el cambio de contenido (cargando → éxito/error)
          a lectores de pantalla sin interrumpir lo que ya se está leyendo. */}
      <div aria-live="polite" className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg text-center">
        {status === 'loading' && (
          /* role="status": el spinner es una región de estado activo, no solo
             decorativa; permite que AT describa el estado en curso. */
          <div role="status">
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-gray-400" />
            <p className="text-gray-600">Cancelando tu reserva...</p>
          </div>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-green-500" />
            <h1 className="mb-2 text-xl font-bold text-gray-900">Reserva cancelada</h1>
            <p className="text-sm text-gray-500">
              Tu reunión fue cancelada correctamente. Recibirás un email de confirmación.
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="mx-auto mb-4 h-12 w-12 text-red-400" />
            <h1 className="mb-2 text-xl font-bold text-gray-900">No se pudo cancelar</h1>
            <p className="text-sm text-gray-500">{errorMsg}</p>
            <p className="mt-3 text-xs text-gray-400">
              El link puede estar vencido o la reunión ya fue cancelada.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
