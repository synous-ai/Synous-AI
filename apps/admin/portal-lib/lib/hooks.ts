import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPatch, apiDelete, apiList } from './api'
import { fetchAllPages } from '@/lib/fetch-all-pages'
import { uploadFile, getFileAccessUrl } from './files'
import type {
  Deal,
  Deliverable,
  ClientIntake,
  ChangeRequest,
  ClientInvoice,
  ClientDocument,
  ClientDocusealSignedDocument,
  ClientProject,
  OnboardingStateDTO,
  ClientOnboarding,
  OnboardingBriefAnswers,
  OnboardingMaterialsState,
  OnboardingMaterialCategory,
  OnboardingAsset,
  CompleteOnboardingResultDTO,
  ClientBranding,
  UpdateClientBrandingInput,
  ClientNotification,
} from './types'

// ─── Deals ──────────────────────────────────────────────────────────────────

export function useClientDeals() {
  return useQuery<Deal[]>({
    queryKey: ['client', 'deals'],
    queryFn: () => apiGet<Deal[]>('/api/client/deals'),
  })
}

// ─── Estado de proyecto (roadmap + novedades, Home del portal) ────────────────

export function useClientProject() {
  return useQuery<ClientProject>({
    queryKey: ['client', 'project'],
    queryFn: () => apiGet<ClientProject>('/api/client/project'),
  })
}

// ─── Deliverables ────────────────────────────────────────────────────────────

export function useClientDeliverables() {
  return useQuery<Deliverable[]>({
    queryKey: ['client', 'deliverables'],
    queryFn: () => fetchAllPages<Deliverable>(apiList, '/api/client/deliverables'),
  })
}

export function useApproveDeliverable() {
  const queryClient = useQueryClient()
  return useMutation<{ success: true }, Error, string>({
    mutationFn: (id) => apiPost<{ success: true }>(`/api/client/deliverables/${id}/approve`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['client', 'deliverables'] })
    },
  })
}

export function useRequestChanges() {
  const queryClient = useQueryClient()
  return useMutation<{ success: true }, Error, { id: string; feedback: string }>({
    mutationFn: ({ id, feedback }) =>
      apiPost<{ success: true }>(`/api/client/deliverables/${id}/request-changes`, { feedback }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['client', 'deliverables'] })
    },
  })
}

// ─── Intakes ──────────────────────────────────────────────────────────────────

export function useClientIntakes() {
  return useQuery<ClientIntake[]>({
    queryKey: ['intakes'],
    queryFn: () => apiGet<ClientIntake[]>('/api/client/intakes'),
  })
}

export function useRespondIntake() {
  const queryClient = useQueryClient()
  return useMutation<{ success: true }, Error, { id: string; answers: Record<string, string> }>({
    mutationFn: ({ id, answers }) =>
      apiPost<{ success: true }>(`/api/client/intakes/${id}/respond`, { answers }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['intakes'] })
    },
  })
}

// ─── Change Requests ──────────────────────────────────────────────────────────

export function useClientChangeRequests() {
  return useQuery<ChangeRequest[]>({
    queryKey: ['change-requests'],
    queryFn: () => fetchAllPages<ChangeRequest>(apiList, '/api/client/change-requests'),
  })
}

export function useApproveCR() {
  const queryClient = useQueryClient()
  return useMutation<{ success: true }, Error, { id: string; comment?: string }>({
    mutationFn: ({ id, comment }) =>
      apiPost<{ success: true }>(`/api/client/change-requests/${id}/approve`, comment ? { comment } : undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['change-requests'] })
    },
  })
}

export function useRejectCR() {
  const queryClient = useQueryClient()
  return useMutation<{ success: true }, Error, { id: string; comment?: string }>({
    mutationFn: ({ id, comment }) =>
      apiPost<{ success: true }>(`/api/client/change-requests/${id}/reject`, comment ? { comment } : undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['change-requests'] })
    },
  })
}

export function useCommentCR() {
  return useMutation<void, Error, { id: string; body: string }>({
    mutationFn: ({ id, body }) =>
      apiPost<void>(`/api/client/change-requests/${id}/comments`, { body }),
  })
}

// ─── Invoices ──────────────────────────────────────────────────────────────────

export function useClientInvoices() {
  return useQuery<ClientInvoice[]>({
    queryKey: ['client', 'invoices'],
    queryFn: () => fetchAllPages<ClientInvoice>(apiList, '/api/client/invoices'),
  })
}

// ─── Documents ──────────────────────────────────────────────────────────────────

