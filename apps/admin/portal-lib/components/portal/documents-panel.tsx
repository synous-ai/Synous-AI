'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowUpDown,
  Check,
  Download,
  Eye,
  FileSignature,
  FileText,
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
import { useClientDeals, useClientDocuments, useDocumentPreview } from '@portal/lib/hooks'
import { openFile } from '@portal/lib/files'
import { cn, initials } from '@portal/lib/utils'
import type { ClientDocument } from '@portal/lib/types'
import { KIND_BY_EXTENSION, KIND_ICON, extensionOf, kindForExtension, type AssetKind } from '@portal/lib/file-kind'
import { Badge, type BadgeProps } from '@portal/components/ui/badge'
import { Button } from '@portal/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@portal/components/ui/table'
import { SectionHeader } from '@portal/components/portal/section-header'
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
import { RowListSkeleton } from '@portal/components/ui/skeletons'
import { EmptyIllustration } from '@portal/components/ui/empty-illustration'
import { Folder } from '@portal/components/ui/folder'

/*
 * ─── Lenguaje visual ───────────────────────────────────────────────────────────
 * Toma la referencia "Docs" (dashboard oscuro de documentación): grilla de cards
 * por categoría con tile de ícono blanco y botón pill, y un panel lateral fijo
 * con el listado de archivos de la categoría elegida. Lo que NO se trae es lo
 * que no tiene datos detrás en esta app: la fila de carpetas "Shortcut" y los
 * gráficos de engagement. Mostrar métricas inventadas a un cliente es peor que
 * no mostrarlas.
 */

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
/** Superficie de card con tokens del tema: se lee igual en claro y en oscuro. */
const SURFACE =
  'rounded-xl border border-border bg-card shadow-card'
/** Controles del header (búsqueda, filtro). */
const CONTROL = cn(
  'inline-flex h-9 items-center rounded-lg border border-border bg-card text-[13px] text-foreground/90 transition-colors hover:bg-muted',
  FOCUS,
)
/** Botón pill secundario — el "Connect" de la referencia. */
const PILL = cn(
  'inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 text-[11px] font-medium text-foreground/90 transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40',
  FOCUS,
)
const PILL_SELECTED = 'border-foreground/25 bg-muted text-foreground'
/** Entrada escalonada (el delay lo pone cada instancia). */
const ENTER =
  'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 motion-safe:fill-mode-both'

// ─── Categorías (filtro por tipo) ─────────────────────────────────────────────
// 100% client-side sobre lo que ya trajo useClientDocuments() — sin params
// nuevos ni llamadas extra. Cualquier `type` que no sea uno de los 3 conocidos
// cae en el balde "other".

type TypeFilterKey = 'contract' | 'proposal' | 'invoice' | 'other'
type TypeFilter = 'all' | TypeFilterKey

const TYPE_FILTER_ORDER: TypeFilterKey[] = ['contract', 'proposal', 'invoice', 'other']

const DOCUMENT_CATEGORIES: Record<
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

