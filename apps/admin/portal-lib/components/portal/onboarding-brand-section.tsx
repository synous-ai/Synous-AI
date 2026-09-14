'use client'

/**
 * Pestaña "Marca" de la sección Onboarding del portal — EDITABLE.
 *
 * Antes esta pestaña era de solo lectura (ver el historial de
 * `onboarding-panel.tsx`): mostraba lo que el cliente había cargado durante
 * el wizard de 8 pasos, sin forma de corregirlo después. Ahora el cliente
 * puede seguir editando su identidad de marca desde acá — logo, nombre,
 * colores, archivos y la respuesta de brief sobre su marca — sin volver a
 * pasar por el wizard.
 *
 * ─── Reglas de negocio que esto respeta ────────────────────────────────────
 * - El LOGO vive solo en "Identidad visual" (`company`/`client_account`
 *   .brand_logo_key, purpose 'brand_logo'). Nunca aparece en "Archivos de
 *   marca" — filtramos cualquier asset cuya storageKey coincida con el logo
 *   vigente, aunque en teoría no debería pasar.
 * - "Archivos de marca" sube con purpose 'onboarding_material' — igual que
 *   los materiales del paso 7 — y jamás se convierte en el logo.
 * - En modo "portal-view" (un admin mirando el portal de un cliente en solo
 *   lectura, ver `usePortalViewer`) NO se renderiza NINGÚN control de
 *   edición: ni inputs, ni botón de subir, ni de eliminar. El backend
 *   igual rechaza cualquier escritura con 403, pero la UI no debe ni
 *   ofrecerla.
 * - Auditoría y notificación al equipo son 100% server-side (branding.service
 *   y onboarding.service llaman a `recordFieldChanges`/`writeAudit`/
 *   `notifyBrandChange`) — acá no hay nada que replicar.
 */

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ClipboardList,
  Copy,
  Download,
  FileImage,
  Loader2,
  Palette,
  Plus,
  RotateCw,
  Trash2,
  Upload,
} from 'lucide-react'
import { Button } from '@portal/components/ui/button'
import { Card, CardContent } from '@portal/components/ui/card'
import { Input } from '@portal/components/ui/input'
import { Label } from '@portal/components/ui/label'
import { Skeleton } from '@portal/components/ui/skeleton'
import { SkeletonGroup } from '@portal/components/ui/loading-region'
import { Textarea } from '@portal/components/ui/textarea'
import { useBranding } from '@portal/components/branding/branding-provider'
import {
  CLIENT_BRANDING_QUERY_KEY,
  useAddBrandFile,
  useClientBranding,
  useDeleteBrandFile,
  usePortalViewer,
  useUpdateBrandIdentity,
  useUpdateClientBranding,
} from '@portal/lib/hooks'
import { FILE_PURPOSE_ACCEPT, uploadFile, useFileUrl } from '@portal/lib/files'
import { ONBOARDING_BRIEF_BLOCKS } from '@portal/lib/onboarding-content'
import type { OnboardingAsset, OnboardingBriefAnswers, UpdateClientBrandingInput } from '@portal/lib/types'
import { useAutosaveField, type AutosaveState } from '@portal/lib/use-autosave-field'
import {
  CHECKERBOARD,
  KIND_ICON,
  THUMBNAIL_LIMIT,
  Answer,
  SectionCardHeader,
  assetKind,
  formatLabel,
  isPreviewable,
  useAssetDownload,
} from './onboarding-shared'
import { formatSize } from '@portal/lib/utils'

const BRAND_IDENTITY_LABEL =
  ONBOARDING_BRIEF_BLOCKS.flatMap((b) => b.fields).find((f) => f.key === 'brandIdentity')?.label ??
  '¿Ya tenés identidad de marca definida?'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

// ─── Estado de guardado (UI compartida por todos los campos autoguardables) ──
// El autoguardado en sí (debounce, orden de respuestas, flush al desmontar)
// vive en el hook compartido `useAutosaveField` — ver portal-lib/lib/use-autosave-field.ts.

