'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Upload, Check, Palette } from 'lucide-react'
import { API_URL } from '@portal/lib/config'
import { apiGet, apiPatch } from '@portal/lib/api'
import { useBranding } from '@portal/components/branding/branding-provider'
import { Card, CardContent } from '@portal/components/ui/card'
import { Button } from '@portal/components/ui/button'
import { Input } from '@portal/components/ui/input'
import { Label } from '@portal/components/ui/label'

interface OwnBranding {
  brandName: string | null
  brandLogoKey: string | null
  logoUrl: string | null
  brandPrimary: string | null
  brandSecondary: string | null
}

/**
 * Obtiene el token de Clerk para adjuntar en el header de la subida de archivo.
 * No podemos usar el api-client para multipart/form-data (no soporta FormData),
 * así que leemos el token directo de window.Clerk — igual que getPortalToken en api.ts.
 */
async function getClerkToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clerk = (window as any).Clerk
  if (!clerk?.session) return null
  try {
    return await (clerk.session.getToken() as Promise<string | null>)
  } catch {
    return null
  }
}

async function uploadClientLogo(file: File): Promise<{ storageKey: string; url: string }> {
  const fd = new FormData()
  fd.append('file', file)
  // Token Clerk asíncrono (reemplaza el getter sync de Zustand de la fase pre-CA2).
  const token = await getClerkToken()
  const res = await fetch(`${API_URL}/api/client/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token ?? ''}` },
    body: fd,
  })
  if (!res.ok) throw new Error('No se pudo subir el logo')
  const json = (await res.json()) as { data: { storageKey: string; url: string } }
  return json.data
}

export function BrandKitForm() {
  const { apply } = useBranding()
  const { data, isLoading } = useQuery({
    queryKey: ['my-branding'],
    queryFn: () => apiGet<OwnBranding & { id: string }>('/api/client/branding'),
  })

  const [name, setName] = useState('')
  const [primary, setPrimary] = useState('#16a34a')
  const [secondary, setSecondary] = useState('#0f766e')
  const [logoKey, setLogoKey] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
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

  async function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const r = await uploadClientLogo(file)
      setLogoKey(r.storageKey)
      setLogoUrl(r.url.startsWith('http') ? r.url : `${API_URL}${r.url}`)
    } catch {
      setError('No se pudo subir el logo')
    } finally {
      setUploading(false)
    }
  }

  async function onSave() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const updated = await apiPatch<OwnBranding>('/api/client/branding', {
        brandName: name.trim() || null,
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
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando…
      </div>
    )
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="space-y-1.5">
          <Label>Nombre de tu marca</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu empresa" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5" /> Color principal
            </Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                className="h-10 w-12 cursor-pointer rounded border border-input bg-background"
              />
              <Input value={primary} onChange={(e) => setPrimary(e.target.value)} className="font-mono" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5" /> Color secundario
            </Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={secondary}
                onChange={(e) => setSecondary(e.target.value)}
                className="h-10 w-12 cursor-pointer rounded border border-input bg-background"
              />
              <Input value={secondary} onChange={(e) => setSecondary(e.target.value)} className="font-mono" />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Logo</Label>
          <div className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="logo" className="h-12 w-12 rounded-lg border object-contain" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                —
              </div>
            )}
            <label className="cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={onPickLogo} disabled={uploading} />
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
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
