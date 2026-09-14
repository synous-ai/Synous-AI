'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Upload, Check, Palette } from 'lucide-react'
import { apiPatch } from '@portal/lib/api'
import { uploadFile, FILE_PURPOSE_ACCEPT } from '@portal/lib/files'
import { CLIENT_BRANDING_QUERY_KEY, useClientBranding } from '@portal/lib/hooks'
import type { ClientBranding } from '@portal/lib/types'
import { useBranding } from '@portal/components/branding/branding-provider'
import { Card, CardContent } from '@portal/components/ui/card'
import { Button } from '@portal/components/ui/button'
import { Input } from '@portal/components/ui/input'
import { Label } from '@portal/components/ui/label'
import { Skeleton } from '@portal/components/ui/skeleton'
import { SkeletonGroup } from '@portal/components/ui/loading-region'

export function BrandKitForm() {
  const { apply } = useBranding()
  const queryClient = useQueryClient()
  const { data, isLoading } = useClientBranding()

  const [name, setName] = useState<string | null>(null)
  const [primary, setPrimary] = useState<string | null>(null)
  const [secondary, setSecondary] = useState<string | null>(null)
  const [logoKey, setLogoKey] = useState<string | null>(null)
  // logoUrl ahora apunta a la ruta pública de logos (GET /api/public/files/brand-logo/*
  // vía branding.service.ts) — un <img src> pelado ya funciona sin token.
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  // Preview de un logo recién elegido pero AÚN NO guardado: usamos un object
  // URL local del `File`, no la key que devuelve la subida. Esa key es
  // "huérfana" hasta el PATCH de /api/client/branding (no quedó escrita en
  // ninguna tabla todavía, así que no tiene sentido pedirle una URL de acceso
  // al backend para ella).
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null)
  const logoPreview = localPreviewUrl ?? logoUrl
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (data) {
      setName(data.brandName ?? '')
      setPrimary(data.brandPrimary ?? '#16a34a')
      setSecondary(data.brandSecondary ?? '#0f766e')
      setLogoKey(data.brandLogoKey ?? '')
      setLogoUrl(data.logoUrl ?? '')
    }
  }, [data])

  // Revoca el object URL local al reemplazarlo o al desmontar — si no, cada
  // logo elegido filtra la memoria del blob anterior.
  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl)
    }
  }, [localPreviewUrl])

  async function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Preview inmediato con un object URL local del File: no depende de la
    // subida ni de una URL de acceso del backend (ver comentario de localPreviewUrl arriba).
    setLocalPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    setUploading(true)
    setError(null)
    try {
      const { storageKey } = await uploadFile(file, { purpose: 'brand_logo' })
      setLogoKey(storageKey)
      // NO seteamos logoUrl acá a propósito: la key recién subida es huérfana
      // (todavía no quedó escrita en ninguna tabla) hasta que se guarde el
      // branding con onSave(). El preview mientras tanto lo cubre
      // localPreviewUrl; logoUrl solo refleja lo YA persistido en el servidor.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el logo')
    } finally {
      setUploading(false)
    }
  }

  async function onSave() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const updated = await apiPatch<ClientBranding>('/api/client/branding', {
        brandName: (name ?? '').trim() || null,
        brandLogoKey: logoKey || null,
        brandPrimary: primary || null,
        brandSecondary: secondary || null,
      })
      // Re-tematiza el portal en vivo.
      apply({
        brandName: updated.brandName,
        logoUrl: updated.logoUrl,
        primaryColor: updated.brandPrimary,
        secondaryColor: updated.brandSecondary,
      })
      // El logo ya quedó persistido (company/client_account.brand_logo_key):
      // a partir de acá el preview vuelve a apoyarse en logoUrl (autorizado
      // para cualquier actor autenticado, ver files.authz.ts) y soltamos el
      // object URL local, que ya cumplió su función.
      queryClient.setQueryData(CLIENT_BRANDING_QUERY_KEY, updated)
      setLogoUrl(updated.logoUrl ?? '')
      setLocalPreviewUrl(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading || name === null) {
    return (
      <Card>
        <CardContent className="space-y-5 p-6">
          <SkeletonGroup label="Cargando configuración de marca…" className="space-y-5">
            {/* Nombre */}
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
            {/* 2 color pickers */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-10 w-12 rounded" />
                  <Skeleton className="h-10 flex-1 rounded-md" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-10 w-12 rounded" />
                  <Skeleton className="h-10 flex-1 rounded-md" />
                </div>
              </div>
            </div>
            {/* Logo */}
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-12" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-12 w-12 rounded-lg" />
                <Skeleton className="h-10 w-28 rounded-md" />
              </div>
            </div>
            {/* Botón */}
            <div className="flex justify-end">
              <Skeleton className="h-10 w-24 rounded-md" />
            </div>
          </SkeletonGroup>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="space-y-1.5">
          <Label>Nombre de tu marca</Label>
          <Input value={name ?? ''} onChange={(e) => setName(e.target.value)} placeholder="Tu empresa" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5" /> Color principal
            </Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primary ?? '#16a34a'}
                onChange={(e) => setPrimary(e.target.value)}
                className="h-10 w-12 cursor-pointer rounded border border-input bg-background"
              />
              <Input value={primary ?? '#16a34a'} onChange={(e) => setPrimary(e.target.value)} className="font-mono" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5" /> Color secundario
            </Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={secondary ?? '#0f766e'}
                onChange={(e) => setSecondary(e.target.value)}
                className="h-10 w-12 cursor-pointer rounded border border-input bg-background"
              />
              <Input value={secondary ?? '#0f766e'} onChange={(e) => setSecondary(e.target.value)} className="font-mono" />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Logo</Label>
          <div className="flex items-center gap-3">
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPreview} alt="logo" className="h-12 w-12 rounded-lg border object-contain" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                —
              </div>
            )}
            <label className="cursor-pointer">
              <input
                type="file"
                accept={FILE_PURPOSE_ACCEPT.brand_logo}
                className="hidden"
                onChange={onPickLogo}
                disabled={uploading}
              />
              <span className="inline-flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Subir logo
              </span>
            </label>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center justify-end gap-3">
          {saved && (
            <span className="inline-flex items-center gap-1 text-sm text-primary">
              <Check className="h-4 w-4" /> Guardado
            </span>
          )}
          <Button onClick={onSave} disabled={saving || uploading}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