function SaveStatus({
  state,
  error,
  onRetry,
}: {
  state: AutosaveState
  error?: string | null
  onRetry?: () => void
}) {
  // UNA sola live region para todo el status (saving/saved/error): antes el
  // caso de error anidaba otro `role="alert"` (asertivo) adentro de este
  // `aria-live="polite"`, y el lector de pantalla anunciaba el mensaje dos
  // veces.
  return (
    <span aria-live="polite" role="status" className="inline-flex min-h-[1.25rem] items-center gap-1.5 text-xs text-muted-foreground">
      {state === 'saving' && (
        <>
          <Loader2 className="h-3 w-3 animate-spin" /> Guardando…
        </>
      )}
      {state === 'saved' && (
        <>
          <Check className="h-3 w-3 text-primary" /> Guardado
        </>
      )}
      {state === 'error' && (
        <span className="inline-flex items-center gap-1.5 text-destructive">
          {error ?? 'No se pudo guardar.'}
          {onRetry && (
            <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2">
              Reintentar
            </button>
          )}
        </span>
      )}
    </span>
  )
}

// ─── Identidad visual — editable ──────────────────────────────────────────────

function NameField({
  serverValue,
  onSave,
}: {
  serverValue: string | null
  onSave: (name: string | null) => Promise<unknown>
}) {
  const auto = useAutosaveField<string>({
    serverValue: serverValue ?? '',
    toKey: (v) => v.trim(),
    isValid: () => true,
    save: (v) => onSave(v.trim() || null),
  })

  return (
    <div className="space-y-1.5">
      <Label htmlFor="brand-name">Nombre de la marca</Label>
      <Input
        id="brand-name"
        value={auto.value}
        onChange={(e) => auto.setValue(e.target.value)}
        onBlur={() => void auto.commit(auto.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        placeholder="Tu empresa"
        maxLength={60}
        aria-describedby="brand-name-status"
      />
      <div id="brand-name-status">
        <SaveStatus state={auto.state} error={auto.error} onRetry={() => void auto.commit(auto.value)} />
      </div>
    </div>
  )
}

function ColorField({
  id,
  label,
  serverValue,
  onSave,
}: {
  id: string
  label: string
  serverValue: string | null
  onSave: (hex: string) => Promise<unknown>
}) {
  const fallback = serverValue ?? '#16a34a'
  const [copied, setCopied] = useState(false)
  const auto = useAutosaveField<string>({
    serverValue: serverValue ?? fallback,
    // Comparación case-insensitive: el input nativo `type="color"` siempre
    // emite hex en minúscula, así que sin esto un color guardado en
    // mayúsculas (o al revés) disparaba un PATCH redundante en cada edición.
    toKey: (v) => v.toLowerCase(),
    isValid: (v) => HEX_RE.test(v),
    save: (v) => onSave(v),
    debounceMs: 600,
  })

  const isValid = HEX_RE.test(auto.value)

  function handleChange(next: string) {
    auto.setValue(next)
    if (HEX_RE.test(next)) auto.schedule(next)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(auto.value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* sin permiso de portapapeles: el código queda visible para copiarlo a mano */
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        <Palette className="h-3.5 w-3.5" /> {label}
      </Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`Selector de color — ${label}`}
          value={isValid ? auto.value : fallback}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={auto.flush}
          className="h-10 w-12 shrink-0 cursor-pointer rounded border border-input bg-background"
        />
        <Input
          id={id}
          value={auto.value}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={auto.flush}
          className="font-mono uppercase"
          maxLength={7}
          aria-invalid={!isValid}
          aria-describedby={`${id}-status`}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void copy()}
          aria-label={`Copiar ${label.toLowerCase()} (${auto.value})`}
          title={copied ? 'Copiado' : 'Copiar'}
          disabled={!isValid}
        >
          {copied ? <Check className="text-primary" /> : <Copy />}
        </Button>
      </div>
      <div id={`${id}-status`}>
        {!isValid ? (
          <p role="alert" className="text-xs text-destructive">
            Formato inválido — usá #RRGGBB.
          </p>
        ) : (
          <SaveStatus state={auto.state} error={auto.error} onRetry={() => void auto.commit(auto.value)} />
        )}
      </div>
    </div>
  )
}

function LogoEditor({
  logoKey,
  logoUrl,
  onUpload,
  onRemove,
}: {
  logoKey: string | null
  logoUrl: string | null
  onUpload: (file: File) => Promise<unknown>
  onRemove: () => Promise<unknown>
}) {
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [broken, setBroken] = useState(false)

  useEffect(() => setBroken(false), [logoUrl])

  // Revoca el object URL local al reemplazarlo, al confirmarse la key nueva o
  // al desmontar — si no, cada logo elegido filtra la memoria del anterior.
  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl)
    }
  }, [localPreviewUrl])

  useEffect(() => {
    setLocalPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    // Solo cuando la key persistida cambia (subida confirmada o logo quitado).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoKey])

  const preview = localPreviewUrl ?? (!broken ? logoUrl : null)

  async function handlePick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLocalPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    setUploading(true)
    setUploadError(null)
    try {
      await onUpload(file)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'No se pudo subir el logo')
      setLocalPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove() {
    setRemoving(true)
    setRemoveError(null)
    try {
      await onRemove()
      setConfirmingRemove(false)
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'No se pudo quitar el logo')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <Label>Logo</Label>
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-border"
          style={CHECKERBOARD}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Logo de tu marca"
              onError={() => setBroken(true)}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-xs text-muted-foreground">Sin logo</span>
          )}
        </div>
        <label className="cursor-pointer">
          <input
            type="file"
            accept={FILE_PURPOSE_ACCEPT.brand_logo}
            className="sr-only"
            onChange={(e) => void handlePick(e)}
            disabled={uploading}
          />
          <span className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {logoKey ? 'Reemplazar' : 'Subir logo'}
          </span>
        </label>
        {logoKey && !confirmingRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingRemove(true)} disabled={uploading}>
            <Trash2 className="h-3.5 w-3.5" /> Quitar
          </Button>
        )}
        {confirmingRemove && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">¿Quitar el logo?</span>
            <Button type="button" variant="destructive" size="sm" onClick={() => void handleRemove()} disabled={removing}>
              {removing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Sí, quitar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingRemove(false)} disabled={removing}>
              Cancelar
            </Button>
          </div>
        )}
      </div>
      {uploadError && (
        <p role="alert" className="text-xs text-destructive">
          {uploadError}
        </p>
      )}
      {removeError && (
        <p role="alert" className="text-xs text-destructive">
          {removeError}
        </p>
      )}
    </div>
  )
}

