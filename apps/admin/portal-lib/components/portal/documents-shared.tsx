'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowUpDown,
  Download,
  Eye,
  FileSignature,
  FolderOpen,
  Loader2,
  MoreHorizontal,
  PenLine,
  Presentation,
  Receipt,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { useDocumentPreview } from '@portal/lib/hooks'
import { openFile } from '@portal/lib/files'
import { cn, initials } from '@portal/lib/utils'
import type { ClientDocument } from '@portal/lib/types'
import { KIND_BY_EXTENSION, KIND_ICON, extensionOf, kindForExtension, type AssetKind } from '@portal/lib/file-kind'
import { Badge, type BadgeProps } from '@portal/components/ui/badge'
import { Button } from '@portal/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@portal/components/ui/table'
import { portalHref } from '@portal/components/portal/portal-nav'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@portal/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@portal/components/ui/dropdown-menu'

/*
 * Piezas compartidas por las dos vistas de Documentos: la general
 * (documents-panel.tsx) y el detalle de una carpeta (document-folder-panel.tsx).
 * Todo es client-side sobre lo que ya trajo useClientDocuments(): sin params
 * nuevos ni llamadas extra.
 */

export const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
/** Superficie de card con tokens del tema: se lee igual en claro y en oscuro. */
export const SURFACE =
  'rounded-xl border border-border bg-card shadow-card'
/** Controles del header (búsqueda, filtro). */
const CONTROL = cn(
  'inline-flex h-9 items-center rounded-lg border border-border bg-card text-[13px] text-foreground/90 transition-colors hover:bg-muted',
  FOCUS,
)
/** Botón pill secundario — el "Connect" de la referencia. */
export const PILL = cn(
  'inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 text-[11px] font-medium text-foreground/90 transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40',
  FOCUS,
)
/** Entrada escalonada (el delay lo pone cada instancia). */
export const ENTER =
  'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 motion-safe:fill-mode-both'

// ─── Categorías (filtro por tipo) ─────────────────────────────────────────────
// Cualquier `type` que no sea uno de los 3 conocidos cae en el balde "other".

export type TypeFilterKey = 'contract' | 'proposal' | 'invoice' | 'other'
export type TypeFilter = 'all' | TypeFilterKey

const TYPE_FILTER_ORDER: TypeFilterKey[] = ['contract', 'proposal', 'invoice', 'other']

export const DOCUMENT_CATEGORIES: Record<
  TypeFilterKey,
  { label: string; singular: string; description: string; Icon: LucideIcon }
> = {
  contract: {
    label: 'Contratos',
    singular: 'Contrato',
    description: 'Los acuerdos de tu proyecto, con su estado de firma al día.',
    Icon: FileSignature,
  },
  proposal: {
    label: 'Propuestas',
    singular: 'Propuesta',
    description: 'Propuestas comerciales y alcances que te compartimos.',
    Icon: Presentation,
  },
  invoice: {
    label: 'Facturas',
    singular: 'Factura',
    description: 'Comprobantes de facturación asociados a tu proyecto.',
    Icon: Receipt,
  },
  other: {
    label: 'Otros',
    singular: 'Otro',
    description: 'Archivos de apoyo: briefs, materiales y referencias.',
    Icon: FolderOpen,
  },
}

export function typeBucket(doc: ClientDocument): TypeFilterKey {
  return doc.type === 'contract' || doc.type === 'proposal' || doc.type === 'invoice' ? doc.type : 'other'
}

