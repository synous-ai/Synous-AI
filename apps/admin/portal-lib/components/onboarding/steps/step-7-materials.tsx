'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, FolderUp, Loader2, Paperclip, Check, X } from 'lucide-react'
import { Button } from '@portal/components/ui/button'
import { ShinyButton } from '@portal/components/ui/shiny-button'
import { Textarea } from '@portal/components/ui/textarea'
import { StepHeader, WizardNav } from '@portal/components/onboarding/wizard-shell'
import {
  useSubmitOnboardingMaterials,
  useUploadOnboardingMaterial,
  useSaveOnboardingMaterialsDraft,
} from '@portal/lib/hooks'
import { downloadFile } from '@portal/lib/api'
import type { OnboardingAsset, OnboardingMaterialCategory, OnboardingMaterialsState } from '@portal/lib/types'
import { ONBOARDING_MATERIAL_CATEGORIES, type OnboardingMaterialCategoryDef } from '@portal/lib/onboarding-content'
import { cn, formatSize } from '@portal/lib/utils'

/**
 * Un adjunto ya subido. Es un botón y no un `<a href>` porque
 * `GET /api/files/:key` exige el token de Clerk y un anchor no manda headers
 * (ver downloadFile en lib/api.ts).
 */
function AssetLink({ asset }: { asset: OnboardingAsset }) {
  const [downloading, setDownloading] = useState(false)
  const [failed, setFailed] = useState(false)

  async function handleDownload() {
    setDownloading(true)
    setFailed(false)
    try {
      await downloadFile(asset.storageKey, asset.name)
    } catch {
      setFailed(true)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={downloading}
      className="flex w-full items-center gap-2 text-left text-sm text-primary hover:underline disabled:opacity-60"
    >
      {downloading ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
      ) : (
        <Paperclip className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="truncate">{asset.name}</span>
      {asset.sizeBytes != null && (
        <span className="shrink-0 text-xs text-muted-foreground">{formatSize(asset.sizeBytes)}</span>
      )}
      {failed && (
        <span role="alert" className="shrink-0 text-xs text-destructive">
          No se pudo descargar
        </span>
      )}
    </button>
  )
}

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
  state: LocalMaterialItem
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
              <AssetLink asset={a} />
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

interface LocalMaterialItem {
  done: boolean
  assetIds: string[]
  note: string
}

type LocalMaterials = Record<OnboardingMaterialCategory, LocalMaterialItem>

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
  const saveDraft = useSaveOnboardingMaterialsDraft()

  /**
   * Autoguardado del checklist. Sin esto, `done`/`note`/`assetIds` vivían solo
   * en memoria hasta apretar "Continuar": tildar tres categorías, escribir una
   * nota y recargar la página perdía todo (los archivos subidos sí quedaban,
   * porque son client_asset, pero el estado del checklist no).
   *
   * Se manda SOLO la categoría que cambió — el backend mergea por categoría,
   * así que dos guardados casi simultáneos no se pisan.
   */
  const saveDraftRef = useRef(saveDraft)
  saveDraftRef.current = saveDraft

  const persistCategory = useCallback((category: OnboardingMaterialCategory, item: LocalMaterialItem) => {
    saveDraftRef.current.mutate({
      [category]: { done: item.done, assetIds: item.assetIds, note: item.note || undefined },
    })
  }, [])

  /**
   * Las notas se guardan con debounce: una request por tecleo sería absurdo.
   * El resto de los cambios (tildar una categoría, terminar una subida) se
   * guarda al instante.
   */
  const pendingNotesRef = useRef(new Map<OnboardingMaterialCategory, LocalMaterialItem>())
  const noteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushPendingNotes = useCallback(() => {
    if (noteTimerRef.current) {
      clearTimeout(noteTimerRef.current)
      noteTimerRef.current = null
    }
    const pending = pendingNotesRef.current
    for (const [category, item] of pending) persistCategory(category, item)
    pending.clear()
  }, [persistCategory])

  const persistNoteDebounced = useCallback(
    (category: OnboardingMaterialCategory, item: LocalMaterialItem) => {
      pendingNotesRef.current.set(category, item)
      if (noteTimerRef.current) clearTimeout(noteTimerRef.current)
      noteTimerRef.current = setTimeout(flushPendingNotes, 800)
    },
    [flushPendingNotes],
  )

  // Al desmontar (p. ej. "Atrás" antes de que dispare el debounce) se GUARDA lo
  // pendiente, no se descarta: cancelar el timer a secas perdería lo último
  // tipeado, que es justo el bug que este autoguardado viene a resolver.
  const flushRef = useRef(flushPendingNotes)
  flushRef.current = flushPendingNotes
  useEffect(() => () => flushRef.current(), [])

  /**
   * Espejo del estado actual para poder calcular el próximo valor FUERA del
   * updater de setState. React puede invocar el updater dos veces (StrictMode)
   * y disparar el guardado ahí adentro duplicaría las requests.
   */
  const stateRef = useRef(state)
  stateRef.current = state

  /** Aplica un cambio de categoría al estado local y lo persiste. */
  function updateCategory(
    category: OnboardingMaterialCategory,
    patch: Partial<LocalMaterialItem>,
    persist: (category: OnboardingMaterialCategory, item: LocalMaterialItem) => void,
  ) {
    const next = { ...stateRef.current[category], ...patch }
    // Se adelanta el espejo al valor nuevo: si hay dos cambios en el mismo tick
    // (doble click, tildar dos categorías seguidas), el segundo no parte de un
    // estado viejo — `stateRef` recién se sincroniza en el próximo render.
    stateRef.current = { ...stateRef.current, [category]: next }
    setState((s) => ({ ...s, [category]: next }))
    persist(category, next)
  }

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
        updateCategory(
          category,
          { assetIds: [...stateRef.current[category].assetIds, ...uploadedIds] },
          persistCategory,
        )
      }
      // Si alguno falló, uploadMaterial.isError queda en true y se muestra el aviso abajo.
    } finally {
      setUploadingCategory(null)
    }
  }

  async function handleContinue() {
    // El submit final manda el estado completo igual, pero volcar lo pendiente
    // evita que un debounce en vuelo escriba DESPUÉS del submit.
    flushPendingNotes()
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
            onToggleDone={() => updateCategory(def.key, { done: !state[def.key].done }, persistCategory)}
            onNoteChange={(note) => updateCategory(def.key, { note }, persistNoteDebounced)}
            onUpload={(files) => void handleUpload(def.key, files)}
          />
        ))}
      </div>

      {(uploadMaterial.isError || submitMaterials.isError || saveDraft.isError) && (
        <p role="alert" className="mt-4 flex items-center gap-1.5 text-sm text-destructive">
          <X className="h-3.5 w-3.5" />
          No se pudo guardar. Probá de nuevo.
        </p>
      )}

      <WizardNav onBack={onBack}>
        <ShinyButton onClick={handleContinue} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Continuar
          {!busy && <ArrowRight className="h-4 w-4" />}
        </ShinyButton>
      </WizardNav>
    </div>
  )
}
