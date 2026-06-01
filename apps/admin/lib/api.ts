// All HTTP logic has been moved to @devduo/api-client.
// This module instantiates the client for the admin (hub_user) context and
// re-exports the individual functions so that existing @/lib/api imports work unchanged.

import { createApiClient, ApiError as _ApiError } from '@devduo/api-client'
import { authToken } from './store/auth'

const client = createApiClient({
  refreshPath: '/api/auth/refresh',
  getToken: () => authToken.get(),
  setToken: (token) => authToken.set(token),
  onAuthFailure: () => authToken.clear(),
})

export const apiGet = client.apiGet
export const apiPost = client.apiPost
export const apiPatch = client.apiPatch
export const apiDelete = client.apiDelete
export const apiList = client.apiList

// Re-export the class so callers can do: import { ApiError } from '@/lib/api'
export { _ApiError as ApiError }
