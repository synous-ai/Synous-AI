import { NextResponse } from 'next/server'
import { API_URL } from '@/lib/config'

/**
 * Proxy de los CTAs del cierre de la propuesta hacia la API
 * (`POST /api/public/proposals/<token>/interest`).
 *
 * Pasa por acá para que el navegador le pegue al mismo origen que sirvió la
 * propuesta: sin CORS de por medio. La validación (Zod) y el rate limit viven
 * en la API; acá solo se reenvía el body y la IP del cliente, para que el
 * límite cuente por persona y no por el servidor de Next.
 */
export async function POST(request: Request, { params }: { params: { token: string } }) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Body inválido' } }, { status: 400 })
  }

  const forwardedFor = request.headers.get('x-forwarded-for')
  try {
    const res = await fetch(`${API_URL}/api/public/proposals/${encodeURIComponent(params.token)}/interest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status })
  } catch {
    return NextResponse.json({ error: { code: 'UPSTREAM', message: 'No disponible' } }, { status: 502 })
  }
}
