'use client'

import { useRef, useState } from 'react'
import { ArrowRight, FolderUp, Loader2, Paperclip, Check, X } from 'lucide-react'
import { Button } from '@portal/components/ui/button'
import { Textarea } from '@portal/components/ui/textarea'
import { StepHeader, WizardNav } from '@portal/components/onboarding/wizard-shell'
import { useSubmitOnboardingMaterials, useUploadOnboardingMaterial } from '@portal/lib/hooks'
import { API_URL } from '@portal/lib/config'
import type { OnboardingAsset, OnboardingMaterialCategory, OnboardingMaterialsState } from '@portal/lib/types'
import { ONBOARDING_MATERIAL_CATEGORIES, type OnboardingMaterialCategoryDef } from '@portal/lib/onboarding-content'
import { cn, formatSize } from '@portal/lib/utils'

function CategoryCard({
  def,
  state,
  assets,
  onToggleDone,
  onNoteChange,
  onUpload,
  uploading,
}: {
  def: OnboardingMaterialCategoryDef
  state: { done: boolean; assetIds: string[]; note: string }
  assets: OnboardingAsset[]
  onToggleDone: () => void
  onNoteChange: (note: string) => void
  onUpload: (files: FileList) => void
  uploading: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="editorial-sheen rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{def.label}</p>
        <button
          type="button"
          onClick={onToggleDone}
          aria-pressed={state.done}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
            state.done
              ? 'border-primary bg-primary text-primary-foreground shadow-card'
              : 'border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground',
          )}
        >
          {state.done && <Check className="h-3 w-3" />}
          {state.done ? 'Listo' : 'Marcar listo'}
        </button>
      </div>

      {assets.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {assets.map((a) => (
            <li key={a.id}>
              <a
                href={`${API_URL}/api/files/${a.storageKey}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <Paperclip className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{a.name}</span>
                {a.sizeBytes != null && (
                  <span className="shrink-0 text-xs text-muted-foreground">{formatSize(a.sizeBytes)}</span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) onUpload(e.target.files)
            e.target.value = ''
          }}
        />
        <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading} className="gap-1.5 rounded-full">
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderUp className="h-3.5 w-3.5" />}
          Subir archivo{uploading ? '…' : 's'}
        </Button>
      </div>

      <Textarea
        rows={2}
        placeholder="Nota (opcional)"
        value={state.note}
        onChange={(e) => onNoteChange(e.target.value)}
        className="mt-3 text-sm"
      />
    </div>
  )
}

type LocalMaterials = Record<OnboardingMaterialCategory, { done: boolean; assetIds: string[]; note: string }>

function buildInitialState(materials: OnboardingMaterialsState): LocalMaterials {
  const out = {} as LocalMaterials
  for (const def of ONBOARDING_MATERIAL_CATEGORIES) {
    const existing = materials[def.key]
    out[def.key] = { done: existing?.done ?? false, assetIds: existing?.assetIds ?? [], note: existing?.note ?? '' }
  }
  return out
}

export function Step7Materials({
  materials,
  assets,
  onContinue,
  onBack,
}: {
  materials: OnboardingMaterialsState
  assets: OnboardingAsset[]
  onContinue: () => void
  onBack: () => void
}) {
  const [state, setState] = useState<LocalMaterials>(() => buildInitialState(materials))
  const [uploadingCategory, setUploadingCategory] = useState<OnboardingMaterialCategory | null>(null)
  const uploadMaterial = useUploadOnboardingMaterial()
  const submitMaterials = useSubmitOnboardingMaterials()

  async function handleUpload(category: OnboardingMaterialCategory, files: FileList) {
    setUploadingCategory(category)
    try {
      // Subidas en paralelo (no secuenciales): con allSettled, un archivo que
      // falla no bloquea ni descarta los que sí se subieron bien.
      const results = await Promise.allSettled(
        Array.from(files).map((file) => uploadMaterial.mutateAsync({ category, file })),
      )
      const uploadedIds = results
        .filter((r): r is PromiseFulfilledResult<OnboardingAsset> => r.status === 'fulfilled')
        .map((r) => r.value.id)
      if (uploadedIds.length > 0) {
        setState((s) => ({ ...s, [category]: { ...s[category], assetIds: [...s[category].assetIds, ...uploadedIds] } }))
      }
      // Si alguno falló, uploadMaterial.isError queda en true y se muestra el aviso abajo.
    } finally {
      setUploadingCategory(null)
    }
  }

  async function handleContinue() {
    const payload: OnboardingMaterialsState = {}
    for (const def of ONBOARDING_MATERIAL_CATEGORIES) {
      payload[def.key] = { done: state[def.key].done, assetIds: state[def.key].assetIds, note: state[def.key].note || undefined }
    }
    try {
      await submitMaterials.mutateAsync(payload)
      onContinue()
    } catch {
      /* el error se muestra abajo vía submitMaterials.isError */
    }
  }

  const assetsByCategory = (category: OnboardingMaterialCategory): OnboardingAsset[] => {
    // Assets recién subidos en esta sesión (por id) + los que ya venían del GET con este fieldName.
    const ids = new Set(state[category].assetIds)
    return assets.filter((a) => ids.has(a.id) || a.fieldName === category)
  }

  const busy = submitMaterials.isPending

  return (
    <div>
      <StepHeader
        icon={FolderUp}
        eyebrow="Paso 7 de 8"
        title="Materiales"
        hint="Subí lo que tengas a mano. No hace falta tener todo — podés marcar un ítem como listo aunque no tengas archivos para subir (por ejemplo, si todavía no tenés manual de marca)."
      />

      <div className="space-y-3">
        {ONBOARDING_MATERIAL_CATEGORIES.map((def) => (
          <CategoryCard
            key={def.key}
            def={def}
            state={state[def.key]}
            assets={assetsByCategory(def.key)}
            uploading={uploadingCategory === def.key}
            onToggleDone={() => setState((s) => ({ ...s, [def.key]: { ...s[def.key], done: !s[def.key].done } }))}
            onNoteChange={(note) => setState((s) => ({ ...s, [def.key]: { ...s[def.key], note } }))}
            onUpload={(files) => void handleUpload(def.key, files)}
          />
        ))}
      </div>

      {(uploadMaterial.isError || submitMaterials.isError) && (
        <p role="alert" className="mt-4 flex items-center gap-1.5 text-sm text-destructive">
          <X className="h-3.5 w-3.5" />
          No se pudo guardar. Probá de nuevo.
        </p>
      )}

      <WizardNav onBack={onBack}>
        <Button type="button" onClick={handleContinue} disabled={busy} className="min-w-32 gap-2 rounded-full">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Continuar
          {!busy && <ArrowRight className="h-4 w-4" />}
        </Button>
      </WizardNav>
    </div>
  )
}
