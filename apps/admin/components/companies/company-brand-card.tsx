'use client'

/**
 * Tarjeta "Marca" del detalle de empresa (panel interno) — edita el mismo
 * branding que el cliente ve/edita en su portal (`company.brand_*`), vía
 * PATCH /api/companies/:id/branding. Auditado server-side en `record_history`
 * (entityType 'company', field_name brandName/brandLogoKey/brandPrimary/
 * brandSecondary — ver lib/history.ts) pero NO notifica: es el propio equipo
 * el que hace el cambio.
 *
 * Cada campo autoguarda con un estado de guardado visible propio, igual que
 * la sección Marca del portal (`portal-lib/components/portal/
 * onboarding-brand-section.tsx`) — mismo patrón, instancia separada porque
 * vive en el design system del admin (Dialog para la confirmación de borrar
 * logo en vez del inline confirm del portal).
 */

import { useEffect, useState, type ChangeEvent } from 'react'
import { Check, Copy, Loader2, Palette, RotateCw, Trash2, Upload } from 'lucide-react'
import { useCompanyDetail, useUpdateCompanyBranding } from '@/lib/hooks'
import { uploadFile, FILE_PURPOSE_ACCEPT } from '@/lib/hooks'
import type { CompanyBrandingInput } from '@/lib/hooks/companies'
import { useAutosaveField, type AutosaveState } from '@portal/lib/use-autosave-field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { SkeletonGroup } from '@/components/ui/loading-region'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

/** Damero detrás del logo: sin él, un PNG transparente se pierde en el fondo. */
const CHECKERBOARD = {
  backgroundImage: 'repeating-conic-gradient(rgba(0,0,0,0.04) 0% 25%, transparent 0% 50%)',
  backgroundSize: '16px 16px',
} as const

// ─── Estado de guardado (UI) ────────────────────────────────────────────────
// El autoguardado en sí (debounce, orden de respuestas, flush al desmontar)
// vive en el hook compartido `useAutosaveField` — ver
// portal-lib/lib/use-autosave-field.ts (compartido con el portal, mismo
// patrón que la sección Marca del onboarding).

function SaveStatus({ state, error, onRetry }: { state: AutosaveState; error?: string | null; onRetry?: () => void }) {
  // UNA sola live region: antes el caso de error anidaba otro `role="alert"`
  // (asertivo) adentro de este `aria-live="polite"` y se anunciaba dos veces.
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

// ─── Campos ────────────────────────────────────────────────────────────────────

function NameField({ serverValue, onSave }: { serverValue: string | null; onSave: (name: string | null) => Promise<unknown> }) {
  const auto = useAutosaveField<string>({
    serverValue: serverValue ?? '',
    toKey: (v) => v.trim(),
    isValid: () => true,
    save: (v) => onSave(v.trim() || null),
  })

  return (
    <div className="space-y-1.5">
      <Label htmlFor="company-brand-name">Nombre de la marca</Label>
      <Input
        id="company-brand-name"
        value={auto.value}
        onChange={(e) => auto.setValue(e.target.value)}
        onBlur={() => void auto.commit(auto.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        placeholder="Nombre visible en el portal del cliente"
        maxLength={60}
        aria-describedby="company-brand-name-status"
      />
      <div id="company-brand-name-status">
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
  const auto = useAutosaveField<string>({
    serverValue: serverValue ?? fallback,
    // Comparación case-insensitive: el input nativo `type="color"` siempre
    // emite hex en minúscula — sin esto, un color guardado con otra
    // capitalización disparaba un PATCH redundante en cada edición.
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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [broken, setBroken] = useState(false)

  useEffect(() => setBroken(false), [logoUrl])

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
      setConfirmOpen(false)
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
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-border" style={CHECKERBOARD}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Logo de la empresa"
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
        {logoKey && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmOpen(true)} disabled={uploading}>
            <Trash2 className="h-3.5 w-3.5" /> Quitar
          </Button>
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
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Quitar el logo?"
        description="El cliente va a dejar de ver este logo en su portal."
        confirmLabel="Quitar logo"
        destructive
        pending={removing}
        onConfirm={() => void handleRemove()}
      />
    </div>
  )
}

// ─── Tarjeta ────────────────────────────────────────────────────────────────────

export function CompanyBrandCard({ companyId }: { companyId: string }) {
  const { data, isLoading, isError, isFetching, refetch } = useCompanyDetail(companyId)
  const updateBranding = useUpdateCompanyBranding()
  const co = data?.company

  async function save(input: CompanyBrandingInput) {
    return updateBranding.mutateAsync({ id: companyId, input })
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <Palette className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-base">Marca</CardTitle>
      </CardHeader>
      <CardContent>
        {!co && isLoading ? (
          <SkeletonGroup label="Cargando la marca…" className="space-y-5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-10 w-full rounded-md" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-16 w-full rounded-md" />
              <Skeleton className="h-16 w-full rounded-md" />
            </div>
            <Skeleton className="h-16 w-40 rounded-md" />
          </SkeletonGroup>
        ) : !co || isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-destructive">No pudimos cargar la marca de esta empresa.</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="animate-spin" /> : <RotateCw />}
              Reintentar
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <NameField serverValue={co.brandName ?? null} onSave={(brandName) => save({ brandName })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorField
                id="company-brand-primary"
                label="Color principal"
                serverValue={co.brandPrimary ?? null}
                onSave={(hex) => save({ brandPrimary: hex })}
              />
              <ColorField
                id="company-brand-secondary"
                label="Color secundario"
                serverValue={co.brandSecondary ?? null}
                onSave={(hex) => save({ brandSecondary: hex })}
              />
            </div>
            <LogoEditor
              logoKey={co.brandLogoKey ?? null}
              logoUrl={co.logoUrl ?? null}
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