export function countByType(docs: ClientDocument[]): Record<TypeFilterKey, number> {
  const counts: Record<TypeFilterKey, number> = { contract: 0, proposal: 0, invoice: 0, other: 0 }
  for (const doc of docs) counts[typeBucket(doc)] += 1
  return counts
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** Minúsculas y sin tildes: "propuesta" encuentra "Propuesta técnica". */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function matchesSearch(doc: ClientDocument, needle: string): boolean {
  if (!needle) return true
  return [doc.name, doc.uploadedBy ?? ''].some((field) => normalizeText(field).includes(needle))
}

// ─── Estado derivado (nunca persistido) ────────────────────────────────────────
// Documentos es una VISTA DE SOLO LECTURA del estado documental. DocuSeal es
// la fuente de verdad de la firma — acá solo se deriva un label/badge en
// render a partir de `docusealStatus`/`signedAt`, nunca se guarda un estado
// propio ni se ofrecen acciones de workflow (aprobar, etc.).

type DerivedDocumentStatusKind = 'pending' | 'signed' | 'declined' | 'expired' | 'informational'

interface DerivedDocumentStatus {
  status: DerivedDocumentStatusKind
  label: string
}

export function deriveDocumentStatus(doc: ClientDocument): DerivedDocumentStatus {
  if (doc.docusealStatus === 'pending') {
    return { status: 'pending', label: 'Requiere tu firma' }
  }
  if (doc.docusealStatus === 'completed' || doc.signedAt != null) {
    return { status: 'signed', label: 'Firmado' }
  }
  if (doc.docusealStatus === 'declined') {
    return { status: 'declined', label: 'Rechazado' }
  }
  if (doc.docusealStatus === 'expired') {
    return { status: 'expired', label: 'Vencido' }
  }
  return { status: 'informational', label: 'Informativo' }
}

export const DOCUMENT_STATUS_VARIANT: Record<DerivedDocumentStatusKind, NonNullable<BadgeProps['variant']>> = {
  pending: 'signal',
  signed: 'default',
  declined: 'destructive',
  expired: 'muted',
  informational: 'muted',
}

/** ¿Hay algún camino para previsualizar este documento en el drawer? */
export function canPreviewDocument(doc: ClientDocument): boolean {
  return doc.storageKey != null || doc.docusealStatus === 'completed'
}

const DATE_FORMAT = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric' })
const TIME_FORMAT = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' })

export function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr)
  return `${DATE_FORMAT.format(date)} · ${TIME_FORMAT.format(date)}`
}

/** Fecha a mostrar: la de firma si está firmado, si no la de alta. */
export function formatDocumentDate(doc: ClientDocument): { label: string; value: string } {
  if (doc.signedAt) return { label: 'Firmado', value: formatDateTime(doc.signedAt) }
  return { label: 'Compartido', value: formatDateTime(doc.createdAt) }
}

/** Última actividad: la firma si existe, si no el alta. */
export function activityDate(doc: ClientDocument): string {
  return doc.signedAt ?? doc.createdAt
}

export function byActivityDesc(a: ClientDocument, b: ClientDocument): number {
  return Date.parse(activityDate(b)) - Date.parse(activityDate(a))
}

// ─── Carpetas: una por proyecto ───────────────────────────────────────────────
// Cada carpeta es un deal del cliente que tiene documentos (nombre vía
// useClientDeals, cruce por `dealId`). Los documentos sin deal caen en
// "Generales". La key de la carpeta es también el segmento de su URL
// (`/documents/<key>`): un id de deal es un UUID, así que no choca con
// `generales` ni necesita encoding.

export const GENERAL_FOLDER = 'generales'

export interface DocumentFolder {
  key: string
  label: string
  count: number
  pending: number
}

export function folderKey(doc: ClientDocument): string {
  return doc.dealId ?? GENERAL_FOLDER
}

export function folderLabel(key: string, dealNames: Map<string, string>): string {
  return key === GENERAL_FOLDER ? 'Generales' : (dealNames.get(key) ?? 'Proyecto')
}

export function documentFolderHref(pathname: string, key: string): string {
  return `${portalHref(pathname, 'documents')}/${key}`
}