function typeBucket(doc: ClientDocument): TypeFilterKey {
  return doc.type === 'contract' || doc.type === 'proposal' || doc.type === 'invoice' ? doc.type : 'other'
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** Minúsculas y sin tildes: "propuesta" encuentra "Propuesta técnica". */
function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function matchesSearch(doc: ClientDocument, needle: string): boolean {
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

function deriveDocumentStatus(doc: ClientDocument): DerivedDocumentStatus {
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

const DOCUMENT_STATUS_VARIANT: Record<DerivedDocumentStatusKind, NonNullable<BadgeProps['variant']>> = {
  pending: 'signal',
  signed: 'default',
  declined: 'destructive',
  expired: 'muted',
  informational: 'muted',
}

/** ¿Hay algún camino para previsualizar este documento en el drawer? */
function canPreviewDocument(doc: ClientDocument): boolean {
  return doc.storageKey != null || doc.docusealStatus === 'completed'
}

const DATE_FORMAT = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric' })
const TIME_FORMAT = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' })

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr)
  return `${DATE_FORMAT.format(date)} · ${TIME_FORMAT.format(date)}`
}

/** Fecha a mostrar: la de firma si está firmado, si no la de alta. */
function formatDocumentDate(doc: ClientDocument): { label: string; value: string } {
  if (doc.signedAt) return { label: 'Firmado', value: formatDateTime(doc.signedAt) }
  return { label: 'Compartido', value: formatDateTime(doc.createdAt) }
}

// ─── Header: búsqueda ─────────────────────────────────────────────────────────
// Atajo "/" (y no ⌘F como en la referencia): pisar el buscar-en-página del
// navegador es hostil, "/" es la convención de búsqueda en apps web.

function DocumentSearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
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

function TypeFilterMenu({
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
// Siempre muestra TODO lo accionable, sin importar el filtro ni la búsqueda.

function AttentionBanner({ docs }: { docs: ClientDocument[] }) {
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

// ─── Card de categoría ────────────────────────────────────────────────────────

function CategoryCard({
  type,
  count,
  pending,
  selected,
  index,
  onToggle,
}: {
  type: TypeFilterKey
  count: number
  pending: number
  selected: boolean
  index: number
  onToggle: () => void
}) {
  const { label, description, Icon } = DOCUMENT_CATEGORIES[type]
  const empty = count === 0

  return (
    <article
      className={cn(SURFACE, 'flex flex-col p-4 transition-colors', selected && 'border-foreground/25 bg-muted/40', ENTER)}
      style={{ animationDelay: `${60 + index * 60}ms` }}
    >
      <span
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-lg',
          empty
            ? 'bg-muted text-muted-foreground'
            : 'bg-foreground text-background shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)]',
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>

      <h3 className="mt-4 text-sm font-medium text-foreground">{label}</h3>
      <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">{description}</p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button type="button" onClick={onToggle} disabled={empty} aria-pressed={selected} className={cn(PILL, selected && PILL_SELECTED)}>
          {selected && <Check className="h-3 w-3" strokeWidth={2} />}
          {selected ? 'Mostrando' : 'Ver archivos'}
        </button>
        <p className="flex items-center gap-2.5 text-[11px] tabular-nums text-muted-foreground">
          {pending > 0 && (
            <span className="flex items-center gap-1 text-signal">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-signal" />
              {pending} por firmar
            </span>
          )}
          <span>{empty ? 'Sin archivos' : plural(count, 'archivo', 'archivos')}</span>
        </p>
      </div>
    </article>
  )
}

// ─── Accesos rápidos: una carpeta por proyecto ────────────────────────────────
// El "Shortcut" de la referencia, con datos reales: cada carpeta es un deal del
// cliente que tiene documentos (nombre vía useClientDeals, cruce por `dealId`).
// Los documentos sin deal caen en "Generales". Elegir una carpeta filtra el
// listado, y se combina con el filtro por tipo y la búsqueda.

const GENERAL_FOLDER = '__general__'

interface ShortcutFolder {
  key: string
  label: string
  count: number
}

function folderKey(doc: ClientDocument): string {
  return doc.dealId ?? GENERAL_FOLDER
}

function buildFolders(docs: ClientDocument[], dealNames: Map<string, string>): ShortcutFolder[] {
  const counts = new Map<string, number>()
  for (const doc of docs) counts.set(folderKey(doc), (counts.get(folderKey(doc)) ?? 0) + 1)

  return Array.from(counts, ([key, count]) => ({
    key,
    count,
    label: key === GENERAL_FOLDER ? 'Generales' : (dealNames.get(key) ?? 'Proyecto'),
  })).sort((a, b) => {
    // "Generales" siempre al final; los proyectos, alfabéticos.
    if (a.key === GENERAL_FOLDER) return 1
    if (b.key === GENERAL_FOLDER) return -1
    return a.label.localeCompare(b.label, 'es')
  })
}

function ShortcutFolders({
  folders,
  selectedKey,
  onToggle,
}: {
  folders: ShortcutFolder[]
  selectedKey: string | null
  onToggle: (key: string) => void
}) {
  // La carpeta es decorativa: el hover lo maneja el botón entero (incluye el
  // label) y también el foco de teclado, no solo el mouse sobre el dibujo.
  const [activeKey, setActiveKey] = useState<string | null>(null)

  if (folders.length === 0) return null

  return (
    <section
      aria-labelledby="documents-shortcuts-title"
      className={cn(SURFACE, 'p-4', ENTER)}
      style={{ animationDelay: '300ms' }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="documents-shortcuts-title" className="text-sm font-medium text-foreground">
          Accesos rápidos
        </h2>
        <p className="text-[11px] text-muted-foreground">Por proyecto</p>
      </div>

      {/* pt-8: al abrirse, las hojas suben por encima de la carpeta. */}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-x-2 gap-y-5 pt-8">
        {folders.map((folder) => {
          const selected = folder.key === selectedKey
          return (
            <li key={folder.key}>
              <button
                type="button"
                onClick={() => onToggle(folder.key)}
                onMouseEnter={() => setActiveKey(folder.key)}
                onMouseLeave={() => setActiveKey(null)}
                onFocus={() => setActiveKey(folder.key)}
                onBlur={() => setActiveKey(null)}
                aria-pressed={selected}
                className={cn('group flex w-full flex-col items-center gap-2 rounded-lg px-1 pb-1 text-center', FOCUS)}
              >
                <Folder
                  color="graphite"
                  size="xs"
                  open={selected}
                  hovered={activeKey === folder.key}
                  className="h-auto w-auto"
                />
                <span
                  className={cn(
                    'line-clamp-2 text-xs leading-snug transition-colors',
                    selected ? 'text-foreground' : 'text-foreground/80 group-hover:text-foreground',
                  )}
                >
                  {folder.label}
                </span>
                <span className="-mt-1 text-[10px] tabular-nums text-muted-foreground">
                  {plural(folder.count, 'archivo', 'archivos')}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ─── Descarga compartida ──────────────────────────────────────────────────────

/**
 * Descarga autenticada de un documento, con estado de carga y de error.
 * Hace falta pedir una URL de acceso temporal (openFile en lib/files.ts): un
 * <a href> pelado no puede. Solo aplica a documentos con storageKey propio (los
 * firmados-en-DocuSeal-sin-copia-propia no tienen bytes locales para bajar,
 * solo preview vía signed-documents). La usan la lista lateral y los recientes.
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

/** Nombre sin la extensión cuando el título la trae: la extensión va en su propio badge. */
function documentBaseName(doc: ClientDocument): string {
  const ext = fileExtension(doc.name)
  return ext ? doc.name.slice(0, -(ext.length + 1)) : doc.name
}

function FileTile({ doc }: { doc: ClientDocument }) {
  const Icon = KIND_ICON[documentKind(doc)]
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/80">
      <Icon className="size-4" strokeWidth={1.5} aria-hidden />
    </span>
  )
}

function FileName({ doc }: { doc: ClientDocument }) {
  const extension = documentExtension(doc)
  return (
    <div className="flex min-w-0 items-center gap-2">
      <p className="truncate text-[13px] font-medium text-foreground" title={doc.name}>
        {documentBaseName(doc)}
      </p>
      {extension && (
        <Badge variant="outline" className="shrink-0">
          .{extension}
        </Badge>
      )}
    </div>
  )
}

// ─── Acciones de un archivo (menú ⋯) ──────────────────────────────────────────
// Solo acciones reales: el portal es de solo lectura para el cliente (no hay
// renombrar ni borrar). Vista previa y descarga dependen de que haya archivo;
// "ver del mismo tipo / proyecto" reusan los filtros de la sección. El menú
// existe siempre, así ninguna fila queda sin acciones.

interface DocumentActions {
  onPreview: (doc: ClientDocument) => void
  onShowType: (type: TypeFilterKey) => void
  onShowFolder: (key: string) => void
  folderLabelOf: (doc: ClientDocument) => string
}

function DocumentActionsMenu({ doc, actions }: { doc: ClientDocument; actions: DocumentActions }) {
  const { downloading, failed, download } = useDocumentDownload(doc)
  const previewable = canPreviewDocument(doc)
  const type = typeBucket(doc)

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
            <DropdownMenuItem onSelect={() => actions.onShowFolder(folderKey(doc))}>
              <FolderOpen />
              <span className="truncate">Ver archivos de {actions.folderLabelOf(doc)}</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ─── Archivos recientes (Data Table) ──────────────────────────────────────────
// Estructura del Data Table de shadcn/ui (columnas definidas, orden por
// encabezado, celda de acciones ⋯), escrita con TanStack Table v8: la guía
// actual de shadcn usa la API de v9, que este proyecto no tiene.
// Se calcula sobre TODOS los documentos, sin mirar filtros ni búsqueda (igual
// que el banner de firma): la vista filtrada ya es el panel lateral.

const RECENT_LIMIT = 5

/** Última actividad: la firma si existe, si no el alta. */
function activityDate(doc: ClientDocument): string {
  return doc.signedAt ?? doc.createdAt
}

/** "Jeremias Ingla" → "JI". `uploadedBy` llega como nombre completo. */
function personInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return initials(parts[0], parts.length > 1 ? parts[parts.length - 1] : null)
}

interface RecentTableMeta {
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

const RECENT_COLUMNS: ColumnDef<ClientDocument>[] = [
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
      <DocumentActionsMenu doc={row.original} actions={(table.options.meta as RecentTableMeta).actions} />
    ),
  },
]

function RecentFiles({ docs, actions }: { docs: ClientDocument[]; actions: DocumentActions }) {
  const [sorting, setSorting] = useState<SortingState>([])
  const table = useReactTable({
    data: docs,
    columns: RECENT_COLUMNS,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    meta: { actions } satisfies RecentTableMeta,
  })

  if (docs.length === 0) return null

  return (
    <section
      aria-labelledby="documents-recent-title"
      className={cn(SURFACE, 'overflow-hidden', ENTER)}
      style={{ animationDelay: '380ms' }}
    >
      <div className="flex items-baseline justify-between gap-3 px-4 pb-3 pt-4">
        <h2 id="documents-recent-title" className="text-sm font-medium text-foreground">
          Archivos recientes
        </h2>
        <p className="text-[11px] text-muted-foreground">
          {plural(docs.length, 'archivo', 'archivos')} con actividad más reciente
        </p>
      </div>

      {/* Table trae su propio contenedor con scroll horizontal: en angosto no rompe el ancho de la página. */}
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
    </section>
  )
}

// ─── Panel lateral: listado de archivos ───────────────────────────────────────

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-1">
      <dt className="shrink-0">{label}:</dt>
      <dd className="truncate text-foreground/75">{value}</dd>
    </div>
  )
}

function DocumentListItem({ doc, actions }: { doc: ClientDocument; actions: DocumentActions }) {
  const derived = deriveDocumentStatus(doc)
  const date = formatDocumentDate(doc)
  const hasFile = canPreviewDocument(doc) || doc.storageKey != null

  return (
    <li className="flex items-start gap-3 p-4 transition-colors hover:bg-muted/40">
      <FileTile doc={doc} />
      <div className="min-w-0 flex-1">
        <FileName doc={doc} />
        {derived.status !== 'informational' && (
          <Badge variant={DOCUMENT_STATUS_VARIANT[derived.status]} className="mt-1.5 whitespace-nowrap">
            {derived.label}
          </Badge>
        )}
        <dl className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
          <MetaRow label="Tipo" value={DOCUMENT_CATEGORIES[typeBucket(doc)].singular} />
          {doc.uploadedBy && <MetaRow label="Subido por" value={doc.uploadedBy} />}
          <MetaRow label={date.label} value={date.value} />
        </dl>
        {!hasFile && <p className="mt-2 text-[11px] text-muted-foreground">Todavía no hay archivo para ver</p>}
      </div>
      <DocumentActionsMenu doc={doc} actions={actions} />
    </li>
  )
}

function DocumentListPanel({
  docs,
  filter,
  folderLabel,
  search,
  onClearSearch,
  onShowAll,
  actions,
}: {
  docs: ClientDocument[]
  filter: TypeFilter
  folderLabel: string | null
  search: string
  onClearSearch: () => void
  onShowAll: () => void
  actions: DocumentActions
}) {
  const category = filter === 'all' ? null : DOCUMENT_CATEGORIES[filter]
  const trimmedSearch = search.trim()

  return (
    <aside
      aria-label="Listado de documentos"
      className={cn(
        SURFACE,
        'flex min-w-0 flex-col overflow-hidden xl:sticky xl:top-24 xl:max-h-[calc(100dvh-8rem)]',
        ENTER,
      )}
      style={{ animationDelay: '120ms' }}
    >
      <header className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-medium text-foreground">{category?.label ?? 'Todos los documentos'}</h2>
          {(category || folderLabel) && (
            <button
              type="button"
              onClick={onShowAll}
              className={cn('shrink-0 rounded text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline', FOCUS)}
            >
              Ver todos
            </button>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {category?.description ?? 'Todo lo que el equipo compartió con vos.'}
        </p>
        <p className="mt-3 truncate text-[11px] uppercase tracking-[0.14em] tabular-nums text-muted-foreground">
          {plural(docs.length, 'archivo', 'archivos')}
          {folderLabel && <span className="normal-case tracking-normal"> · {folderLabel}</span>}
          {trimmedSearch && <span className="normal-case tracking-normal"> · “{trimmedSearch}”</span>}
        </p>
      </header>

      {docs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <FolderOpen className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
          <p className="px-4 text-sm text-muted-foreground">Ningún documento coincide con la búsqueda.</p>
          {trimmedSearch && (
            <button type="button" onClick={onClearSearch} className={PILL}>
              Limpiar búsqueda
            </button>
          )}
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {docs.map((doc) => (
            <DocumentListItem key={doc.id} doc={doc} actions={actions} />
          ))}
        </ul>
      )}
    </aside>
  )
}

// ─── Preview drawer ────────────────────────────────────────────────────────────

function DocumentPreviewDrawer({
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

// ─── Panel ────────────────────────────────────────────────────────────────────

export function DocumentsPanel() {
  const query = useClientDocuments()
  const docs = query.data ?? []
  const [previewDoc, setPreviewDoc] = useState<ClientDocument | null>(null)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [search, setSearch] = useState('')
  const [folderFilter, setFolderFilter] = useState<string | null>(null)
  const dealsQuery = useClientDeals()

  const renderHeader = (actions?: ReactNode) => (
    <SectionHeader
      eyebrow="Tu proyecto"
      title="Documentos"
      description="Contratos y archivos compartidos con vos."
      actions={actions}
    />
  )

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        {renderHeader()}
        <RowListSkeleton count={4} label="Cargando documentos…" />
      </div>
    )
  }

  if (query.isError) {
    return (
      <div className="space-y-6">
        {renderHeader()}
        <p className="py-8 text-sm text-destructive">No se pudieron cargar los documentos.</p>
      </div>
    )
  }

  if (docs.length === 0) {
    return (
      <div className="space-y-6">
        {renderHeader()}
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <EmptyIllustration icon={FileText} />
          <div>
            <p className="font-medium text-muted-foreground">Sin Documentos</p>
            <p className="mt-0.5 text-sm text-muted-foreground/70">
              Los contratos y documentos de tus proyectos aparecerán acá cuando el equipo los suba.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const pendingSignature = docs.filter((doc) => deriveDocumentStatus(doc).status === 'pending')

  const counts: Record<TypeFilterKey, number> = { contract: 0, proposal: 0, invoice: 0, other: 0 }
  const pendingCounts: Record<TypeFilterKey, number> = { contract: 0, proposal: 0, invoice: 0, other: 0 }
  for (const doc of docs) counts[typeBucket(doc)] += 1
  for (const doc of pendingSignature) pendingCounts[typeBucket(doc)] += 1

  const dealNames = new Map((dealsQuery.data ?? []).map((deal) => [deal.id, deal.name]))
  const folders = buildFolders(docs, dealNames)
  // Si la carpeta elegida dejó de existir (cambió la data), se ignora el filtro.
  const activeFolder = folders.find((folder) => folder.key === folderFilter) ?? null

  const needle = normalizeText(search.trim())
  const visibleDocs = docs.filter(
    (doc) =>
      (typeFilter === 'all' || typeBucket(doc) === typeFilter) &&
      (activeFolder == null || folderKey(doc) === activeFolder.key) &&
      matchesSearch(doc, needle),
  )

  const recentDocs = docs
    .slice()
    .sort((a, b) => Date.parse(activityDate(b)) - Date.parse(activityDate(a)))
    .slice(0, RECENT_LIMIT)

  const folderLabels = new Map(folders.map((folder) => [folder.key, folder.label]))
  const documentActions: DocumentActions = {
    onPreview: setPreviewDoc,
    // Acciones de una fila ("ver los de este tipo / proyecto"): limpian el otro
    // filtro y la búsqueda. Si no, se combinarían con lo que ya estaba activo y el
    // documento que se eligió podría no aparecer en el panel lateral.
    onShowType: (type) => {
      setTypeFilter(type)
      setFolderFilter(null)
      setSearch('')
    },
    onShowFolder: (key) => {
      setFolderFilter(key)
      setTypeFilter('all')
      setSearch('')
    },
    folderLabelOf: (doc) => folderLabels.get(folderKey(doc)) ?? 'Generales',
  }

  return (
    <div className="space-y-6">
      {renderHeader(
        <>
          <DocumentSearchField value={search} onChange={setSearch} />
          <TypeFilterMenu value={typeFilter} counts={counts} total={docs.length} onChange={setTypeFilter} />
        </>,
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="min-w-0 space-y-5">
          <AttentionBanner docs={pendingSignature} />

          <section aria-label="Categorías de documentos" className="grid gap-4 sm:grid-cols-2">
            {TYPE_FILTER_ORDER.map((type, index) => (
              <CategoryCard
                key={type}
                type={type}
                index={index}
                count={counts[type]}
                pending={pendingCounts[type]}
                selected={typeFilter === type}
                onToggle={() => setTypeFilter((current) => (current === type ? 'all' : type))}
              />
            ))}
          </section>

          <ShortcutFolders
            folders={folders}
            selectedKey={activeFolder?.key ?? null}
            onToggle={(key) => setFolderFilter((current) => (current === key ? null : key))}
          />

          <RecentFiles docs={recentDocs} actions={documentActions} />
        </div>

        <DocumentListPanel
          docs={visibleDocs}
          filter={typeFilter}
          folderLabel={activeFolder?.label ?? null}
          search={search}
          onClearSearch={() => setSearch('')}
          onShowAll={() => {
            setTypeFilter('all')
            setFolderFilter(null)
          }}
          actions={documentActions}
        />
      </div>

      <DocumentPreviewDrawer doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </div>
  )
}
