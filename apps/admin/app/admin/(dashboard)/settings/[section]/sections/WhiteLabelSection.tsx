'use client'

import { useState } from 'react'
import { Loader2, Upload, Save, Globe, Palette } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { useClientBranding, useUpdateBranding, uploadBrandLogo } from '@/lib/hooks'
import type { ClientBranding } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'

function BrandingEditor({ account }: { account: ClientBranding }) {
  const update = useUpdateBranding()
  const [slug, setSlug] = useState(account.brandSlug ?? '')
  const [name, setName] = useState(account.brandName ?? '')
  const [primary, setPrimary] = useState(account.brandPrimary ?? '#16a34a')
  const [secondary, setSecondary] = useState(account.brandSecondary ?? '#0f766e')
  const [logoKey, setLogoKey] = useState(account.brandLogoKey ?? '')
  const [logoUrl, setLogoUrl] = useState(account.logoUrl ?? '')
  const [uploading, setUploading] = useState(false)

  async function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const r = await uploadBrandLogo(file)
      setLogoKey(r.storageKey)
      setLogoUrl(r.url.startsWith('http') ? r.url : URL.createObjectURL(file))
      toast.success('Logo subido — acordate de guardar')
    } catch {
      toast.error('No se pudo subir el logo')
    } finally {
      setUploading(false)
    }
  }

  function onSave() {
    update.mutate(
      {
        id: account.id,
        input: {
          brandSlug: slug.trim() || null,
          brandName: name.trim() || null,
          brandLogoKey: logoKey || null,
          brandPrimary: primary || null,
          brandSecondary: secondary || null,
        },
      },
      {
        onSuccess: () => toast.success('Branding guardado'),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo guardar'),
      },
    )
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">{account.email}</p>
          {slug && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">
              <Globe className="h-3 w-3" />
              /c/{slug}
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Nombre de Marca</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc." />
          </div>
          <div className="space-y-1.5">
            <Label>Slug (URL)</Label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="acme"
            />
          </div>
        </div>

        {/* Colores */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5" /> Color Primary
            </Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-input bg-background"
              />
              <Input value={primary} onChange={(e) => setPrimary(e.target.value)} className="font-mono" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5" /> Color Secondary
            </Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={secondary}
                onChange={(e) => setSecondary(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-input bg-background"
              />
              <Input value={secondary} onChange={(e) => setSecondary(e.target.value)} className="font-mono" />
            </div>
          </div>
        </div>

        {/* Logo */}
        <div className="space-y-1.5">
          <Label>Logo</Label>
          <div className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="logo" className="h-10 w-10 rounded-lg border object-contain" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                —
              </div>
            )}
            <label className="cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={onPickLogo} disabled={uploading} />
              <span className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Subir logo
              </span>
            </label>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={onSave} disabled={update.isPending}>
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function WhiteLabelSection() {
  const { data, isLoading } = useClientBranding()

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Personalizá la identidad del portal por cliente. Cada uno entra por su URL{' '}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">/c/&lt;slug&gt;</code> y ve su propio
        logo, nombre y colores. El admin siempre queda con la marca NOUS.
      </p>

      {isLoading ? (
        /* Skeleton de branding editors: imita las tarjetas de configuración por cliente */
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-5 space-y-4">
              <Skeleton className="h-5 w-48" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
              <Skeleton className="h-9 w-28" />
            </div>
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyIllustration icon={Palette} />
            <EmptyTitle>Sin Clientes Aún</EmptyTitle>
            <EmptyDescription>
              Cuando tengas cuentas de cliente activas vas a poder personalizar su branding acá.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-4">
          {data.map((account) => (
            <BrandingEditor key={account.id} account={account} />
          ))}
        </div>
      )}
    </div>
  )
}