export function useClientDocuments() {
  return useQuery<ClientDocument[]>({
    queryKey: ['client', 'documents'],
    queryFn: () => fetchAllPages<ClientDocument>(apiList, '/api/client/documents'),
  })
}

/**
 * Estado del preview de un documento (drawer de "Ver" en el panel de
 * Documentos). Dos caminos, mutuamente excluyentes:
 *
 * - `storageKey` presente → archivo propio del CRM. Se pide una URL de acceso
 *   temporal vía `getFileAccessUrl` (POST /api/files/access) — NUNCA se
 *   bajan los bytes a memoria como object URL: un archivo grande no entra en
 *   el límite de payload de la función serverless (ver blob-contract.md).
 * - sin `storageKey` pero `docusealStatus === 'completed'` → PDF firmado en
 *   DocuSeal. Se pide `GET /api/client/documents/:id/signed-documents` recién
 *   acá, en el momento exacto en que hace falta: la URL que devuelve DocuSeal
 *   caduca a los 40 minutos, así que NUNCA se guarda en caché ni sobrevive
 *   más allá de la vida de este hook (no hay queryKey de TanStack Query a
 *   propósito).
 *
 * Cualquier otra combinación (sin storageKey y sin firma completada) no tiene
 * preview disponible — el caller decide si ofrece "Descargar" o nada.
 */
export type DocumentPreviewStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface DocumentPreviewState {
  status: DocumentPreviewStatus
  url: string | null
}

export function useDocumentPreview(
  doc: Pick<ClientDocument, 'id' | 'storageKey' | 'docusealStatus'> | null,
): DocumentPreviewState {
  const [state, setState] = useState<DocumentPreviewState>({ status: 'idle', url: null })

  const id = doc?.id ?? null
  const storageKey = doc?.storageKey ?? null
  const docusealStatus = doc?.docusealStatus ?? null

  useEffect(() => {
    if (!id) {
      setState({ status: 'idle', url: null })
      return
    }

    let cancelled = false
    setState({ status: 'loading', url: null })

    async function load() {
      if (storageKey) {
        const { url } = await getFileAccessUrl(storageKey)
        if (cancelled) return
        setState({ status: 'ready', url })
        return
      }

      if (docusealStatus === 'completed') {
        const documents = await apiGet<ClientDocusealSignedDocument[]>(
          `/api/client/documents/${id}/signed-documents`,
        )
        const [signed] = documents
        if (!signed) throw new Error('NO_SIGNED_DOCUMENT')
        if (cancelled) return
        setState({ status: 'ready', url: signed.url })
        return
      }

      throw new Error('NO_PREVIEW_AVAILABLE')
    }

    void load().catch(() => {
      if (!cancelled) setState({ status: 'error', url: null })
    })

    return () => {
      cancelled = true
    }
  }, [id, storageKey, docusealStatus])

  return state
}

// ─── Onboarding POST-VENTA (wizard de 8 pasos) ───────────────────────────────
// Ver apps/api/src/modules/onboarding/client-onboarding.router.ts (prefix
// /api/client/onboarding). Todas las mutations invalidan la query de estado
// para que el wizard resuma con `currentStep`/`stepsCompleted` frescos.

const ONBOARDING_QUERY_KEY = ['client', 'onboarding'] as const

export function useClientOnboarding() {
  return useQuery<OnboardingStateDTO>({
    queryKey: ONBOARDING_QUERY_KEY,
    queryFn: () => apiGet<OnboardingStateDTO>('/api/client/onboarding'),
  })
}

/** Paso 1-4: marca un paso de orientación como visto. */
export function useMarkOnboardingProgress() {
  const queryClient = useQueryClient()
  return useMutation<ClientOnboarding, Error, number>({
    mutationFn: (step) => apiPatch<ClientOnboarding>('/api/client/onboarding/progress', { step }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY })
    },
  })
}

/** Paso 5: firma (checkbox + nombre). 409 si ya estaba firmado. */
export function useSubmitOnboardingSignature() {
  const queryClient = useQueryClient()
  return useMutation<ClientOnboarding, Error, { fullName: string; accepted: true }>({
    mutationFn: (body) => apiPost<ClientOnboarding>('/api/client/onboarding/signature', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY })
    },
  })
}

/** Paso 6: brief de 16 preguntas. Re-submit permitido (sobreescribe). */
export function useSubmitOnboardingBrief() {
  const queryClient = useQueryClient()
  return useMutation<ClientOnboarding, Error, OnboardingBriefAnswers>({
    mutationFn: (answers) => apiPost<ClientOnboarding>('/api/client/onboarding/brief', answers),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY })
    },
  })
}