function BrandKitEditor() {
  const { data, isLoading, isError, isFetching, refetch } = useClientBranding()
  const updateBranding = useUpdateClientBranding()
  const { apply } = useBranding()
  const queryClient = useQueryClient()
  // Nombre, logo, color principal y color secundario comparten esta MISMA
  // mutation y la misma query key — este id ordena sus respuestas entre sí
  // (no solo dentro de un campo): si dos PATCHes están en vuelo y el más
  // viejo resuelve después del más nuevo, esa respuesta vencida no debe
  // pisar la caché ni re-tematizar el portal con datos desactualizados.
  const requestIdRef = useRef(0)

  async function save(patch: UpdateClientBrandingInput) {
    const myId = ++requestIdRef.current
    const updated = await updateBranding.mutateAsync(patch)
    if (myId !== requestIdRef.current) return updated
    queryClient.setQueryData(CLIENT_BRANDING_QUERY_KEY, updated)
    apply({
      brandName: updated.brandName,
      logoUrl: updated.logoUrl,
      primaryColor: updated.brandPrimary,
      secondaryColor: updated.brandSecondary,
    })
    return updated
  }

  return (
    <Card>
      <SectionCardHeader
        icon={Palette}
        title="Identidad visual"
        description="El nombre, logo y colores con los que trabajamos tu proyecto."
      />
      <CardContent>
        {!data && (isLoading || !isError) ? (
          <SkeletonGroup label="Cargando tu marca…" className="space-y-5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-10 w-full rounded-md" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-16 w-full rounded-md" />
              <Skeleton className="h-16 w-full rounded-md" />
            </div>
            <Skeleton className="h-16 w-40 rounded-md" />
          </SkeletonGroup>
        ) : !data ? (
          <div role="alert" className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-destructive">No pudimos cargar tu identidad visual.</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="animate-spin" /> : <RotateCw />}
              Reintentar
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <NameField serverValue={data.brandName} onSave={(brandName) => save({ brandName })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorField
                id="brand-primary"
                label="Color principal"
                serverValue={data.brandPrimary}
                onSave={(hex) => save({ brandPrimary: hex })}
              />
              <ColorField
                id="brand-secondary"
                label="Color secundario"
                serverValue={data.brandSecondary}
                onSave={(hex) => save({ brandSecondary: hex })}
              />
            </div>
            <LogoEditor
              logoKey={data.brandLogoKey}
              logoUrl={data.logoUrl}
              onUpload={async (file) => {
                const { storageKey } = await uploadFile(file, { purpose: 'brand_logo' })
                await save({ brandLogoKey: storageKey })
              }}
              onRemove={() => save({ brandLogoKey: null })}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Identidad visual — solo lectura (portal-view) ────────────────────────────

function ColorSwatchReadOnly({ label, hex }: { label: string; hex: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(hex)
      setCopied(true)
    } catch {
      /* sin permiso de portapapeles: el código queda visible para copiarlo a mano */
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border p-3">
      <span aria-hidden className="h-10 w-10 shrink-0 rounded-lg border border-white/10" style={{ backgroundColor: hex }} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-mono text-sm uppercase text-foreground">{hex}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => void copy()}
        aria-label={`Copiar ${label.toLowerCase()} (${hex})`}
        title={copied ? 'Copiado' : 'Copiar'}
      >
        {copied ? <Check className="text-primary" /> : <Copy />}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? `${label} copiado` : ''}
      </span>
    </div>
  )
}

function BrandKitReadOnly() {
  const { data, isLoading, isError, isFetching, refetch } = useClientBranding()
  const [logoBroken, setLogoBroken] = useState(false)

  useEffect(() => setLogoBroken(false), [data?.logoUrl])

  const hasBrand = Boolean(data && (data.brandName || data.logoUrl || data.brandPrimary || data.brandSecondary))

  return (
    <Card>
      <SectionCardHeader
        icon={Palette}
        title="Identidad visual"
        description="El nombre, logo y colores con los que trabajamos tu proyecto."
      />
      <CardContent>
        {!data && (isLoading || !isError) ? (
          <SkeletonGroup label="Cargando tu marca…" className="flex flex-col gap-5 sm:flex-row">
            <Skeleton className="h-24 w-full rounded-xl sm:w-40" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          </SkeletonGroup>
        ) : !data ? (
          <div role="alert" className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-destructive">No pudimos cargar tu identidad visual.</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="animate-spin" /> : <RotateCw />}
              Reintentar
            </Button>
          </div>
        ) : !hasBrand ? (
          <p className="text-sm text-muted-foreground/70">Todavía no hay una identidad visual cargada.</p>
        ) : (
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div
              className="flex h-24 w-full shrink-0 items-center justify-center rounded-xl border border-border p-3 sm:w-40"
              style={CHECKERBOARD}
            >
              {data.logoUrl && !logoBroken ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.logoUrl}
                  alt={`Logo de ${data.brandName || 'tu marca'}`}
                  onError={() => setLogoBroken(true)}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="text-xs text-muted-foreground">{logoBroken ? 'No se pudo cargar el logo' : 'Sin logo'}</span>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">Nombre de la marca</p>
                <p className="mt-0.5 text-sm font-medium text-foreground">{data.brandName || 'Sin nombre'}</p>
              </div>
              {(data.brandPrimary || data.brandSecondary) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.brandPrimary && <ColorSwatchReadOnly label="Color principal" hex={data.brandPrimary} />}
                  {data.brandSecondary && <ColorSwatchReadOnly label="Color secundario" hex={data.brandSecondary} />}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Archivos de marca ────────────────────────────────────────────────────────

interface UploadItem {
  id: string
  file: File
  progress: number
  status: 'uploading' | 'error'
  error?: string
}

function BrandFilesUploader() {
  const addFile = useAddBrandFile()
  const [items, setItems] = useState<UploadItem[]>([])

  function uploadOne(file: File, existingId?: string) {
    const id = existingId ?? `${file.name}-${Date.now()}-${Math.random()}`
    setItems((prev) => [...prev.filter((it) => it.id !== id), { id, file, progress: 0, status: 'uploading' as const }])
    addFile.mutate(
      {
        file,
        onProgress: (percent) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, progress: percent } : it))),
      },
      {
        onSuccess: () => setItems((prev) => prev.filter((it) => it.id !== id)),
        onError: (err) =>
          setItems((prev) =>
            prev.map((it) =>
              it.id === id ? { ...it, status: 'error', error: err instanceof Error ? err.message : 'No se pudo subir' } : it,
            ),
          ),
      },
    )
  }

  function handleSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    for (const file of files) uploadOne(file)
  }

  return (
    <div className="space-y-3">
      <label className="inline-block cursor-pointer">
        <input
          type="file"
          multiple
          accept={FILE_PURPOSE_ACCEPT.onboarding_material}
          className="sr-only"
          onChange={handleSelect}
        />
        <span className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent">
          <Plus className="h-4 w-4" /> Agregar archivos
        </span>
      </label>
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 rounded-lg border border-border p-2 text-sm">
              <span className="min-w-0 flex-1 truncate" title={it.file.name}>
                {it.file.name}
              </span>
              {it.status === 'uploading' ? (
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {it.progress}%
                </span>
              ) : (
                <span role="alert" className="flex shrink-0 items-center gap-2 text-xs text-destructive">
                  {it.error}
                  <button type="button" className="font-medium underline underline-offset-2" onClick={() => uploadOne(it.file, it.id)}>
                    Reintentar
                  </button>
                  <button
                    type="button"
                    className="font-medium underline underline-offset-2"
                    onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}
                  >
                    Quitar
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function BrandFileTile({
  asset,
  withThumbnail,
  deletable,
  onPreview,
}: {
  asset: OnboardingAsset
  withThumbnail: boolean
  deletable: boolean
  onPreview: (asset: OnboardingAsset) => void
}) {
  const kind = assetKind(asset)
  const Icon = KIND_ICON[kind]
  const previewable = isPreviewable(kind)
  const thumbnail = useFileUrl(withThumbnail ? asset.storageKey : null)
  const [broken, setBroken] = useState(false)
  const { downloading, failed, download } = useAssetDownload(asset.storageKey)
  const [confirming, setConfirming] = useState(false)
  const deleteFile = useDeleteBrandFile()

  const showImage = withThumbnail && thumbnail.url && !broken
  const loadingThumbnail = withThumbnail && !thumbnail.url && !thumbnail.error && !broken

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => onPreview(asset)}
        disabled={!previewable}
        aria-label={`Ver ${asset.name}`}
        className="flex aspect-[4/3] w-full items-center justify-center p-4 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default"
        style={CHECKERBOARD}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnail.url!}
            alt=""
            onError={() => setBroken(true)}
            className="max-h-full max-w-full object-contain"
          />
        ) : loadingThumbnail ? (
          <Skeleton className="h-full w-full rounded-md" />
        ) : (
          <Icon className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
        )}
      </button>
      <div className="flex items-center gap-2 border-t border-border p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground" title={asset.name}>
            {asset.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {[formatLabel(asset), formatSize(asset.sizeBytes)].filter(Boolean).join(' · ')}
          </p>
          {failed && (
            <p role="alert" className="text-xs text-destructive">
              No se pudo abrir
            </p>
          )}
          {deleteFile.isError && (
            <p role="alert" className="text-xs text-destructive">
              No pudimos eliminar el archivo. Probá de nuevo.
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void download()}
          disabled={downloading}
          aria-label={`Descargar ${asset.name}`}
        >
          {downloading ? <Loader2 className="animate-spin" /> : <Download />}
        </Button>
        {deletable && !confirming && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setConfirming(true)}
            aria-label={`Eliminar ${asset.name}`}
          >
            <Trash2 />
          </Button>
        )}
      </div>
      {deletable && confirming && (
        <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/20 p-2 text-xs">
          <span>¿Eliminar este archivo?</span>
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                deleteFile.mutate(asset.id, { onSuccess: () => setConfirming(false) })
              }}
              disabled={deleteFile.isPending}
            >
              {deleteFile.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Sí, eliminar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={deleteFile.isPending}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

// ─── Identidad de marca contada en el brief ───────────────────────────────────

function BrandIdentityEditor({
  value,
  onSave,
}: {
  value: string | null
  onSave: (text: string) => Promise<unknown>
}) {
  const auto = useAutosaveField<string>({
    serverValue: value ?? '',
    toKey: (v) => v.trim(),
    isValid: (v) => {
      const t = v.trim()
      return t.length > 0 && t.length <= 500
    },
    save: (v) => onSave(v.trim()),
    debounceMs: 800,
  })

  const trimmed = auto.value.trim()

  function handleChange(next: string) {
    auto.setValue(next)
    const nextTrimmed = next.trim()
    if (nextTrimmed.length > 0 && nextTrimmed.length <= 500) auto.schedule(next)
  }

  return (
    <div className="space-y-2">
      <Textarea
        id="brand-identity"
        aria-label={BRAND_IDENTITY_LABEL}
        value={auto.value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={auto.flush}
        rows={4}
        maxLength={500}
        aria-describedby="brand-identity-status"
        aria-invalid={trimmed.length === 0}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div id="brand-identity-status">
          {trimmed.length === 0 ? (
            <p role="alert" className="text-xs text-destructive">
              No puede quedar vacío.
            </p>
          ) : (
            <SaveStatus state={auto.state} error={auto.error} onRetry={() => void auto.commit(auto.value)} />
          )}
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{auto.value.length}/500</span>
      </div>
    </div>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function OnboardingBrandSection({
  brief,
  assets,
  onPreview,
}: {
  brief: OnboardingBriefAnswers | null
  assets: OnboardingAsset[]
  onPreview: (asset: OnboardingAsset) => void
}) {
  const viewer = usePortalViewer()
  const brandingQuery = useClientBranding()
  const updateBrandIdentity = useUpdateBrandIdentity()

  // Fail CLOSED: los controles de edición se muestran SOLO cuando la query de
  // /api/client-auth/me confirmó con éxito que esta sesión NO es portal-view.
  // Mientras está cargando, o si falla (red, 500), `isPortalView` cae a
  // `false` por default — mostrar edición en ese caso dejaría a un admin
  // viendo el portal con controles que el backend igual rechaza con 403, pero
  // que la UI nunca debió ofrecer.
  const editable = viewer.isSuccess && !viewer.isPortalView

  const currentLogoKey = brandingQuery.data?.brandLogoKey ?? null
  const brandFiles = assets.filter((a) => a.fieldName === 'logoBrand' && a.storageKey !== currentLogoKey)
  const thumbnailIds = new Set(
    brandFiles
      .filter((a) => assetKind(a) === 'image')
      .slice(0, THUMBNAIL_LIMIT)
      .map((a) => a.id),
  )

  return (
    <div className="space-y-4">
      {editable ? <BrandKitEditor /> : <BrandKitReadOnly />}

      <Card>
        <SectionCardHeader
          icon={FileImage}
          title="Archivos de marca"
          description={
            editable
              ? 'Manual, piezas y otros archivos de tu marca. El logo se carga en Identidad visual.'
              : 'Manual y piezas de marca que compartiste en el onboarding. El logo vive en Identidad visual.'
          }
        />
        <CardContent className="space-y-4">
          {editable && <BrandFilesUploader />}
          {brandFiles.length === 0 ? (
            <p className="text-sm text-muted-foreground/70">
              {editable ? 'Todavía no subiste archivos de marca.' : 'No subiste archivos de marca durante el onboarding.'}
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
              {brandFiles.map((asset) => (
                <BrandFileTile
                  key={asset.id}
                  asset={asset}
                  withThumbnail={thumbnailIds.has(asset.id)}
                  deletable={editable}
                  onPreview={onPreview}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <SectionCardHeader
          icon={ClipboardList}
          title="Lo que nos contaste de tu marca"
          description="Tu respuesta en el brief del onboarding."
        />
        <CardContent>
          {editable && brief ? (
            <div className="space-y-1.5">
              <Label htmlFor="brand-identity" className="text-sm font-normal text-muted-foreground">
                {BRAND_IDENTITY_LABEL}
              </Label>
              <BrandIdentityEditor value={brief.brandIdentity} onSave={(text) => updateBrandIdentity.mutateAsync(text)} />
            </div>
          ) : (
            <dl>
              <dt className="text-sm text-muted-foreground">{BRAND_IDENTITY_LABEL}</dt>
              <Answer value={brief?.brandIdentity} />
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
