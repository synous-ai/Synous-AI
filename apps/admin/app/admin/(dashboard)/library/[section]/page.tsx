'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ExternalLink,
  Download,
  Trash2,
  Plus,
  FileText,
  Loader2,
  ChevronDown,
  ChevronUp,
  GripVertical,
  X,
  ClipboardList,
  Square,
} from 'lucide-react'
import { ApiError } from '@/lib/api'
import { API_URL } from '@/lib/config'
import {
  useLibrary,
  useCreateLibraryItem,
  useUpdateLibraryItem,
  useDeleteLibraryItem,
  uploadFile,
} from '@/lib/hooks'
import { useUsers } from '@/lib/hooks/settings'
import type { LibraryItemType, LibraryKind, LibraryItem, LibraryStep } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { DataPagination } from '@/components/ui/data-pagination'
import { usePagination } from '@/lib/use-pagination'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'
import { Skeleton } from '@/components/ui/skeleton'

// ─── section config ────────────────────────────────────────────────────────────

interface SectionConfig {
  type: LibraryItemType
  label: string
  eyebrow: string
  description: string
  /** Si es true, el modal muestra el editor de pasos y el selector de owner. */
  hasSteps: boolean
}

/**
 * Mapa de secciones de Biblioteca.
 * 'sops' es la sección operativa unificada: aloja procedimientos (kind='procedure')
 * y checklists (kind='checklist') en un solo lugar. El filtro por kind vive
 * como tabs client-side dentro de la propia página.
 * La entrada 'checklists' fue eliminada — ya no existe esa ruta.
 */
const SECTIONS: Record<string, SectionConfig> = {
  documents: {
    type: 'document',
    label: 'Documentos',
    eyebrow: 'Biblioteca',
    description: 'Documentos internos y de referencia de la agencia.',
    hasSteps: false,
  },
  sops: {
    type: 'sop',
    label: 'Procesos y checklists',
    eyebrow: 'Biblioteca',
    description: 'Procedimientos (pasos ordenados) y checklists (ítems de verificación) del equipo.',
    hasSteps: true,
  },
  templates: {
    type: 'template',
    label: 'Plantillas',
    eyebrow: 'Biblioteca',
    description: 'Plantillas reutilizables para proyectos y comunicaciones.',
    hasSteps: false,
  },
  contracts: {
    type: 'contract_base',
    label: 'Contratos base',
    eyebrow: 'Biblioteca',
    description: 'Modelos base de contratos para nuevos clientes.',
    hasSteps: false,
  },
  proposals: {
    type: 'proposal_base',
    label: 'Propuestas base',
    eyebrow: 'Biblioteca',
    description: 'Estructuras base para propuestas comerciales.',
    hasSteps: false,
  },
  'tech-docs': {
    type: 'tech_doc',
    label: 'Documentación técnica',
    eyebrow: 'Biblioteca',
    description: 'Documentación técnica interna de proyectos y sistemas.',
    hasSteps: false,
  },
}

// ─── steps editor ──────────────────────────────────────────────────────────────

/**
 * Editor de pasos/ítems ordenados para SOPs/procesos y checklists.
 * Permite agregar, reordenar (arriba/abajo) y eliminar ítems.
 *
 * GUARDRAIL DE DISEÑO: sin checkbox "paso hecho", sin campo status, sin
 * completedAt ni ningún indicador de ejecución. Los pasos son CONTENIDO DE
 * REFERENCIA — una plantilla que el equipo sigue, no un tracker de progreso.
 * Cuando a futuro se implemente "correr un proceso para un cliente", se
 * generarán tareas en el proyecto a partir de estos pasos; ESA lógica es externa.
 *
 * `kind` controla el vocabulario cosmético: 'procedure' → "Paso", 'checklist' → "Ítem".
 * El editor subyacente es el mismo para ambos.
 */