/**
 * Paso 6: guarda un borrador PARCIAL del brief (se llama al avanzar cada uno
 * de los 5 bloques). Sin esto, los bloques que el cliente ya completó vivirían
 * solo en memoria de React Hook Form hasta el submit final, y un reload —o
 * cerrar la pestaña— se llevaría todo lo tipeado.
 *
 * No invalida la query a propósito: un refetch en medio del paso 6
 * remontaría el formulario con nuevos `defaultValues` y le pisaría al cliente
 * lo que está escribiendo. Lo guardado se lee al volver a montar el wizard.
 */
export function useSaveOnboardingBriefDraft() {
  return useMutation<ClientOnboarding, Error, Partial<OnboardingBriefAnswers>>({
    mutationFn: (partial) => apiPatch<ClientOnboarding>('/api/client/onboarding/brief/draft', partial),
  })
}

/**
 * Paso 7: sube un archivo de materiales para una categoría y devuelve el asset
 * creado. Dos pasos: 1) subida real vía el módulo de transferencia (blob
 * presignado o PUT server-mode), 2) POST /api/client/onboarding/materials/assets con
 * `{ category, storageKey }` — el backend reclama la key y crea el client_asset
 * (reemplaza la vieja ruta multipart .../materials/upload?category=).
 */
export function useUploadOnboardingMaterial() {
  const queryClient = useQueryClient()
  return useMutation<
    OnboardingAsset,
    Error,
    { category: OnboardingMaterialCategory; file: File; onProgress?: (percent: number) => void; signal?: AbortSignal }
  >({
    mutationFn: async ({ category, file, onProgress, signal }) => {
      const { storageKey } = await uploadFile(file, { purpose: 'onboarding_material', onProgress, signal })
      return apiPost<OnboardingAsset>('/api/client/onboarding/materials/assets', { category, storageKey })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY })
    },
  })
}

/** Paso 7: guarda el estado (done/assetIds/note) de las 4 categorías de materiales. */
export function useSubmitOnboardingMaterials() {
  const queryClient = useQueryClient()
  return useMutation<ClientOnboarding, Error, OnboardingMaterialsState>({
    mutationFn: (materials) => apiPost<ClientOnboarding>('/api/client/onboarding/materials', { materials }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY })
    },
  })
}

/**
 * Paso 7: guarda el estado parcial del checklist (al tildar una categoría,
 * escribir una nota o terminar una subida) sin marcar el paso como completo.
 * Misma razón que el borrador del brief: `done`/`note`/`assetIds` no pueden
 * vivir solo en memoria hasta que el cliente apriete "Continuar".
 */
export function useSaveOnboardingMaterialsDraft() {
  return useMutation<ClientOnboarding, Error, OnboardingMaterialsState>({
    mutationFn: (materials) => apiPatch<ClientOnboarding>('/api/client/onboarding/materials/draft', { materials }),
  })
}

/** Paso 8: gate final. 400 con `{ missing: string[] }` si falta firma/brief/materiales. */
export function useCompleteOnboarding() {
  const queryClient = useQueryClient()
  return useMutation<CompleteOnboardingResultDTO, Error, void>({
    mutationFn: () => apiPost<CompleteOnboardingResultDTO>('/api/client/onboarding/complete'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY })
    },
  })
}

// ─── Marca ───────────────────────────────────────────────────────────────────
// Ver apps/api/src/modules/branding/branding.router.ts (prefix /api/client/branding).

export const CLIENT_BRANDING_QUERY_KEY = ['client', 'branding'] as const

/**
 * Marca vigente del cliente. Una sola query para el formulario de /marca y la
 * sección Onboarding: al guardar, el formulario escribe la respuesta en esta
 * misma key y la otra vista no queda desactualizada.
 */
export function useClientBranding() {
  return useQuery<ClientBranding>({
    queryKey: CLIENT_BRANDING_QUERY_KEY,
    queryFn: () => apiGet<ClientBranding>('/api/client/branding'),
  })
}

/**
 * Guarda nombre/logo/colores de marca (sección "Identidad visual" del tab
 * Marca del onboarding — reusa el mismo endpoint que /marca).
 *
 * A PROPÓSITO no escribe la caché acá (nada de `onSuccess` con
 * `setQueryData`): nombre, logo, color principal y color secundario son 4
 * campos que autoguardan de forma INDEPENDIENTE contra esta misma mutation
 * (una sola instancia compartida en `BrandKitEditor`) y la MISMA query key —
 * si dos PATCHes están en vuelo y el más viejo resuelve después del más
 * nuevo, un `onSuccess` acá pisaría la caché (y el tema re-aplicado) con
 * datos vencidos sin forma de saber que llegó tarde. `BrandKitEditor.save()`
 * SÍ lleva ese orden (un id por request) y escribe la caché + reaplica el
 * tema (`useBranding().apply(...)`) solo si su propia respuesta sigue siendo
 * la más reciente — ver ese componente.
 */
