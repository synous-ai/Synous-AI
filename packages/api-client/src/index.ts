import { API_URL } from '@nous/shared'

// ---------------------------------------------------------------------------
// Shared envelope type — matches what the Fastify API returns
// ---------------------------------------------------------------------------

export interface ApiEnvelope<T> {
  data: T
  meta?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ---------------------------------------------------------------------------
// Factory options
// ---------------------------------------------------------------------------

export interface ApiClientOptions {
  /**
   * Path used to exchange the httpOnly refresh cookie for a new access token.
   * Admin:         '/api/auth/refresh'
   * Client portal: '/api/client-auth/refresh'
   * Opcional: el admin y el portal usan Clerk — no necesitan refresh propio.
   */
  refreshPath?: string
  /**
   * Devuelve el access token actual (o null si no está autenticado).
   * Acepta tanto funciones síncronas (Zustand store) como asíncronas (Clerk).
   */
  getToken: () => string | null | Promise<string | null>
  /**
   * Persiste un access token recién emitido en el store.
   * Opcional: no aplica cuando se usa Clerk (auto-gestiona la sesión).
   */
  setToken?: (token: string) => void
  /** Called when a 401 cannot be recovered — should clear the session and redirect. */
  onAuthFailure: () => void
}

// ---------------------------------------------------------------------------
// Internal request options
// ---------------------------------------------------------------------------

interface RequestOptions {
  method?: string
  body?: unknown
  /** Do not attach the Authorization header or attempt a refresh. */
  skipAuth?: boolean
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createApiClient(opts: ApiClientOptions) {
  let refreshPromise: Promise<boolean> | null = null

  /**
   * Renueva el access token vía cookie httpOnly.
   * Si no hay refreshPath configurado (ej: Clerk), devuelve false de inmediato.
   */
  async function tryRefresh(): Promise<boolean> {
    // Sin refreshPath no hay renovación vía cookie — Clerk auto-gestiona su sesión.
    if (!opts.refreshPath) return false
    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          const res = await fetch(`${API_URL}${opts.refreshPath}`, {
            method: 'POST',
            credentials: 'include',
          })
          if (!res.ok) return false
          const json = (await res.json()) as ApiEnvelope<{ accessToken: string }>
          opts.setToken?.(json.data.accessToken)
          return true
        } catch {
          return false
        } finally {
          // Limpiar en el próximo tick para que callers concurrentes compartan el resultado
          setTimeout(() => {
            refreshPromise = null
          }, 0)
        }
      })()
    }
    return refreshPromise
  }

  async function raw<T>(path: string, options: RequestOptions, retry: boolean): Promise<T> {
    const headers: Record<string, string> = {}
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    // getToken acepta sync y async — se awaitea siempre de forma segura
    const token = await Promise.resolve(opts.getToken())
    if (!options.skipAuth && token) headers.Authorization = `Bearer ${token}`

    const res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      credentials: 'include',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })

    if (res.status === 401 && !options.skipAuth && retry) {
      const ok = await tryRefresh()
      if (ok) return raw<T>(path, options, false)
      opts.onAuthFailure()
    }

    const json = await res.json().catch(() => null)
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string } } | null)?.error
      throw new ApiError(err?.code ?? 'ERROR', err?.message ?? 'Error de red', res.status)
    }
    return (json as ApiEnvelope<T>).data
  }

  function apiGet<T>(path: string): Promise<T> {
    return raw<T>(path, {}, true)
  }

  function apiPost<T>(path: string, body?: unknown, options?: { skipAuth?: boolean }): Promise<T> {
    return raw<T>(path, { method: 'POST', body, skipAuth: options?.skipAuth }, true)
  }

  function apiPatch<T>(path: string, body?: unknown): Promise<T> {
    return raw<T>(path, { method: 'PATCH', body }, true)
  }

  function apiDelete<T>(path: string): Promise<T> {
    return raw<T>(path, { method: 'DELETE' }, true)
  }

  /** Returns the full envelope (data + meta) — needed for paginated lists. */
  async function apiList<T>(path: string): Promise<ApiEnvelope<T>> {
    // getToken acepta sync y async — se awaitea siempre de forma segura
    const token = await Promise.resolve(opts.getToken())
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(`${API_URL}${path}`, { headers, credentials: 'include' })
    if (res.status === 401) {
      const ok = await tryRefresh()
      if (ok) return apiList<T>(path)
      opts.onAuthFailure()
    }
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string } } | null)?.error
      throw new ApiError(err?.code ?? 'ERROR', err?.message ?? 'Error de red', res.status)
    }
    return json as ApiEnvelope<T>
  }

  return { apiGet, apiPost, apiPatch, apiDelete, apiList }
}