export function buildFolders(docs: ClientDocument[], dealNames: Map<string, string>): DocumentFolder[] {
  const byKey = new Map<string, DocumentFolder>()
  for (const doc of docs) {
    const key = folderKey(doc)
    const folder = byKey.get(key) ?? { key, label: folderLabel(key, dealNames), count: 0, pending: 0 }
    folder.count += 1
    if (deriveDocumentStatus(doc).status === 'pending') folder.pending += 1
    byKey.set(key, folder)
  }

  return Array.from(byKey.values()).sort((a, b) => {
    // "Generales" siempre al final; los proyectos, alfabéticos.
    if (a.key === GENERAL_FOLDER) return 1
    if (b.key === GENERAL_FOLDER) return -1
    return a.label.localeCompare(b.label, 'es')
  })
}

// ─── Header: búsqueda ─────────────────────────────────────────────────────────
// Atajo "/" (y no ⌘F como en la referencia): pisar el buscar-en-página del
// navegador es hostil, "/" es la convención de búsqueda en apps web.

export function DocumentSearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      event.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <label className="relative flex min-w-0 flex-1 items-center md:w-64 md:flex-none">
      <span className="sr-only">Buscar documentos</span>
      <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onChange('')
            event.currentTarget.blur()
          }
        }}
        placeholder="Buscar"
        className={cn(
          CONTROL,
          'w-full pl-9 pr-9 placeholder:text-muted-foreground hover:bg-card [&::-webkit-search-cancel-button]:hidden',
        )}
      />
      {!value && (
        <kbd
          aria-hidden
          className="pointer-events-none absolute right-2.5 rounded border border-border px-1.5 font-sans text-[10px] leading-4 text-muted-foreground"
        >
          /
        </kbd>
      )}
    </label>
  )
}

// ─── Header: filtro por tipo ──────────────────────────────────────────────────

