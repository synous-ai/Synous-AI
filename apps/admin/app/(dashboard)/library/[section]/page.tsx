'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ExternalLink,
  Download,
  Trash2,
  Plus,
  FileText,
  Loader2,
} from 'lucide-react'
import { ApiError } from '@/lib/api'
import { API_URL } from '@/lib/config'
import {
  useLibrary,
  useCreateLibraryItem,
  useDeleteLibraryItem,
  uploadFile,
} from '@/lib/hooks'
import type { LibraryItemType } from '@/lib/types'
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
import { DataPagination } from '@/components/ui/data-pagination'
import { usePagination } from '@/lib/use-pagination'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { EmptyIllustration } from '@/components/ui/empty-illustration'

// ─── section config ────────────────────────────────────────────────────────────

interface SectionConfig {
  type: LibraryItemType
  label: string
  eyebrow: string
  description: string
}

const SECTIONS: Record<string, SectionConfig> = {
  documents: {
    type: 'document',
    label: 'Documentos',
    eyebrow: 'Biblioteca',
    description: 'Documentos internos y de referencia de la agencia.',
  },
  sops: {
    type: 'sop',
    label: 'SOPs',
    eyebrow: 'Biblioteca',
    description: 'Procedimientos operativos estándar del equipo.',
  },
  templates: {
    type: 'template',
    label: 'Plantillas',
    eyebrow: 'Biblioteca',
    description: 'Plantillas reutilizables para proyectos y comunicaciones.',
  },
  contracts: {
    type: 'contract_base',
    label: 'Contratos base',
    eyebrow: 'Biblioteca',
    description: 'Modelos base de contratos para nuevos clientes.',
  },
  proposals: {
    type: 'proposal_base',
    label: 'Propuestas base',
    eyebrow: 'Biblioteca',
    description: 'Estructuras base para propuestas comerciales.',
  },
  checklists: {
    type: 'checklist',
    label: 'Checklists',
    eyebrow: 'Biblioteca',
    description: 'Listas de verificación para procesos repetibles.',
  },
  'tech-docs': {
    type: 'tech_doc',
    label: 'Documentación técnica',
    eyebrow: 'Biblioteca',
    description: 'Documentación técnica interna de proyectos y sistemas.',
  },
}

// ─── form schema ───────────────────────────────────────────────────────────────

const FormSchema = z
  .object({
    name: z.string().min(1, 'El nombre es requerido'),
    category: z.string().optional(),
    description: z.string().optional(),
    linkUrl: z.string().url('Ingresá una URL válida').optional().or(z.literal('')),
  })
  .refine((v) => true, { message: '' }) // extra validation done in onSubmit
type FormValues = z.infer<typeof FormSchema>

// ─── add dialog ────────────────────────────────────────────────────────────────

function AddItemDialog({
  open,
  onClose,
  type,
}: {
  open: boolean
  onClose: () => void
  type: LibraryItemType
}) {
  const create = useCreateLibraryItem()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(FormSchema) })

  useEffect(() => {
    if (open) {
      reset({ name: '', category: '', description: '', linkUrl: '' })
      setSelectedFile(null)
      setError(null)
    }
  }, [open, reset])

  async function onSubmit(values: FormValues) {
    setError(null)

    const hasFile = !!selectedFile
    const hasUrl = !!values.linkUrl

    if (hasFile && hasUrl) {
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
      })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar Ítem</DialogTitle>
          <DialogDescription className="sr-only">
            Formulario para agregar un ítem a la biblioteca.
          </DialogDescription>
        </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* name */}
        <div className="space-y-1.5">
          <Label htmlFor="lib-name">Nombre</Label>
          <Input id="lib-name" {...register('name')} placeholder="Ej: Contrato de servicios v3" />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        {/* category */}
        <div className="space-y-1.5">
          <Label htmlFor="lib-category">Categoría (opcional)</Label>
          <Input id="lib-category" {...register('category')} placeholder="Ej: Legal, Onboarding…" />
        </div>

        {/* description */}
        <div className="space-y-1.5">
          <Label htmlFor="lib-description">Descripción (opcional)</Label>
          <Input id="lib-description" {...register('description')} placeholder="Breve descripción del contenido" />
        </div>

        {/* file OR url */}
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

// ─── page ──────────────────────────────────────────────────────────────────────

export default function LibrarySectionPage() {
  const params = useParams()
  const section = typeof params.section === 'string' ? params.section : ''
  const config = SECTIONS[section]

  const [dialogOpen, setDialogOpen] = useState(false)
  const deleteItem = useDeleteLibraryItem()

  const { data: items, isLoading } = useLibrary(config?.type)
  const { page, setPage, pageCount, pageItems } = usePagination(items ?? [])

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`¿Eliminar "${name}"?`)) return
    await deleteItem.mutateAsync(id)
  }

  // Unknown section
  if (!config) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Sección no encontrada.</p>
      </div>
    )
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

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando…
        </div>
      ) : !items || items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyIllustration icon={FileText} />
            <EmptyTitle>Sin Ítems Todavía</EmptyTitle>
            <EmptyDescription>Agregá el primero con el botón &quot;Agregar&quot;.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pageItems.map((item) => {
            const fileUrl = item.storageKey ? `${API_URL}/api/files/${item.storageKey}` : null
            const openUrl = fileUrl ?? item.url ?? null

            return (
              <div
                key={item.id}
                className="flex flex-col rounded-2xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
              >
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
                    onClick={() => handleDelete(item.id, item.name)}
                    className="ml-auto text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
        <DataPagination page={page} pageCount={pageCount} onPageChange={setPage} />
        </>
      )}

      <AddItemDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        type={config.type}
      />
    </div>
  )
}
