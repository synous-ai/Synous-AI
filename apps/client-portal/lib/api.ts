// All HTTP logic has been moved to @devduo/api-client.
// This module instantiates the client for the client portal (client_account) context
// and re-exports the individual functions so that existing @/lib/api imports work unchanged.

import { createApiClient, ApiError as _ApiError } from '@devduo/api-client'
import { clientAuthToken } from './store/auth'

const client = createApiClient({
  refreshPath: '/api/client-auth/refresh',
  getToken: () => clientAuthToken.get(),
  setToken: (token) => clientAuthToken.set(token),
  onAuthFailure: () => clientAuthToken.clear(),
})

export const apiGet = client.apiGet
export const apiPost = client.apiPost
export const apiPatch = client.apiPatch
export const apiDelete = client.apiDelete

// Re-export the class so callers can do: import { ApiError } from '@/lib/api'
export { _ApiError as ApiError }