export function TypeFilterMenu({
  value,
  counts,
  total,
  onChange,
}: {
  value: TypeFilter
  counts: Record<TypeFilterKey, number>
  total: number
  onChange: (value: TypeFilter) => void
}) {
  const active = value !== 'all'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn(CONTROL, 'shrink-0 gap-2 px-3', active && 'border-foreground/20 text-foreground')}>
          <SlidersHorizontal className="h-4 w-4" strokeWidth={1.5} />
          {active ? DOCUMENT_CATEGORIES[value].label : 'Filtrar'}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Tipo de documento</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as TypeFilter)}>
          <DropdownMenuRadioItem value="all">
            Todos
            <span className="ml-auto pl-3 text-xs tabular-nums text-muted-foreground">{total}</span>
          </DropdownMenuRadioItem>
          {TYPE_FILTER_ORDER.map((type) => (
            <DropdownMenuRadioItem key={type} value={type} disabled={counts[type] === 0}>
              {DOCUMENT_CATEGORIES[type].label}
              <span className="ml-auto pl-3 text-xs tabular-nums text-muted-foreground">{counts[type]}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── "Requieren tu firma" ─────────────────────────────────────────────────────
// Siempre muestra TODO lo accionable del alcance de la vista, sin importar el
// filtro ni la búsqueda.

export function AttentionBanner({ docs }: { docs: ClientDocument[] }) {
  if (docs.length === 0) return null

  return (
    <section
      aria-labelledby="documents-attention-title"
      className={cn('rounded-xl border border-signal/30 bg-signal/[0.06] p-4', ENTER)}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-signal text-signal-foreground">
          <PenLine className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 id="documents-attention-title" className="text-sm font-medium text-foreground">
            {docs.length === 1 ? 'Un documento requiere tu firma' : `${docs.length} documentos requieren tu firma`}
          </h2>
          <p className="text-xs text-muted-foreground">Te llegó el pedido de firma por email — completalo desde ahí.</p>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {docs.map((doc) => (
          <li
            key={doc.id}
            title={doc.name}
            className="max-w-full truncate rounded-md border border-signal/25 bg-background/40 px-2.5 py-1 text-xs text-foreground/90"
          >
            {doc.name}
          </li>
        ))}
      </ul>
      {/* PENDIENTE: botón Firmar — requiere exponer signingUrl validando que el client_account sea el firmante. */}
    </section>
  )
}

// ─── Descarga compartida ──────────────────────────────────────────────────────

/**
 * Descarga autenticada de un documento, con estado de carga y de error.
 * Hace falta pedir una URL de acceso temporal (openFile en lib/files.ts): un
 * <a href> pelado no puede. Solo aplica a documentos con storageKey propio (los
 * firmados-en-DocuSeal-sin-copia-propia no tienen bytes locales para bajar,
 * solo preview vía signed-documents).
 */
function useDocumentDownload(doc: ClientDocument) {
  const [downloading, setDownloading] = useState(false)
  const [failed, setFailed] = useState(false)

  async function download() {
    if (!doc.storageKey) return
    setDownloading(true)
    setFailed(false)
    try {
      await openFile(doc.storageKey)
    } catch {
      setFailed(true)
    } finally {
      setDownloading(false)
    }
  }

  return { downloading, failed, download }
}

// ─── Archivo: extensión, tipo e ícono ─────────────────────────────────────────
// `name` es un título que carga el equipo ("Contrato de desarrollo"), no un
// nombre de archivo: puede no traer extensión. Se busca en este orden: el
// nombre, la storage key (conserva la extensión del archivo subido; la API
// deduce el MIME de ahí) y, para lo firmado en DocuSeal sin copia propia, PDF.

/** Extensión plausible: conocida, o letras y dígitos que empiezan con letra ("Propuesta v1.2" no tiene extensión "2"). */
function fileExtension(value: string): string | null {
  const ext = extensionOf(value)
  if (!ext) return null
  const known = Object.prototype.hasOwnProperty.call(KIND_BY_EXTENSION, ext)
  return known || /^[a-z][a-z0-9]{1,4}$/.test(ext) ? ext : null
}

function documentExtension(doc: ClientDocument): string | null {
  return (
    fileExtension(doc.name) ??
    (doc.storageKey ? fileExtension(doc.storageKey) : null) ??
    (doc.docusealStatus === 'completed' ? 'pdf' : null)
  )
}

function documentKind(doc: ClientDocument): AssetKind {
  return kindForExtension(documentExtension(doc))
}

/** Nombre sin la extensión cuando el título la trae: `FileName` la vuelve a pegar aparte para no truncarla. */
function documentBaseName(doc: ClientDocument): string {
  const ext = fileExtension(doc.name)
  return ext ? doc.name.slice(0, -(ext.length + 1)) : doc.name
}

export function FileTile({ doc }: { doc: ClientDocument }) {
  const Icon = KIND_ICON[documentKind(doc)]
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/80">
      <Icon className="size-4" strokeWidth={1.5} aria-hidden />
    </span>
  )
}

/**
 * Nombre de archivo con su extensión, como en un explorador. Con un título
 * largo se trunca la base y la extensión queda siempre visible:
 * "Contrato de servicios — ….pdf".
 */
export function FileName({ doc }: { doc: ClientDocument }) {
  const baseName = documentBaseName(doc)
  const extension = documentExtension(doc)
  const fullName = extension ? `${baseName}.${extension}` : baseName
  return (
    <p className="flex min-w-0 text-[13px] font-medium text-foreground" title={fullName}>
      <span className="truncate">{baseName}</span>
      {extension && <span className="shrink-0">.{extension}</span>}
    </p>
  )
}

// ─── Acciones de un archivo (menú ⋯) ──────────────────────────────────────────
// Solo acciones reales: el portal es de solo lectura para el cliente (no hay
// renombrar ni borrar). Vista previa y descarga dependen de que haya archivo;
// "ver del mismo tipo" reusa el filtro de la vista y "abrir carpeta" navega al
// detalle. El menú existe siempre, así ninguna fila queda sin acciones.

export interface DocumentActions {
  onPreview: (doc: ClientDocument) => void
  onShowType: (type: TypeFilterKey) => void
  /** Carpeta del documento para "Abrir carpeta". `null` oculta el ítem: la vista ya es esa carpeta. */
  folderOf: ((doc: ClientDocument) => { label: string; href: string }) | null
}

export function DocumentActionsMenu({ doc, actions }: { doc: ClientDocument; actions: DocumentActions }) {
  const { downloading, failed, download } = useDocumentDownload(doc)
  const previewable = canPreviewDocument(doc)
  const type = typeBucket(doc)
  const folder = actions.folderOf?.(doc) ?? null

  return (
    <div className="flex items-center justify-end gap-2">
      {failed && (
        <span role="alert" className="whitespace-nowrap text-[11px] text-destructive">
          No se pudo descargar
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={`Acciones para ${doc.name}`}>
            {downloading ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem disabled={!previewable} onSelect={() => actions.onPreview(doc)}>
              <Eye />
              Vista previa
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!doc.storageKey || downloading} onSelect={() => void download()}>
              <Download />
              Descargar
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => actions.onShowType(type)}>
              <SlidersHorizontal />
              Ver {DOCUMENT_CATEGORIES[type].label.toLowerCase()}
            </DropdownMenuItem>
            {folder && (
              <DropdownMenuItem asChild>
                <Link href={folder.href}>
                  <FolderOpen />
                  <span className="truncate">Abrir carpeta {folder.label}</span>
                </Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ─── Tabla de archivos (Data Table) ───────────────────────────────────────────
// Estructura del Data Table de shadcn/ui (columnas definidas, orden por
// encabezado, celda de acciones ⋯), escrita con TanStack Table v8: la guía
// actual de shadcn usa la API de v9, que este proyecto no tiene. La usan los
// "Archivos recientes" de la vista general y el listado de una carpeta.

/** "Jeremias Ingla" → "JI". `uploadedBy` llega como nombre completo. */
function personInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return initials(parts[0], parts.length > 1 ? parts[parts.length - 1] : null)
}

interface DocumentsTableMeta {
  actions: DocumentActions
}

function SortableHeader({ column, label }: { column: Column<ClientDocument, unknown>; label: string }) {
  return (
    <Button variant="ghost" size="sm" className="-ml-3" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
      {label}
      <ArrowUpDown aria-hidden />
    </Button>
  )
}

const DOCUMENT_COLUMNS: ColumnDef<ClientDocument>[] = [
  {
    id: 'name',
    accessorFn: (doc) => documentBaseName(doc).toLowerCase(),
    header: ({ column }) => <SortableHeader column={column} label="Nombre" />,
    cell: ({ row }) => {
      const doc = row.original
      const derived = deriveDocumentStatus(doc)
      return (
        <div className="flex min-w-0 items-center gap-3">
          <FileTile doc={doc} />
          <div className="min-w-0">
            <FileName doc={doc} />
            <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              {DOCUMENT_CATEGORIES[typeBucket(doc)].singular}
              {derived.status !== 'informational' && (
                <Badge variant={DOCUMENT_STATUS_VARIANT[derived.status]} className="whitespace-nowrap">
                  {derived.label}
                </Badge>
              )}
            </p>
          </div>
        </div>
      )
    },
  },
  {
    id: 'activity',
    accessorFn: (doc) => Date.parse(activityDate(doc)),
    header: ({ column }) => <SortableHeader column={column} label="Última actividad" />,
    cell: ({ row }) => {
      const date = formatDocumentDate(row.original)
      return (
        <div className="whitespace-nowrap text-xs">
          <p className="tabular-nums text-foreground/80">{date.value}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{date.label}</p>
        </div>
      )
    },
  },
  {
    id: 'uploadedBy',
    accessorFn: (doc) => doc.uploadedBy ?? '',
    enableSorting: false,
    header: 'Subido por',
    cell: ({ row }) => {
      const uploadedBy = row.original.uploadedBy
      if (!uploadedBy) return <span className="text-xs text-muted-foreground">—</span>
      return (
        <span className="flex items-center gap-2 whitespace-nowrap text-xs text-foreground/80">
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground"
          >
            {personInitials(uploadedBy)}
          </span>
          {uploadedBy}
        </span>
      )
    },
  },
  {
    id: 'actions',
    enableSorting: false,
    header: () => <span className="sr-only">Acciones</span>,
    cell: ({ row, table }) => (
      <DocumentActionsMenu doc={row.original} actions={(table.options.meta as DocumentsTableMeta).actions} />
    ),
  },
]

/**
 * `docs` llega ya filtrado y en el orden por defecto; el orden por encabezado
 * es solo de la tabla. `empty` es lo que se muestra sin filas: sin él, una
 * tabla vacía no se renderiza.
 */
export function DocumentsTable({
  docs,
  actions,
  title,
  subtitle,
  empty,
  animationDelay,
}: {
  docs: ClientDocument[]
  actions: DocumentActions
  title: string
  subtitle: ReactNode
  empty?: ReactNode
  animationDelay?: string
}) {
  const titleId = useId()
  const [sorting, setSorting] = useState<SortingState>([])
  const table = useReactTable({
    data: docs,
    columns: DOCUMENT_COLUMNS,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    meta: { actions } satisfies DocumentsTableMeta,
  })

  if (docs.length === 0 && !empty) return null

  return (
    <section aria-labelledby={titleId} className={cn(SURFACE, 'overflow-hidden', ENTER)} style={{ animationDelay }}>
      <div className="flex items-baseline justify-between gap-3 px-4 pb-3 pt-4">
        <h2 id={titleId} className="text-sm font-medium text-foreground">
          {title}
        </h2>
        <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
      </div>

      {docs.length === 0 ? (
        <div className="border-t border-border">{empty}</div>
      ) : (
        // Table trae su propio contenedor con scroll horizontal: en angosto no rompe el ancho de la página.
        <Table className="min-w-[680px]">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-t">
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={
                        header.column.getCanSort()
                          ? sorted === 'asc'
                            ? 'ascending'
                            : sorted === 'desc'
                              ? 'descending'
                              : 'none'
                          : undefined
                      }
                      className={cn(
                        'whitespace-nowrap px-3',
                        header.column.id === 'name' && 'w-full pl-4',
                        header.column.id === 'actions' && 'pr-4',
                      )}
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      'px-3 py-3',
                      cell.column.id === 'name' && 'w-full max-w-0 pl-4',
                      cell.column.id === 'actions' && 'pr-4',
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}

// ─── Preview drawer ────────────────────────────────────────────────────────────

export function DocumentPreviewDrawer({
  doc,
  onClose,
}: {
  doc: ClientDocument | null
  onClose: () => void
}) {
  const preview = useDocumentPreview(doc)
  const storageKey = doc?.storageKey ?? null

  return (
    <Sheet
      open={doc != null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-3 sm:max-w-2xl"
        aria-label="Vista previa del documento"
      >
        <SheetHeader>
          <SheetTitle className="truncate pr-6">{doc?.name ?? 'Documento'}</SheetTitle>
          <SheetDescription>
            {preview.status === 'error'
              ? 'No se pudo cargar la vista previa.'
              : 'Vista previa del documento — puede tardar unos segundos en cargar.'}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted/30">
          {preview.status === 'loading' && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <p className="text-sm">Cargando vista previa…</p>
            </div>
          )}

          {preview.status === 'error' && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-destructive">No pudimos cargar la vista previa de este documento.</p>
              {storageKey && (
                <button
                  type="button"
                  onClick={() => void openFile(storageKey).catch(() => {})}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent/50"
                >
                  Descargar en su lugar
                </button>
              )}
            </div>
          )}

          {preview.status === 'ready' && preview.url && (
            <iframe
              src={preview.url}
              title={doc?.name ?? 'Vista previa del documento'}
              className="h-full w-full"
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
