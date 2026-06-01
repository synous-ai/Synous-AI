import { API_URL } from '@devduo/shared'

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
   */
  refreshPath: string
  /** Return the current access token (or null if not authenticated). */
  getToken: () => string | null
  /** Persist a freshly-issued access token into the store. */
  setToken: (token: string) => void
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

  /** Renew the access token via the httpOnly cookie. Deduplicates concurrent callers. */
  async function tryRefresh(): Promise<boolean> {
    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          const res = await fetch(`${API_URL}${opts.refreshPath}`, {
            method: 'POST',
            credentials: 'include',
          })
          if (!res.ok) return false
          const json = (await res.json()) as ApiEnvelope<{ accessToken: string }>
          opts.setToken(json.data.accessToken)
          return true
        } catch {
          return false
        } finally {
          // Clear in the next tick so concurrent callers share this result
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
    const token = opts.getToken()
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
    const token = opts.getToken()
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