function StepsEditor({
  steps,
  onChange,
  kind = 'procedure',
}: {
  steps: LibraryStep[]
  onChange: (steps: LibraryStep[]) => void
  kind?: LibraryKind
}) {
  // Etiquetas adaptadas al kind del ítem
  const labels = kind === 'checklist'
    ? { header: 'Ítems del checklist', add: 'Agregar ítem', singular: 'Ítem' }
    : { header: 'Pasos del procedimiento', add: 'Agregar paso', singular: 'Paso' }
  function addStep() {
    onChange([...steps, { title: '', body: '' }])
  }

  function removeStep(index: number) {
    onChange(steps.filter((_, i) => i !== index))
  }

  function moveUp(index: number) {
    if (index === 0) return
    const next = [...steps]
    // Swap con variable temporal para evitar error TS con strict null checks
    const tmp = next[index - 1]!
    next[index - 1] = next[index]!
    next[index] = tmp
    onChange(next)
  }

  function moveDown(index: number) {
    if (index === steps.length - 1) return
    const next = [...steps]
    const tmp = next[index]!
    next[index] = next[index + 1]!
    next[index + 1] = tmp
    onChange(next)
  }

  function updateTitle(index: number, value: string) {
    const next = steps.map((s, i) => (i === index ? { ...s, title: value } : s))
    onChange(next)
  }

  function updateBody(index: number, value: string) {
    const next = steps.map((s, i) => (i === index ? { ...s, body: value } : s))
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{labels.header}</Label>
        <Button type="button" variant="outline" size="sm" onClick={addStep}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {labels.add}
        </Button>
      </div>

      {steps.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Sin {kind === 'checklist' ? 'ítems' : 'pasos'} aún. Hacé clic en &quot;{labels.add}&quot; para empezar.
        </p>
      ) : (
        <div className="space-y-2">
          {steps.map((step, idx) => (
            <div key={idx} className="rounded-lg border bg-muted/30 p-3">
              {/* controles de orden y borrar */}
              <div className="mb-2 flex items-center gap-1.5">
                <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40" aria-hidden />
                <span className="text-xs font-semibold text-muted-foreground">{labels.singular} {idx + 1}</span>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    title={`Subir ${labels.singular.toLowerCase()}`}
                    aria-label={`Subir ${labels.singular.toLowerCase()}`}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => moveDown(idx)}
                    disabled={idx === steps.length - 1}
                    title={`Bajar ${labels.singular.toLowerCase()}`}
                    aria-label={`Bajar ${labels.singular.toLowerCase()}`}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => removeStep(idx)}
                    title={`Eliminar ${labels.singular.toLowerCase()}`}
                    aria-label={`Eliminar ${labels.singular.toLowerCase()}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* título del ítem/paso (obligatorio) */}
              <div className="space-y-1.5">
                <Input
                  value={step.title}
                  onChange={(e) => updateTitle(idx, e.target.value)}
                  placeholder={`Título del ${labels.singular.toLowerCase()} (requerido)`}
                  className="h-8 text-sm"
                />
              </div>

              {/* descripción del ítem/paso (opcional) */}
              <div className="mt-2">
                <Textarea
                  value={step.body ?? ''}
                  onChange={(e) => updateBody(idx, e.target.value)}
                  placeholder={`Descripción detallada del ${labels.singular.toLowerCase()} (opcional)`}
                  rows={2}
                  className="resize-none text-sm"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── form schema ───────────────────────────────────────────────────────────────

const FormSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  category: z.string().optional(),
  description: z.string().optional(),
  linkUrl: z.string().url('Ingresá una URL válida').optional().or(z.literal('')),
  ownerId: z.string().optional(),
  /**
   * kind aplica solo cuando hasSteps=true (sección 'sops').
   * Discrimina si el ítem es un procedimiento numerado o un checklist con bullets.
   */
  kind: z.enum(['procedure', 'checklist']).optional(),
})
type FormValues = z.infer<typeof FormSchema>

// ─── add / edit dialog ─────────────────────────────────────────────────────────

/**
 * Modal de creación de ítems de biblioteca.
 * Para SOPs: muestra además el editor de pasos y el select de owner.
 * Para otros tipos: flujo original (archivo/URL + nombre/categoría/descripción).
 */
function AddItemDialog({
  open,
  onClose,
  type,
  hasSteps,
}: {
  open: boolean
  onClose: () => void
  type: LibraryItemType
  hasSteps: boolean
}) {
  const create = useCreateLibraryItem()
  const { data: users } = useUsers()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Estado local de pasos: fuera del react-hook-form para evitar serialización
  // compleja. Se valida manualmente en onSubmit.
  const [steps, setSteps] = useState<LibraryStep[]>([])
  // kind local: solo aplica cuando hasSteps=true (sección sops).
  // Default 'procedure' — el usuario puede cambiarlo al crear.
  const [selectedKind, setSelectedKind] = useState<LibraryKind>('procedure')

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(FormSchema) })

  useEffect(() => {
    if (open) {
      reset({ name: '', category: '', description: '', linkUrl: '', ownerId: '', kind: 'procedure' })
      setSelectedFile(null)
      setError(null)
      setSteps([])
      setSelectedKind('procedure')
    }
  }, [open, reset])

  async function onSubmit(values: FormValues) {
    setError(null)

    // Validar pasos/ítems: todos deben tener título si hay alguno definido.
    if (hasSteps && steps.some((s) => !s.title.trim())) {
      setError('Todos los ítems/pasos deben tener un título.')
      return
    }

    const hasFile = !!selectedFile
    const hasUrl = !!values.linkUrl

    if (!hasSteps && hasFile && hasUrl) {
      setError('Elegí solo una opción: subir un archivo o pegar una URL.')
      return
    }

    try {
      let storageKey: string | undefined
      let url: string | undefined

      if (hasFile) {
        setUploading(true)
        try {
          const result = await uploadFile(selectedFile!)
          storageKey = result.key
        } finally {
          setUploading(false)
        }
      } else if (hasUrl) {
        url = values.linkUrl
      }

      await create.mutateAsync({
        type,
        name: values.name,
        category: values.category || undefined,
        description: values.description || undefined,
        storageKey,
        url,
        // Pasos: solo se envían para la sección operativa; para otros tipos se omite.
        steps: hasSteps ? steps.filter((s) => s.title.trim()).map((s) => ({ title: s.title.trim(), body: s.body?.trim() || undefined })) : undefined,
        // kind: solo para ítems de tipo sop. Define si es procedimiento o checklist.
        kind: hasSteps ? selectedKind : undefined,
        // Owner: solo para SOPs (habilitado cuando hasSteps=true).
        ownerId: hasSteps && values.ownerId ? values.ownerId : undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar {hasSteps ? 'Proceso o Checklist' : 'Ítem'}</DialogTitle>
          <DialogDescription className="sr-only">
            Formulario para agregar un ítem a la biblioteca.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* selector de tipo (kind) — solo para la sección operativa sops */}
          {hasSteps && (
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              {/* Segmented control simple con Buttons — sin librería de Tabs externa */}
              <div className="flex gap-1 rounded-lg border p-1">
                <button
                  type="button"
                  onClick={() => setSelectedKind('procedure')}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    selectedKind === 'procedure'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  Procedimiento
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedKind('checklist')}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    selectedKind === 'checklist'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  Checklist
                </button>
              </div>
            </div>
          )}

          {/* name */}
          <div className="space-y-1.5">
            <Label htmlFor="lib-name">Nombre</Label>
            <Input id="lib-name" {...register('name')} placeholder="Ej: Proceso de onboarding de cliente" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          {/* category */}
          <div className="space-y-1.5">
            <Label htmlFor="lib-category">Categoría (opcional)</Label>
            <Input id="lib-category" {...register('category')} placeholder="Ej: Onboarding, Legal, Diseño…" />
          </div>

          {/* description */}
          <div className="space-y-1.5">
            <Label htmlFor="lib-description">Descripción (opcional)</Label>
            <Input id="lib-description" {...register('description')} placeholder="Breve descripción del contenido" />
          </div>

          {/* owner — solo para la sección operativa */}
          {hasSteps && (
            <div className="space-y-1.5">
              <Label>Responsable (owner)</Label>
              <Controller
                control={control}
                name="ownerId"
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={(v) => field.onChange(v || '')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sin responsable" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none-placeholder">Sin responsable</SelectItem>
                      {users?.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {`${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}

          {/* editor de pasos/ítems — el kind controla el vocabulario cosmético */}
          {hasSteps && (
            <StepsEditor steps={steps} onChange={setSteps} kind={selectedKind} />
          )}

          {/* adjunto (archivo/URL) — solo para ítems sin pasos */}
          {!hasSteps && (
            <div className="space-y-3 rounded-xl border p-4">
              <p className="text-sm font-medium text-foreground">Adjunto (elegí uno)</p>

              <div className="space-y-1.5">
                <Label>Subir archivo</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {selectedFile ? 'Cambiar archivo' : 'Elegir archivo'}
                  </Button>
                  {selectedFile && (
                    <span className="truncate text-sm text-muted-foreground">{selectedFile.name}</span>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">o</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="lib-url">URL externa</Label>
                <Input
                  id="lib-url"
                  {...register('linkUrl')}
                  placeholder="https://drive.google.com/…"
                />
                {errors.linkUrl && (
                  <p className="text-xs text-destructive">{errors.linkUrl.message}</p>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || uploading}>
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Subiendo…
                </>
              ) : isSubmitting ? (
                'Guardando…'
              ) : (
                'Guardar'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── steps viewer ──────────────────────────────────────────────────────────────

/**
 * Vista de solo lectura de los pasos/ítems de un SOP o checklist.
 * - kind='procedure': numeración circular (1, 2, 3…) — pasos ordenados.
 * - kind='checklist': bullet Square outline ESTÁTICO — sin interacción.
 *
 * GUARDRAIL: los ítems de checklist NO tienen checkbox interactivo ni estado
 * "tildable". El Square es puro contenido visual de referencia.
 * Si en el futuro se necesita trackers de ejecución, eso es responsabilidad
 * del módulo de Proyectos/Tareas, no de la Biblioteca.
 */
function StepsViewer({ steps, kind = 'procedure' }: { steps: LibraryStep[]; kind?: LibraryKind | null }) {
  if (!steps || steps.length === 0) {
    return <p className="text-xs text-muted-foreground italic">Sin {kind === 'checklist' ? 'ítems' : 'pasos'} definidos.</p>
  }

  // Checklist: bullet Square outline estático (no interactivo).
  if (kind === 'checklist') {
    return (
      <ul className="space-y-2">
        {steps.map((step, idx) => (
          <li key={idx} className="flex gap-3 text-sm">
            {/* Square outline de lucide — decorativo, sin evento de click */}
            <Square className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
            <div className="min-w-0">
              <p className="font-medium text-foreground leading-snug">{step.title}</p>
              {step.body && (
                <p className="mt-0.5 text-muted-foreground whitespace-pre-wrap leading-relaxed">{step.body}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    )
  }

  // Procedimiento: pasos numerados con burbuja de número.
  return (
    <ol className="space-y-2">
      {steps.map((step, idx) => (
        <li key={idx} className="flex gap-3 text-sm">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
            {idx + 1}
          </span>
          <div className="min-w-0">
            <p className="font-medium text-foreground leading-snug">{step.title}</p>
            {step.body && (
              <p className="mt-0.5 text-muted-foreground whitespace-pre-wrap leading-relaxed">{step.body}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

// ─── sop card ─────────────────────────────────────────────────────────────────

/**
 * Card para ítems de la sección operativa (SOPs, procedimientos y checklists).
 * Muestra nombre, categoría, descripción, badge de kind, owner y pasos colapsables.
 *
 * - kind='procedure': badge "Procedimiento", pasos numerados.
 * - kind='checklist': badge "Checklist", bullets Square estáticos (sin checkbox).
 * Sin ningún estado de ejecución — pura referencia.
 */
function SopCard({
  item,
  users,
  onDelete,
}: {
  item: LibraryItem
  users: ReturnType<typeof useUsers>['data']
  onDelete: (id: string, name: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const owner = item.ownerId ? users?.find((u) => u.id === item.ownerId) : null
  const ownerName = owner
    ? `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim() || owner.email
    : null
  const hasSteps = Array.isArray(item.steps) && item.steps.length > 0

  // Etiqueta del badge según kind (fallback 'procedure' para ítems sin kind definido).
  const kindLabel = item.kind === 'checklist' ? 'Checklist' : 'Procedimiento'
  // Cuenta con vocabulario correcto según el kind
  const stepCount = hasSteps
    ? `${item.steps.length} ${item.kind === 'checklist' ? (item.steps.length === 1 ? 'ítem' : 'ítems') : (item.steps.length === 1 ? 'paso' : 'pasos')}`
    : null

  return (
    <div className="flex flex-col rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md">
      {/* encabezado */}
      <div className="flex items-start justify-between gap-2 p-5">
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-primary/60" />
            <p className="font-semibold text-foreground leading-snug">{item.name}</p>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {/* Badge de kind: "Procedimiento" o "Checklist" */}
            <Badge variant={item.kind === 'checklist' ? 'secondary' : 'outline'} className="text-[10px]">
              {kindLabel}
            </Badge>
            {item.category && (
              <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {item.category}
              </span>
            )}
            {ownerName && (
              <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {ownerName}
              </span>
            )}
            {stepCount && (
              <span className="text-[11px] text-muted-foreground">{stepCount}</span>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(item.id, item.name)}
          className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title="Eliminar"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {item.description && (
        <p className="px-5 pb-3 text-sm text-muted-foreground line-clamp-2">{item.description}</p>
      )}

      {/* pasos/ítems colapsables */}
      {hasSteps && (
        <div className="border-t">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-3 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            <span>
              {expanded
                ? `Ocultar ${item.kind === 'checklist' ? 'ítems' : 'pasos'}`
                : `Ver ${item.kind === 'checklist' ? 'ítems' : 'pasos'}`}
            </span>
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {expanded && (
            <div className="px-5 pb-4">
              {/* StepsViewer recibe el kind para adaptar la presentación */}
              <StepsViewer steps={item.steps} kind={item.kind} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── generic item card ────────────────────────────────────────────────────────

/**
 * Card genérica para ítems de biblioteca sin pasos (documentos, plantillas, etc.).
 */
function GenericItemCard({
  item,
  onDelete,
}: {
  item: LibraryItem
  onDelete: (id: string, name: string) => void
}) {
  const fileUrl = item.storageKey ? `${API_URL}/api/files/${item.storageKey}` : null
  const openUrl = fileUrl ?? item.url ?? null

  return (
    <div className="flex flex-col rounded-2xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{item.name}</p>
          {item.category && (
            <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {item.category}
            </span>
          )}
        </div>
        <FileText className="h-5 w-5 shrink-0 text-muted-foreground/50" />
      </div>

      {item.description && (
        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
          {item.description}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2 border-t pt-3">
        {openUrl ? (
          <>
            {fileUrl ? (
              <a
                href={fileUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Download className="h-3.5 w-3.5" />
                Descargar
              </a>
            ) : (
              <a
                href={openUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir
              </a>
            )}
          </>
        ) : (
          <span className="text-xs text-muted-foreground/60">Sin adjunto</span>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(item.id, item.name)}
          className="ml-auto text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title="Eliminar"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── page ──────────────────────────────────────────────────────────────────────

/**
 * Tabs de filtro por kind para la sección operativa (sops).
 * 'all' | 'procedure' | 'checklist'.
 * Tipo local — no se expone fuera de la página.
 */
type KindFilter = 'all' | LibraryKind

export default function LibrarySectionPage() {
  const params = useParams()
  const section = typeof params.section === 'string' ? params.section : ''
  const config = SECTIONS[section]

  const [dialogOpen, setDialogOpen] = useState(false)
  const deleteItem = useDeleteLibraryItem()
  const { data: users } = useUsers()

  // Filtro de kind: solo activo en la sección operativa (hasSteps=true).
  // El fetch trae todos los ítems de type='sop'; el filtro es client-side.
  // Al cambiar de tab se resetea la paginación a página 1.
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')

  const { data: items, isLoading } = useLibrary(config?.type)

  /**
   * Lista filtrada por kind (client-side).
   * Si la sección no es operativa, se retorna la lista completa sin tocar.
   * Si kindFilter es 'all', también se retorna completa.
   */
  const filteredItems = (() => {
    if (!config?.hasSteps || kindFilter === 'all') return items ?? []
    return (items ?? []).filter((it) => it.kind === kindFilter)
  })()

  const { page, setPage, pageCount, pageItems } = usePagination(filteredItems)

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`¿Eliminar "${name}"?`)) return
    await deleteItem.mutateAsync(id)
  }

  // Sección desconocida — 404 in-page.
  // Quien entre a /library/checklists (ruta eliminada) cae aquí.
  if (!config) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Sección no encontrada.</p>
      </div>
    )
  }

  const isSop = config.hasSteps

  /** Cambia el tab de filtro y resetea paginación. */
  function handleKindFilter(filter: KindFilter) {
    setKindFilter(filter)
    setPage(1)
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="eyebrow">{config.eyebrow}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{config.label}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{config.description}</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Agregar
        </Button>
      </div>

      {/* Tabs de filtro por kind — solo en la sección operativa */}
      {isSop && (
        <div className="mb-5 flex gap-1 rounded-lg border bg-muted/40 p-1 w-fit">
          {(
            [
              { value: 'all', label: 'Todos' },
              { value: 'procedure', label: 'Procedimientos' },
              { value: 'checklist', label: 'Checklists' },
            ] satisfies { value: KindFilter; label: string }[]
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleKindFilter(value)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                kindFilter === value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        /* Skeleton de grilla de cards: replica el layout real (3 columnas) */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-4 space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyIllustration icon={isSop ? ClipboardList : FileText} />
            <EmptyTitle>
              Sin {isSop ? 'Procesos y checklists' : 'Ítems'} Todavía
            </EmptyTitle>
            <EmptyDescription>
              {kindFilter !== 'all'
                ? `No hay ${kindFilter === 'checklist' ? 'checklists' : 'procedimientos'} aún. Cambiá el filtro o agregá uno nuevo.`
                : 'Agregá el primero con el botón "Agregar".'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pageItems.map((item) =>
              isSop ? (
                // Card especializada: muestra badge de kind, pasos y owner
                <SopCard key={item.id} item={item} users={users} onDelete={handleDelete} />
              ) : (
                // Card genérica para el resto de tipos
                <GenericItemCard key={item.id} item={item} onDelete={handleDelete} />
              ),
            )}
          </div>
          <DataPagination page={page} pageCount={pageCount} onPageChange={setPage} />
        </>
      )}

      <AddItemDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        type={config.type}
        hasSteps={config.hasSteps}
      />
    </div>
  )
}
