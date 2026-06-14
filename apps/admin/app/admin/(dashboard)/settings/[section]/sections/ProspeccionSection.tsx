'use client'

import { useEffect, useState } from 'react'
import { Loader2, Sparkles, Save } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { usePortal, useUpdatePortal } from '@/lib/hooks'
import { useSuggestServices, useProspectingCapabilities } from '@/lib/hooks'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function ProspeccionSection() {
  const { data: portal, isLoading } = usePortal()
  const update = useUpdatePortal()
  const suggest = useSuggestServices()
  const { data: caps } = useProspectingCapabilities()

  const [value, setValue] = useState('')
  const [hint, setHint] = useState('')

  // Sincroniza el textarea cuando carga el portal (una sola vez por dato).
  useEffect(() => {
    if (portal) setValue(portal.prospectingServices ?? '')
  }, [portal])

  function onSave() {
    update.mutate(
      { prospectingServices: value.trim() || null },
      {
        onSuccess: () => toast.success('Perfil de servicios guardado'),
        onError: () => toast.error('No se pudo guardar'),
      },
    )
  }

  function onSuggest() {
    suggest.mutate(hint, {
      onSuccess: (r) => {
        setValue(r.services)
        toast.success('Sugerencia generada — revisala y guardá')
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo sugerir'),
    })
  }

  const dirty = portal ? value.trim() !== (portal.prospectingServices ?? '').trim() : false

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Describí qué ofrece la agencia. Este texto se pre-carga en cada búsqueda de{' '}
        <strong className="font-medium text-foreground">Prospección</strong> como contexto para la
        IA, así no lo reescribís cada vez. La IA igual adapta la propuesta a cada negocio.
      </p>

      <Card>
        <CardContent className="space-y-4 p-5">
          {isLoading ? (
            /* Skeleton de formulario de prospección: imita el textarea y el panel de IA */
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-24 w-full" />
              </div>
              <div className="rounded-lg border border-dashed p-3 space-y-2">
                <Skeleton className="h-3 w-64" />
                <div className="flex gap-2">
                  <Skeleton className="h-9 flex-1" />
                  <Skeleton className="h-9 w-28" />
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="services">Qué Ofrecemos</Label>
                <Textarea
                  id="services"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Ej: desarrollamos web apps a medida y automatizaciones con IA (chatbots, gestión de turnos, lectura de documentos, integraciones)…"
                  rows={4}
                />
              </div>

              {/* Sugerir con IA */}
              <div className="rounded-lg border border-dashed bg-muted/20 p-3">
                <Label htmlFor="hint" className="text-xs text-muted-foreground">
                  ¿No sabés qué poner? Tirá un par de palabras y la IA lo redacta.
                </Label>
                <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="hint"
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                    placeholder="web apps, automatización, chatbots…"
                    disabled={suggest.isPending || (caps && !caps.ai)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onSuggest}
                    disabled={suggest.isPending || (caps && !caps.ai)}
                    className="shrink-0"
                  >
                    {suggest.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Sugerir
                  </Button>
                </div>
                {caps && !caps.ai && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    La sugerencia con IA requiere Vertex configurado en la API.
                  </p>
                )}
              </div>

              <div className="flex justify-end">
                <Button onClick={onSave} disabled={update.isPending || !dirty}>
                  {update.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Guardar
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