export function useUpdateClientBranding() {
  return useMutation<ClientBranding, Error, UpdateClientBrandingInput>({
    mutationFn: (input) => apiPatch<ClientBranding>('/api/client/branding', input),
  })
}

/**
 * Sube y vincula un archivo de marca (pestaña Marca → "Archivos de marca").
 * Mismo propósito de subida ('onboarding_material') que los materiales del
 * paso 7 — el logo NUNCA sale de acá, ver `useUpdateClientBranding`.
 */
export function useAddBrandFile() {
  const queryClient = useQueryClient()
  return useMutation<
    OnboardingAsset,
    Error,
    { file: File; onProgress?: (percent: number) => void; signal?: AbortSignal }
  >({
    mutationFn: async ({ file, onProgress, signal }) => {
      const { storageKey } = await uploadFile(file, { purpose: 'onboarding_material', onProgress, signal })
      return apiPost<OnboardingAsset>('/api/client/branding/files', { storageKey })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY })
    },
  })
}

/** Soft delete de un archivo de marca (fila `client_asset`, fieldName 'logoBrand'). */
export function useDeleteBrandFile() {
  const queryClient = useQueryClient()
  return useMutation<{ success: true }, Error, string>({
    mutationFn: (id) => apiDelete<{ success: true }>(`/api/client/branding/files/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY })
    },
  })
}

/**
 * Edita `brandIdentity` (única respuesta del brief editable después de
 * completado el onboarding). Actualiza la fila `onboarding` en la caché SIN
 * invalidar — invalidar tiraría también un refetch de `assets` que no cambió
 * y podría pisar una subida recién hecha que todavía no confirmó el backend.
 *
 * `requestIdRef` ordena las respuestas: si el cliente edita, el debounce
 * dispara un PATCH, edita de nuevo antes de que resuelva y ese segundo PATCH
 * resuelve PRIMERO, la respuesta del primero (más vieja) NO debe pisar la
 * caché con el texto anterior — solo la última request lanzada puede
 * escribir.
 */
export function useUpdateBrandIdentity() {
  const queryClient = useQueryClient()
  const requestIdRef = useRef(0)
  return useMutation<ClientOnboarding, Error, string>({
    mutationFn: (brandIdentity) => {
      const myId = ++requestIdRef.current
      return apiPatch<ClientOnboarding>('/api/client/onboarding/brand-identity', { brandIdentity }).then((updated) => {
        if (myId === requestIdRef.current) {
          queryClient.setQueryData<OnboardingStateDTO | undefined>(ONBOARDING_QUERY_KEY, (prev) =>
            prev ? { ...prev, onboarding: updated } : prev,
          )
        }
        return updated
      })
    },
  })
}

// ─── Notificaciones ──────────────────────────────────────────────────────────
// Ver apps/api/src/modules/notifications/notifications.router.ts
// (prefix /api/client/notifications). El destinatario lo resuelve el backend
// desde el token: no se manda ningún id.

const NOTIFICATIONS_KEY = ['client', 'notifications'] as const

/**
 * Solo las 20 más recientes, a propósito: la campana del portal es un panel de
 * novedades (una página del endpoint paginado, sin seguir `meta.nextCursor`) y
 * lo pendiente lo cuenta `useClientUnreadCount` sobre el total.
 */
export function useClientNotifications() {
  return useQuery<ClientNotification[]>({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () => apiGet<ClientNotification[]>('/api/client/notifications?limit=20'),
  })
}

export function useClientUnreadCount() {
  return useQuery<{ count: number }>({
    queryKey: [...NOTIFICATIONS_KEY, 'unread'],
    queryFn: () => apiGet<{ count: number }>('/api/client/notifications/unread-count'),
    // El portal no tiene WebSocket propio (el WS del backend hoy solo resuelve
    // hub_user). Un refetch periódico mantiene el badge vivo sin sumar
    // infraestructura; ver nota de realtime en el informe.
    refetchInterval: 60_000,
  })
}

function useInvalidateNotifications() {
  const queryClient = useQueryClient()
  return () => void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY })
}

export function useMarkNotificationRead() {
  const invalidate = useInvalidateNotifications()
  return useMutation<{ success: boolean }, Error, string>({
    mutationFn: (id) => apiPost<{ success: boolean }>(`/api/client/notifications/${id}/read`),
    onSuccess: invalidate,
  })
}

export function useMarkAllNotificationsRead() {
  const invalidate = useInvalidateNotifications()
  return useMutation<{ success: boolean }, Error, void>({
    mutationFn: () => apiPost<{ success: boolean }>('/api/client/notifications/read-all'),
    onSuccess: invalidate,
  })
}

// ─── Pendientes por sección ──────────────────────────────────────────────────

export interface PortalPending {
  /** Ítems que esperan acción del cliente, por sección. */
  deliverables: Deliverable[]
  forms: ClientIntake[]
  requests: ChangeRequest[]
  invoices: ClientInvoice[]
  counts: { deliverables: number; forms: number; requests: number; invoices: number; total: number }
  isLoading: boolean
  isError: boolean
}

/**
 * Qué está esperando una acción del cliente en cada sección.
 *
 * Devuelve las LISTAS además de los conteos: el sidebar solo necesita el
 * número para el badge, pero las tarjetas del panel de inicio miran el detalle
 * (la de facturas distingue vencida de emitida). Si el hook devolviera solo
 * números, el panel volvería a filtrar por su cuenta y los criterios podrían
 * divergir — que es justo lo que esto evita.
 */
export function usePortalPendingCounts(): PortalPending {
  const deliverables = useClientDeliverables()
  const intakes = useClientIntakes()
  const crs = useClientChangeRequests()
  const invoices = useClientInvoices()

  const pendingDeliverables = (deliverables.data ?? []).filter(
    (d) => d.status === 'pending_review' || d.status === 'changes_requested',
  )
  const pendingForms = (intakes.data ?? []).filter(
    (i) => i.status === 'pending' || i.status === 'in_progress',
  )
  const pendingRequests = (crs.data ?? []).filter((cr) =>
    (['sent', 'negotiating'] as string[]).includes(cr.status),
  )
  // 'sent' y 'overdue': emitida sin saldar. Una pagada no pide nada.
  const alertInvoices = (invoices.data ?? []).filter(
    (inv) => inv.status === 'sent' || inv.status === 'overdue',
  )

  return {
    deliverables: pendingDeliverables,
    forms: pendingForms,
    requests: pendingRequests,
    invoices: alertInvoices,
    counts: {
      deliverables: pendingDeliverables.length,
      forms: pendingForms.length,
      requests: pendingRequests.length,
      invoices: alertInvoices.length,
      total:
        pendingDeliverables.length + pendingForms.length + pendingRequests.length + alertInvoices.length,
    },
    isLoading: deliverables.isLoading || intakes.isLoading || crs.isLoading || invoices.isLoading,
    isError: deliverables.isError || intakes.isError || crs.isError || invoices.isError,
  }
}

// ─── Vista de solo lectura del equipo (portal-view) ──────────────────────────
// Ver apps/api/src/modules/client-auth — GET /api/client-auth/me resuelve
// `viewer` cuando el caller es un admin viendo el portal de una empresa con
// `X-Portal-View: <slug>` (ver apps/api/src/lib/portal-access.ts). Un cliente
// normal siempre recibe `viewer: null`. Hook único: antes `PortalViewBanner`
// duplicaba este fetch a mano — cualquier otro componente que necesite saber
// si está en modo solo lectura reusa esto en vez de volver a pedirlo.

export interface PortalViewer {
  companyId: string
  companySlug: string
}

interface ClientMeDTO {
  id: string
  viewer: PortalViewer | null
}

const CLIENT_ME_QUERY_KEY = ['client-auth', 'me'] as const

export interface PortalViewerResult {
  isPortalView: boolean
  viewer: PortalViewer | null
  isLoading: boolean
  /** La query falló (red, 500, …) — `isPortalView` es `false` en ese caso, pero eso NO significa "confirmado no-viewer". */
  isError: boolean
  /** La query resolvió con éxito — recién ahí `isPortalView` es un dato confiable, no un default. */
  isSuccess: boolean
}

export function usePortalViewer(): PortalViewerResult {
  const query = useQuery<ClientMeDTO>({
    queryKey: CLIENT_ME_QUERY_KEY,
    queryFn: () => apiGet<ClientMeDTO>('/api/client-auth/me'),
    staleTime: Infinity,
  })
  return {
    isPortalView: Boolean(query.data?.viewer),
    viewer: query.data?.viewer ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    isSuccess: query.isSuccess,
  }
}
